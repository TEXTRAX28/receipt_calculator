"""Run source-specific arithmetic without changing extracted evidence."""
from collections import defaultdict
from decimal import Decimal, ROUND_HALF_UP
import json

from collect import ROOT
from score import minor


def main():
    config = json.loads((ROOT / "evaluation/config.json").read_text(encoding="utf-8"))
    cases = json.loads((ROOT / "evaluation/monetary-cases.json").read_text(encoding="utf-8"))
    results = []
    for case in cases["cases"]:
        currency = case["currency"]
        result = {"receipt_id": case["receipt_id"], "currency": currency, "status": case["status"], "basis": case["basis"]}
        if "assumed_tax_rates" in case:
            by_code = defaultdict(Decimal)
            for amount, code in zip(case["item_amounts"], case["item_codes"]):
                by_code[code] += Decimal(amount)
            for deduction in case["deductions"]:
                by_code[case["item_codes"][deduction["item_index"]]] += Decimal(deduction["amount"])
            # Rounding is an explicit scenario rule, not a claim about Costco's till.
            tax = sum((value * Decimal(case["assumed_tax_rates"][code])).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP) for code, value in by_code.items())
            net = sum(by_code.values())
            calculated = net + tax
            result.update({"net_by_code": {code: str(value) for code, value in by_code.items()}, "net": str(net), "hypothetical_tax": str(tax), "calculated_total": str(calculated), "tax_rounding_rule": "once per code, half up to penny; unconfirmed scenario"})
        else:
            calculated = sum(Decimal(term["amount"]) for term in case["terms"])
            result["calculated_total"] = str(calculated)
        actual_minor = minor(str(calculated), currency, config)
        printed_minor = minor(case["printed_total"], currency, config)
        assert actual_minor is not None and printed_minor is not None
        result.update({"printed_total": case["printed_total"], "difference_minor": actual_minor - printed_minor, "balances": actual_minor == printed_minor})
        results.append(result)
    (ROOT / "evaluation/monetary-audit.json").write_text(json.dumps({"verification": cases["verification"], "results": results}, indent=2) + "\n", encoding="utf-8")
    for result in results:
        print(result["receipt_id"], result["status"], "difference minor units:", result["difference_minor"])


if __name__ == "__main__":
    main()
