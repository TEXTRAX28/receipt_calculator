"""Bind source-backed role recovery, paired replays and explicit browser gaps."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

from audit_evidence_integrity import sha

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'receipt_training/evaluation/advanced-reduced-price-role-v1.json'
PARENT = '9f8db67253d5d8b29a29965b061fdc99b9131d50'
BASE = 'qa-artifacts/grouped-amounts-v9'
HASHES = {}


def record(name, expected=None):
    path = ROOT / name
    path.resolve().relative_to(ROOT)
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


def main():
    if '--check' in sys.argv:
        packet = json.loads(OUT.read_text(encoding='utf-8'))
        for name, digest in packet['evidence_sha256'].items():
            record(name, digest)
        print(json.dumps({'verified_files': len(HASHES), 'new_model_calls': 0}))
        return
    assert not OUT.exists(), 'Preserve the sealed packet'
    git = lambda *args, cwd=ROOT: subprocess.check_output(['git', *args], cwd=cwd)
    assert git('rev-parse', 'HEAD').decode().strip() == PARENT
    assert git('branch', '--show-current').decode().strip() == 'feature/advanced-ocr-vision-ai'
    protocol = load(BASE + '/plan.json')
    assert protocol['recorded_before_change'] and protocol['parent_commit'] == PARENT
    for name, digest in protocol['reference_sha256'].items():
        assert sha(ROOT / name) == digest, name
        record(name, digest)
    for name, digest in protocol['source_sha256'].items():
        assert hashlib.sha256(git('show', PARENT + ':' + name)).hexdigest() == digest, name
        record(BASE + '/before/' + name, digest)

    meta, fifty = load(BASE + '/replay/metadata.json'), load(BASE + '/scores.json')
    assert meta['prediction_views'] == 400 and meta['new_model_requests'] == meta['external_requests'] == 0
    assert not meta['references_changed'] and meta['recovery_checks_unconfirmed']
    assert not fifty['improvements'] and not fifty['regressions']
    for reader in ('primary', 'hybrid'):
        for mode in ('automatic', 'known-currency'):
            assert fifty['counts'][f'{reader}/{mode}/before'] == fifty['counts'][f'{reader}/{mode}/after']
    for mapping in (meta['input_sha256'], fifty['evidence_sha256']):
        for name, digest in mapping.items():
            record(name, digest)
    for variant, mapping in meta['source_sha256'].items():
        for name, digest in mapping.items():
            record(meta['frozen_source_paths'][variant] + '/' + name, digest)
            if variant == 'after':
                assert sha(ROOT / name) == digest, name
                record(name, digest)

    six = {}
    for version in (1, 2):
        folder = f'qa-artifacts/provider-review/azure-gemini35-replay-v{version}'
        replay, score = load(folder + '/metadata.json'), load(folder + '/scores.json')
        assert replay['prediction_views'] == score['views'] == 24
        assert replay['new_model_calls'] == replay['external_requests'] == 0
        assert replay['source_unchanged'] and replay['originals_unchanged'] and replay['all_checks_unconfirmed']
        assert score['all_drafts_blocked']
        for mapping in (score['evidence_sha256'], replay['input_sha256']):
            for name, digest in mapping.items():
                record(name, digest)
        tree(folder)
        six[str(version)] = {'counts': score['counts'], 'input_sha256': replay['input_sha256']}
    assert six['1']['input_sha256'] == six['2']['input_sha256']
    for method, counts in six['1']['counts'].items():
        expected = dict(counts)
        if method == 'azure-gemini-with-fallback/known-currency':
            expected['total_correct'] += 2
        assert six['2']['counts'][method] == expected, method
    changes = load(BASE + '/six-crop-differences.json')
    assert len(changes) == 1 and changes[0]['receipt_id'] == 'tesco-gb-1994'
    predictions = load('qa-artifacts/provider-review/azure-gemini35-replay-v2/predictions.json')
    candidate = next(row for row in predictions if row['case'] == 'case-03' and row['mode'] == 'known-currency' and row['compared'])
    receipt = candidate['receipt']
    assert candidate['calculation']['issues'] and all(c['confirmedValue'] == '' for c in receipt['reviewChecks'])
    for name, amount in (('4 TEACAKES', '0.50'), ('18 BROWN ROLLS', '0.85')):
        item = next(row for row in receipt['items'] if row['description'] == name)
        assert item['lineTotal'] == amount and item['discount'] == '0' and item['unitPrice'] == ''
        for field in ('lineTotal', 'discount'):
            assert any(c.get('itemId') == item['id'] and c['field'] == field and c['reason'] == 'recovered' for c in receipt['reviewChecks'])
    assert receipt['items'][0]['lineTotal'] == '' and receipt['items'][0]['discount'] == '0.55'

    tests = load(BASE + '/final-unit-tests.json')
    assert tests['numPassedTests'] == tests['numTotalTests'] == 987 and tests['numFailedTests'] == 0
    assert len(tests['testResults']) == 59
    initial = load(BASE + '/focused-tests-initial.json')
    assert initial['numFailedTests'] == 1
    build = load('qa-artifacts/reduced-price-role-build-v1/proof.json')
    assert build['exit_code'] == 0 and build['source_unchanged']
    for name, digest in {**build['source_sha256'], **build['build_sha256']}.items():
        assert sha(ROOT / name) == digest, name
        record(name, digest)
    browser = load('qa-artifacts/reduced-price-role-browser-v1/controller.json')
    browser_plan = load('qa-artifacts/reduced-price-role-browser-v1/plan.json')
    assert browser_plan['expected_tests'] == 24
    assert not browser['spawned'] and browser['error'] == 'insufficient-available-ram-before-start'
    assert browser['initial_available_ram'] < browser['startup_floor_bytes'] == 2684354560
    refresh = load(BASE + '/model-plan-refresh.json')
    assert refresh['changed_inputs'] == ['src/lib/reduced-price-role.ts', 'src/lib/verify-readings.ts']
    assert refresh['models_images_parameters_limits_scoring_timing_unchanged']
    study = load('qa-artifacts/browser-paddle-medium-paired-plan-v6/study-plan.json')
    for name, digest in study['input_sha256'].items():
        record(name, digest)
    for folder in (BASE, 'qa-artifacts/reduced-price-role-build-v1', 'qa-artifacts/reduced-price-role-browser-v1', 'qa-artifacts/browser-paddle-medium-paired-plan-v6'):
        tree(folder)
    record('qa-artifacts/reduced-price-role-build-v1.py')
    original = Path(r'C:\Users\natan\VSC Code\costco_calc')
    protected = {'stable': git('rev-parse', 'stable/receipt-verified').decode().strip(),
                 'original_head': git('rev-parse', 'HEAD', cwd=original).decode().strip(),
                 'original_diff_sha256': hashlib.sha256(git('diff', '--binary', cwd=original)).hexdigest()}
    assert protected == {'stable': 'ee725ba45e799bee8501d3de034e0302c0127afd',
                         'original_head': '29a187af7347be94c0728f4785be674500833748',
                         'original_diff_sha256': '72fe803bf341a3052a441b7144838d06e7f4cbea5b59d612feb649368442e31b'}
    for name in ('REDUCED_PRICE_ROLE_RECOVERY.md', 'GOAL_ACCEPTANCE_AUDIT.md', 'ADVANCED_OCR_REPORT.md'):
        record('receipt_training/evaluation/' + name)
    for name in ('replay_reduced_price_role.mjs', 'score_reduced_price_role.py', Path(__file__).name):
        record('receipt_training/scripts/' + name)
    result = {'parent_commit': PARENT, 'scope': protocol['scope'],
              'original_fifty_counts': fifty['counts'], 'original_fifty_improvements': [], 'original_fifty_regressions': [],
              'six_crop_before': six['1']['counts'], 'six_crop_after': six['2']['counts'], 'changed_scored_views': changes,
              'unit_tests': {'passed': 987, 'files': 59, 'new_cases': 21, 'initial_assertion_failure_retained': True},
              'production_build_and_typecheck': 'passed', 'browser': {'executed_tests': 0, 'prepared_tests': 24, 'controller': browser},
              'pending_model_study': refresh, 'protected_checkouts': protected,
              'new_model_calls': 0, 'private_uploads': 0, 'api_charges': 0, 'provider_or_default_switch': False,
              'limits': ['Two recovered fields on one familiar development receipt, not blind inference.',
                         'No original-fifty field gain or trusted automatic acceptance.',
                         'No live cloud combination; raw model outputs and failed cases unchanged.',
                         'New and slanted-column browser scenarios remain unexecuted under unchanged guard.',
                         'Full goal, physical-device and public-release acceptance remain open.'],
              'evidence_sha256': HASHES}
    with OUT.open('x', encoding='utf-8', newline='\n') as file:
        json.dump(result, file, indent=2)
        file.write('\n')
    print(json.dumps({'packet': OUT.relative_to(ROOT).as_posix(), 'evidence_files': len(HASHES), 'unit_tests': 987, 'new_model_calls': 0}))


if __name__ == '__main__':
    main()
