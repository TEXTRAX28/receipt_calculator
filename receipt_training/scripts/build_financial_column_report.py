"""Bind the slanted-footer replay, checks and explicit browser/resource gaps."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

from audit_evidence_integrity import sha

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'receipt_training/evaluation/advanced-financial-word-columns-v1.json'
PARENT = 'b2d526181ea4166d980dc091e0b1474946557017'
HASHES = {}


def record(name, expected=None):
    path = ROOT / name
    path.resolve().relative_to(ROOT)
    assert not path.name.startswith('.env') or path.name == '.env.example'
    digest = sha(path) if path.is_file() else None
    if expected and digest != expected:
        path = ROOT / 'qa-artifacts/evidence-blobs' / expected
        assert path.is_file() and sha(path) == expected, name
        digest = expected
        HASHES[path.relative_to(ROOT).as_posix()] = expected
    assert digest is not None, name
    HASHES[name] = digest
    return path


def load(name):
    return json.loads(record(name).read_text(encoding='utf-8'))


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
    assert not OUT.exists(), 'Preserve the sealed evidence packet'
    git = lambda *args, cwd=ROOT: subprocess.check_output(['git', *args], cwd=cwd)
    assert git('rev-parse', 'HEAD').decode().strip() == PARENT
    assert git('branch', '--show-current').decode().strip() == 'feature/advanced-ocr-vision-ai'
    protocol = load('qa-artifacts/grouped-amounts-v7/plan.json')
    assert protocol['recorded_before_change'] and protocol['parent_commit'] == PARENT
    for name, digest in protocol['reference_sha256'].items():
        assert sha(ROOT / name) == digest, name
        record(name, digest)
    for name, digest in protocol['source_sha256'].items():
        assert hashlib.sha256(git('show', PARENT + ':' + name)).hexdigest() == digest
        record('qa-artifacts/grouped-amounts-v7/before/' + name, digest)
    summaries = {}
    for version in (7, 8):
        base = f'qa-artifacts/grouped-amounts-v{version}'
        meta, score = load(base + '/replay/metadata.json'), load(base + '/scores.json')
        assert meta['prediction_views'] == 400
        assert meta['new_model_requests'] == meta['external_requests'] == 0
        assert not meta['references_changed'] and meta['recovery_checks_unconfirmed']
        assert not score['regressions']
        assert score['improvements'] == [{'receipt_id': 'cord-v2-train-001', 'reader': 'hybrid', 'mode': 'known-currency', 'field': 'price_basis_correct', 'delta': 1}]
        for mapping in (meta['input_sha256'], score['evidence_sha256']):
            for name, digest in mapping.items():
                record(name, digest)
        for variant, mapping in meta['source_sha256'].items():
            for name, digest in mapping.items():
                record(meta['frozen_source_paths'][variant] + '/' + name, digest)
                if version == 8 and variant == 'after':
                    assert sha(ROOT / name) == digest, name
        tree(base)
        summaries[str(version)] = {k: score[k] for k in ('counts', 'improvements', 'regressions')}
    assert summaries['7'] == summaries['8']
    final = summaries['8']['counts']
    for key in ('hybrid/automatic', 'primary/automatic', 'primary/known-currency'):
        assert final[key + '/before'] == final[key + '/after']
    expected = dict(final['hybrid/known-currency/before'], price_basis_correct=6,
                    untrusted_zero_discrepancy=23, reconciliation_failed=26)
    assert expected == final['hybrid/known-currency/after']
    predictions = [json.loads(line) for line in record('qa-artifacts/grouped-amounts-v8/replay/predictions.jsonl').read_text(encoding='utf-8').splitlines()]
    cases = {row['variant']: row for row in predictions if row['receipt_id'] == 'cord-v2-train-001' and row['reader'] == 'hybrid' and row['mode'] == 'known-currency'}
    items = lambda row: [{k: v for k, v in item.items() if k != 'id'} for item in row['receipt']['items']]
    assert items(cases['before']) == items(cases['after'])
    for row in cases.values():
        assert len(row['receipt']['reviewChecks']) == 28
        assert all(check['confirmedValue'] == '' for check in row['receipt']['reviewChecks'])
    after = cases['after']
    assert after['calculation']['discrepancy'] == '0' and len(after['calculation']['issues']) == 29
    assert after['receipt']['pricesIncludeTax'] is False
    assert [(row['kind'], row['amount']) for row in after['receipt']['adjustments']] == [('tax', '52815'), ('fee', '25150')]
    units = load('qa-artifacts/grouped-amounts-v7/unit-tests.json')
    assert units['numPassedTests'] == units['numTotalTests'] == 966 and units['numFailedTests'] == 0
    assert len(units['testResults']) == 58
    builds = []
    for version in (1, 2):
        base = f'qa-artifacts/financial-columns-build-v{version}'
        proof = load(base + '/proof.json')
        assert proof['exit_code'] == 0 and proof['source_unchanged']
        for name, digest in {**proof['source_sha256'], **proof['build_sha256']}.items():
            record(name, digest)
        tree(base)
        record(base + '.py')
        builds.append(proof)
    assert builds[0]['build_sha256'] == builds[1]['build_sha256']
    for name, digest in builds[1]['source_sha256'].items():
        assert sha(ROOT / name) == digest, name
    browsers = []
    for version in (1, 2):
        base = f'qa-artifacts/financial-columns-browser-v{version}'
        control = load(base + '/controller.json')
        assert not control['spawned'] and control['error'] == 'insufficient-available-ram-before-start'
        assert control['startup_floor_bytes'] == 2684354560
        assert control['initial_available_ram'] < control['startup_floor_bytes']
        tree(base)
        browsers.append(control)
    refresh = load('qa-artifacts/grouped-amounts-v8/model-plan-refresh.json')
    assert refresh['changed_inputs'] == ['src/lib/financial-basis.ts']
    study = load('qa-artifacts/browser-paddle-medium-paired-plan-v5/study-plan.json')
    for name, digest in study['input_sha256'].items():
        record(name, digest)
    tree('qa-artifacts/browser-paddle-medium-paired-plan-v5')
    protection = load('qa-artifacts/grouped-amounts-v8/protected-checkouts.json')
    assert protection['stable'] == 'ee725ba45e799bee8501d3de034e0302c0127afd'
    assert protection['original_head'] == '29a187af7347be94c0728f4785be674500833748'
    assert protection['original_diff_sha256'] == '72fe803bf341a3052a441b7144838d06e7f4cbea5b59d612feb649368442e31b'
    for name in ('FINANCIAL_WORD_COLUMNS.md', 'GOAL_ACCEPTANCE_AUDIT.md', 'ADVANCED_OCR_REPORT.md'):
        record('receipt_training/evaluation/' + name)
    record(Path(__file__).relative_to(ROOT).as_posix())
    result = {'parent_commit': PARENT, 'scope': protocol['scope'], 'counts': final,
              'improvements': summaries['8']['improvements'], 'regressions': [],
              'unit_tests': {'passed': 966, 'files': 58, 'initial_assertion_failure_retained': True},
              'builds_identical': True, 'browser_validation': {'status': 'pending-resource-guard', 'attempts': browsers, 'executed_tests': 0},
              'prepared_model_study': refresh, 'protected_checkouts': protection,
              'new_model_calls': 0, 'private_uploads': 0, 'api_charges': 0,
              'limitations': ['One familiar development case; no blind gain claim', 'No new inference or model latency measurement',
                              'All fifty lack complete financial truth', 'Trusted reconciliation remains zero',
                              'New browser scenario unexecuted; physical phones not verified', 'Full goal remains active'],
              'evidence_sha256': HASHES}
    with OUT.open('x', encoding='utf-8', newline='\n') as file:
        json.dump(result, file, indent=2)
        file.write('\n')
    print(json.dumps({'packet': OUT.relative_to(ROOT).as_posix(), 'evidence_files': len(HASHES), 'new_model_calls': 0, 'browser_tests': 0}))


if __name__ == '__main__':
    main()
