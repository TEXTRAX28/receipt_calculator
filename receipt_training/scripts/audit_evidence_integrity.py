"""Verify declared historical hashes; archive mutable QA aliases without rewriting truth.

Archive fallback requires the exact expected bytes. A newer test result never
substitutes for a missing historical result. All receipt content stays local.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re

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
    parser.add_argument("--archive-mutable", action="store_true")
    args = parser.parse_args()
    if not re.fullmatch(r"[\w-]+", args.run):
        raise ValueError("Use a new simple run name")
    out = QA / "evidence-audits" / (args.run + ".json")
    if out.exists():
        raise ValueError("Preserve the previous audit; choose a new run")
    cache, reports, archives = {}, {}, {}
    for report in sorted((ROOT / "receipt_training/evaluation").glob("*.json")):
        value = json.loads(report.read_text(encoding="utf-8"))
        hashes = value.get("evidence_sha256", {})
        if not hashes:
            continue
        result = {"declared": len(hashes), "matched_in_place": 0, "matched_exact_archive": 0, "gaps": []}
        for name, expected in hashes.items():
            path = ROOT / name
            path.resolve().relative_to(ROOT.resolve())
            if path.name.startswith(".env") or not re.fullmatch(r"[a-f0-9]{64}", expected):
                raise ValueError("Invalid evidence declaration")
            if name not in cache:
                cache[name] = sha(path) if path.is_file() else None
            actual = cache[name]
            mutable = path.parent == QA or (path.parent == QA / "advanced-ocr" and path.name.startswith("pdf-flow-"))
            if args.archive_mutable and mutable and actual:
                archives[name] = {"observed_sha256": actual, "blob": archive(path, actual)}
            if actual == expected:
                result["matched_in_place"] += 1
            elif (BLOBS / expected).is_file() and sha(BLOBS / expected) == expected:
                result["matched_exact_archive"] += 1
            else:
                result["gaps"].append({"path": name, "expected_sha256": expected, "observed_sha256": actual,
                                       "observed_replacement_blob": archives.get(name, {}).get("blob")})
        reports[report.name] = result
    gaps = sum(len(value["gaps"]) for value in reports.values())
    result = {"scope": "Every declared evidence hash in the current aggregate reports; strict exact-byte archive fallback only",
              "reports": reports, "unique_paths_checked": len(cache), "unresolved_declared_hashes": gaps,
              "mutable_alias_archives": archives,
              "finding": "Missing historical bytes remain an explicit gap. Later successful runs and archived replacements do not establish the old run's exact timing, IDs or screenshot.",
              "network_requests": 0}
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("x", encoding="utf-8", newline="\n") as file:
        file.write(json.dumps(result, indent=2) + "\n")
    print(json.dumps({"audit": out.relative_to(ROOT).as_posix(), "unique_paths_checked": len(cache),
                      "unresolved_declared_hashes": gaps,
                      "affected_reports": {name: len(value["gaps"]) for name, value in reports.items() if value["gaps"]},
                      "archived_mutable_aliases": len(archives), "network_requests": 0}))
    if gaps:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
