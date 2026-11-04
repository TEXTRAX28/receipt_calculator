"""Validate frozen visual-source records without reading OCR/model predictions.

Unknown/ambiguous fields stay null. Arithmetic is reported separately and never
supplies a missing printed value. Detailed source records remain local/ignored.
"""
from __future__ import annotations

import argparse
from collections import Counter
from copy import deepcopy
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
import hashlib
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]
STATES = {'printed', 'not_printed', 'unreadable', 'cropped', 'not_reviewed',
          'ambiguous', 'partially_readable'}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load(path):
    return json.loads(path.read_text(encoding='utf-8'))


def local(name):
    path = (ROOT / name).resolve()
    path.relative_to(ROOT)
    require(not any(p.lower().startswith('.env') for p in path.parts), 'Environment files are outside this audit')
    return path


def numeric(field):
    if field['value'] is None:
        return None
    require(field['state'] == 'printed', 'Only a printed field has a numeric value')
    require(bool(re.fullmatch(r'-?\d+(?:\.\d+)?', field['value'])), 'Invalid normalized number')
    try:
        value = Decimal(field['value'])
    except InvalidOperation as error:
        raise ValueError('Invalid numeric field') from error
    require(value.is_finite(), 'Non-finite monetary field')
    return value


def validate_field(field):
    require(isinstance(field, dict) and field.get('state') in STATES, 'Missing/invalid field state')
    require(set(['raw', 'value', 'scope', 'notes']) <= set(field), 'Incomplete field provenance')
    require(isinstance(field['scope'], str) and bool(field['scope']), 'Missing source scope')
    require(isinstance(field['notes'], list), 'Invalid source notes')
    if field['state'] == 'printed':
        require(isinstance(field['raw'], str) and bool(field['raw']), 'Printed raw text is required')
        require(isinstance(field['value'], str) and bool(field['value']), 'Printed normalized value is required')
    else:
        require(field['value'] is None, 'Unknown or ambiguous facts must stay null, including zero')


def validate_records(records, plan):
    expected = {r['receipt_id']: r for r in plan['images']}
    require(len(records) == len(expected), 'Wrong source count')
    require(len({r['receipt_id'] for r in records}) == len(records), 'Duplicate source record')
    require({r['receipt_id'] for r in records} == set(expected), 'Wrong selected sources')
    for record in records:
        source = expected[record['receipt_id']]
        require(record['source_sha256'] == source['sha256'], 'Source hash mismatch')
        require(record['original_split'] == source['original_split'] == 'evaluation', 'Evaluation split changed')
        require(record['visible_body_reviewed'] is True, 'Source inspection is incomplete')
        require(record['independent_human_verified'] is False, 'No independent human verification exists')
        require(record['model_predictions_consulted_before_freeze'] is False, 'Source-first freeze violated')
        require(record['complete_unredacted_receipt'] is False, 'Publisher-redacted images are not complete originals')
        for name in ['merchant', 'date', 'country', 'currency', 'tax_inclusive_text']:
            validate_field(record[name])
        for index, item in enumerate(record['items']):
            for name in ['description', 'quantity', 'unit_price', 'line_total', 'item_number']:
                validate_field(item[name])
            for name in ['quantity', 'unit_price', 'line_total']:
                numeric(item[name])
            parent = item['association']
            require(parent is None or (type(parent) is int and 0 <= parent < index), 'Invalid modifier association')
        seen = set()
        for row in record['summary_rows']:
            require(row['kind'] not in seen, 'Repeated source summary role')
            seen.add(row['kind'])
            validate_field(row['amount']); numeric(row['amount'])
            require(record['fields'][row['kind']] == row['amount'], 'Summary projection changed a source fact')
        for field in record['fields'].values():
            validate_field(field); numeric(field)


def coverage(records):
    counts = Counter()
    states = {name: Counter() for name in ['description', 'quantity', 'unit_price', 'line_total']}
    scalar = {name: Counter() for name in ['subtotal', 'tax', 'discount', 'discount_rate', 'service',
                                         'rounding', 'grand_total', 'tender', 'change', 'item_count']}
    equations = []
    for record in records:
        counts['receipts_reviewed'] += 1
        counts['visible_priced_components'] += len(record['items'])
        counts['printed_iso_or_unambiguous_currency'] += record['currency']['state'] == 'printed'
        counts['complete_unredacted_sources'] += record['complete_unredacted_receipt']
        for item in record['items']:
            for key in states:
                states[key][item[key]['state']] += 1
            counts['literal_zero_line_amounts'] += numeric(item['line_total']) == 0
            counts['priced_modifiers_with_source_association'] += item['association'] is not None
            q, unit, amount = (numeric(item[k]) for k in ['quantity', 'unit_price', 'line_total'])
            if q is not None and unit is not None and amount is not None:
                counts['explicit_quantity_unit_line_equations_checked'] += 1
                counts['explicit_quantity_unit_line_equations_equal'] += q * unit == amount
        for key in scalar:
            scalar[key][record['fields'][key]['state']] += 1
        subtotal = numeric(record['fields']['subtotal'])
        grand = numeric(record['fields']['grand_total'])
        tax = numeric(record['fields']['tax'])
        discount = numeric(record['fields']['discount'])
        rounding = numeric(record['fields']['rounding'])
        amounts = [numeric(item['line_total']) for item in record['items']]
        details = {'receipt_id': record['receipt_id'], 'derived_only_not_new_printed_facts': True}
        if subtotal is not None and all(a is not None for a in amounts):
            counts['printed_subtotal_vs_visible_rows_checked'] += 1
            counts['printed_subtotal_vs_visible_rows_equal'] += sum(amounts) == subtotal
            details['visible_rows_equal_subtotal'] = sum(amounts) == subtotal
        if subtotal is not None and grand is not None:
            details['subtotal_equals_grand'] = subtotal == grand
            if tax is not None:
                details['subtotal_plus_tax_equals_grand'] = subtotal + tax == grand
                counts['observed_additive_tax_equations'] += subtotal + tax == grand
                counts['observed_tax_not_added_to_equal_subtotal_grand'] += subtotal == grand
            if discount is not None:
                details['subtotal_less_discount_magnitude_equals_grand'] = subtotal - abs(discount) == grand
        if rounding == 0:
            counts['literal_zero_rounding'] += 1
        if any('%' in row['label'] for row in record['summary_rows'] if row['kind'] == 'tax'):
            counts['tax_labels_with_literal_percent'] += 1
        equations.append(details)
    return {'counts': dict(counts), 'body_field_states': {k: dict(v) for k, v in states.items()},
            'summary_field_states': {k: dict(v) for k, v in scalar.items()}, 'equations': equations,
            'equation_scope': 'Relationships among literal values only. Missing fields are not treated as zero; no tax basis, unit, quantity or final-total fact is filled from arithmetic.'}


def controls(records, plan):
    checks = []
    def rejected(name, mutate):
        bad = deepcopy(records); mutate(bad)
        try:
            validate_records(bad, plan)
        except ValueError:
            checks.append({'control': name, 'rejected': True}); return
        raise ValueError('Negative control was accepted: ' + name)
    rejected('unknown quantity turned into zero', lambda rows: rows[1]['items'][0]['quantity'].update(value='0'))
    rejected('ambiguous currency asserted as USD', lambda rows: rows[0]['currency'].update(value='USD'))
    rejected('source-byte mismatch', lambda rows: rows[0].update(source_sha256='0' * 64))
    rejected('evaluation moved to development', lambda rows: rows[0].update(original_split='development'))
    rejected('non-finite normalized price', lambda rows: rows[0]['items'][0]['line_total'].update(value='NaN'))
    rejected('self-referencing modifier', lambda rows: rows[2]['items'][1].update(association=1))
    validate_records(records, plan)
    require(coverage(records)['counts']['literal_zero_line_amounts'] == 2, 'Actual printed zeros were lost')
    checks.append({'control': 'two genuine zero-priced components preserved', 'accepted': True})
    return checks


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--plan', default='qa-artifacts/evaluation-source-review-v1/plan.json')
    parser.add_argument('--frozen', default='qa-artifacts/evaluation-source-review-v1/reference-frozen-v2.json')
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    plan_path, frozen_path, output = map(local, [args.plan, args.frozen, args.output])
    require(not output.exists(), 'Keep the existing report; choose a new output')
    plan, frozen = load(plan_path), load(frozen_path)
    require(sha(plan_path) == frozen['plan_sha256'], 'Frozen plan changed')
    reference = local(frozen['reference_path'])
    require(sha(reference) == frozen['reference_sha256'], 'Frozen source reference changed')
    records = [json.loads(s) for s in reference.read_text(encoding='utf-8').splitlines() if s.strip()]
    for source in plan['images']:
        path = Path(source['file_path'])
        require(path.suffix.lower() in {'.jpg', '.jpeg', '.png', '.webp'}, 'Not a source image')
        require(sha(path) == source['sha256'], 'Original source bytes changed')
    validate_records(records, plan)
    report = {'created_at': datetime.now(timezone.utc).isoformat(), 'reference_path': frozen['reference_path'],
              'reference_sha256': sha(reference), 'plan_sha256': sha(plan_path), 'runner_sha256': sha(Path(__file__)),
              'coverage': coverage(records), 'reference_integrity_controls': controls(records, plan),
              'new_model_inferences': 0, 'provider_requests': 0, 'app_source_changed': False,
              'scope': 'Assistant visual audit of twelve historically familiar fixed evaluation sources. No independent human truth, new model accuracy or complete-receipt assertion. Original reference/score files stay unchanged.'}
    with output.open('x', encoding='utf-8') as handle:
        json.dump(report, handle, indent=2); handle.write('\n')
    print(json.dumps({'source_records': len(records), 'coverage': report['coverage'],
                      'reference_integrity_controls': len(report['reference_integrity_controls']), 'provider_requests': 0}))


if __name__ == '__main__':
    main()
