"""Record the legacy evidence gap and verify fresh immutable browser artifacts."""
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
QA = ROOT / "qa-artifacts"
OUT = ROOT / "receipt_training/evaluation/advanced-evidence-integrity.json"
EVIDENCE = {}


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def remember(path, expected=None):
    digest = sha(path)
    if expected is not None and expected != digest:
        raise ValueError("Evidence changed: " + str(path))
    EVIDENCE[path.resolve().relative_to(ROOT).as_posix()] = digest
    return path


def load(path):
    return json.loads(remember(path).read_text(encoding="utf-8"))


def main():
    if "--check" in sys.argv:
        value = json.loads(OUT.read_text(encoding="utf-8"))
        for name, expected in value["evidence_sha256"].items():
            remember(ROOT / name, expected)
        print(json.dumps({"verified_files": len(EVIDENCE), "legacy_unresolved_hashes": value["legacy_unresolved_hashes"],
                          "fresh_evidence_packet_verified": True}))
        return
    if OUT.exists():
        raise ValueError("Preserve the checkpoint; use --check")
    before, after = [load(QA / "evidence-audits" / (name + ".json")) for name in (
        "reading-currency-before-immutable-rerun", "reading-currency-after-immutable-rerun")]
    gap_map = lambda audit: {name: [(x["path"], x["expected_sha256"]) for x in row["gaps"]]
                             for name, row in audit["reports"].items() if row["gaps"]}
    if gap_map(before) != gap_map(after) or after["unresolved_declared_hashes"] != 13:
        raise ValueError("A rerun introduced a new evidence gap")
    for name, record in before["mutable_alias_archives"].items():
        remember(ROOT / record["blob"], record["observed_sha256"])
        if sha(ROOT / name) != record["observed_sha256"]:
            raise ValueError("A legacy alias changed during the controlled rerun")
    preservation = load(QA / "evidence-archive-preservation-check.json")
    first_wave = load(QA / "evidence-archive-first-wave.json")
    if (preservation["overwritten_first_wave_files"] != 0 or len(first_wave) != 82
            or preservation["total_files_after_repeat"] != 164):
        raise ValueError("Repeated tests did not retain the first complete artifact set")
    for name, expected in first_wave.items():
        remember(ROOT / name, expected)
    def find(name):
        paths = [ROOT / path for path in first_wave if Path(path).name == name]
        if len(paths) != 1:
            raise ValueError("Missing or ambiguous fresh browser evidence")
        return load(paths[0])
    refunds, area, pdfs = [], [], []
    for project in ("desktop", "mobile"):
        refund = find(f"refund-ocr-{project}.json")
        if (not refund["synthetic"] or refund["financialEdits"] or refund["posts"] or refund["external"]
                or refund["lineTotal"] != "-5.00" or refund["printedTotal"] != "-5.00"
                or refund["finalCreditShares"] != ["-2.50", "-2.50"]):
            raise ValueError("Fresh actual refund OCR did not complete without financial edits")
        reread = find(f"area-device-real-{project}.json")
        if not reread["synthetic"] or not reread["draftUnchanged"] or reread["posts"] or reread["external"]:
            raise ValueError("Fresh area OCR changed a draft or sent an unexpected request")
        pdf = find(f"pdf-flow-{project}.json")
        if (not pdf["synthetic"] or pdf["pages"] != 2 or not pdf["embeddedTextExtraction"]
                or pdf["financialEdits"] or pdf["purchases"] != 3 or pdf["distinctRepeatedMilks"] != 2
                or pdf["totalMinor"] != "650" or pdf["sharesMinor"] != ["217", "217", "216"] or pdf["workersRemaining"]):
            raise ValueError("Fresh PDF flow did not preserve the checked split")
        refunds.append({"project": project, "input_sha256": refund["input_sha256"], "elapsed_ms": refund["elapsedMs"]})
        area.append({"project": project, "recognized_text_retained": bool(reread["recognized"]), "elapsed_ms": reread["elapsedMs"]})
        pdfs.append({"project": project, "total_minor": "650", "shares_minor": ["217", "217", "216"]})
    logs = {}
    for name, expected in (("evidence-archive-rerun-v1.log", "48 passed"),
                           ("evidence-archive-final-e2e.log", "139 passed"),
                           ("evidence-archive-format-final-v2.log", "All matched files")):
        text = remember(QA / name).read_text(encoding="utf-8")
        if expected not in text:
            raise ValueError("Fresh artifact validation is incomplete")
        logs[name] = expected
    for name in ("tests/e2e/qa-artifacts.ts", "tests/e2e/refunds.spec.ts", "tests/e2e/pdf-receipts.spec.ts",
                 "tests/e2e/computer-reader.spec.ts", "tests/e2e/local-vision.spec.ts",
                 "receipt_training/scripts/audit_evidence_integrity.py", "receipt_training/scripts/build_evidence_integrity_report.py"):
        source = ROOT / name
        target = QA / "evidence-integrity-checkpoint-final-v2/source" / name
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.exists() and sha(target) != sha(source):
            raise ValueError("Do not replace a frozen integrity checkpoint")
        if not target.exists():
            target.write_bytes(source.read_bytes())
        remember(target, sha(source))
    value = {"scope": "Historical evidence integrity and fresh browser verification; no new OCR accuracy denominator",
             "legacy_unresolved_hashes": 13, "legacy_affected_reports": gap_map(after),
             "historical_gap": "Repeated tests overwrote 13 mutable aliases referenced by three older checkpoints. Their original exact JSON timing/IDs and screenshot bytes are not recovered. Old reports and hashes are unchanged; newer successful outputs do not replace those historical bytes. Legacy checkpoint --check commands can fail at these aliases. The full before/after audit checks 1831 unique declared paths; all other declarations resolve.",
             "fix": "Affected refund, PDF, selected-area and currency browser tests write to per-test exclusive directories and reject duplicate names. Successful reruns leave earlier evidence intact. Existing mutable QA aliases were archived by exact content hash; audit fallback accepts only the original expected bytes and still reports unrecovered gaps.",
             "preservation": {"first_wave_files": 82, "second_wave_total_files": 164, "overwritten_first_wave_files": 0,
                              "observed_legacy_aliases_preserved": len(before["mutable_alias_archives"]), "new_legacy_gaps_after_rerun": 0},
             "fresh_verification": {"focused_browser_passes": 48, "full_browser_passes": 139, "existing_skip": 1,
                                    "refund_actual_tesseract": refunds, "area_actual_tesseract": area, "pdf_direct_text": pdfs},
             "limits": "The refund, area and PDF sources are synthetic. Desktop and phone emulation share source transactions; these are integration checks, not distinct accuracy samples or physical-phone benchmarks. The fresh packet verifies current behavior, not the old run's missing raw bytes. Other unlisted artifact writers should adopt the same exclusive-directory convention when added or revised.",
             "network_requests_by_audit": 0, "evidence_sha256": EVIDENCE}
    OUT.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps({"output": OUT.relative_to(ROOT).as_posix(), "fresh_artifact_files_preserved": 82,
                      "legacy_gaps_disclosed": 13, "network_requests_by_audit": 0}))


if __name__ == "__main__":
    main()
