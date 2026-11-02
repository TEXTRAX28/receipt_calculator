"""Seal actual capture controls, retained native errors and explicit user corrections."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import re

from audit_evidence_integrity import archive

ROOT = Path(__file__).resolve().parents[2]
RUN = ROOT / "qa-artifacts/capture-geometry-v1"
OUT = ROOT / "receipt_training/evaluation/advanced-capture-geometry-v1.json"
HASHES = {}


def read(path, expected=None):
    assert not path.name.startswith(".env"), "Never capture live configuration"
    assert path.is_file() or expected, str(path)
    raw = path.read_bytes() if path.is_file() else b""
    digest = hashlib.sha256(raw).hexdigest()
    if expected and digest != expected:
        raw = (ROOT / "qa-artifacts/evidence-blobs" / expected).read_bytes()
        digest = hashlib.sha256(raw).hexdigest()
    assert expected is None or digest == expected, str(path)
    HASHES[path.relative_to(ROOT).as_posix()] = digest
    if "qa-artifacts" not in path.parts and expected is None:
        archive(path, digest)
    return raw


def load(path, expected=None):
    return json.loads(read(path, expected))


def folder(path):
    for child in sorted(path.rglob("*")):
        if child.is_file() and "__pycache__" not in child.parts:
            read(child)


def main():
    if "--check" in sys.argv:
        report = json.loads(OUT.read_text(encoding="utf-8"))
        for filename, digest in report["evidence_sha256"].items():
            read(ROOT / filename, digest)
        print(json.dumps({"verified_files": len(HASHES), "external_requests": 0}))
        return
    assert not OUT.exists(), "Preserve the previous evidence packet"
    previous = load(ROOT / "receipt_training/evaluation/advanced-column-purchases-v1.json")
    for filename in ("receipt_training/manifest.jsonl", "receipt_training/annotations/private/priced-rows-v5-financial-labels.jsonl"):
        read(ROOT / filename, previous["evidence_sha256"][filename])
    plan = load(RUN / "plan.json")
    assert plan["parent_commit"].startswith("72bbd35")
    for filename, digest in plan["before_sha256"].items():
        read(RUN / "before" / filename, digest)
    needles = {"unit-padding-v4.txt": "716 passed", "browser-padding-v4.txt": "183 passed", "build-padding-v4.txt": "built in", "format-padding-v4.txt": "All matched files", "graph-padding-v4.txt": "Graph:", "touch-probe-fifth.txt": "1 passed"}
    for filename, needle in needles.items():
        assert needle in read(RUN / filename).decode("utf-8-sig")
    native = []
    screenshots = []
    for project in ("desktop", "mobile"):
        paths = sorted((ROOT / "qa-artifacts/e2e-runs").glob(project + "-*/native-ocr-observation.json"), key=lambda path: path.stat().st_mtime)
        assert paths
        observation = load(paths[-1])
        assert observation["names"] == ["Milk", "~ Apples"]
        assert observation["items"][1] == {"description": "~ Apples", "quantity": "1", "unitPrice": "3.00", "lineTotal": "3.00"}
        assert observation["manualCorrectionsToFollow"] == ["Item 2 description -> Apples"]
        assert observation["privateUploads"] == 0
        native.append({"project": project, **observation})
        folder(paths[-1].parent)
        screenshots.append(paths[-1].parent.relative_to(ROOT).as_posix())
    touch = load(RUN / "touch-probe-v4/result.json")
    assert touch["physicalPhone"] is False and touch["nativeGeometryWorker"] is True and touch["externalUploads"] == 0
    assert [(item["name"], item["x"], item["y"]) for item in touch["observed"]] == [("Top left",20,10),("Top right",80,10),("Bottom right",80,90),("Bottom left",20,90)]
    before_test = read(RUN / "no-padding-final-source/tests/e2e/image-geometry.spec.ts").decode()
    after_test = read(ROOT / "tests/e2e/image-geometry.spec.ts").decode()
    generator = lambda text: re.search(r"async function uploadTilted\(.*?(?=\nasync function openGeometry)", text, re.S).group()
    assert generator(before_test) == generator(after_test)
    generator_sha = hashlib.sha256(generator(after_test).encode()).hexdigest()
    # Content-address actual runtime/build/test bytes; immutable copies survive future builds.
    for directory in ("src", "server", "tests", "scripts", "dist"):
        folder(ROOT / directory)
    for filename in ("package.json", "package-lock.json", "playwright.config.ts", "vite.config.ts", "tsconfig.json", "index.html", "receipt_training/scripts/build_capture_geometry_report.py", "receipt_training/evaluation/CAPTURE_GEOMETRY.md", "receipt_training/evaluation/GOAL_ACCEPTANCE_AUDIT.md", "receipt_training/evaluation/ADVANCED_OCR_REPORT.md"):
        read(ROOT / filename)
    folder(RUN)
    git = lambda *args: subprocess.check_output(["git", *args], cwd=ROOT)
    stable = git("rev-parse", "stable/receipt-verified").decode().strip()
    original = r"C:\Users\natan\VSC Code\costco_calc"
    original_diff = hashlib.sha256(git("-C", original, "diff", "--binary")).hexdigest()
    assert stable == "ee725ba45e799bee8501d3de034e0302c0127afd"
    assert git("-C", original, "rev-parse", "HEAD").decode().strip() == "29a187af7347be94c0728f4785be674500833748"
    assert original_diff == "72fe803bf341a3052a441b7144838d06e7f4cbea5b59d612feb649368442e31b"
    report = {"scope": "Optional user-controlled local rotation/projective correction, original preservation, explicit preview and purchase-list review. One independent synthetic tilted/sideways fixture tested through actual correction and Tesseract in two browser contexts. No genuine-photo accuracy claim.",
        "native_ocr_observations": native, "unique_native_receipt_fixtures": 1,
        "unedited_native_counts_per_view": {"exact_names": [1,2], "quantities": [2,2], "unit_prices": [2,2], "line_prices": [2,2], "printed_total": "GBP 5.50"},
        "explicit_user_corrections_per_view": 1, "final_checked_split_per_view": ["GBP 2.75", "GBP 2.75"],
        "preprocessing_comparison": {"scope":"One synthetic fixture, same canvas generator; no general accuracy claim", "generator_sha256":generator_sha, "before_unit_price":"3.60", "after_unit_price":"3.00", "remaining_name_error":"~ Apples", "assessment_correction":"Initial failed name assertion hid the unit-price gain in the white-margin trace. Retain margin with adaptive thin-preview placement; preserve original notes and trials."},
        "verification": {"unit_tests": 716, "new_unit_tests": 23, "standard_browser_tests": 183, "existing_browser_skip": 1, "new_standard_browser_tests": 4, "editor_axe_violations": 0, "emulated_touch_probe_passes": 1, "physical_phone_test": False, "build_typecheck_format_graph": "passed", "browser_artifact_folders": screenshots},
        "touch_probe": touch,
        "requests": {"new_private_uploads": 0, "new_external_ocr_or_vlm_requests": 0, "paid_activation": False, "local_native_tesseract_runs": "Two real correction/OCR journeys per native attempt, including retained failed trials and the final full suite; standard suite also retains its pre-existing native OCR cases. No new original-fifty native cohort."},
        "git": {"parent_commit": git("rev-parse", "HEAD").decode().strip(), "branch": git("branch", "--show-current").decode().strip(), "stable": stable, "original_diff_sha256": original_diff, "merge_push_deploy": False},
        "limitations": ["Unattended corrected-image OCR is not verified: the synthetic source still yields one name error. Human changes are excluded from accuracy counts. The unit-price gain is only on this one synthetic fixture.", "On-device adapter currently supplies plain text without word boxes. The full corrected/original views are real; no rectangles are invented. Other readers retain actual section evidence.", "True physical aspect ratio, paper-curvature correction, automatic pose/clipping diagnostics and genuine-photograph gains are uncalibrated.", "Touch uses actual Chromium CDP touch events with iPhone emulation, not a physical phone or Safari/camera observation. Early touch-harness errors are retained separately.", "Per-input buffers and deadlines are bounded. Physical-phone peak memory and geometry latency distributions are not measured.", "Main bundle 531.64 kB and worker 8.70 kB; existing main chunk warning remains. No new runtime dependency.", "Original-fifty references, permissions and saved predictions are unchanged; prior 132/143 selected-currency price score is not a new capture measurement. Complete original receipts remain unscorable and trusted reconciliation remains 0/49.", "New Gemini six-crop private approval remains pending. Thirteen known historical artifact gaps are not restored. Full goal remains active."],
        "evidence_sha256": HASHES}
    with OUT.open("x", encoding="utf-8", newline="\n") as file:
        file.write(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"evidence_files": len(HASHES), "unit_tests":716, "browser_tests":183, "touch_probe":1, "manual_corrections_per_view":1, "private_uploads":0}))


if __name__ == "__main__":
    main()
