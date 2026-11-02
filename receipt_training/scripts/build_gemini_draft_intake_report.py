"""Audit literal draft retention separately from the frozen native benchmark.

No provider calls, amount conversion, coupon inference, or reference changes.
"""
import base64
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys

from audit_evidence_integrity import sha
from review_veryfi_screening import compare
from review_gemini35_screening import aggregate

ROOT = Path(__file__).resolve().parents[2]
BASE = 'qa-artifacts/gemini-draft-intake-v1'
OUT = ROOT / 'receipt_training/evaluation/advanced-gemini-draft-intake-v1.json'
PARENT = '71c502708d88bab3c72e8671c7a1eddf037b0186'
HASHES = {}


def record(name, expected=None):
    path = (ROOT / name).resolve()
    path.relative_to(ROOT)
    assert not any(part.startswith('.env') for part in path.parts), name
    digest = sha(path) if path.is_file() else None
    if expected and digest != expected:
        path = ROOT / 'qa-artifacts/evidence-blobs' / expected
        assert path.is_file() and sha(path) == expected, name
        HASHES[path.relative_to(ROOT).as_posix()] = expected
        digest = expected
    assert digest, name
    HASHES[name] = digest
    return path


def load(name, expected=None):
    return json.loads(record(name, expected).read_text(encoding='utf-8'))


def tree(name):
    for path in sorted((ROOT / name).rglob('*')):
        if path.is_file():
            record(path.relative_to(ROOT).as_posix())


def browser_artifacts(value):
    if isinstance(value, dict):
        if value.get('name') == 'QA artifact directory':
            directory = base64.b64decode(value['body'], validate=True).decode('utf-8').replace('\\', '/')
            assert directory.startswith('qa-artifacts/e2e-runs/')
            tree(directory)
        for child in value.values():
            browser_artifacts(child)
    elif isinstance(value, list):
        for child in value:
            browser_artifacts(child)


def project(raw):
    # Invalid monetary literals remain in the decoded/application drafts. They
    # are unavailable numeric fields here, never interpreted as thousands.
    def number(value):
        return value if re.fullmatch(r'-?[0-9]{1,12}(?:[.][0-9]{1,6})?', value) else None

    return {
        'line_items': [
            {'row_index': i, 'description': item['description'],
             'quantity': number(item['quantity']), 'price': number(item['unitPrice']),
             'total': number(item['lineTotal']), 'discount': number(item['discount']),
             'tax_code': item['taxCode']}
            for i, item in enumerate(raw['items'])
        ],
        'document': {'subtotal': number(raw['subtotal']),
                     'total': number(raw['printedTotal']), 'tax': number(raw['printedTax'])},
    }


def main():
    if '--check' in sys.argv:
        packet = json.loads(OUT.read_text(encoding='utf-8'))
        for name, digest in packet['evidence_sha256'].items():
            record(name, digest)
        print(json.dumps({'verified_files': len(HASHES), 'new_external_requests': 0}))
        return
    assert not OUT.exists(), 'Preserve the sealed evidence packet'
    git = lambda *args, cwd=ROOT: subprocess.check_output(['git', *args], cwd=cwd)
    assert git('rev-parse', 'HEAD').decode().strip() == PARENT
    assert git('branch', '--show-current').decode().strip() == 'feature/advanced-ocr-vision-ai'
    protocol = load(BASE + '/plan.json')
    assert protocol['parent_commit'] == PARENT and protocol['recorded_before_change']
    for name, digest in protocol['source_sha256'].items():
        assert hashlib.sha256(git('show', PARENT + ':' + name)).hexdigest() == digest, name
        record(BASE + '/before/' + name, digest)

    native = load('receipt_training/evaluation/advanced-gemini35-screening-result-v1.json')
    for name, digest in native['evidence_sha256'].items():
        record(name, digest)
    labels_name = 'qa-artifacts/provider-review/veryfi-screening-crops-v2/screening-labels-v1.jsonl'
    labels = {row['receipt_id']: row for row in map(json.loads, record(labels_name, native['evidence_sha256'][labels_name]).read_text(encoding='utf-8').splitlines())}
    config_name = 'receipt_training/evaluation/config.json'
    config = load(config_name, native['evidence_sha256'][config_name])
    for name in ('score.py', 'review_veryfi_screening.py'):
        path = 'receipt_training/scripts/' + name
        record(path, native['evidence_sha256'][path])

    meta = load(BASE + '/replay/metadata.json')
    assert meta['new_model_calls'] == meta['external_requests'] == 0
    assert meta['editable_drafts'] == meta['mock_transport_calls'] == 6
    assert meta['canonical_drafts'] == 4 and meta['unparsed_drafts'] == 2
    for name in ('source_unchanged', 'literal_output_unchanged', 'provider_request_schema_unchanged', 'unparsed_money_blocks_finalization'):
        assert meta[name]
    for name, digest in meta['input_sha256'].items():
        record(name, digest)
    for name, digest in meta['source_sha256'].items():
        assert sha(ROOT / name) == digest, name
        record(name, digest)
        record(BASE + '/replay/source/' + name, digest)
    record(BASE + '/replay/runner.mjs', meta['runner_sha256'])
    rows = load(BASE + '/replay/predictions.json', meta['predictions_sha256'])
    assert len(rows) == 6 and len({row['receipt_id'] for row in rows}) == 6
    assert sum(row['canonical_schema_valid'] for row in rows) == 4
    per_case = []
    for row in rows:
        if row['pending_format_checks']:
            assert row['cannot_finalize_after_checking']
        score = compare(labels[row['receipt_id']], project(row['decoded']), config)
        per_case.append({'case': row['case'], 'receipt_id': row['receipt_id'],
                         'canonical': row['canonical_schema_valid'], 'score': score})
    retained = aggregate([row['score'] for row in per_case])
    previous = native['gemini_all_planned_case_field_coverage']
    expected = dict(previous)
    expected.update(native_rows=retained['native_rows'], matched_reference_names=26,
                    exact_normalized_descriptions=26, quantity_correct=15)
    assert retained == expected, (retained, expected)

    fifty = load('qa-artifacts/grouped-amounts-v10/scores.json')
    replay = load('qa-artifacts/grouped-amounts-v10/replay/metadata.json')
    assert replay['prediction_views'] == 400 and replay['new_model_requests'] == replay['external_requests'] == 0
    assert not replay['references_changed'] and replay['recovery_checks_unconfirmed']
    assert not fifty['improvements'] and not fifty['regressions']
    for key, count in fifty['counts'].items():
        if key.endswith('/before'):
            assert count == fifty['counts'][key.replace('/before', '/after')]
    for mapping in (fifty['evidence_sha256'], replay['input_sha256']):
        for name, digest in mapping.items():
            record(name, digest)
    for variant, mapping in replay['source_sha256'].items():
        for name, digest in mapping.items():
            record(replay['frozen_source_paths'][variant] + '/' + name, digest)

    tests = load(BASE + '/final-unit-tests.json')
    assert tests['success'] and tests['numFailedTests'] == 0
    assert tests['numPassedTests'] == tests['numTotalTests'] == 1010
    build = load('qa-artifacts/gemini-draft-intake-build-v3/proof.json')
    assert build['exit_code'] == 0 and build['source_unchanged']
    for name, digest in {**build['source_sha256'], **build['build_sha256']}.items():
        assert sha(ROOT / name) == digest, name
        record(name, digest)
    browser_base = 'qa-artifacts/gemini-draft-intake-browser-v2'
    browser, plan = load(browser_base + '/controller.json'), load(browser_base + '/plan.json')
    assert browser['spawned'] and browser['exit_code'] == 0 and not browser.get('error')
    stats = load(browser_base + '/results.json')['stats']
    assert stats['expected'] == plan['expected_tests'] == 27
    assert stats['unexpected'] == stats['flaky'] == stats['skipped'] == 0
    for name, digest in {**plan['source_sha256'], **plan['build_sha256']}.items():
        assert sha(ROOT / name) == digest, name
        record(name, digest)
    assert plan['retries'] == plan['private_uploads'] == 0
    assert browser['minimum_available_ram'] >= plan['runtime_floor_bytes'] == 1073741824
    assert browser['initial_available_ram'] >= plan['startup_floor_bytes'] == 2684354560

    for version in (1, 2):
        browser_artifacts(load(f'qa-artifacts/gemini-draft-intake-browser-v{version}/results.json'))
    refresh = load(BASE + '/model-plan-refresh.json')
    assert refresh['models_images_parameters_limits_scoring_timing_unchanged']
    assert refresh['changed_inputs'] == ['src/lib/extraction-schema.mjs', 'src/lib/gemini.ts']
    for name, digest in refresh['evidence_sha256'].items():
        record(name, digest)
    study = load(refresh['to'])
    for name, digest in study['input_sha256'].items():
        record(name, digest)
    resources = load(BASE + '/resource-check.json')
    assert resources['available_ram_bytes'] < study['limits']['startup_ram_bytes']
    assert resources['free_disk_bytes'] < resources['qwen8b_required_disk_with_reserve_bytes']
    assert not resources['larger_trial_started']

    stable = git('rev-parse', 'stable/receipt-verified').decode().strip()
    assert stable == 'ee725ba45e799bee8501d3de034e0302c0127afd'
    original = Path(r'C:\Users\natan\VSC Code\costco_calc')
    original_head = git('rev-parse', 'HEAD', cwd=original).decode().strip()
    original_diff = hashlib.sha256(git('diff', '--binary', cwd=original)).hexdigest()
    assert original_head == '29a187af7347be94c0728f4785be674500833748'
    assert original_diff == '72fe803bf341a3052a441b7144838d06e7f4cbea5b59d612feb649368442e31b'

    for name in (BASE, 'qa-artifacts/gemini-draft-intake-build-v1',
                 'qa-artifacts/gemini-draft-intake-build-v2', 'qa-artifacts/gemini-draft-intake-build-v3',
                 'qa-artifacts/gemini-draft-intake-browser-v1', browser_base,
                 'receipt_training/evaluation/runs/gemini-draft-intake-browser-v1',
                 'receipt_training/evaluation/runs/gemini-draft-intake-browser-v2'):
        tree(name)
    for name in ('README.md', 'receipt_training/scripts/build_gemini_draft_intake_report.py',
                 'receipt_training/scripts/replay_gemini_draft_intake.mjs',
                 'receipt_training/scripts/review_gemini35_screening.py',
                 'receipt_training/evaluation/GEMINI_DRAFT_INTAKE.md',
                 'receipt_training/evaluation/GOAL_ACCEPTANCE_AUDIT.md',
                 'receipt_training/evaluation/ADVANCED_OCR_REPORT.md'):
        record(name)
    packet = {'parent_commit': PARENT, 'stable_ref': stable,
              'original_checkout_head': original_head, 'original_diff_sha256': original_diff,
              'new_model_calls': 0, 'new_private_uploads': 0, 'editable_drafts_before': 4,
              'editable_drafts_after': 6, 'canonical_drafts_after': 4, 'unparsed_drafts': 2,
              'literal_amounts_unchanged': True, 'unparsed_amounts_block_finalization': True,
              'before_all_case_fields': previous, 'after_all_case_fields': retained,
              'per_case': per_case, 'original_fifty_counts_unchanged': True,
              'unit_tests_passed': 1010, 'browser_stats': stats,
              'build_passed': True, 'default_provider_changed': False,
              'limits': ['Offline delivery recovery of the same six saved responses; no new model accuracy or independent holdout claim.',
                         'Grouped literals have no numeric interpretation in the app or scorer. Missing currencies/quantities remain missing.',
                         'Historical four-success/two-rejection native benchmark is unchanged. Every planned case remains in the denominator.',
                         'Browser tests use synthetic mocked responses and host phone emulation, not live inference or a physical phone.',
                         'Public release and trusted automatic financial acceptance remain unverified.'],
              'evidence_sha256': HASHES}
    with OUT.open('x', encoding='utf-8', newline='\n') as handle:
        handle.write(json.dumps(packet, indent=2, ensure_ascii=False) + '\n')
    print(json.dumps({'output': OUT.relative_to(ROOT).as_posix(), 'verified_files': len(HASHES),
                      'editable_drafts': 6, 'unparsed_drafts': 2, 'new_external_requests': 0}))


if __name__ == '__main__':
    main()
