"""Unchanged six-crop matcher on saved Azure/Gemini interpretation views."""
from collections import defaultdict
import json
from pathlib import Path

from audit_evidence_integrity import sha
from review_veryfi_screening import compare
from review_gemini35_screening import aggregate

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / 'qa-artifacts/provider-review/azure-gemini35-replay-v1'
HASHES = {}


def read(path, expected=None):
    digest = sha(path)
    assert expected is None or digest == expected, str(path)
    HASHES[path.relative_to(ROOT).as_posix()] = digest
    return path.read_bytes()


def main():
    output = BASE / 'scores.json'
    assert not output.exists(), 'Preserve the original scored replay'
    meta = json.loads(read(BASE / 'metadata.json'))
    assert meta['source_unchanged'] and meta['originals_unchanged'] and meta['all_checks_unconfirmed']
    assert meta['new_model_calls'] == meta['external_requests'] == 0
    for name, digest in meta['source_sha256'].items():
        read(BASE / 'source' / Path(name).name, digest)
    for name, digest in meta['input_sha256'].items():
        read(ROOT / name, digest)
    prior = json.loads(read(ROOT / 'receipt_training/evaluation/advanced-azure-screening-result-v2.json'))
    label_path = 'qa-artifacts/provider-review/veryfi-screening-crops-v2/screening-labels-v1.jsonl'
    labels = {r['receipt_id']: r for r in map(json.loads, read(ROOT / label_path, prior['evidence_sha256'][label_path]).splitlines())}
    config_path = 'receipt_training/evaluation/config.json'
    config = json.loads(read(ROOT / config_path, prior['evidence_sha256'][config_path]))
    for name in ['score.py', 'review_veryfi_screening.py']:
        old = 'qa-artifacts/provider-review/azure-screening-v1/offline-review-v3/' + name
        read(Path(__file__).with_name(name), prior['evidence_sha256'][old])
    groups, cases = defaultdict(list), []
    predictions = json.loads(read(BASE / 'predictions.json', meta['predictions_sha256']))
    assert len(predictions) == meta['prediction_views'] == 24
    for row in predictions:
        r = row['receipt']
        view = {
            'line_items': [{'row_index':i, 'description':item['description'], 'quantity':item['quantity'] or None,
                            'price':item['unitPrice'] or None, 'total':item['lineTotal'] or None,
                            'discount':item['discount'] or None, 'tax_code':item['taxCode'] or None}
                           for i,item in enumerate(r['items'])],
            'document': {'subtotal':r['subtotal'] or None, 'tax':r['printedTax'] or None, 'total':r['printedTotal'] or None},
        }
        result = compare(labels[row['receipt_id']], view, config)
        key = row['method'] + '/' + row['mode']
        groups[key].append(result)
        assert all(c['confirmedValue'] == '' for c in r['reviewChecks']) and row['calculation']['issues']
        cases.append({k:row[k] for k in ['case','receipt_id','method','mode','compared','fallback']} | {'metrics':result})
    for p in [Path(__file__), Path(__file__).with_name('review_gemini35_screening.py')]:read(p)
    result = {'counts': {key:aggregate(rows) for key,rows in groups.items()}, 'per_case':cases,
              'views':24, 'transactions':6, 'new_model_calls':0, 'all_drafts_blocked':True,
              'scope':'Offline existing verifier with Azure fallback for two rejected Gemini drafts; no locale normalization, new extraction, live integration or speed claim.',
              'evidence_sha256':HASHES}
    with output.open('x',encoding='utf-8') as file:json.dump(result,file,indent=2)
    print(json.dumps({'counts':result['counts'],'all_drafts_blocked':True,'new_model_calls':0}))


if __name__ == '__main__':
    main()
