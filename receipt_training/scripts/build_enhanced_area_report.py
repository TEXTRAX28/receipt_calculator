"""Seal actual selected-area recovery without claiming automatic financial edits."""
from decimal import Decimal
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
from audit_evidence_integrity import archive, sha

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "receipt_training/evaluation/advanced-enhanced-area-v1.json"
HASHES = {}


def record(name, expected=None):
    path = (ROOT / name).resolve()
    path.relative_to(ROOT.resolve())
    assert not path.name.startswith(".env")
    digest = sha(path) if path.is_file() else None
    if expected and digest != expected:
        path = ROOT / "qa-artifacts/evidence-blobs" / expected
        digest = sha(path)
    assert digest is not None and (expected is None or digest == expected), name
    assert name not in HASHES or HASHES[name] == digest, "Conflicting evidence version: " + name
    HASHES[name] = digest
    if "qa-artifacts" not in path.parts and "runs" not in path.parts and ".cache" not in path.parts:
        archive(path, digest)
    return path


def load(name):
    return json.loads(record(name).read_text(encoding="utf-8"))


def tree(folder):
    for path in sorted((ROOT / folder).rglob("*")):
        if path.is_file():
            record(path.relative_to(ROOT).as_posix())


def main():
    if "--check" in sys.argv:
        for name, expected in json.loads(OUT.read_text(encoding="utf-8"))["evidence_sha256"].items():
            record(name, expected)
        print(json.dumps({"verified_files": len(HASHES), "new_model_calls": 0}))
        return
    assert not OUT.exists()
    logs = {key: record("qa-artifacts/enhanced-area-" + file).read_text(encoding="utf-8") for key, file in {
        "unit": "unit-v1.log", "browser": "browser-v1.log", "targeted": "targeted-browser-v1.log", "build": "build-v1.log", "format": "format-v2.log", "typecheck": "typecheck-v1.log"}.items()}
    assert "912 passed" in logs["unit"] and "197 passed" in logs["browser"] and "1 skipped" in logs["browser"]
    assert "8 passed" in logs["targeted"] and "built in" in logs["build"] and "All matched files" in logs["format"]
    actual = load("qa-artifacts/enhanced-area-app-uk-v1/result.json")
    evidence = load("qa-artifacts/enhanced-area-app-uk-v1/area-readings.json")
    scores = load("qa-artifacts/enhanced-area-app-uk-v1/scores.json")
    counts = scores["score"]["counts"]
    assert actual["noFinancialEdits"] and actual["noChecksConfirmed"] and evidence["passiveWorkerObservation"]
    assert actual["external"] == actual["writes"] == actual["errors"] == []
    assert actual["closed"] == 4 and len(actual["workers"]) == 4 and len(evidence["modelInputs"]) == 5
    assert counts["predicted_items"] == counts["matched_items"] == counts["item_price_correct"] == 18
    assert counts["complete_receipt_correct"] == counts["trusted_reconciliation_correct"] == 0
    assert scores["score"]["scanner_discrepancy_minor"] == "0" and actual["calculation"]["issues"]
    for entries in (scores["evidence_sha256"], actual["input_sha256"], actual["source_sha256"]):
        for name, digest in entries.items():
            record(name, digest)
    for c in evidence["modelInputs"]:
        path = Path(c["path"]).resolve()
        record(path.relative_to(ROOT.resolve()).as_posix(), c["sha256"])
        assert path.stat().st_size == c["bytes"] and c["reply"]["ok"] and c["reply"]["id"] == c["id"]
    assert actual["areaReadings"] == evidence["areaReadings"]
    areas = {a["name"]: a for a in actual["areaReadings"]}
    assert len(areas) == 3 and all(a["draftUnchanged"] and a["originalHighlightsUnchanged"] for a in areas.values())
    # Unchanged pre-existing reference; no labels entered the model or UI reads.
    label_path = record("receipt_training/annotations/private/supplement-financial-v2-labels.jsonl")
    label = next(r for line in label_path.read_text(encoding="utf-8").splitlines() if (r := json.loads(line))["receipt_id"] == actual["receipt_id"])
    legend = {m[1]: m[2] for line in areas["vat-legend"]["text"].splitlines()
              if (m := re.fullmatch(r"([A-Z])\s+(\d+(?:\.\d+)?)%\s+\d+\.\d{2}\s+\d+\.\d{2}", line.strip()))}
    before_legend = {c["code"]: c["rate"] for c in actual["receipt"]["taxCodes"]}
    legend_rows = [{"code": c["code"], "expected_rate": c["rate"], "before_rate": before_legend.get(c["code"]), "focused_rate": legend.get(c["code"]),
                    "before_correct": bool(before_legend.get(c["code"])) and Decimal(before_legend[c["code"]]) == Decimal(c["rate"]),
                    "focused_correct": bool(legend.get(c["code"])) and Decimal(legend[c["code"]]) == Decimal(c["rate"])} for c in label["tax_codes"]]
    selected = []
    for name, index in (("chicken-skewer", 3), ("baby-plum-tomatoes", 12)):
        expected = label["items"][index]
        sku = expected["item_number"]["value"]
        # Literal row envelope only: no glyph substitution, code inference or balancing.
        rows = [m for line in areas[name]["text"].splitlines()
                if (m := re.fullmatch(re.escape(sku) + r"\s+\d+(?:\.\d+)?[x×]\s+\d+\.\d{2}\s+\d+\.\d{2}\s+([A-Z0-9]{1,6})", line.strip()))]
        code = rows[0][1] if len(rows) == 1 else None
        before = actual["receipt"]["items"][index]
        selected.append({"target": name, "expected_tax_code": expected["tax_code"]["value"], "before_tax_code": before["taxCode"], "focused_tax_code": code,
                         "before_correct": before["taxCode"] == expected["tax_code"]["value"], "focused_correct": code == expected["tax_code"]["value"],
                         "expected_description": expected["description"]["value"], "before_description_correct": before["description"] == expected["description"]["value"],
                         "focused_description_present": expected["description"]["value"] in [line.strip() for line in areas[name]["text"].splitlines()]})
    assert sum(r["before_correct"] for r in legend_rows) == 1 and sum(r["focused_correct"] for r in legend_rows) == 2
    assert sum(r["before_correct"] for r in selected) == 0 and sum(r["focused_correct"] for r in selected) == 1
    assert selected[0]["focused_tax_code"] == "7" and all(r["focused_description_present"] for r in selected)
    controller = load("qa-artifacts/enhanced-area-app-uk-v1-control/controller.json")
    memory = load("receipt_training/evaluation/runs/enhanced-area-app-uk-v1/owned-memory.json")
    assert controller["exit_code"] == 0 and not controller.get("error") and not memory["errors"]
    assert controller["minimum_available_ram"] >= controller["runtime_ram_floor"]
    for name, digest in controller["source_sha256"].items():
        prefix = "qa-artifacts/enhanced-area-app-uk-v1-control/"
        record(prefix + (Path(name).name if name.startswith("receipt_training/scripts/") else "source/" + name), digest)
    for folder in ("qa-artifacts/enhanced-area-app-uk-v1", "qa-artifacts/enhanced-area-app-uk-v1-control", "receipt_training/evaluation/runs/enhanced-area-app-uk-v1", "dist"):
        tree(folder)
    for path in sorted((ROOT / "qa-artifacts").glob("enhanced-area-*.log")):
        record(path.relative_to(ROOT).as_posix())
    for path in sorted((ROOT / "src").rglob("*")):
        if path.is_file():
            record(path.relative_to(ROOT).as_posix())
    for name in ("package.json", "package-lock.json", "playwright.config.ts", "vite.config.ts", "tests/e2e/enhanced-reader.spec.ts", "tests/e2e/enhanced-reader-real.spec.ts", "receipt_training/scripts/guard_browser_paddle_probe.py", "receipt_training/scripts/build_enhanced_area_report.py", "receipt_training/evaluation/ENHANCED_AREA_RECOVERY.md", "receipt_training/evaluation/GOAL_ACCEPTANCE_AUDIT.md"):
        record(name)
    git = lambda *args, cwd=ROOT: subprocess.check_output(["git", *args], cwd=cwd)
    parent = git("rev-parse", "HEAD").decode().strip()
    assert parent == "e65d9f6cc2afe89b6ebc70830521463c21d72d9c"
    unchanged = git("ls-tree", "-r", "--name-only", parent, "src/lib").decode().splitlines() + ["package-lock.json", "src/ImageCropper.tsx"]
    for name in unchanged:
        assert hashlib.sha256(git("show", parent + ":" + name)).hexdigest() == sha(ROOT / name), name
    previous = load("receipt_training/evaluation/advanced-footer-overlap-v1.json")
    for name, digest in previous["evidence_sha256"].items():
        if name in HASHES and HASHES[name] != digest:
            record("qa-artifacts/evidence-blobs/" + digest, digest)
        else:
            record(name, digest)
    original = Path(r"C:\Users\natan\VSC Code\costco_calc")
    protected = {"stable": git("rev-parse", "stable/receipt-verified").decode().strip(), "original_commit": git("rev-parse", "HEAD", cwd=original).decode().strip(), "original_diff_sha256": hashlib.sha256(git("diff", "--binary", cwd=original)).hexdigest()}
    assert list(protected.values()) == ["ee725ba45e799bee8501d3de034e0302c0127afd", "29a187af7347be94c0728f4785be674500833748", "72fe803bf341a3052a441b7144838d06e7f4cbea5b59d612feb649368442e31b"]
    packet = {"scope": "Implemented enhanced purchase/receipt-area rereading; observed new text for explicit review, no automatic financial corrections or complete-goal claim.",
              "checks": {"unit_passes": 912, "browser_passes": 197, "existing_browser_skips": 1, "dedicated_enhanced_cases": 8, "additional_actual_private_app_test": 1},
              "focused_source_observations": {"legend": legend_rows, "selected_items": selected, "scope": "Three default crops chosen for known errors on one familiar assistant-reviewed development receipt, not blind/representative accuracy or whole-receipt improvement."},
              "actual_app": {"counts": counts, "discrepancy_minor": "0", "financial_edits": 0, "checks_confirmed": 0, "scan_to_review_ms": actual["elapsed_ms"], "area_elapsed_ms": {name: a["elapsed_ms"] for name, a in areas.items()}},
              "resources": {"controller": controller, "owned_tree_observation": memory},
              "unchanged_parent_modules": unchanged, "privacy": {"new_private_external_uploads": 0, "model_downloads": 0, "new_credentials": False, "paid_activation": False},
              "new_private_image_inferences": 5, "api_cost_usd": "0", "compute_cost_usd": None,
              "limits": ["Skewer code still7 rather than sourceZ. Neighboring clipped text can remain garbled.", "Draft remains exactly unchanged and blocked; strict and trusted accuracy0/1.", "Phone emulation is desktop Chromium; physical handset/Safari evidence absent.", "Original-fifty replay remains previous evidence on byte-identical parser/model modules, not a fresh cohort inference.", "Public service controls, broader accuracy and independent complete financial truth remain open."],
              "git": {"parent_commit": parent, **protected, "merge_push_deploy": False}, "evidence_sha256": HASHES}
    with OUT.open("x", encoding="utf-8", newline="\n") as file:
        file.write(json.dumps(packet, indent=2) + "\n")
    print(json.dumps({"sealed_files": len(HASHES), "unit_passes": 912, "browser_passes": 197, "focused_tax_codes_correct": "1/2", "focused_legend_rates_correct": "2/2", "private_uploads": 0}))


if __name__ == "__main__":
    main()
