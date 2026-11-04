"""Collect the frozen fresh CORD selection through bounded public Parquet ranges.

Research data only: no model calls, private uploads, credentials or app changes.
The isolated PyArrow tool directory must already contain a verified installation.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import io
import json
from pathlib import Path
import shutil
import sys
import time

from PIL import Image
from collect import verify_image
from fresh_cord_cohort import DATASET, REVISION, ROOT, RESERVE, PublicSources, load, local, require, sha, write
from parquet_image_prefix import image_dictionary
from parquet_source_ranges import RangeSource

LIMIT = 256 * 1024**2
SOURCES = {
    'train': ('data/train-00000-of-00004-b4aaeceff1d90ecb.parquet', 490224630,
              'da3994eee1bf9bd3c57f0d53a72c3a6812c8696c5ba26245987949ddf73483cc'),
    'test': ('data/test-00000-of-00001-9c204eb3f4e11791.parquet', 234202795,
             '51c65f1788faff392abe2a0b55b023eb23e9be551c509138eaa3a832514224e7'),
}
CODE = ['fresh_cord_cohort.py', 'fresh_parquet_cohort.py', 'parquet_image_prefix.py', 'parquet_source_ranges.py', 'collect.py']


def code_hashes():
    return {name: sha(ROOT / 'receipt_training/scripts' / name) for name in CODE}


def prepare(out, previous):
    require(not out.exists(), 'Preserve existing cohort plans and terminal outcomes')
    prior = load(previous / 'plan.json')
    exposure = load(previous / 'existing-exposure.json')
    require(sha(previous / 'existing-exposure.json') == prior['existing_exposure_sha256'], 'Prior exposure inventory changed')
    expected = [('train', i, 'development') for i in range(24, 36)] + [('test', i, 'evaluation') for i in range(12, 24)]
    require([(r['source_split'], r['source_index'], r['role']) for r in prior['selection']] == expected, 'Preserve the original selected cases')
    controls = load(ROOT / 'qa-artifacts/fresh-cord-tools-v1/prefix-controls-v3.json')
    familiar = load(ROOT / 'qa-artifacts/fresh-cord-tools-v1/familiar-prefix-probe-v2.json')
    require(controls['passed'] and controls['count'] == 17 and familiar['passed'], 'Transport controls are required')
    require(all(controls['source_sha256'][name] == code_hashes()[name] for name in controls['source_sha256']), 'Transport changed after its controls')
    out.mkdir(parents=True)
    write(out / 'existing-exposure.json', exposure)
    plan = {**prior, 'prepared_at': datetime.now(timezone.utc).isoformat(),
            'previous_plan_sha256': sha(previous / 'plan.json'),
            'collector_sha256': sha(Path(__file__)), 'source_sha256': code_hashes(),
            'source_mode': 'pinned-parquet-image-dictionary-prefix',
            'existing_exposure_sha256': sha(out / 'existing-exposure.json'),
            'network_limits': {'range_gets_per_file': 256, 'range_payload_bytes_total': LIMIT,
                               'max_range_bytes': 8 * 1024**2, 'seconds': 180,
                               'metadata_gets': 2, 'retries': 0, 'authentication': False},
            'transport_revision': 'Same 24 cases. The viewer endpoints failed before any image collection. Only transport and its declared byte budget change.',
            'source_files': {split: {'path': path, 'bytes': size, 'publisher_lfs_sha256': digest} for split, (path, size, digest) in SOURCES.items()},
            'integrity_limit': 'Pinned anonymous HTTPS ranges with consistent ETags; full source-file/LFS hash and unread dictionary suffix CRC are not verified. Each retained raw image and label gets its own SHA256.',
            'native_tool': {'version': '26.0.1', 'wheel_sha256': '8196f36a2f4cb8d2d6ef3651941b80e5ccf125d7653657d99af5bb298e7a7026'},
            'controls_sha256': sha(ROOT / 'qa-artifacts/fresh-cord-tools-v1/prefix-controls-v3.json'),
            'familiar_control_sha256': sha(ROOT / 'qa-artifacts/fresh-cord-tools-v1/familiar-prefix-probe-v2.json')}
    write(out / 'plan.json', plan)
    print(json.dumps({'prepared': True, 'selected': len(plan['selection']), 'selection_unchanged': True, 'plan_sha256': sha(out / 'plan.json'), 'network_calls': 0}))


def overlaps(records, exposure):
    """Conservative eligibility, with no automatic identity claim from dHash."""
    decisions = {r['receipt_id']: [] for r in records}
    candidates = []
    for row in records:
        reasons = decisions[row['receipt_id']]
        if row['image_sha256'] in exposure['image_sha256']:
            reasons.append('exact-image-in-previous-corpus')
        if row['semantic_group_id'] in exposure['semantic_group_ids']:
            reasons.append('canonical-upstream-transaction-in-previous-corpus')
        for old in exposure['dhash_records']:
            distance = (int(row['image']['dhash'], 16) ^ int(old['dhash'], 16)).bit_count()
            if distance <= 4:
                candidates.append({'left': row['receipt_id'], 'right': old['receipt_id'], 'hamming_distance': distance, 'scope': 'prior-corpus', 'identity_proven': False})
                reasons.append('prior-corpus-near-image-pending-visual-review')
    for i, left in enumerate(records):
        for right in records[i + 1:]:
            exact = left['image_sha256'] == right['image_sha256']
            semantic = left['semantic_group_id'] == right['semantic_group_id']
            if exact or semantic:
                for row in (left, right):
                    decisions[row['receipt_id']].append('fresh-cohort-exact-or-semantic-overlap')
            distance = (int(left['image']['dhash'], 16) ^ int(right['image']['dhash'], 16)).bit_count()
            if distance <= 4:
                candidates.append({'left': left['receipt_id'], 'right': right['receipt_id'], 'hamming_distance': distance, 'scope': 'fresh-cohort', 'identity_proven': exact})
                for row in (left, right):
                    decisions[row['receipt_id']].append('fresh-cohort-near-image-pending-visual-review')
    return {'decisions': {key: sorted(set(value)) for key, value in decisions.items()}, 'near_image_candidates': candidates,
            'policy': 'Flagged cases remain retained and quarantined, never silently replaced. dHash alone is not transaction identity.'}


def collect(out):
    plan, exposure = load(out / 'plan.json'), load(out / 'existing-exposure.json')
    require(plan['source_sha256'] == code_hashes(), 'Collection code changed after the plan freeze')
    require(plan['dataset'] == DATASET and plan['revision'] == REVISION, 'Unexpected pinned dataset')
    require(sha(out / 'existing-exposure.json') == plan['existing_exposure_sha256'], 'Exposure inventory changed')
    require(not (out / 'collection-started.json').exists(), 'Inspect the previous terminal outcome; never silently retry collection')
    require(shutil.disk_usage(ROOT).free >= RESERVE + LIMIT, 'Preserve the ten-GiB disk reserve')
    image_root = ROOT / 'receipt_training/non_costco/physical/cord-fresh-v1'
    labels_root = ROOT / 'receipt_training/annotations/private/fresh-cord-v1'
    require(not image_root.exists() and not labels_root.exists(), 'Preserve existing collected data')
    write(out / 'collection-started.json', {'started_at': datetime.now(timezone.utc).isoformat(), 'plan_sha256': sha(out / 'plan.json')})
    sys.path.insert(0, str(ROOT / 'receipt_training/.cache/fresh-parquet-tools-v1'))
    import pyarrow as pa
    import pyarrow.parquet as pq
    require(pa.__version__ == plan['native_tool']['version'], 'Unexpected Arrow version')
    network, sources, completed, error = PublicSources(), [], [], None
    started = time.monotonic()
    try:
        before = network.repository()
        write(out / 'publisher-metadata-before.json', before)
        for split in ['train', 'test']:
            chosen = [r for r in plan['selection'] if r['source_split'] == split]
            path, size, _ = SOURCES[split]
            used = sum(source.bytes for source in sources)
            source = RangeSource('https://huggingface.co/datasets/' + DATASET + '/resolve/' + REVISION + '/' + path,
                                 size, max_bytes=LIMIT - used, seconds=max(1, 180 - (time.monotonic() - started)))
            sources.append(source)
            file = pq.ParquetFile(source, pre_buffer=False, buffer_size=1024**2,
                                  memory_map=False, arrow_extensions_enabled=False,
                                  thrift_string_size_limit=8*1024**2, thrift_container_size_limit=1000000)
            images, encoding = image_dictionary(source, file, [r['source_index'] for r in chosen], pa.Codec('snappy'))
            labels = file.read(columns=['ground_truth'], use_threads=False).column('ground_truth')
            for selected in chosen:
                require(time.monotonic() - started < 180, 'Collection time limit reached')
                index, receipt_id = selected['source_index'], selected['receipt_id']
                raw, raw_label = images[index], labels[index].as_py()
                gt = json.loads(raw_label)
                require(gt['meta']['split'] == split and int(gt['meta']['image_id']) == index, 'Upstream row identity mismatch')
                with Image.open(io.BytesIO(raw)) as image:
                    require(image.width * image.height <= 32_000_000, 'Source image exceeds the pixel bound')
                    suffix = {'PNG': '.png', 'JPEG': '.jpg'}.get(image.format)
                    require(suffix is not None, 'Unsupported source image format')
                properties = verify_image(raw)
                label_bytes = raw_label.encode('utf-8')
                require(shutil.disk_usage(ROOT).free >= RESERVE + len(raw) + len(label_bytes) + 1024**2, 'Preserve the ten-GiB disk reserve')
                image_path = image_root / selected['role'] / (receipt_id + suffix)
                label_path = labels_root / selected['role'] / (receipt_id + '.json')
                image_path.parent.mkdir(parents=True, exist_ok=True)
                label_path.parent.mkdir(parents=True, exist_ok=True)
                with image_path.open('xb') as handle:
                    handle.write(raw)
                with label_path.open('xb') as handle:
                    handle.write(label_bytes)
                record = {**selected, 'source_id': f'{DATASET}@{REVISION}:{split}:{index}',
                          'image_path': image_path.relative_to(ROOT).as_posix(), 'image_sha256': sha(image_path),
                          'raw_label_path': label_path.relative_to(ROOT).as_posix(), 'raw_label_sha256': sha(label_path),
                          'semantic_group_id': 'cord-transaction-' + hashlib.sha256(json.dumps(gt['gt_parse'], sort_keys=True).encode()).hexdigest(),
                          'image': properties, 'licence': 'CC-BY-4.0',
                          'attribution': 'CORD v2, NAVER CLOVA; Park et al., NeurIPS Document Intelligence Workshop 2019.',
                          'source_url': 'https://huggingface.co/datasets/' + DATASET,
                          'changes': 'Original embedded image bytes; no local image edit or dataset-viewer JPEG re-encoding.',
                          'source_annotations_status': 'upstream annotations, not visually reverified',
                          'external_processing_allowed': False, 'image_or_label_values_displayed': False}
                completed.append(record)
                write(out / f'completed-{len(completed):02}.json', {'receipt_id': receipt_id, 'role': selected['role'], 'image_sha256': record['image_sha256']})
            write(out / ('encoding-' + split + '.json'), encoding)
            del images, labels, file
        after = network.repository()
        require(after == before, 'Publisher revision/license changed during collection')
        write(out / 'publisher-metadata-after.json', after)
    except Exception as problem:
        error = {'type': type(problem).__name__, 'message': str(problem) if isinstance(problem, ValueError) else 'Collection failed; no source contents or signed URLs logged'}
    eligibility = overlaps(completed, exposure)
    write(out / 'overlap-review.json', eligibility)
    for record in completed:
        record['quarantine_reasons'] = eligibility['decisions'][record['receipt_id']]
        record['eligible_before_visual_review'] = not record['quarantine_reasons']
    result = {'terminal': 'failed' if error else 'completed', 'error': error,
              'completed_at': datetime.now(timezone.utc).isoformat(), 'plan_sha256': sha(out / 'plan.json'),
              'planned': len(plan['selection']), 'completed': len(completed), 'records': completed,
              'eligible_before_visual_review': {role: sum(r['role'] == role and r['eligible_before_visual_review'] for r in completed) for role in ['development', 'evaluation']},
              'public_metadata_gets': network.calls, 'ranges': [source.summary() for source in sources],
              'downloaded_range_bytes': sum(source.bytes for source in sources),
              'disk_free_after_bytes': shutil.disk_usage(ROOT).free,
              'provider_requests': 0, 'model_inferences': 0, 'private_uploads': 0,
              'evaluation_content_displayed': False, 'signed_asset_urls_persisted': False}
    write(out / 'collection.json', result)
    for role in ['development', 'evaluation']:
        with (out / ('model-inputs-' + role + '.jsonl')).open('x', encoding='utf-8', newline='\n') as handle:
            for row in completed:
                if row['role'] == role and row['eligible_before_visual_review']:
                    handle.write(json.dumps({key: row[key] for key in ['receipt_id', 'role', 'image_path', 'image_sha256']}) + '\n')
    print(json.dumps({key: result[key] for key in ['terminal', 'error', 'planned', 'completed', 'eligible_before_visual_review', 'downloaded_range_bytes', 'disk_free_after_bytes', 'model_inferences', 'provider_requests', 'evaluation_content_displayed']}))
    if error:
        raise SystemExit(2)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--study', default='qa-artifacts/fresh-cord-cohort-v3')
    parser.add_argument('--previous-study', default='qa-artifacts/fresh-cord-cohort-v2')
    parser.add_argument('--prepare', action='store_true')
    parser.add_argument('--collect', action='store_true')
    args = parser.parse_args()
    require(args.prepare != args.collect, 'Choose prepare or collect')
    out = local(args.study)
    if args.prepare:
        prepare(out, local(args.previous_study))
    else:
        collect(out)


if __name__ == '__main__':
    main()
