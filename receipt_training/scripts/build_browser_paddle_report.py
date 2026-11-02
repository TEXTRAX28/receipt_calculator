"""Seal actual official-browser SDK comparisons, including losing/failed paths."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

from audit_evidence_integrity import archive, sha

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "receipt_training/evaluation/advanced-browser-paddle-v1.json"
HASHES = {}


def record(name, expected=None):
    path = (ROOT / name).resolve()
    path.relative_to(ROOT.resolve())
    assert not path.name.startswith(".env")
    digest = sha(path) if path.is_file() else None
    if expected and digest != expected:
        path = ROOT / "qa-artifacts/evidence-blobs" / expected
        digest = sha(path)
    assert digest is not None and (not expected or digest == expected), name
    HASHES[name] = digest
    if not expected and not any(p in path.parts for p in ("qa-artifacts", ".cache", "runs")):
        archive(path, digest)
    return path


def load(name):
    return json.loads(record(name).read_text(encoding="utf-8"))


def main():
    if "--check" in sys.argv:
        for name, digest in json.loads(OUT.read_text(encoding="utf-8"))["evidence_sha256"].items():
            record(name, digest)
        print(json.dumps({"verified_files": len(HASHES), "new_inference_calls": 0}))
        return
    assert not OUT.exists()
    scores = load("qa-artifacts/browser-paddle-tiny-original50-parsed-v1/scores.json")
    four = load("qa-artifacts/browser-paddle-tiny-capture-parsed-v1/scores.json")
    assert scores["counts"]["all/paddle-ppocrv6-tiny-browser-wasm/known-currency"]["item_price_correct"] == 103
    assert scores["counts"]["all/tesseract-js-6-eng/known-currency"]["item_price_correct"] == 30
    assert four["counts"]["supplied-uk/known-currency/original"]["complete_receipt_correct"] == 0
    for score in (scores, four):
        for name, digest in score["evidence_sha256"].items():
            record(name, digest)
    resources = {}
    for tag in ("browser-paddle-medium-v1", "browser-paddle-tiny-v1", "browser-paddle-tiny-capture-v1", "browser-paddle-tiny-original50-v1"):
        base = "qa-artifacts/" + tag
        synthetic = load(base + "/result.json")
        control = load(base + "-control/controller.json")
        memory = load("receipt_training/evaluation/runs/" + tag + "/owned-memory.json")
        assert control["exit_code"] == 0 and not control.get("error")
        assert not synthetic.get("error") and len(synthetic["reading"][0]["items"]) == 6
        assert not synthetic["requests"]["external"] and not synthetic["requests"]["writes"]
        assert control["minimum_available_ram"] >= control["runtime_ram_floor"]
        resources[tag] = {"control": control, "memory": memory, "initialized_ms": synthetic["initialized_ms"], "synthetic_total_ms": synthetic["elapsed_ms"]}
    for tag, count in (("browser-paddle-tiny-capture-v1", 4), ("browser-paddle-tiny-original50-v1", 50)):
        readings = load("qa-artifacts/" + tag + "/capture-results.json")
        assert len(readings["cases"]) == count and not readings["errors"]
        assert not readings["requests"]["external"] and not readings["requests"]["writes"]
        assert not any(c["error"] for c in readings["cases"])
        for name, digest in readings["input_sha256"].items():
            record(name, digest)
    for path in sorted((ROOT / "qa-artifacts").glob("browser-paddle-*")):
        if path.is_dir():
            for file in sorted(path.rglob("*")):
                if file.is_file() and "vite-cache" not in file.parts:
                    record(file.relative_to(ROOT).as_posix())
    scripts = ("prepare_browser_paddle_probe.py", "prepare_browser_paddle_tiny.py", "probe_browser_paddle.mjs", "guard_browser_paddle_probe.py", "adapt_browser_paddle.py", "replay_browser_paddle_capture.mjs", "prepare_browser_paddle_cohort.mjs", "score_browser_paddle_cohort.py", "build_browser_paddle_report.py")
    for name in scripts:
        record("receipt_training/scripts/" + name)
    for name in ("BROWSER_PADDLE_COMPARISON.md", "GOAL_ACCEPTANCE_AUDIT.md"):
        record("receipt_training/evaluation/" + name)
    git = lambda *a, cwd=ROOT: subprocess.check_output(["git", *a], cwd=cwd)
    original = Path(r"C:\Users\natan\VSC Code\costco_calc")
    protected = {"stable": git("rev-parse", "stable/receipt-verified").decode().strip(),
                 "original_commit": git("rev-parse", "HEAD", cwd=original).decode().strip(),
                 "original_diff_sha256": hashlib.sha256(git("diff", "--binary", cwd=original)).hexdigest()}
    assert list(protected.values()) == ["ee725ba45e799bee8501d3de034e0302c0127afd", "29a187af7347be94c0728f4785be674500833748", "72fe803bf341a3052a441b7144838d06e7f4cbea5b59d612feb649368442e31b"]
    packet = {"scope": "Official browser SDK measured on four familiar development transactions and the separate original fifty, with exact paired prepared JPEG hashes. App runtime/dependencies unchanged; no mobile/default/provider promotion.",
              "original50": {"counts": scores["counts"], "timing": scores["timing"]},
              "separate_genuine_capture_four": four["counts"], "resources": resources,
              "fresh_real_image_sections": 56, "synthetic_inferences": 4,
              "public_model_downloads": 2, "public_model_and_configuration_gets": 4,
              "public_asset_bytes": 6299683, "private_external_uploads": 0,
              "api_cost_usd": "0", "compute_cost_usd": None, "paid_activation": False,
              "limits": ["Complete truth unavailable for original fifty; all strict receipts unscorable and all trust counts zero.",
                         "UK all eighteen annotated prices/quantities recovered, but two overlap duplicates remain; +1138 minor discrepancy and strict 0/1.",
                         "Automatic currency and quantity recall remain weak; candidate is not stronger than current computer-assisted hybrid.",
                         "Timing is warm inference/decode; memory is sampled Node/Vite/Chrome development tree. No phone/Safari or production-bundle measurement.",
                         "First preparation run failed a harness MIME declaration for WebP after forty-nine preparations, before OCR; fixed separate run retained.",
                         "Old synthetic guards lack pre-run helper-source hashing; later real-photo/full-cohort guards snapshot helpers before start.",
                         "No new full app suite was warranted for this research-only change; previous 874 unit/189 browser passes and one existing skip remain the latest runtime checks."],
              "git": {"parent_commit": git("rev-parse", "HEAD").decode().strip(), **protected, "merge_push_deploy": False},
              "evidence_sha256": HASHES}
    with OUT.open("x", encoding="utf-8", newline="\n") as file:
        file.write(json.dumps(packet, indent=2) + "\n")
    print(json.dumps({"sealed_files": len(HASHES), "real_image_sections": 56, "private_uploads": 0, "provider_promoted": False}))


if __name__ == "__main__":
    main()
