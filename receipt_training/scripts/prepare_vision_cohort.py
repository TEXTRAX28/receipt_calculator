"""Seal the existing structured vision protocol for every frozen original case.

Keeps original and supplemental cohorts separate; no labels or OCR are read.
Known pilot requests retain exactly their old bytes. New cases use that same
schema/settings/instruction with only their verified source image mapping.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[2]


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def local(value):
    path = (ROOT / value).resolve()
    path.relative_to(ROOT)
    return path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-pilot", required=True)
    parser.add_argument("--version", required=True)
    args = parser.parse_args()
    if not re.fullmatch(r"[\w-]+", args.version):
        raise ValueError("Choose a simple new version")
    base_path = local(args.base_pilot)
    base = json.loads(base_path.read_text(encoding="utf-8"))
    known = {}
    for case in base["pilot"]:
        path = local(case["request"])
        if sha(path) != case["request_sha256"]:
            raise ValueError("Sealed pilot request changed")
        known[case["id"]] = (case, path.read_bytes(), json.loads(path.read_text(encoding="utf-8")))
    template = next(iter(known.values()))[2]
    marker = "\nImage 1 is original photo "
    prefix, suffix = template["prompt"].split(marker, 1)
    rules = "Return only JSON." + suffix.split("Return only JSON.", 1)[1]
    directory = ROOT / "qa-artifacts/advanced-ocr" / (args.version + "-requests")
    output = directory.parent / (args.version + ".json")
    if directory.exists() or output.exists():
        raise ValueError("Preserve previous versions")
    pending, pilot, inventories = [], [], []
    for split, expected in [("development", 38), ("evaluation", 12), ("supplement", 4)]:
        run = "advanced-panels-" + split
        folder = ROOT / "receipt_training/evaluation/runs" / run
        predictions = folder / "predictions.jsonl"
        metadata = json.loads((folder / "metadata.json").read_text(encoding="utf-8"))
        if not metadata.get("completed_at") or sha(predictions) != metadata["predictions_sha256"]:
            raise ValueError("Frozen preparation run changed or is incomplete")
        rows = list(map(json.loads, predictions.read_text(encoding="utf-8").splitlines()))
        if len(rows) != expected:
            raise ValueError("Original cohort size changed; inspect instead of silently changing scope")
        inventories.append({"name": run, "predictions_sha256": sha(predictions), "cases": len(rows)})
        for row in rows:
            name = row["receipt_id"]
            if not re.fullmatch(r"[\w-]+", name) or not 1 <= len(row["panels"]) <= 3:
                raise ValueError("Invalid or over-budget case; do not drop it from the cohort")
            images = []
            for panel in row["panels"]:
                path = (folder / panel["file_path"]).resolve()
                path.relative_to(folder.resolve())
                if sha(path) != panel["sha256"]:
                    raise ValueError("Frozen image panel changed")
                images.append(path.relative_to(ROOT).as_posix())
            if name in known:
                original_case, data, request = known[name]
                if request["images"] != images or request["source_image_sha256"] != row["image_sha256"] or request["source_panel_manifest_sha256"] != sha(predictions):
                    raise ValueError("Previously tested pilot pixels differ from the full cohort")
                role = original_case["source"]
            else:
                request = {**template, "images": images, "source_panel_run": run, "source_panel_manifest_sha256": sha(predictions), "source_image_sha256": row["image_sha256"]}
                mapping = " ".join(f"Image {i+1} is original photo {p['photo_index']+1}, detail section {p['panel_index']+1}." for i, p in enumerate(row["panels"]))
                request["prompt"] = prefix + "\n" + mapping + " " + rules
                data = (json.dumps(request, indent=2) + "\n").encode("utf-8")
                role = "development" if split == "supplement" else split
            path = directory / (name + ".json")
            pending.append((path, data))
            pilot.append({"id": name, "source": role, "cohort": "supplement4" if split == "supplement" else "original50", "source_split": split,
                          "request": path.relative_to(ROOT).as_posix(), "request_sha256": hashlib.sha256(data).hexdigest()})
    if len(pilot) != 54 or len({r["id"] for r in pilot}) != 54:
        raise ValueError("Cohort has missing or duplicate cases")
    directory.mkdir()
    for path, data in pending:
        with path.open("xb") as handle:
            handle.write(data)
    plan = {"version": args.version, "sealed_at": datetime.now(timezone.utc).isoformat(), "base_plan_sha256": sha(base_path), "builder_sha256": sha(Path(__file__)),
            "source_commit": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(), "pilot": pilot, "source_preparation_runs": inventories,
            "scope": "Full original50 regression cohort plus four separate development/control diagnostics. Original evaluation cases were previously inspected, not a new blind holdout. Same strict v2 protocol/model/pixels; no labels or OCR text supplied.",
            "label_files_read": False, "input_ocr_text": False}
    with output.open("x", encoding="utf-8") as handle:
        json.dump(plan, handle, indent=2)
    print(json.dumps({"cases": len(pilot), "original": sum(r["cohort"] == "original50" for r in pilot), "supplement": 4, "plan": output.relative_to(ROOT).as_posix()}))


if __name__ == "__main__":
    main()
