"""Bind source-owned quantity recovery to unchanged saved Azure readings."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

from audit_evidence_integrity import sha
from review_veryfi_screening import compare
from review_gemini35_screening import aggregate

ROOT = Path(__file__).resolve().parents[2]
BASE = 'qa-artifacts/azure-quantity-v1'
REPLAY = BASE + '/replay-v3'
BUILD = 'qa-artifacts/azure-quantity-build-v4'
BROWSER = 'qa-artifacts/azure-quantity-browser-v1'
PARENT = '82403381b6fd74d89c5f3e6ae9f52bc672a6c621'
OUT = ROOT / 'receipt_training/evaluation/advanced-azure-quantity-recovery-v1.json'
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
    directory = ROOT / name
    assert directory.is_dir(), name
    for path in sorted(directory.rglob('*')):
        if path.is_file():
            record(path.relative_to(ROOT).as_posix())


def main():
    if '--check' in sys.argv:
        packet = json.loads(OUT.read_text(encoding='utf-8'))
        for name, digest in packet['evidence_sha256'].items():
            record(name, digest)
        # A shared path can occur in both the earlier browser plan and final
        # build. Verify both versions, including final test-only corrections.
        proof_name = BUILD + '/proof.json'
        proof = load(proof_name, packet['evidence_sha256'][proof_name])
        for name, digest in {**proof['source_sha256'], **proof['build_sha256']}.items():
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

    meta = load(REPLAY + '/metadata.json')
    scores = load(REPLAY + '/scores.json')
    assert meta['prediction_views'] == scores['prediction_views'] == 24
    assert meta['new_model_calls'] == meta['external_requests'] == scores['new_model_calls'] == 0
    assert scores['transactions'] == 6 and scores['all_drafts_blocked']
    for key in ['other_fields_unchanged', 'source_words_unchanged', 'all_checks_unconfirmed']:
        assert meta[key]
    assert len(meta['changes']) == 10
    for version, mapping in meta['source_sha256'].items():
        for name, digest in mapping.items():
            record(REPLAY + '/' + version + '/' + name, digest)
            if version == 'after':
                assert sha(ROOT / name) == digest, name
                record(name, digest)
        for name, digest in meta['loaded_source_sha256'][version].items():
            assert mapping[name] == digest, name
    for mapping in (meta['input_sha256'], scores['evidence_sha256']):
        for name, digest in mapping.items():
            record(name, digest)
    record(REPLAY + '/runner.mjs', meta['runner_sha256'])

    native = load('receipt_training/evaluation/advanced-azure-screening-result-v2.json')
    label_name = 'qa-artifacts/provider-review/veryfi-screening-crops-v2/screening-labels-v1.jsonl'
    labels = {row['receipt_id']: row for row in map(json.loads, record(label_name, native['evidence_sha256'][label_name]).read_text(encoding='utf-8').splitlines())}
    config_name = 'receipt_training/evaluation/config.json'
    config = load(config_name, native['evidence_sha256'][config_name])
    rows = load(REPLAY + '/predictions.json', meta['predictions_sha256'])
    assert len(rows) == 24 and len({r['receipt_id'] for r in rows}) == 6
    pairs, groups = {}, {}
    for row in rows:
        receipt = row['receipt']
        assert all(check['confirmedValue'] == '' for check in receipt['reviewChecks'])
        assert row['calculation']['issues']
        view = {'line_items': [
            {'row_index': i, 'description': item['description'], 'quantity': item['quantity'] or None,
             'price': item['unitPrice'] or None, 'total': item['lineTotal'] or None,
             'discount': item['discount'] or None, 'tax_code': item['taxCode'] or None}
            for i, item in enumerate(receipt['items'])],
            'document': {'subtotal': receipt['subtotal'] or None, 'total': receipt['printedTotal'] or None,
                         'tax': receipt['printedTax'] or None}}
        key = row['version'] + '/' + row['mode']
        groups.setdefault(key, []).append(compare(labels[row['receipt_id']], view, config))
        pairs[(row['case'], row['mode'], row['version'])] = row
    counts = {key: aggregate(values) for key, values in groups.items()}
    assert counts == scores['counts']
    changes = 0
    for case, mode, version in pairs:
        if version != 'before':
            continue
        before, after = pairs[(case, mode, 'before')], pairs[(case, mode, 'after')]
        assert before['recognition'] == after['recognition']
        a, b = before['receipt'], after['receipt']
        # Fresh parses allocate fresh receipt/item/adjustment IDs. Compare
        # purchase order and values, not these unrelated generated identities.
        excluded = {'id', 'items', 'reviewChecks', 'adjustments'}
        assert {k: v for k, v in a.items() if k not in excluded} == {
            k: v for k, v in b.items() if k not in excluded}
        assert [{k: v for k, v in item.items() if k != 'id'} for item in a['adjustments']] == [
            {k: v for k, v in item.items() if k != 'id'} for item in b['adjustments']]
        assert len(a['items']) == len(b['items'])
        for left, right in zip(a['items'], b['items'], strict=True):
            assert {k: v for k, v in left.items() if k not in {'id', 'quantity'}} == {
                k: v for k, v in right.items() if k not in {'id', 'quantity'}}
            if left['quantity'] != right['quantity']:
                changes += 1
                assert left['quantity'] == '' and right['quantity'] == '1'
                assert any(c['scope'] == 'item' and c.get('itemId') == right['id'] and
                           c['field'] == 'quantity' and c['confirmedValue'] == '' for c in b['reviewChecks'])
    assert changes == 10
    for mode in ['automatic', 'known-currency']:
        expected = dict(counts['before/' + mode])
        assert expected['quantity_correct'] == 9 and expected['quantity_known'] == 15
        expected['quantity_correct'] = 14
        assert counts['after/' + mode] == expected

    fifty = load('qa-artifacts/grouped-amounts-v11/scores.json')
    replay = load('qa-artifacts/grouped-amounts-v11/replay/metadata.json')
    assert replay['prediction_views'] == 400 and replay['new_model_requests'] == replay['external_requests'] == 0
    assert not replay['references_changed'] and replay['recovery_checks_unconfirmed']
    assert not fifty['improvements'] and not fifty['regressions']
    for key, count in fifty['counts'].items():
        if key.endswith('/before'):
            assert count == fifty['counts'][key.replace('/before', '/after')]
    for mapping in (fifty['evidence_sha256'], replay['input_sha256']):
        for name, digest in mapping.items():
            record(name, digest)
    for version, mapping in replay['source_sha256'].items():
        for name, digest in mapping.items():
            record(replay['frozen_source_paths'][version] + '/' + name, digest)
        for name, digest in replay['loaded_frozen_source_sha256'][version].items():
            assert mapping[name] == digest, name
            if version == 'after':
                assert sha(ROOT / name) == digest, name

    tests = load(BASE + '/final-validation-tests.json')
    assert tests['success'] and tests['numFailedTests'] == tests['numPendingTests'] == 0
    assert tests['numPassedTests'] == tests['numTotalTests'] == 1037
    focused = load(BASE + '/http-quantity-tests.json')
    assert focused['success'] and focused['numPassedTests'] == 57
    build = load(BUILD + '/proof.json')
    assert build['exit_code'] == 0 and build['source_unchanged']
    for name, digest in {**build['source_sha256'], **build['build_sha256']}.items():
        assert sha(ROOT / name) == digest, name
        record(name, digest)
    record(BUILD + '/output.log', build['log_sha256'])
    browser, plan = load(BROWSER + '/controller.json'), load(BROWSER + '/plan.json')
    assert not browser['spawned'] and browser['error'] == 'insufficient-available-ram-before-start'
    assert browser['initial_available_ram'] < plan['startup_floor_bytes'] == 2684354560
    assert plan['runtime_floor_bytes'] == 1073741824
    assert plan['expected_tests'] == 15 and plan['workers'] == 1
    assert plan['retries'] == plan['private_uploads'] == browser['private_uploads'] == 0
    assert not (ROOT / BROWSER / 'results.json').exists()
    for name, digest in {**plan['source_sha256'], **plan['build_sha256']}.items():
        record(name, digest)

    refresh = load(BASE + '/model-plan-refresh.json')
    assert refresh['models_images_parameters_limits_scoring_timing_unchanged']
    assert refresh['changed_inputs'] == ['src/lib/azure-layout.mjs', 'src/lib/azure-quantities.ts',
                                         'src/lib/azure-schema.mjs', 'src/lib/azure.ts']
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
    for name in [BASE, BROWSER, 'qa-artifacts/azure-quantity-build-v1',
                 'qa-artifacts/azure-quantity-build-v2', 'qa-artifacts/azure-quantity-build-v3', BUILD]:
        tree(name)
    for name in ['README.md', 'receipt_training/scripts/build_azure_quantity_report.py',
                 'receipt_training/scripts/replay_azure_quantities.mjs',
                 'receipt_training/scripts/score_azure_quantities.py',
                 'receipt_training/evaluation/AZURE_QUANTITY_RECOVERY.md',
                 'receipt_training/evaluation/AZURE_APP_READER.md',
                 'receipt_training/evaluation/GOAL_ACCEPTANCE_AUDIT.md',
                 'receipt_training/evaluation/ADVANCED_OCR_REPORT.md']:
        record(name)
    packet = {'parent_commit': PARENT, 'stable_ref': stable, 'original_checkout_head': original_head,
              'original_diff_sha256': original_diff, 'new_model_calls': 0, 'new_private_uploads': 0,
              'transactions': 6, 'counts': counts, 'recovered_purchases': 5,
              'all_proposals_require_source_review': True, 'all_monetary_fields_unchanged': True,
              'original_fifty_counts_unchanged': True, 'unit_tests_passed': 1037,
              'synthetic_http_cases_passed': 2, 'build_passed': True, 'browser_completed': False,
              'browser_refusal': browser, 'default_provider_changed': False, 'allowance_increased': False,
              'limits': ['Interpretation of the same six saved Azure responses, not new OCR or independent verification.',
                         'One quantity stays blank because its description evidence is weak; all proposed quantities need source review.',
                         'Native money/currency ignored. Known-currency scores are conditional on separate user context.',
                         'Browser journey unexecuted under the unchanged RAM guard. HTTP controls use synthetic provider data.',
                         'Public release, physical-phone support and trusted automatic financial acceptance remain unverified.'],
              'evidence_sha256': HASHES}
    with OUT.open('x', encoding='utf-8', newline='\n') as file:
        file.write(json.dumps(packet, indent=2) + '\n')
    print(json.dumps({'output': OUT.relative_to(ROOT).as_posix(), 'verified_files': len(HASHES),
                      'quantity_before': 9, 'quantity_after': 14, 'quantity_known': 15, 'new_external_requests': 0}))


if __name__ == '__main__':
    main()
