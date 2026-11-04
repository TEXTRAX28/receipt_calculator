"""Verify declared historical hashes; archive mutable QA aliases without rewriting truth.

Archive fallback requires the exact expected bytes. A newer test result never
substitutes for a missing historical result. All receipt content stays local.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[2]
QA = ROOT / "qa-artifacts"
BLOBS = QA / "evidence-blobs"


def sha(path):
    value = hashlib.sha256()
    with path.open("rb") as file:
        while block := file.read(1024 * 1024):
            value.update(block)
    return value.hexdigest()


def archive(path, digest):
    target = BLOBS / digest
    if target.exists():
        if sha(target) != digest:
            raise ValueError("An archived blob has changed")
    else:
        BLOBS.mkdir(parents=True, exist_ok=True)
        with path.open("rb") as source, target.open("xb") as destination:
            while block := source.read(1024 * 1024):
                destination.write(block)
        if sha(target) != digest:
            raise ValueError("A source changed while being archived")
    return target.relative_to(ROOT).as_posix()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", required=True)
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument("--archive-mutable", action="store_true")
    modes.add_argument("--prefer-archive", action="store_true",
                       help="Read-only: verify exact retained archive bytes before hashing a current alias")
    parser.add_argument("--progress", action="store_true")
    parser.add_argument("--report", action="append", metavar="FILENAME",
                        help="Audit only these aggregate filenames; selected runs are explicitly partial")
    args = parser.parse_args()
    if not re.fullmatch(r"[\w-]+", args.run):
        raise ValueError("Use a new simple run name")
    out = QA / "evidence-audits" / (args.run + ".json")
    if out.exists():
        raise ValueError("Preserve the previous audit; choose a new run")
    root = ROOT.resolve()
    qa = QA.resolve()
    blobs = BLOBS.resolve()
    blobs.relative_to(root)
    cache, paths, blob_cache, reports, archives = {}, {}, {}, {}, {}
    report_paths = sorted((ROOT / "receipt_training/evaluation").glob("*.json"))
    if args.report is not None:
        requested = set(args.report)
        available = {path.name for path in report_paths}
        if len(requested) != len(args.report) or not requested <= available:
            raise ValueError("Select distinct existing aggregate filenames")
        report_paths = [path for path in report_paths if path.name in requested]

    def exact_archive(expected):
        if expected not in blob_cache:
            blob = (blobs / expected).resolve()
            blob.relative_to(root)
            if blob.name.casefold().startswith(".env") and blob.name.casefold() != ".env.example":
                raise ValueError("Invalid evidence declaration")
            blob_cache[expected] = sha(blob) if blob.is_file() else None
        return blob_cache[expected] == expected

    for report in report_paths:
        value = json.loads(report.read_text(encoding="utf-8"))
        hashes = value.get("evidence_sha256", {})
        if not hashes:
            continue
        result = {"declared": len(hashes), "matched_in_place": 0, "matched_exact_archive": 0, "gaps": []}
        for name, expected in hashes.items():
            path = root / name
            # The committed blank-key example is public source; live env files
            # remain forbidden. Source/build secret scanning is a separate gate.
            private_env = path.name.casefold().startswith(".env") and path.name.casefold() != ".env.example"
            if private_env or not re.fullmatch(r"[a-f0-9]{64}", expected):
                raise ValueError("Invalid evidence declaration")
            if name not in paths:
                path = path.resolve()
                path.relative_to(root)
                if path.name.casefold().startswith(".env") and path.name.casefold() != ".env.example":
                    raise ValueError("Invalid evidence declaration")
                paths[name] = path
            path = paths[name]
            if args.prefer_archive and exact_archive(expected):
                result["matched_exact_archive"] += 1
                continue
            if name not in cache:
                cache[name] = sha(path) if path.is_file() else None
            actual = cache[name]
            mutable = path.parent == qa or (path.parent == qa / "advanced-ocr" and path.name.startswith("pdf-flow-"))
            if args.archive_mutable and mutable and actual and name not in archives:
                archives[name] = {"observed_sha256": actual, "blob": archive(path, actual)}
                blob_cache.pop(actual, None)
            if actual == expected:
                result["matched_in_place"] += 1
            elif exact_archive(expected):
                result["matched_exact_archive"] += 1
            else:
                result["gaps"].append({"path": name, "expected_sha256": expected, "observed_sha256": actual,
                                       "observed_replacement_blob": archives.get(name, {}).get("blob")})
        reports[report.name] = result
        if args.progress:
            print(json.dumps({"audit_report": report.name, "reports_completed": len(reports)}), file=sys.stderr, flush=True)
    gaps = sum(len(value["gaps"]) for value in reports.values())
    scope = ("Only explicitly selected aggregate reports; not the full current manifest" if args.report is not None
             else "Every declared evidence hash in the current aggregate reports; strict exact-byte archive fallback only")
    result = {"scope": scope,
              "selection_requested": args.report is not None, "selected_input_filenames": list(reports),
              "reports": reports, "unique_paths_checked": len(paths), "unresolved_declared_hashes": gaps,
              "current_paths_hashed": sum(value is not None for value in cache.values()),
              "unique_archive_hashes_checked": len(blob_cache),
              "verification_order": "exact-archive-then-current" if args.prefer_archive else "current-then-exact-archive",
              "digest_cache_scope": "This audit process only; no persistent trusted checksum cache",
              "mutable_alias_archives": archives,
              "finding": "Missing historical bytes remain an explicit gap. Later successful runs and archived replacements do not establish the old run's exact timing, IDs or screenshot.",
              "network_requests": 0}
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("x", encoding="utf-8", newline="\n") as file:
        file.write(json.dumps(result, indent=2) + "\n")
    print(json.dumps({"audit": out.relative_to(ROOT).as_posix(), "unique_paths_checked": len(paths),
                      "unresolved_declared_hashes": gaps,
                      "affected_reports": {name: len(value["gaps"]) for name, value in reports.items() if value["gaps"]},
                      "archived_mutable_aliases": len(archives), "network_requests": 0}))
    if gaps:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
