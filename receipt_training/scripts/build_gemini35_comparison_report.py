"""Seal the completed Gemini screen and offline Azure combination; no API calls."""
import ast
from datetime import datetime
from decimal import Decimal
import hashlib
import json
from pathlib import Path
import subprocess
import sys

from audit_evidence_integrity import sha

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'receipt_training/evaluation/advanced-gemini35-comparison-v2.json'
PARENT = 'a4a5b8889a7a29ae7043fab34d7b7544d5213e06'
APPROVED = '4520ce9af8f63e9edcddd51f51967b4e51bf750f2dccabf3cc8fe41b8dc16f0b'
SYNTHETIC = 'qa-artifacts/advanced-ocr/gemini35-synthetic-v1'
LIVE = 'qa-artifacts/provider-review/gemini35-screen-v1'
REPLAY = 'qa-artifacts/provider-review/azure-gemini35-replay-v1'
HASHES = {}


def record(name, expected=None):
    path = ROOT / name
    path.resolve().relative_to(ROOT)
    assert not any(part.startswith('.env') for part in path.parts), name
    digest = sha(path) if path.is_file() else None
    if expected and digest != expected:
        path = ROOT / 'qa-artifacts/evidence-blobs' / expected
        assert path.is_file() and sha(path) == expected, name
        digest = expected
        HASHES[path.relative_to(ROOT).as_posix()] = expected
    assert digest is not None, name
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
        print(json.dumps({'verified_files': len(HASHES), 'new_external_requests': 0}))
        return
    assert not OUT.exists(), 'Preserve the sealed packet'
    git = lambda *args, cwd=ROOT: subprocess.check_output(['git', *args], cwd=cwd)
    assert git('rev-parse', 'HEAD').decode().strip() == PARENT
    assert git('branch', '--show-current').decode().strip() == 'feature/advanced-ocr-vision-ai'
    assert not git('status', '--porcelain', '--', 'src', 'server', 'tests', 'package.json', 'package-lock.json', 'vite.config.ts', 'playwright.config.ts')

    initial = load('receipt_training/evaluation/advanced-gemini35-comparison-v1.json')
    for name, digest in initial['evidence_sha256'].items():
        record(name, digest)
    checkout = load('qa-artifacts/gemini35-checkout-integrity-v1/before.json')
    for name, proof in checkout.items():
        if not name.startswith('receipt_training/scripts/'):
            continue
        old = record(name, proof['measured_sha256']).read_bytes()
        current = (ROOT / name).read_bytes()
        if name.endswith('review_gemini35_screening.py'):
            def projection_tree(raw):
                module = ast.parse(raw.decode('utf-8'))
                module.body = [node for node in module.body if not isinstance(node, ast.FunctionDef) or node.name != 'remember']
                return ast.dump(module)
            assert projection_tree(old) == projection_tree(current), 'Scoring logic changed'
        elif not name.endswith('test_gemini35_screening.mjs'):
            assert old.replace(b'\r\n', b'\n') == current, name

    smoke_plan = load(SYNTHETIC + '/plan.json')
    smoke = load(SYNTHETIC + '/result.json')
    date = load(SYNTHETIC + '/date-review.json')
    assert smoke['requests'] == 1 and smoke['private_uploads'] == smoke['retries'] == 0
    assert smoke['http_status'] == 200 and smoke['strict_schema'] and smoke['source_unchanged']
    assert not smoke['billing_activated'] and not smoke['checks']['date']
    assert all(value for key, value in smoke['checks'].items() if key != 'date')
    assert date['exact_printed_match'] and date['original_result_preserved']
    record(smoke_plan['input'], smoke_plan['image_sha256'])

    plan = load(LIVE + '/plan.json', APPROVED)
    auth = load(LIVE + '/authorization.json')
    meta = load(LIVE + '/run/metadata.json')
    native = load('receipt_training/evaluation/advanced-gemini35-screening-result-v1.json')
    for name, digest in native['evidence_sha256'].items():
        record(name, digest)
    assert auth['approved_by_user'] and auth['free_quota_confirmed_by_user']
    assert auth['plan_sha256'] == meta['proof']['plan_sha256'] == APPROVED
    assert auth['limits'] == plan['limits'] and not auth['prior_3_8_authorization_reused']
    assert auth['model'] == plan['model'] == meta['model'] == smoke['model'] == 'gemini-3.5-flash-lite'
    assert meta['private_generation_requests'] == len(meta['cases']) == 6
    assert meta['retries'] == 0 and not meta['billing_activated'] and not meta['store']
    assert all(case['http_status'] == 200 for case in meta['cases'])
    assert sum(case['status'] == 'strict-schema-passed' for case in meta['cases']) == 4
    parse_date = lambda text: datetime.fromisoformat(text.replace('Z', '+00:00'))
    starts = [parse_date(case['started_at']) for case in meta['cases']]
    assert all((later - earlier).total_seconds() >= 31 for earlier, later in zip(starts, starts[1:]))
    assert native['live_execution']['authorization_consumed']
    counts = native['gemini_all_planned_case_field_coverage']
    assert (counts['total_correct'], counts['total_known'], counts['discount_correct'], counts['tax_code_correct']) == (17, 25, 0, 9)
    usage = {field: sum(int(case['provider_reported_usage'][field]) for case in native['per_case'])
             for field in ('total_input_tokens', 'total_output_tokens')}
    assert usage == {'total_input_tokens': 9973, 'total_output_tokens': 3237}
    estimate = (Decimal(usage['total_input_tokens']) * Decimal('0.30') + Decimal(usage['total_output_tokens']) * Decimal('2.50')) / 1_000_000

    replay_plan = load(REPLAY + '/plan.json')
    replay = load(REPLAY + '/metadata.json')
    scores = load(REPLAY + '/scores.json')
    assert replay['prediction_views'] == scores['views'] == 24 and scores['transactions'] == 6
    assert replay['new_model_calls'] == replay['external_requests'] == scores['new_model_calls'] == 0
    assert replay['source_unchanged'] and replay['originals_unchanged'] and replay['all_checks_unconfirmed']
    assert scores['all_drafts_blocked']
    assert replay_plan['source_sha256'] == replay['source_sha256']
    assert replay_plan['input_sha256'] == replay['input_sha256']
    for name, digest in {**scores['evidence_sha256'], **replay['input_sha256']}.items():
        record(name, digest)
    record('receipt_training/scripts/replay_azure_gemini35.mjs', replay_plan['runner_sha256'])
    record(REPLAY + '/runner.mjs', replay_plan['runner_sha256'])
    predictions = load(REPLAY + '/predictions.json', replay['predictions_sha256'])
    assert len(predictions) == 24
    assert all(row['calculation']['issues'] for row in predictions)
    assert all(check['confirmedValue'] == '' for row in predictions for check in row['receipt']['reviewChecks'])
    for name, digest in replay['loaded_frozen_source_sha256'].items():
        assert replay['source_sha256'][name] == digest
    before = scores['counts']['azure-words/known-currency']
    after = scores['counts']['azure-gemini-with-fallback/known-currency']
    assert (before['total_correct'], after['total_correct']) == (25, 22)
    assert (before['discount_correct'], after['discount_correct']) == (2, 0)

    source_hashes = {**smoke_plan['source_sha256'], **meta['proof']['source_sha256'], **replay['source_sha256']}
    for name, digest in source_hashes.items():
        record(name, digest)
        if name.startswith(('src/', 'server/')):
            assert sha(ROOT / name) == digest, name
            assert hashlib.sha256(git('show', PARENT + ':' + name)).hexdigest() == digest, name
    for name in (SYNTHETIC, LIVE, REPLAY, 'qa-artifacts/gemini35-offline-validation-v1', 'qa-artifacts/gemini35-checkout-integrity-v1'):
        tree(name)
    transport = record('qa-artifacts/gemini35-offline-validation-v1/transport-tests.log').read_text(encoding='utf-8')
    assert 'tests 4' in transport and 'pass 4' in transport and 'fail 0' in transport
    assert native['offline_projection_tests_passed'] == 5
    checkout_tests = load('qa-artifacts/gemini35-checkout-integrity-v1/result.json')
    assert checkout_tests['offline_tests_passed'] == 9 and checkout_tests['exact_archive_accepted']
    assert checkout_tests['corrupt_archive_rejected'] and checkout_tests['missing_archive_rejected']

    original = Path(r'C:\Users\natan\VSC Code\costco_calc')
    protection = {
        'stable': git('rev-parse', 'stable/receipt-verified').decode().strip(),
        'original_head': git('rev-parse', 'HEAD', cwd=original).decode().strip(),
        'original_branch': git('branch', '--show-current', cwd=original).decode().strip(),
        'original_diff_sha256': hashlib.sha256(git('diff', '--binary', cwd=original)).hexdigest(),
    }
    assert protection == {'stable': 'ee725ba45e799bee8501d3de034e0302c0127afd',
                          'original_head': '29a187af7347be94c0728f4785be674500833748',
                          'original_branch': 'receipt-dataset-evaluation',
                          'original_diff_sha256': '72fe803bf341a3052a441b7144838d06e7f4cbea5b59d612feb649368442e31b'}
    for name in ('GEMINI35_SCREENING_PLAN.md', 'GEMINI35_SIX_RESULT.md', 'GOAL_ACCEPTANCE_AUDIT.md', 'ADVANCED_OCR_REPORT.md'):
        record('receipt_training/evaluation/' + name)
    for name in ('probe_gemini35_synthetic.mjs', 'gemini35_screening.mjs', 'test_gemini35_screening.mjs',
                 'review_gemini35_screening.py', 'test_review_gemini35_screening.py', 'score_azure_gemini35.py'):
        record('receipt_training/scripts/' + name)
    record(Path(__file__).relative_to(ROOT).as_posix())
    record('receipt_training/evaluation/advanced-financial-word-columns-v1.json')
    record('qa-artifacts/evidence-audits/financial-columns-final-v1.json')
    result = {
        'parent_application_commit': PARENT, 'model': plan['model'], 'approval_plan_sha256': APPROVED,
        'synthetic_probe': smoke, 'synthetic_date_check_review': date,
        'live_execution': native['live_execution'], 'http_200_responses': 6,
        'native_field_coverage': counts, 'successful_only_accuracy': native['gemini_successful_cases_only_accuracy'],
        'prior_native_comparison': native['prior_native_aggregate'], 'request_latency_ms': native['request_latency_ms'],
        'provider_reported_usage': usage,
        'cost': {'paid_list_rate_estimate_usd': str(estimate), 'user_confirmed_free_quota': True,
                 'billing_activated': False, 'actual_invoice_inspected': False},
        'offline_combination': {'counts': scores['counts'], 'views': 24, 'new_model_calls': 0, 'accepted_payable_drafts': 0},
        'decision': {'change_application_or_default': False, 'integrate_live_combination': False,
                     'reason': 'Native financial errors and offline combination price/coupon regressions.'},
        'offline_tests_passed': 9, 'protected_checkouts': protection,
        'checkout_integrity': {'source_line_endings': 'LF', 'measured_script_bytes_preserved': True,
                               'scoring_logic_unchanged': True, 'verification_only_archive_fallback': checkout_tests,
                               'transport_test_fixture': 'Fresh temporary mock scope; consumed live proof remains immutable.',
                               'initial_normalized_transport_test_failures_retained': 2},
        'limitations': ['Six familiar development crops; no blind or whole-receipt accuracy claim.',
                        'PNG/JPEG framing matches but encoding differs from earlier provider inputs.',
                        'Two schema rejections remain in all-case field coverage; no amount repair.',
                        'No new browser test or full-corpus inference; prior 966-unit app source unchanged.',
                        'Initial synthetic date check, offline scorer failure and Vite scan warning retained.',
                        'Thirteen previously disclosed historical artifact gaps remain; no broad audit rerun.',
                        'Physical-device, resource-constrained local trials and full-goal acceptance remain open.'],
        'evidence_sha256': HASHES,
    }
    with OUT.open('x', encoding='utf-8', newline='\n') as file:
        json.dump(result, file, indent=2)
        file.write('\n')
    print(json.dumps({'packet': OUT.relative_to(ROOT).as_posix(), 'evidence_files': len(HASHES), 'new_external_requests_by_report': 0}))


if __name__ == '__main__':
    main()
