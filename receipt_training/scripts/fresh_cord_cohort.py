"""Prepare a separate, fixed CORD cohort without displaying evaluation images/labels.

Public, unauthenticated GETs only. Existing datasets, models and scores are read-only.
No signed asset URL, API credential or receipt field text is written to logs.
"""
from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import io
import json
import re
import shutil
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image
from collect import verify_image

ROOT = Path(__file__).resolve().parents[2]
DATASET = 'naver-clova-ix/cord-v2'
REVISION = '7f0115a4b758a71d6473b8d085751692da2fef98'
RESERVE = 10 * 1024**3
MAX_BYTES = 64 * 1024**2
Image.MAX_IMAGE_PIXELS = 32_000_000


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('x', encoding='utf-8', newline='\n') as handle:
        json.dump(value, handle, indent=2, ensure_ascii=False); handle.write('\n')


def load(path):
    return json.loads(path.read_text(encoding='utf-8'))


def jsonl(path):
    return [json.loads(s) for s in path.read_text(encoding='utf-8').splitlines() if s.strip()]


def local(name):
    path = (ROOT / name).resolve(); path.relative_to(ROOT)
    require(not any(part.lower().startswith('.env') for part in path.parts), 'Environment files are outside this collection')
    return path


class PublicSources:
    def __init__(self):
        self.started = time.monotonic(); self.bytes = 0; self.calls = []

    def get(self, url, kind, cap):
        parsed = urllib.parse.urlsplit(url)
        require(parsed.scheme == 'https' and parsed.hostname in {'huggingface.co', 'datasets-server.huggingface.co'}, 'Unexpected public source host')
        require(parsed.username is None and parsed.password is None, 'No source credentials allowed')
        require(len(self.calls) < 28 and time.monotonic() - self.started < 180, 'Collection request/time limit reached')
        require(shutil.disk_usage(ROOT).free >= RESERVE + MAX_BYTES, 'Preserve the ten-GiB disk reserve')
        event = {'kind': kind, 'host': parsed.hostname, 'attempt': 1}
        self.calls.append(event)
        request = urllib.request.Request(url, headers={'User-Agent': 'GatherReceiptEvaluation/1.0 (public sources; attribution retained)'})
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                final = urllib.parse.urlsplit(response.geturl())
                require(final.scheme == 'https' and final.hostname in {'huggingface.co', 'datasets-server.huggingface.co'}, 'Unexpected final source host')
                data = response.read(min(cap, MAX_BYTES - self.bytes) + 1)
                require(len(data) <= cap and self.bytes + len(data) <= MAX_BYTES, 'Public source byte limit reached')
                self.bytes += len(data)
                event.update(status=response.status, bytes=len(data), sha256=hashlib.sha256(data).hexdigest())
                return data
        except urllib.error.HTTPError as error:
            event['status'] = error.code
            raise ValueError(f'Public source HTTP {error.code}; no automatic retry') from None
        except (OSError, TimeoutError):
            event['status'] = 'connection-failed'
            raise ValueError('Public source connection failed; no automatic retry') from None

    def repository(self):
        info = json.loads(self.get('https://huggingface.co/api/datasets/' + DATASET, 'repository-metadata', 2 * 1024**2))
        require(info['sha'] == REVISION, 'Dataset revision changed; review a new plan')
        license_value = info.get('cardData', {}).get('license')
        require('cc-by-4.0' in json.dumps(license_value).lower(), 'Publisher license must remain explicit')
        return {'dataset': DATASET, 'revision': info['sha'], 'license': license_value,
                'source_url': 'https://huggingface.co/datasets/' + DATASET,
                'publisher_docs': 'https://github.com/clovaai/cord',
                'api_docs': 'https://huggingface.co/docs/dataset-viewer/rows'}


def inventory(reference_root):
    training = reference_root / 'receipt_training'
    paths = [training / 'manifest.jsonl', training / 'annotations/private/supplement-manifest.jsonl']
    records = [r for path in paths for r in jsonl(path)]
    evidence = {str(path): sha(path) for path in paths}
    image_hashes, groups, near, seen = set(), set(), [], set()
    def hashes(value):
        if isinstance(value, dict):
            for key, entry in value.items():
                if key.endswith('sha256') and isinstance(entry, str) and re.fullmatch('[a-f0-9]{64}', entry):
                    image_hashes.add(entry)
                hashes(entry)
        elif isinstance(value, list):
            for entry in value: hashes(entry)
    for row in records:
        hashes(row)
        if row.get('group_id'): groups.add(row['group_id'])
        if row.get('image', {}).get('dhash'):
            near.append({'receipt_id': row['receipt_id'], 'dhash': row['image']['dhash'], 'group_id': row.get('group_id')})
    # No image/model text is displayed. Existing report IDs conservatively mark
    # a source as exposed, even if it appeared only in a previous plan.
    for path in sorted((training / 'evaluation').glob('*')):
        if path.suffix not in {'.md', '.json'} or not path.is_file(): continue
        data = path.read_bytes(); evidence[str(path)] = hashlib.sha256(data).hexdigest()
        seen.update(re.findall(r'cord-v2-(?:train|test|validation)-\d{3}', data.decode('utf-8')))
    for path in sorted((training / 'annotations/raw').glob('cord-v2-*.json')):
        value = load(path); evidence[str(path)] = sha(path)
        canonical = hashlib.sha256(json.dumps(value['gt_parse'], sort_keys=True).encode()).hexdigest()
        groups.add('cord-transaction-' + canonical)
        seen.add(path.stem)
    return {'source_evidence_sha256': evidence, 'record_count': len(records),
            'image_sha256': sorted(image_hashes), 'semantic_group_ids': sorted(groups),
            'dhash_records': near, 'previously_exposed_ids': sorted(seen),
            'scope': 'Original and supplement manifests, raw CORD annotations and existing top-level evaluation report source IDs. dHash is a review aid, never proof of transaction identity.'}


def prepare(out, reference_root, source_mode):
    require(not out.exists(), 'Preserve the existing cohort study')
    require((reference_root / 'receipt_training/manifest.jsonl').is_file(), 'Reference dataset root is required')
    out.mkdir(parents=True)
    old = inventory(reference_root); write(out / 'existing-exposure.json', old)
    selected = [{'receipt_id': f'cord-v2-{split}-{index:03}', 'source_split': split,
                 'source_index': index, 'role': role}
                for split, role, start in [('train', 'development', 24), ('test', 'evaluation', 12)]
                for index in range(start, start + 12)]
    require(not {r['receipt_id'] for r in selected} & set(old['previously_exposed_ids']), 'Planned source already appeared in prior project reports')
    plan = {'prepared_at': datetime.now(timezone.utc).isoformat(), 'dataset': DATASET, 'revision': REVISION,
            'collector_sha256': sha(Path(__file__)),
            'source_mode': source_mode,
            'reference_root': str(reference_root), 'existing_exposure_sha256': sha(out / 'existing-exposure.json'),
            'selection': selected, 'selection_policy': 'Fixed consecutive twelve train24..35 development and twelve test12..23 evaluation sources, before image/label/result inspection. No replacement of failed, duplicate or difficult cases.',
            'network_limits': {'public_gets': 28, 'downloaded_bytes': MAX_BYTES, 'seconds': 180, 'retries': 0, 'authentication': False},
            'disk_reserve_bytes': RESERVE, 'near_duplicate_hamming_max': 4,
            'overlap_policy': 'Exact image or canonical gt_parse matches are quarantined. dHash candidates require visual adjudication and are quarantined until reviewed. Never automatically assert transaction identity from dHash.',
            'evaluation_policy': 'Do not display/evaluate test image pixels or field labels until the scanner/prompt/settings are frozen after development. Collector hashes upstream gt_parse only for overlap detection and stores raw labels separately. No model receives labels or corpus hints.',
            'privacy': 'Local-only receipt images and raw annotations. No provider upload permission; signed asset URLs discarded. Public licensing is not an anonymity or third-party-processing approval.',
            'limits': 'New to project selection, not proof unseen during model pretraining or representative UK Costco accuracy. Original fifty and original scores remain separate.',
            'provider_requests': 0, 'model_inferences': 0}
    write(out / 'plan.json', plan)
    print(json.dumps({'plan_sha256': sha(out / 'plan.json'), 'selected': len(selected), 'roles': {'development': 12, 'evaluation': 12}, 'old_source_ids_excluded': len(old['previously_exposed_ids']), 'network_calls': 0}))


def collect(out):
    plan = load(out / 'plan.json'); old = load(out / 'existing-exposure.json')
    require(sha(out / 'existing-exposure.json') == plan['existing_exposure_sha256'], 'Exposure inventory changed')
    require(plan['dataset'] == DATASET and plan['revision'] == REVISION and len(plan['selection']) == 24, 'Unexpected cohort plan')
    require(sha(Path(__file__)) == plan['collector_sha256'], 'Collector changed after the plan freeze')
    require(not (out / 'collection-started.json').exists(), 'Collection was already started; inspect its terminal controller before any follow-up')
    write(out / 'collection-started.json', {'started_at': datetime.now(timezone.utc).isoformat(), 'plan_sha256': sha(out / 'plan.json')})
    network = PublicSources(); completed = []; error = None
    image_root = ROOT / 'receipt_training/non_costco/physical/cord-fresh-v1'
    labels_root = ROOT / 'receipt_training/annotations/private/fresh-cord-v1'
    require(not image_root.exists() and not labels_root.exists(), 'Preserve any existing fresh source collection')
    try:
        repository = network.repository(); write(out / 'publisher-metadata-before.json', repository)
        for split in ['train', 'test']:
            selected = [r for r in plan['selection'] if r['source_split'] == split]
            params = {'dataset': DATASET, 'config': 'default', 'split': split}
            endpoint = plan['source_mode']
            require(endpoint in {'rows', 'first-rows'}, 'Unexpected public row endpoint')
            if endpoint == 'rows': params.update(offset=selected[0]['source_index'], length=len(selected))
            response = json.loads(network.get('https://datasets-server.huggingface.co/' + endpoint + '?' + urllib.parse.urlencode(params), 'row-slice-' + split, 4 * 1024**2))
            require(not response.get('partial'), 'Incomplete public row slice')
            indexed = {row['row_idx']: row for row in response['rows']}
            require(len(indexed) == len(response['rows']) and all(r['source_index'] in indexed for r in selected), 'Selected public row is missing/duplicated')
            for chosen in selected:
                row = indexed[chosen['source_index']]
                require(row['row_idx'] == chosen['source_index'] and not row.get('truncated_cells'), 'Unexpected/truncated source row')
                raw_gt = row['row']['ground_truth']; gt = json.loads(raw_gt)
                require(gt['meta']['split'] == split and int(gt['meta']['image_id']) == chosen['source_index'], 'Upstream row identity mismatch')
                asset = row['row']['image']['src']; url = urllib.parse.urlsplit(asset)
                require(url.hostname == 'datasets-server.huggingface.co' and REVISION in urllib.parse.unquote(url.path), 'Image asset is not bound to the pinned revision')
                data = network.get(asset, 'image-' + chosen['receipt_id'], 12 * 1024**2)
                with Image.open(io.BytesIO(data)) as im:
                    require(im.width * im.height <= 32_000_000, 'Source image exceeds the pixel bound')
                properties = verify_image(data)
                require(properties['width'] == row['row']['image']['width'] and properties['height'] == row['row']['image']['height'], 'Image metadata differs from source bytes')
                image_hash = hashlib.sha256(data).hexdigest()
                group = 'cord-transaction-' + hashlib.sha256(json.dumps(gt['gt_parse'], sort_keys=True).encode()).hexdigest()
                path = image_root / chosen['role'] / (chosen['receipt_id'] + '.jpg')
                label = labels_root / chosen['role'] / (chosen['receipt_id'] + '.json')
                path.parent.mkdir(parents=True, exist_ok=True); label.parent.mkdir(parents=True, exist_ok=True)
                with path.open('xb') as handle: handle.write(data)
                with label.open('xb') as handle: handle.write(raw_gt.encode('utf-8'))
                record = {**chosen, 'source_id': f'{DATASET}@{REVISION}:{split}:{chosen["source_index"]}',
                    'image_path': path.relative_to(ROOT).as_posix(), 'image_sha256': image_hash,
                    'raw_label_path': label.relative_to(ROOT).as_posix(), 'raw_label_sha256': sha(label),
                    'semantic_group_id': group, 'image': properties, 'licence': 'CC-BY-4.0',
                    'attribution': 'CORD v2, NAVER CLOVA; Park et al., NeurIPS Document Intelligence Workshop 2019.',
                    'source_url': 'https://huggingface.co/datasets/' + DATASET,
                    'changes': 'Dataset-viewer JPEG rendition retained byte-for-byte; no local image edit.',
                    'external_processing_allowed': False, 'image_or_label_values_displayed': False,
                    'source_annotations_status': 'upstream annotations, not visually reverified'}
                completed.append(record)
                write(out / f'completed-{len(completed):02}.json', {'receipt_id': chosen['receipt_id'], 'image_sha256': image_hash, 'role': chosen['role']})
        after = network.repository(); require(after == repository, 'Publisher revision/license changed during collection')
        write(out / 'publisher-metadata-after.json', after)
    except Exception as problem:
        # Never include asset URLs, signed query strings or arbitrary remote text.
        error = {'type': type(problem).__name__, 'message': str(problem) if isinstance(problem, ValueError) else 'Collection failed; inspect local implementation without printing signed source URLs'}
    record = {'completed_at': datetime.now(timezone.utc).isoformat(), 'terminal': 'failed' if error else 'completed',
              'error': error, 'planned': len(plan['selection']), 'completed': len(completed), 'records': completed,
              'public_source_gets': network.calls, 'downloaded_bytes': network.bytes,
              'provider_requests': 0, 'model_inferences': 0, 'private_uploads': 0,
              'signed_asset_urls_persisted': False, 'evaluation_content_displayed': False}
    write(out / 'collection.json', record)
    print(json.dumps({k: record[k] for k in ['terminal','error','planned','completed','downloaded_bytes','provider_requests','model_inferences','evaluation_content_displayed']}))
    if error: raise SystemExit(2)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--study', default='qa-artifacts/fresh-cord-cohort-v1')
    parser.add_argument('--prepare', action='store_true')
    parser.add_argument('--collect', action='store_true')
    parser.add_argument('--reference-root', type=Path)
    parser.add_argument('--source-mode', choices=['rows', 'first-rows'], default='rows')
    args = parser.parse_args(); out = local(args.study)
    require(args.prepare != args.collect, 'Choose prepare or collect')
    if args.prepare:
        require(args.reference_root is not None, 'Reference root is required for source separation')
        prepare(out, args.reference_root.resolve(), args.source_mode)
    else:
        collect(out)


if __name__ == '__main__':
    main()
