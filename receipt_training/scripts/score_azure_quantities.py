"""Score paired Azure app quantity recovery without interpreting native money."""
from collections import defaultdict
import json
from pathlib import Path
import re
import sys

from audit_evidence_integrity import sha
from review_veryfi_screening import compare
from review_gemini35_screening import aggregate

ROOT = Path(__file__).resolve().parents[2]
HASHES = {}


def read(path, expected=None):
    digest = sha(path)
    assert expected is None or expected == digest, path
    HASHES[path.relative_to(ROOT).as_posix()] = digest
    return path.read_bytes()


def main():
    tag = sys.argv[1]
    assert re.fullmatch(r'replay-v[1-9]\d*', tag)
    folder = ROOT / 'qa-artifacts/azure-quantity-v1' / tag
    assert not (folder / 'scores.json').exists()
    meta = json.loads(read(folder / 'metadata.json'))
    assert meta['other_fields_unchanged'] and meta['source_words_unchanged'] and meta['all_checks_unconfirmed']
    assert meta['new_model_calls'] == meta['external_requests'] == 0
    for version, files in meta['source_sha256'].items():
        for name, digest in files.items():
            read(folder / version / name, digest)
    for name, digest in meta['input_sha256'].items():
        read(ROOT / name, digest)
    prior = json.loads(read(ROOT / 'receipt_training/evaluation/advanced-azure-screening-result-v2.json'))
    path = 'qa-artifacts/provider-review/veryfi-screening-crops-v2/screening-labels-v1.jsonl'
    labels = {row['receipt_id']: row for row in map(json.loads, read(ROOT / path, prior['evidence_sha256'][path]).splitlines())}
    path = 'receipt_training/evaluation/config.json'
    config = json.loads(read(ROOT / path, prior['evidence_sha256'][path]))
    for name in ['score.py', 'review_veryfi_screening.py']:
        read(Path(__file__).with_name(name), prior['evidence_sha256']['qa-artifacts/provider-review/azure-screening-v1/offline-review-v3/' + name])
    rows = json.loads(read(folder / 'predictions.json', meta['predictions_sha256']))
    assert len(rows) == 24
    groups, cases = defaultdict(list), []
    for row in rows:
        receipt = row['receipt']
        view = {'line_items': [
            {'row_index': i, 'description': item['description'], 'quantity': item['quantity'] or None,
             'price': item['unitPrice'] or None, 'total': item['lineTotal'] or None,
             'discount': item['discount'] or None, 'tax_code': item['taxCode'] or None}
            for i, item in enumerate(receipt['items'])],
            'document': {'subtotal': receipt['subtotal'] or None, 'total': receipt['printedTotal'] or None, 'tax': receipt['printedTax'] or None}}
        result = compare(labels[row['receipt_id']], view, config)
        groups[row['version'] + '/' + row['mode']].append(result)
        assert all(check['confirmedValue'] == '' for check in receipt['reviewChecks'])
        assert row['calculation']['issues']
        cases.append({key: row[key] for key in ['case', 'receipt_id', 'version', 'mode']} | {'metrics': result})
    counts = {key: aggregate(values) for key, values in groups.items()}
    for mode in ['automatic', 'known-currency']:
        expected = dict(counts['before/' + mode]); expected['quantity_correct'] += 5
        assert counts['after/' + mode] == expected
    for script in [Path(__file__), Path(__file__).with_name('review_gemini35_screening.py')]:
        read(script)
    result = {'counts': counts, 'per_case': cases, 'prediction_views': 24, 'transactions': 6,
              'all_drafts_blocked': True, 'new_model_calls': 0,
              'scope': 'Same six saved Azure responses, unchanged labels/matcher, five source-owned missing quantity proposals in each context mode. No new OCR or independent holdout.',
              'evidence_sha256': HASHES}
    with (folder / 'scores.json').open('x', encoding='utf-8', newline='\n') as handle:
        handle.write(json.dumps(result, indent=2) + '\n')
    print(json.dumps({'counts': counts, 'new_model_calls': 0}))


if __name__ == '__main__':
    main()
