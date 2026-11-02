"""Score fixed selected fields and unchanged complete-receipt references separately."""
from collections import Counter, defaultdict
from decimal import Decimal
import hashlib
import json
from pathlib import Path
import re
import sys

from score_adjustments import score_with_adjustments

ROOT = Path(__file__).resolve().parents[2]


def main():
    tag = sys.argv[1]
    assert re.fullmatch(r"[\w-]+", tag)
    out = ROOT / "qa-artifacts" / tag
    hashes = {}

    def read(name, expected=None):
        path = (ROOT / name).resolve()
        path.relative_to(ROOT)
        assert not path.name.startswith(".env")
        raw = path.read_bytes()
        digest = hashlib.sha256(raw).hexdigest()
        assert expected is None or expected == digest, name
        hashes[name] = digest
        return raw

    def load(name):
        return json.loads(read(name))

    base = "qa-artifacts/" + tag
    meta = load(base + "/metadata.json")
    assert meta["new_model_calls"] == meta["external_receipt_uploads"] == 0
    plan = load(meta["study_plan_path"])
    for name, expected in meta["input_sha256"].items():
        read(name, expected)
    labels = {}
    for name in ("priced-rows-v5-financial-labels.jsonl", "supplement-financial-v2-labels.jsonl"):
        path = "receipt_training/annotations/private/" + name
        labels.update({r["receipt_id"]: r for line in read(path, plan["input_sha256"][path]).decode("utf-8").splitlines() if (r := json.loads(line))})
    config_path = "receipt_training/evaluation/config.json"
    config = json.loads(read(config_path, plan["input_sha256"][config_path]))
    counts, scores, selected, timing = defaultdict(Counter), [], {}, {}
    uk = labels["supplement-user-uk-20261026-group"]
    for size in ("tiny", "medium"):
        areas = {}
        timing[size] = {"whole_receipts": [], "selected_areas": []}
        for entry in plan["cases"]:
            data = load(f"{base}/{size}/{entry['receipt_id']}.json")
            assert data["image_sha256"] == entry["image_sha256"] and data["frames"] == entry["frames"]
            assert data["financial_edits"] == data["checks_confirmed"] == 0
            measurement = {"receipt_id": entry["receipt_id"], "warm_reading_ms": data["reading_ms"]}
            if entry["group"] == "selected-area":
                assert not data["predictions"]
                areas[entry["target"]] = data["output"]["text"]
                timing[size]["selected_areas"].append(measurement)
                continue
            timing[size]["whole_receipts"].append(measurement)
            for prediction in data["predictions"]:
                group = "supplied-uk" if entry["receipt_id"].startswith("supplement-") else "cord-three"
                score = score_with_adjustments(entry["record"], labels[entry["receipt_id"]], {**prediction, "elapsed_ms": data["reading_ms"]}, config)
                counts[f"{group}/{size}/{prediction['mode']}"].update(score["counts"])
                scores.append({"size": size, "mode": prediction["mode"], "group": group, **score})
        legend = {m[1]: m[2] for line in areas["vat-legend"].splitlines()
                  if (m := re.fullmatch(r"([A-Z])\s+(\d+(?:\.\d+)?)%\s+\d+\.\d{2}\s+\d+\.\d{2}", line.strip()))}
        legend_rows = [{"code": c["code"], "expected_rate": c["rate"], "observed_rate": legend.get(c["code"]),
                        "correct": bool(legend.get(c["code"])) and Decimal(legend[c["code"]]) == Decimal(c["rate"])} for c in uk["tax_codes"]]
        items = []
        for target, index in (("chicken-skewer", 3), ("baby-plum-tomatoes", 12)):
            expected = uk["items"][index]
            sku = expected["item_number"]["value"]
            rows = [m for line in areas[target].splitlines()
                    if (m := re.fullmatch(re.escape(sku) + r"\s+\d+(?:\.\d+)?[x×]\s+\d+\.\d{2}\s+\d+\.\d{2}\s+([A-Z0-9]{1,6})", line.strip()))]
            observed = rows[0][1] if len(rows) == 1 else None
            items.append({"target": target, "expected_tax_code": expected["tax_code"]["value"], "observed_tax_code": observed,
                          "tax_code_correct": observed == expected["tax_code"]["value"],
                          "description_present_exact": expected["description"]["value"] in [line.strip() for line in areas[target].splitlines()]})
        selected[size] = {"legend": legend_rows, "items": items, "text": areas}
    for name in ("score.py", "score_adjustments.py", "score_browser_paddle_medium_study.py"):
        path = "receipt_training/scripts/" + name
        read(path, plan["source_sha256"][path])
    result = {"counts": {k: dict(v) for k, v in counts.items()}, "scores": scores,
              "selected_areas": selected, "timing": timing,
              "scope": "Four familiar development transactions; not a blind holdout or original50 rerun. Three failure-selected UK crops are separate selected-field observations, never three extra receipts or a full-accuracy claim. Existing assistant-reviewed/partial references and unchanged financial scorer. Same frozen parser for both arms, no checks confirmed or financial edits. Timing excludes startup, image preparation and parser replay; no physical-phone or robust latency-distribution claim.",
              "new_model_calls_in_scoring": 0, "api_cost_usd": "0", "compute_cost_usd": None, "evidence_sha256": hashes}
    with (out / "scores.json").open("x", encoding="utf-8", newline="\n") as file:
        file.write(json.dumps(result, indent=2) + "\n")
    fields = ("expected_items", "predicted_items", "matched_items", "description_correct", "quantity_correct", "quantity_known", "unit_price_correct", "unit_price_known", "item_price_correct", "item_price_known", "discount_correct", "discount_known", "total_correct", "total_known", "tax_correct", "tax_known", "complete_receipt_correct", "complete_receipt_known", "complete_receipt_unscorable", "trusted_reconciliation_correct")
    print(json.dumps({"counts": {k: {f: v.get(f, 0) for f in fields} for k, v in counts.items()},
                      "selected": {s: {"legend_rates_correct": sum(r['correct'] for r in v['legend']), "item_tax_codes_correct": sum(i['tax_code_correct'] for i in v['items'])} for s,v in selected.items()}}))


if __name__ == "__main__":
    main()
