"""Exact historical-byte, path-boundary and duplicate-read audit controls."""
import argparse
import contextlib
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[2]
IMPLEMENTATION = Path(__file__).with_name("audit_evidence_integrity.py").resolve()
digest = lambda data: hashlib.sha256(data).hexdigest()


class AuditControls(unittest.TestCase):
    def setUp(self):
        self.base = (ROOT / "qa-artifacts/evidence-audit-cache-tests").resolve()
        self.base.relative_to((ROOT / "qa-artifacts").resolve())
        self.base.mkdir(exist_ok=True)
        self.temporary = tempfile.TemporaryDirectory(prefix="owned-", dir=self.base)
        self.directory = Path(self.temporary.name).resolve()
        self.assertEqual(self.directory.parent, self.base)
        self.project = self.directory / "project"
        (self.project / "receipt_training/evaluation").mkdir(parents=True)
        (self.project / "qa-artifacts/evidence-blobs").mkdir(parents=True)
        spec = importlib.util.spec_from_file_location("controlled_evidence_audit", IMPLEMENTATION)
        self.audit = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.audit)
        self.audit.ROOT = self.project
        self.audit.QA = self.project / "qa-artifacts"
        self.audit.BLOBS = self.audit.QA / "evidence-blobs"

    def tearDown(self):
        self.assertEqual(self.directory.resolve().parent, self.base)
        self.temporary.cleanup()

    def write(self, name, data):
        path = self.project / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return path

    def report(self, name, declarations):
        self.write("receipt_training/evaluation/" + name + ".json",
                   json.dumps({"evidence_sha256": declarations}).encode("utf-8"))

    def run_audit(self, run="controlled", extra=()):
        status = 0
        stdout = io.StringIO()
        with mock.patch.object(sys, "argv", ["audit_evidence_integrity.py", "--run", run, *extra]), contextlib.redirect_stdout(stdout):
            try:
                self.audit.main()
            except SystemExit as error:
                status = error.code
        result = json.loads((self.audit.QA / "evidence-audits" / (run + ".json")).read_text(encoding="utf-8"))
        self.last_summary = json.loads(stdout.getvalue())
        return status, result

    def test_repeated_reports_keep_exact_results_without_rehashing_the_same_archive(self):
        old = b"retained historical observation"
        current = b"different later observation"
        good = b"unchanged source"
        self.write("source/observation.txt", current)
        self.write("source/unchanged.txt", good)
        self.write("qa-artifacts/evidence-blobs/" + digest(old), old)
        for number in range(10):
            self.report(str(number), {"source/observation.txt": digest(old), "source/unchanged.txt": digest(good)})
        with mock.patch.object(self.audit, "sha", wraps=self.audit.sha) as reads:
            status, result = self.run_audit()
        self.assertEqual(status, 0)
        self.assertEqual(result["unique_paths_checked"], 2)
        self.assertEqual(result["unresolved_declared_hashes"], 0)
        self.assertEqual(len(result["reports"]), 10)
        for report in result["reports"].values():
            self.assertEqual((report["declared"], report["matched_in_place"], report["matched_exact_archive"]), (2, 1, 1))
        self.assertLessEqual(reads.call_count, 3, "Each of the two current files and one exact archive should be hashed once")

    def test_later_success_cannot_substitute_for_missing_expected_bytes(self):
        later = b"later successful result"
        expected = digest(b"missing historical failure")
        self.write("source/result.txt", later)
        self.report("missing", {"source/result.txt": expected})
        status, result = self.run_audit()
        self.assertEqual(status, 1)
        self.assertEqual(result["unresolved_declared_hashes"], 1)
        gap = result["reports"]["missing.json"]["gaps"][0]
        self.assertEqual(gap["expected_sha256"], expected)
        self.assertEqual(gap["observed_sha256"], digest(later))
        self.assertIsNone(gap["observed_replacement_blob"])

    def test_a_blob_filename_does_not_prove_its_content(self):
        expected = digest(b"old exact bytes")
        self.write("source/result.txt", b"new result")
        self.write("qa-artifacts/evidence-blobs/" + expected, b"corrupt archive contents")
        self.report("corrupt", {"source/result.txt": expected})
        status, result = self.run_audit()
        self.assertEqual(status, 1)
        self.assertEqual(result["unresolved_declared_hashes"], 1)
        self.assertEqual(result["reports"]["corrupt.json"]["matched_exact_archive"], 0)

    def test_case_insensitive_private_environment_name_is_rejected_without_hashing(self):
        # No environment file is created or opened, even as a fixture.
        self.report("private", {".ENV.LOCAL": "a" * 64})
        with mock.patch.object(self.audit, "sha", side_effect=AssertionError("Private paths must never be hashed")):
            with self.assertRaises(ValueError):
                self.run_audit()

    def test_parent_escape_is_rejected_without_hashing(self):
        self.report("escape", {"../outside.txt": "b" * 64})
        with mock.patch.object(self.audit, "sha", side_effect=AssertionError("Escaping paths must never be hashed")):
            with self.assertRaises(ValueError):
                self.run_audit()

    def test_invalid_expected_digest_is_rejected_without_hashing(self):
        self.report("digest", {"source/result.txt": "a" * 63})
        with mock.patch.object(self.audit, "sha", side_effect=AssertionError("Invalid declarations must not be read")):
            with self.assertRaises(ValueError):
                self.run_audit()

    def test_public_environment_example_remains_a_regular_source_artifact(self):
        public = b"PUBLIC_EXAMPLE_ONLY=yes\n"
        self.write(".env.example", public)
        self.report("example", {".env.example": digest(public)})
        status, result = self.run_audit()
        self.assertEqual(status, 0)
        self.assertEqual(result["reports"]["example.json"]["matched_in_place"], 1)

    def test_archive_first_proves_exact_bytes_without_reading_current_aliases(self):
        old = b"exact retained observation"
        expected = digest(old)
        self.write("qa-artifacts/evidence-blobs/" + expected, old)
        for number in range(10):
            self.write(f"source/{number}.txt", b"later content is not historical proof")
            self.report(str(number), {f"source/{number}.txt": expected})
        original_sha = self.audit.sha

        def archive_reads_only(path):
            self.assertEqual(path.parent, self.audit.BLOBS)
            return original_sha(path)

        with mock.patch.object(self.audit, "sha", side_effect=archive_reads_only) as reads:
            status, result = self.run_audit(extra=("--prefer-archive",))
        self.assertEqual(status, 0)
        self.assertEqual(result["unique_paths_checked"], 10)
        self.assertEqual(result["current_paths_hashed"], 0)
        self.assertEqual(result["verification_order"], "exact-archive-then-current")
        self.assertEqual(sum(row["matched_exact_archive"] for row in result["reports"].values()), 10)
        self.assertEqual(reads.call_count, 1)

    def test_archive_first_rejects_corrupt_archive_and_checks_current_file(self):
        current = b"correct current retained bytes"
        expected = digest(current)
        self.write("source/result.txt", current)
        self.write("qa-artifacts/evidence-blobs/" + expected, b"corrupt")
        self.report("fallback", {"source/result.txt": expected})
        status, result = self.run_audit(extra=("--prefer-archive",))
        self.assertEqual(status, 0)
        self.assertEqual(result["reports"]["fallback.json"]["matched_in_place"], 1)
        self.assertEqual(result["reports"]["fallback.json"]["matched_exact_archive"], 0)

    def test_archive_first_cannot_bypass_private_path_validation(self):
        old = b"retained bytes"
        expected = digest(old)
        self.write("qa-artifacts/evidence-blobs/" + expected, old)
        self.report("private", {".ENV.LOCAL": expected})
        with mock.patch.object(self.audit, "sha", side_effect=AssertionError("Reject private paths first")):
            with self.assertRaises(ValueError):
                self.run_audit(extra=("--prefer-archive",))

    def test_archive_first_cannot_bypass_the_root_boundary(self):
        old = b"retained bytes"
        expected = digest(old)
        self.write("qa-artifacts/evidence-blobs/" + expected, old)
        self.report("escape", {"../outside.txt": expected})
        with mock.patch.object(self.audit, "sha", side_effect=AssertionError("Reject escaping paths first")):
            with self.assertRaises(ValueError):
                self.run_audit(extra=("--prefer-archive",))

    def test_archiving_a_later_success_does_not_repair_missing_historical_bytes(self):
        current = b"later successful observation"
        expected = digest(b"missing original observation")
        self.write("qa-artifacts/result.txt", current)
        self.report("mutable", {"qa-artifacts/result.txt": expected})
        status, result = self.run_audit(extra=("--archive-mutable",))
        self.assertEqual(status, 1)
        self.assertEqual(result["unresolved_declared_hashes"], 1)
        self.assertEqual((self.audit.BLOBS / digest(current)).read_bytes(), current)
        self.assertFalse((self.audit.BLOBS / expected).exists())
        gap = result["reports"]["mutable.json"]["gaps"][0]
        self.assertEqual(gap["observed_replacement_blob"], "qa-artifacts/evidence-blobs/" + digest(current))

    def test_selected_run_is_explicitly_partial_and_does_not_hide_excluded_failures(self):
        good = b"known exact bytes"
        self.write("source/good.txt", good)
        self.report("good", {"source/good.txt": digest(good)})
        self.report("excluded", {"source/missing.txt": digest(b"not retained")})
        status, selected = self.run_audit(extra=("--report", "good.json"))
        self.assertEqual(status, 0)
        self.assertTrue(selected["selection_requested"])
        self.assertIn("not the full", selected["scope"])
        self.assertEqual(selected["selected_input_filenames"], ["good.json"])
        self.assertEqual(set(selected["reports"]), {"good.json"})
        status, full = self.run_audit("full")
        self.assertEqual(status, 1)
        self.assertEqual(full["unresolved_declared_hashes"], 1)
        self.assertFalse(full["selection_requested"])

    def test_unknown_or_duplicate_selection_is_rejected_before_artifact_reads(self):
        self.report("good", {"source/good.txt": digest(b"retained")})
        with mock.patch.object(self.audit, "sha", side_effect=AssertionError("Invalid selections must not read artifacts")):
            with self.assertRaises(ValueError):
                self.run_audit(extra=("--report", "unknown.json"))
            with self.assertRaises(ValueError):
                self.run_audit(extra=("--report", "good.json", "--report", "good.json"))

    def test_union_of_disjoint_selected_reports_equals_the_full_audit_including_gaps(self):
        good = b"known exact bytes"
        self.write("source/good.txt", good)
        self.write("source/later.txt", b"different later bytes")
        self.report("good", {"source/good.txt": digest(good)})
        self.report("missing", {"source/later.txt": digest(b"missing old bytes")})
        _, full = self.run_audit("full")
        _, first = self.run_audit("first", ("--report", "good.json"))
        _, second = self.run_audit("second", ("--report", "missing.json"))
        self.assertTrue(set(first["reports"]).isdisjoint(second["reports"]))
        self.assertEqual({**first["reports"], **second["reports"]}, full["reports"])
        self.assertEqual(first["unresolved_declared_hashes"] + second["unresolved_declared_hashes"], full["unresolved_declared_hashes"])

    def test_console_summary_counts_all_archive_verified_paths_like_the_saved_result(self):
        old = b"exact retained bytes"
        expected = digest(old)
        self.write("qa-artifacts/evidence-blobs/" + expected, old)
        self.report("archived", {"source/older-alias.txt": expected})
        status, saved = self.run_audit(extra=("--prefer-archive",))
        self.assertEqual(status, 0)
        self.assertEqual(saved["unique_paths_checked"], 1)
        self.assertEqual(self.last_summary["unique_paths_checked"], saved["unique_paths_checked"])


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--implementation", type=Path, default=IMPLEMENTATION)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()
    IMPLEMENTATION = args.implementation.resolve()
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(AuditControls)
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    report = {"tests_run": result.testsRun, "failures": len(result.failures), "errors": len(result.errors),
              "skips": len(result.skipped), "successful": result.wasSuccessful(),
              "implementation_path": IMPLEMENTATION.relative_to(ROOT).as_posix(),
              "implementation_sha256": digest(IMPLEMENTATION.read_bytes()),
              "test_sha256": digest(Path(__file__).read_bytes()), "private_env_files_created_or_read": False,
              "scope": "Controlled local artifact trees only; no models, providers or receipt processing"}
    with args.report.open("x", encoding="utf-8", newline="\n") as file:
        json.dump(report, file, indent=2)
        file.write("\n")
    raise SystemExit(0 if result.wasSuccessful() else 1)
