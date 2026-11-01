"""Freeze optional Veryfi app integration evidence. Local files only; no credentials."""
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / "qa-artifacts/veryfi-app-integration-v1"
OUT = ROOT / "receipt_training/evaluation/advanced-veryfi-app-reader-v2.json"


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def main():
    if "--check" in sys.argv:
        report = load(OUT)
        for name, digest in report["evidence_sha256"].items():
            assert sha(ROOT / name) == digest, "Frozen evidence changed: " + name
        print(json.dumps({"verified_files": len(report["evidence_sha256"]), "actual_external_requests": 0}))
        return
    assert not OUT.exists(), "Preserve the report; use --check"
    meta = load(BASE / "saved-replay-v3/metadata.json")
    assert meta["actual_external_requests"] == meta["forbidden_network_attempts"] == 0
    assert meta["variants"] == meta["financial_fields_unchanged"] == 12
    assert meta["accepted_payable_results"] == 0
    for name, digest in meta["source_sha256"].items():
        assert sha(ROOT / name) == digest, "Code changed after replay: " + name
        assert sha(BASE / "saved-replay-v3/source" / name) == digest
    for name, digest in meta["loaded_ssr_modules"].items():
        assert meta["source_sha256"][name] == digest
    assert sha(BASE / "saved-replay-v3/predictions.jsonl") == meta["predictions_sha256"]

    markers = {
        "full-unit-v2.log": ["421 passed"],
        "build-v3.log": ["built in"],
        "focused-browser-v3.log": ["6 passed"],
        "full-browser-v2.log": ["157 passed", "1 skipped"],
        "format-v3.log": ["All matched files use Prettier code style"],
        "graph-check-v2.log": ["Graph is current"],
    }
    for name, expected in markers.items():
        text = (BASE / name).read_text(encoding="utf-8-sig")
        assert all(marker in text for marker in expected), "Missing successful validation: " + name

    integrity = load(ROOT / "qa-artifacts/evidence-audits/veryfi-app-after-v1.json")
    assert integrity["unresolved_declared_hashes"] == 13
    protection = load(BASE / "workspace-verification-final-v2.json")
    assert protection["original_checkout_preserved"] and protection["actual_credential_and_pattern_hits"] == 0
    prior_path = ROOT / "receipt_training/evaluation/advanced-reduced-price-grouping-v1.json"
    prior = load(prior_path)
    assert prior["provider_text_after"]["known-currency"]["line_prices_correct"] == 25

    # Freeze current source/config/tests; actual executed browser bytes and the
    # format-only equivalence proof are retained separately. No ignored env is read.
    staged = subprocess.check_output(["git", "diff", "--cached", "--name-only", "-z"], cwd=ROOT).decode().split("\0")
    files = sorted({name for name in staged if name} | {"package.json", "package-lock.json", "receipt_training/scripts/build_veryfi_app_report.py"})
    assert all(not Path(name).name.startswith(".env") or name == ".env.example" for name in files)
    source = BASE / "checkpoint-source-v2"
    source.mkdir()
    for name in files:
        # The aggregate auditor deliberately refuses .env* evidence paths.
        # Snapshot this public, empty-value example under a neutral filename.
        target = source / ("public-env-template.example" if name == ".env.example" else name)
        target.parent.mkdir(parents=True, exist_ok=True)
        with target.open("xb") as output:
            output.write((ROOT / name).read_bytes())
    for name in ("graph.json", "GRAPH_REPORT.md"):
        shutil.copyfile(ROOT / "graphify-out" / name, source / name)
    for asset in sorted((ROOT / "dist").rglob("*")):
        if not asset.is_file() or "/ocr/" in asset.as_posix() or "/pdf/" in asset.as_posix():
            continue
        target = BASE / "executed-build-v2" / asset.relative_to(ROOT / "dist")
        target.parent.mkdir(parents=True, exist_ok=True)
        with target.open("xb") as output:
            output.write(asset.read_bytes())

    screenshots = []
    for project in ("desktop", "mobile"):
        candidates = []
        for path in (ROOT / "qa-artifacts/e2e-runs").glob("*/test.json"):
            info = load(path)
            if (info["project"] == project and info["title"] == "Veryfi consent, phone layout, source review and exact split (synthetic transport)"
                    and info["created_at"] > meta["created_at"]):
                candidates.append((info["created_at"], path))
        assert candidates, "Missing final-build screenshots: " + project
        _, info_path = max(candidates)
        screenshots.append(info_path)
        for width in (320, 390):
            screenshot = info_path.parent / f"veryfi-consent-{width}.png"
            assert screenshot.is_file()
            screenshots.append(screenshot)

    evidence = {}
    paths = sorted(path for path in BASE.rglob("*") if path.is_file() and not path.name.startswith(".env"))
    paths += screenshots + [prior_path, ROOT / "receipt_training/evaluation/advanced-veryfi-screening-result-v1.json",
                            ROOT / "qa-artifacts/evidence-audits/veryfi-app-before-v1.json",
                            ROOT / "qa-artifacts/evidence-audits/veryfi-app-after-v1.json", Path(__file__).resolve()]
    for path in paths:
        evidence[path.relative_to(ROOT).as_posix()] = sha(path)
    graph = load(source / "graph.json")
    locations = {node["id"]: {"source_file": node["source_file"], "source_location": node["source_location"]}
                 for node in graph["nodes"] if node["id"] in {
                     "veryfi_reader_createveryfireader", "document_allowance_createdocumentallowance",
                     "receipt_zip_zipreceiptsections", "veryfi_receiptfromveryfitext", "veryfi_extractwithveryfi"}}
    assert len(locations) == 5
    report = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "scope": "Optional literal-text Veryfi app reader; default provider unchanged; synthetic transport and genuine saved-output integration replay, not new recognition accuracy",
        "implementation": {"verified_graph_locations": locations,
            "persistent_allowance_default": 0, "explicit_consent_notice": "veryfi-us-training-v1", "max_sections": 15,
            "automatic_retries": 0, "automatic_fallback_providers": 0,
            "native_financial_fields_used": False, "fabricated_source_geometry": False,
            "mandatory_review_fields": ["items", "adjustments", "pricesIncludeTax"]},
        "validation": {"unit_tests_passed": 421, "full_browser_passed": 157, "existing_browser_skips": 1,
            "focused_browser_passed": 6, "production_build_typecheck": "passed", "format": "passed", "graph": "current",
            "saved_response_variants": 12, "financial_fields_unchanged": 12, "accepted_unreviewed_payable_results": 0,
            "viewport_widths": [320, 390], "horizontal_overflow": False, "minimum_scan_button_height_px": 44,
            "browser_accessibility": "axe WCAG2A/AA and WCAG21AA passed", "physical_handset_testing": False},
        "prior_measured_six_case_text_results": prior["provider_text_after"],
        "measurement_limits": ["Source-informed cropped development selection, not an independent holdout",
            "Selected currency is supplied after extraction", "Full financial accuracy is unscorable on incomplete truth",
            "Saved replay uses a JPEG header control and synthetic identities; no recognition or real deletion is repeated"],
        "privacy": {"actual_external_requests_in_this_integration": 0, "prior_live_scopes_consumed": True,
            "paid_activation": False, "real_environment_changed": False, "current_app_allowance": 0,
            "provider_default_hosting": "US", "proprietary_model_improvement_per_policy": True,
            "deletion_is_zero_retention_proof": False, "public_api_authentication_or_deployment": False},
        "git_protection": protection,
        "historical_integrity": {"unresolved_declared_hashes": 13, "new_gaps": 0,
            "note": "Older area/PDF/refund exact-byte gaps are not repaired by later passing runs. The unpublished v1 packaging capture and builder are retained privately; its public .env.example filename failed the aggregate auditor's blanket secret-path rule. V2 names the empty public template neutrally and does not declare .env* files. Prior report references are hashed; this checkpoint does not certify every historical transitive artifact."},
        "evidence_sha256": evidence,
    }
    with OUT.open("x", encoding="utf-8", newline="\n") as output:
        json.dump(report, output, indent=2)
        output.write("\n")
    print(json.dumps({"report": OUT.relative_to(ROOT).as_posix(), "evidence_files": len(evidence), "actual_external_requests": 0}))


if __name__ == "__main__":
    main()
