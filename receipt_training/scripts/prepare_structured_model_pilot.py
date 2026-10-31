"""Seal a model-specific structured pilot on the old pilot's identical pixels.

Copies a synthetic-tested format/profile, never labels or earlier OCR output.
Only source-photo mapping changes between requests; all results remain diagnostic.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[2]


def local(name):
    path = (ROOT / name).resolve()
    path.relative_to(ROOT)
    return path


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-pilot", required=True)
    parser.add_argument("--profile", required=True)
    parser.add_argument("--version", required=True)
    parser.add_argument("--base-prompt-with-schema", action="store_true", help="Keep each sealed base prompt and append the synthetic-tested explicit JSON schema")
    args = parser.parse_args()
    if not re.fullmatch(r"[\w-]+", args.version):
        raise ValueError("Use a simple new pilot name")
    base_path, profile_path = local(args.base_pilot), local(args.profile)
    base, profile = [json.loads(path.read_text(encoding="utf-8")) for path in [base_path, profile_path]]
    manifest = local(profile["model_manifest"])
    manifest.relative_to((ROOT / "receipt_training/evaluation").resolve())
    marker = "Image 1 is original photo 1; use sourcePhotos [1] for its purchase rows."
    schema_suffix = '\nYour response MUST match this complete JSON Schema; include every required field, including empty arrays and unknown metadata. The schema is format guidance, never receipt evidence.\n' + json.dumps(profile["schema"], ensure_ascii=False, separators=(',', ':'))
    if args.base_prompt_with_schema and not profile["prompt"].endswith(schema_suffix):
        raise ValueError("Choose a synthetic-tested profile containing this exact explicit schema")
    if profile["output_mode"] != "structured-receipt" or (not args.base_prompt_with_schema and profile["prompt"].count(marker) != 1):
        raise ValueError("Choose the synthetic-tested structured profile with its source-map marker")
    folder = ROOT / "qa-artifacts/advanced-ocr" / (args.version + "-requests")
    plan_path = folder.parent / (args.version + ".json")
    if folder.exists() or plan_path.exists():
        raise ValueError("Preserve an existing pilot; use a new version")
    pending, cases = [], []
    for case in base["pilot"]:
        if not re.fullmatch(r"[\w-]+", case["id"]):
            raise ValueError("Invalid case ID")
        old_path = local(case["request"])
        if sha(old_path) != case["request_sha256"]:
            raise ValueError("The sealed base request changed")
        old = json.loads(old_path.read_text(encoding="utf-8"))
        if not re.fullmatch(r"[\w-]+", old["source_panel_run"]):
            raise ValueError("Invalid source panel run")
        source = ROOT / "receipt_training/evaluation/runs" / old["source_panel_run"] / "predictions.jsonl"
        if sha(source) != old["source_panel_manifest_sha256"]:
            raise ValueError("The frozen panel manifest changed")
        record = next(row for row in map(json.loads, source.read_text(encoding="utf-8").splitlines()) if row["receipt_id"] == case["id"])
        if len(old["images"]) != len(record["panels"]) or old["source_image_sha256"] != record["image_sha256"]:
            raise ValueError("The original image/panel mapping changed")
        mapping = []
        for index, (image, panel) in enumerate(zip(old["images"], record["panels"])):
            if sha(local(image)) != panel["sha256"]:
                raise ValueError("The original image pixels changed")
            mapping.append(f"Image {index + 1} is original photo {panel['photo_index'] + 1}, section {panel['panel_index'] + 1}.")
        if args.base_prompt_with_schema and old["schema"] != profile["schema"]:
            raise ValueError("Explicit schema must match the original pilot contract")
        prompt = old["prompt"] + schema_suffix if args.base_prompt_with_schema else profile["prompt"].replace(marker, " ".join(mapping) + " Use each row's original photo number in sourcePhotos.")
        if len(prompt) > 12000:
            raise ValueError("Prompt exceeds the native experiment bound")
        overrides = {"model_manifest", "output_mode", "schema", "context", "max_tokens", "image_tokens", "gpu_layers", "projector_gpu", "verbose", "require_clean_schema", "constrain_schema", "normalize_numeric_json", "chat_template_kwargs"}
        request = {**old, **{key: value for key, value in profile.items() if key in overrides}, "images": old["images"], "prompt": prompt}
        if any(request[key] != old[key] for key in ["source_panel_run", "source_panel_manifest_sha256", "source_image_sha256", "images"]):
            raise ValueError("A model profile may not override original source provenance")
        path = folder / (case["id"] + ".json")
        data = (json.dumps(request, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
        pending.append((path, data))
        cases.append({**case, "request": path.relative_to(ROOT).as_posix(), "request_sha256": hashlib.sha256(data).hexdigest()})
    if not cases or len(cases) > 100 or len({case["id"] for case in cases}) != len(cases):
        raise ValueError("Invalid bounded pilot selection")
    folder.mkdir()
    (folder / "builder.py").write_bytes(Path(__file__).read_bytes())
    for path, data in pending:
        with path.open("xb") as output:
            output.write(data)
    value = {"version": args.version, "sealed_at": datetime.now(timezone.utc).isoformat(), "source_commit": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
             "base_plan_sha256": sha(base_path), "synthetic_profile_sha256": sha(profile_path), "builder_sha256": sha(Path(__file__)), "model_manifest_sha256": sha(manifest),
             "prompt_policy": "base prompt plus explicit schema" if args.base_prompt_with_schema else "synthetic-tested template with source-photo map",
             "scope": "Direct model-only structured extraction, with a synthetic-tested prompt and explicit typed-format normalization. Identical base-pilot image panels; no source OCR or labels enter a model request. Not a blind holdout.",
             "label_files_read": False, "input_ocr_text": False, "pilot": cases}
    with plan_path.open("x", encoding="utf-8") as output:
        json.dump(value, output, ensure_ascii=False, indent=2)
    print(json.dumps({"sealed_cases": len(cases), "plan": plan_path.relative_to(ROOT).as_posix()}))


if __name__ == "__main__":
    main()
