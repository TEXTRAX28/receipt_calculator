"""Read-only source diagnostics on saved outputs; no extraction, rewriting or price tuning."""
from collections import Counter, defaultdict
from decimal import Decimal, InvalidOperation
import argparse
import hashlib
import json
from pathlib import Path
import re

from audit_evaluation_source import load, local, require, sha, validate_records
from score import description, match_items

ROOT = Path(__file__).resolve().parents[2]
MAIN = Path(r'C:\Users\natan\.codex\worktrees\receipt-ocr-baseline\costco_calc')
EXPECTED_PREDICTIONS = '3ae7e7bc0405bcca6d21100478422d1ec40501c8a8bb946552a3d7302539e4e0'


def decimal_token(value):
    # Used only for quantity and the exact, ungrouped change-role diagnostic.
    # Grouped money is not silently reinterpreted or scored here.
    if not isinstance(value, str) or not re.fullmatch(r'-?\d+(?:\.\d+)?', value):
        return None
    try:
        number = Decimal(value)
        return number if number.is_finite() else None
    except InvalidOperation:
        return None


def change_as_total(reference, receipt):
    final, change = reference['fields']['grand_total'], reference['fields']['change']
    proposed = decimal_token(receipt.get('printedTotal'))
    return (final['state'] == 'not_printed' and change['state'] == 'printed'
            and proposed is not None and proposed == decimal_token(change['value']))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    output = local(args.output); require(not output.exists(), 'Preserve the previous diagnostics')
    folder = ROOT / 'qa-artifacts/evaluation-source-review-v1'
    frozen = load(folder / 'reference-frozen-v2.json')
    reference_path = local(frozen['reference_path'])
    require(sha(reference_path) == frozen['reference_sha256'], 'Visual reference changed')
    plan = load(folder / 'plan.json')
    require(sha(folder / 'plan.json') == frozen['plan_sha256'], 'Source plan changed')
    references = {r['receipt_id']: r for r in map(json.loads, reference_path.read_text(encoding='utf-8').splitlines())}
    validate_records(list(references.values()), plan)
    legacy_path = Path(frozen['legacy_reference_path'])
    require(sha(legacy_path) == frozen['legacy_reference_sha256'], 'Original labels changed')
    legacy = {r['receipt_id']: r for r in map(json.loads, legacy_path.read_text(encoding='utf-8').splitlines())}

    shared = Counter(); disagreements = []
    for identity, ref in references.items():
        old = legacy[identity]
        require(len(old['items']) == len(ref['items']), 'Reference row alignment differs')
        for index, (item, previous) in enumerate(zip(ref['items'], old['items'])):
            for field in ['description', 'quantity', 'unit_price', 'line_total']:
                if item[field]['state'] != 'printed' or previous[field]['value'] is None:
                    continue
                shared[field] += 1
                equal = (description(item[field]['value']) == description(previous[field]['value'])
                         if field == 'description' else Decimal(item[field]['value']) == Decimal(previous[field]['value']))
                if not equal:
                    disagreements.append({'receipt_id': identity, 'item_index': index, 'field': field})
        for field in ['subtotal', 'tax', 'rounding', 'grand_total']:
            if ref['fields'][field]['state'] == 'printed' and old[field]['value'] is not None:
                shared[field] += 1
                if Decimal(ref['fields'][field]['value']) != Decimal(old[field]['value']):
                    disagreements.append({'receipt_id': identity, 'field': field})

    run = MAIN / 'qa-artifacts/grouped-amounts-v31/replay'
    source_path, meta_path = run / 'predictions.jsonl', run / 'metadata.json'
    require(sha(source_path) == EXPECTED_PREDICTIONS, 'Retained predictions changed')
    meta = load(meta_path)
    require(meta['predictions_sha256'] == EXPECTED_PREDICTIONS, 'Retained metadata mismatch')
    current_sources = meta['source_sha256']['after']
    require(len(current_sources) == 71, 'Unexpected interpretation source set')
    require(all(sha(local(name)) == digest for name, digest in current_sources.items()), 'Interpretation source changed')
    predictions = [r for r in map(json.loads, source_path.read_text(encoding='utf-8').splitlines())
                   if r['variant'] == 'after' and r['receipt_id'] in references]
    require(len(predictions) == 48, 'Need all four views of all twelve fixed sources')
    identities = {(r['receipt_id'], r['reader'], r['mode']) for r in predictions}
    require(len(identities) == 48 and identities == {(identity, reader, mode) for identity in references
                for reader in ['primary', 'hybrid'] for mode in ['automatic', 'known-currency']}, 'Missing or duplicate views')
    config_path = ROOT / 'receipt_training/evaluation/config.json'
    config = load(config_path)
    threshold = config['item_matching']['minimum_similarity']
    totals = defaultdict(Counter); cases = []
    for row in predictions:
        ref = references[row['receipt_id']]; receipt = row['receipt']
        require(row['image_sha256'] == ref['source_sha256'], 'Prediction is a different image')
        expected = [{'description': {'value': item['description']['value'] or item['description']['raw'].replace('[unreadable]', '')}}
                    for item in ref['items']]
        matches = match_items(expected, receipt['items'], threshold)
        counts = Counter(views=1, visible_components=len(expected), proposed_components=len(receipt['items']), matched_components=len(matches))
        for index, item in enumerate(ref['items']):
            predicted = receipt['items'][matches[index]] if index in matches else {}
            if item['description']['state'] == 'printed':
                counts['fully_readable_names'] += 1
                counts['exact_normalized_names'] += description(item['description']['value']) == description(predicted.get('description'))
            if item['quantity']['state'] == 'printed':
                counts['printed_quantities'] += 1
                counts['correct_printed_quantities'] += decimal_token(item['quantity']['value']) == decimal_token(predicted.get('quantity'))
            elif predicted.get('quantity', '') != '':
                counts['quantity_proposals_without_direct_readable_quantity'] += 1
            if item['unit_price']['state'] != 'printed' and predicted.get('unitPrice', '') != '':
                counts['unit_proposals_without_direct_readable_unit'] += 1
        if ref['currency']['state'] == 'printed':
            counts['literal_currencies_known'] += 1
            counts['literal_currency_resolved_correctly'] += receipt['currency'] == ref['currency']['value'] and not receipt.get('currencyUnresolved', False)
        role_error = change_as_total(ref, receipt)
        counts['visible_change_proposed_as_printed_total'] += role_error
        # A tender heading proposed as an unmatched product is reported without
        # copying masked account strings or other raw OCR text into the output.
        unmatched = set(range(len(receipt['items']))) - set(matches.values())
        tender_labels = [r['label'] for r in ref['summary_rows'] if r['kind'] == 'tender']
        tender_markers = [marker for marker in ['EDC', 'CASH', 'CARD', 'TUNAI']
                          if any(re.search(r'\b' + marker + r'\b', text, re.I) for text in tender_labels)]
        counts['unmatched_tender_heading_proposals'] += sum(any(re.search(r'^\W*' + marker + r'\b', receipt['items'][i]['description'], re.I)
                      for marker in tender_markers) for i in unmatched)
        blocked = bool(row['calculation']['issues'])
        counts['views_with_blocking_validation_issues'] += blocked
        pending_total = any(c.get('scope') == 'receipt' and c.get('field') == 'printedTotal'
                            and c.get('confirmedValue') == '' for c in receipt.get('reviewChecks', []))
        key = row['reader'] + '/' + row['mode']; totals[key].update(counts)
        cases.append({'receipt_id': row['receipt_id'], 'reader': row['reader'], 'mode': row['mode'],
                      'counts': dict(counts), 'change_role_diagnostic': role_error,
                      'printed_total_source_check_pending': pending_total, 'validation_blocked': blocked})
    # Exact diagnostic scope: a declared known final total or an absent/invalid
    # proposal must not be flagged simply because the change amount exists.
    sample = next(r for r in references.values() if r['receipt_id'].endswith('009'))
    require(change_as_total(sample, {'printedTotal': '14000'}), 'Positive role control failed')
    require(not change_as_total(sample, {'printedTotal': ''}), 'Abstention was called a role error')
    require(not change_as_total(sample, {'printedTotal': 'not-a-number'}), 'Invalid token was called a matched amount')
    other = json.loads(json.dumps(sample)); other['fields']['grand_total'] = {'state': 'printed', 'value': '14000'}
    require(not change_as_total(other, {'printedTotal': '14000'}), 'Known legitimate final was called a role error')
    report = {'reference_sha256': sha(reference_path), 'legacy_reference_sha256': sha(legacy_path),
       'prediction_path': str(source_path), 'prediction_sha256': sha(source_path), 'retained_metadata_sha256': sha(meta_path),
       'interpretation_source_sha256': current_sources, 'runner_sha256': sha(Path(__file__)),
       'matcher_sha256': sha(Path(__file__).with_name('score.py')), 'config_sha256': sha(config_path),
       'counts': {key: dict(value) for key, value in totals.items()}, 'cases': cases,
       'shared_known_reference_facts': dict(shared), 'shared_known_reference_disagreements': disagreements,
       'role_diagnostic_controls_passed': 4, 'new_model_inferences': 0, 'provider_requests': 0,
       'scope': 'Saved-reading source diagnostics, four views of all twelve familiar evaluation images; 71 interpretation files exactly current. Matching uses unchanged price-blind cardinality/similarity matcher. The one partially readable name uses visible fragments for alignment only, not full-name accuracy. Unknown quantity/unit proposals are not declared incorrect facts. No grouped-price accuracy, new inference latency, whole-receipt score or blind result is claimed.'}
    with output.open('x', encoding='utf-8') as handle:
        json.dump(report, handle, indent=2); handle.write('\n')
    print(json.dumps({key: report[key] for key in ['counts', 'shared_known_reference_facts', 'shared_known_reference_disagreements', 'role_diagnostic_controls_passed', 'new_model_inferences', 'provider_requests']}))


if __name__ == '__main__':
    main()
