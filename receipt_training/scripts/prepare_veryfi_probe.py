"""Package exactly two inspected redacted crops; no network, labels or API keys."""
from datetime import datetime, timezone
import hashlib
import io
import json
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "qa-artifacts/advanced-ocr/cloud-review"
OUT = ROOT / "qa-artifacts/provider-review/veryfi-uk-v1"
EXPECTED = [
    ("user-uk-items.jpg", "1c53a19923a200676096db4cc093610a3c895634d68fa90f9a9a5c5b38b51b68"),
    ("user-uk-vat-totals.jpg", "adcf3ef31024a3e0e1efd92e90404e3bf48b1585fb6d2d5a911836b4e16e705b"),
]


def sha(data):
    return hashlib.sha256(data).hexdigest()


def main():
    stream, inputs = io.BytesIO(), []
    with zipfile.ZipFile(stream, "w", compression=zipfile.ZIP_STORED) as archive:
        for index, (name, expected) in enumerate(EXPECTED):
            data = (SOURCE / name).read_bytes()
            if sha(data) != expected or not data.startswith(b"\xff\xd8\xff"):
                raise ValueError("The inspected crop bytes changed")
            entry = zipfile.ZipInfo(f"{index + 1:02}.jpg", date_time=(1980, 1, 1, 0, 0, 0))
            entry.create_system = 0
            archive.writestr(entry, data)
            inputs.append({"source": (SOURCE / name).relative_to(ROOT).as_posix(), "entry": entry.filename, "sha256": expected, "bytes": len(data)})
    bundle = stream.getvalue()
    with zipfile.ZipFile(io.BytesIO(bundle)) as archive:
        if archive.namelist() != [entry["entry"] for entry in inputs]:
            raise ValueError("Unexpected ZIP members")
        for entry in inputs:
            if sha(archive.read(entry["entry"])) != entry["sha256"]:
                raise ValueError("ZIP changed an original crop")
    if len(bundle) > 2_000_000:
        raise ValueError("Prepared request exceeds the two-megabyte input bound")
    OUT.mkdir(parents=True, exist_ok=False)
    (OUT / "receipt.zip").write_bytes(bundle)
    manifest = {"provider": "Veryfi", "api_version": "v8", "prepared_at": datetime.now(timezone.utc).isoformat(),
                "endpoint": "https://api.veryfi.com/api/v8/partner/documents", "archive": "receipt.zip", "archive_sha256": sha(bundle), "archive_bytes": len(bundle), "inputs": inputs,
                "max_processing_requests": 1, "max_deletion_requests": 1, "automatic_retries": 0, "approval_required": True,
                "approval_received": False, "billing_activation_allowed": False, "label_files_read": False, "ocr_text_supplied": False,
                "scope": "Exactly the two locally inspected identifier-removed source JPEGs in alphabetical order, packaged without re-encoding, source hints or extra files. No source-corpus upload permission is changed.",
                "cleanup_scope": "At most one DELETE for the fresh 201 response ID, only when its external_id matches this request and no duplicate is reported. A timeout, unmatched record or cleanup failure may leave provider data retained.",
                "builder_sha256": sha(Path(__file__).read_bytes()),
                "references": ["https://docs.veryfi.com/api/receipts-invoices/process-a-document/", "https://docs.veryfi.com/api/getting-started/authentication/bearer-keys/", "https://faq.veryfi.com/en/articles/6243055-processing-zip-files", "https://www.veryfi.com/pricing/", "https://faq.veryfi.com/en/articles/6716494-document-retention-management"]}
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8", newline="\n")
    (OUT / "builder.py").write_bytes(Path(__file__).read_bytes())
    print(json.dumps({"prepared": OUT.relative_to(ROOT).as_posix(), "files": len(inputs), "archive_bytes": len(bundle), "external_requests": 0, "approval_received": False}))


if __name__ == "__main__":
    main()
