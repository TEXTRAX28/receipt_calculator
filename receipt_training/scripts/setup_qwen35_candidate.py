"""Install only two pinned public research assets; never replace the runtime."""
import argparse
import json
from pathlib import Path
import shutil
import time

from qwen8b_resources import available_memory, DISK_RESERVE
from setup_vision_candidate import CACHE, ROOT, valid
from setup_qwen8b_candidate import RUNTIME, stream_asset, verify_runtime

MANIFEST = ROOT / 'receipt_training/evaluation/qwen35-2b-candidate-manifest.json'
MODEL = 'unsloth/Qwen3.5-2B-GGUF'
REVISION = 'f6d5376be1edb4d416d56da11e5397a961aca8ae'
EXPECTED = {
    'qwen35-2b/Qwen3.5-2B-Q4_K_M.gguf': (1280835840, 'aaf42c8b7c3cab2bf3d69c355048d4a0ee9973d48f16c731c0520ee914699223'),
    'qwen35-2b/mmproj-F16.gguf': (668227264, '7035e9cb8d7c6a9681d07eef9a364783e86ea4cd73faab2eabb4f43a101830c7'),
}


def manifest():
    value = json.loads(MANIFEST.read_text(encoding='utf-8'))
    assert value['model'] == MODEL and value['revision'] == REVISION and value['research_only']
    assert value['base_model'] == 'Qwen/Qwen3.5-2B'
    assert value['base_model_revision'] == '15852e8c16360a2fea060d615a32b45270f8a8fc'
    assert value['runtime_build'] == 'b11960' and value['files'][-1] == RUNTIME
    assert value['runtime_commit'] == '8642541b255bfb5dc39cd351a178be09013a55d6'
    assert len(value['files']) == 3 and sum(e['bytes'] for e in value['files']) < 4_000_000_000
    assert [e['path'] for e in value['files'][:2]] == list(EXPECTED)
    for entry in value['files'][:2]:
        assert EXPECTED[entry['path']] == (entry['bytes'], entry['sha256'])
        assert entry['url'] == f"https://huggingface.co/{MODEL}/resolve/{REVISION}/{Path(entry['path']).name}"
    return value


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--download', action='store_true')
    mode.add_argument('--check', action='store_true')
    args = parser.parse_args()
    value = manifest()
    entries = value['files'][:2]
    targets = [(CACHE / entry['path']).resolve() for entry in entries]
    for target in targets:
        target.relative_to(CACHE.resolve())
    present = [valid(target, entry) for target, entry in zip(targets, entries)]
    missing = sum(entry['bytes'] for entry, ok in zip(entries, present) if not ok)
    initial = available_memory()[1]
    if not args.download and not args.check:
        print(json.dumps({'assets_valid': all(present), 'missing_bytes': missing,
                          'available_ram_bytes': initial, 'disk_free_bytes': shutil.disk_usage(ROOT).free,
                          'model_inferences': 0, 'downloaded': False}))
        return
    if args.download:
        if initial < 1610612736 or shutil.disk_usage(ROOT).free < DISK_RESERVE + missing:
            raise ValueError('CPU startup RAM and ten-GiB disk reserve must pass before download')
    verify_runtime(value)
    start = time.monotonic()
    downloaded = []
    for entry, target, ok in zip(entries, targets, present):
        if not ok:
            if not args.download:
                raise ValueError('A pinned research asset is absent or changed')
            if target.exists():
                raise ValueError('An existing cache file will not be replaced')
            stream_asset(entry, target, deadline=300)
            downloaded.append(entry['path'])
        assert valid(target, entry)
    print(json.dumps({'model': MODEL, 'revision': REVISION, 'assets_valid': True,
                      'downloaded_paths': downloaded, 'downloaded_bytes': sum(e['bytes'] for e in entries if e['path'] in downloaded),
                      'elapsed_ms': round((time.monotonic()-start)*1000), 'existing_runtime_verified_unmodified': True,
                      'model_inferences': 0, 'private_uploads': 0, 'api_requests': 0}))


if __name__ == '__main__':
    main()
