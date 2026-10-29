"""Download only the reviewed Commons sources; preserve the user's original."""
import html
import json
import re
import shutil
import urllib.parse
import urllib.error

from collect import ROOT, digest, empty_label, field, get, jsonl, save_json, verify_image

SOURCES = [
    ("costco-tw-20121104", "Costco Xizhi Store uniform invoice 20121104.jpg", "Costco", "TW", "TWD"),
    ("costco-tw-20170303", "Costco Xizhi Store uniform invoice 20170303.jpg", "Costco", "TW", "TWD"),
    ("costco-tw-20151020", "Costco Xizhi Store e-invoice 20151020.jpg", "Costco", "TW", "TWD"),
    ("costco-tw-20180210", "Costco Xizhi Store e-invoice 20180210.jpg", "Costco", "TW", "TWD"),
    ("costco-tw-photo-20130612", "TW Costco Photo receipt 20130612.jpg", "Costco", "TW", "TWD"),
    ("tesco-gb-1994", "Tesco grocery receipt Finchley 1994.jpg", "Tesco", "GB", "GBP"),
]


def main():
    url = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode({
        "action": "query", "titles": "|".join("File:" + source[1] for source in SOURCES),
        "prop": "imageinfo", "iiprop": "url|extmetadata|sha1", "format": "json",
    })
    metadata = json.loads(get(url))
    save_json(ROOT / ".cache/commons-reviewed-sources.json", metadata)
    pages = {p["title"]: p for p in metadata["query"]["pages"].values()}
    manifests, new_labels, failures = [], [], []
    for receipt_id, title, merchant, country, currency in SOURCES:
        page = pages["File:" + title]
        info = page["imageinfo"][0]
        meta = info["extmetadata"]
        licence = meta["LicenseShortName"]["value"]
        if not (licence.startswith("CC BY-SA") or (receipt_id == "tesco-gb-1994" and licence == "Public domain")):
            raise RuntimeError(f"Unexpected receipt-image rights for {title}: {licence}")
        category = "costco/physical" if merchant == "Costco" else "non_costco/physical/tesco"
        relative = f"{category}/{receipt_id}.jpg"
        path = ROOT / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        rendition = "original"
        if not path.exists():
            try:
                try:
                    data = get(info["url"])
                except urllib.error.HTTPError as error:
                    if error.code != 429:
                        raise
                    # Wikimedia explicitly recommends its standard thumbnail sizes on 429.
                    width = 500 if merchant == "Tesco" else 1280
                    thumb_api = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode({
                        "action": "query", "titles": "File:" + title, "prop": "imageinfo",
                        "iiprop": "url", "iiurlwidth": width, "format": "json",
                    })
                    thumb_page = next(iter(json.loads(get(thumb_api))["query"]["pages"].values()))
                    data = get(thumb_page["imageinfo"][0]["thumburl"])
                    rendition = f"Commons {width}px thumbnail"
                verify_image(data)
                path.write_bytes(data)
                save_json(ROOT / ".cache" / f"{receipt_id}-rendition.json", {"rendition": rendition})
            except Exception as error:
                failures.append({"receipt_id": receipt_id, "source_url": info["descriptionurl"], "reason": str(error)})
                print(f"Not collected: {receipt_id}: {error}", flush=True)
                continue
        rendition_file = ROOT / ".cache" / f"{receipt_id}-rendition.json"
        if rendition_file.exists():
            rendition = json.loads(rendition_file.read_text(encoding="utf-8"))["rendition"]
        data = path.read_bytes()
        source_url = "https://commons.wikimedia.org/wiki/" + urllib.parse.quote("File:" + title.replace(" ", "_"), safe=":")
        manifests.append({
            "receipt_id": receipt_id, "file_path": relative, "retailer": merchant,
            "country": country, "currency": currency, "origin": "physical",
            "category": "costco/physical" if merchant == "Costco" else "non_costco/physical",
            "real_receipt": True, "source_url": source_url, "source_id": f"commons:{page['pageid']}",
            "included_in_pilot": receipt_id != "costco-tw-photo-20130612",
            "document_kind": "photo_order_acknowledgement" if receipt_id == "costco-tw-photo-20130612" else "financial_receipt",
            "source_split": None, "split": "development", "licence": licence,
            "licence_url": meta.get("LicenseUrl", {}).get("value", source_url),
            "permission_status": "author licenses photograph" if merchant == "Costco" else "Commons PD-ineligible declaration for factual receipt",
            "attribution": html.unescape(re.sub(r"<[^>]+>", "", meta["Artist"]["value"])),
            "changes": "none; original image downloaded" if rendition == "original" else f"Resized by Wikimedia: {rendition}; no local edits", "sha256": digest(data),
            "group_id": f"transaction-{receipt_id}", "image": verify_image(data),
            "quality_notes": ["awaiting visual inspection"], "annotation_status": "pending_manual_transcription",
            "privacy_status": "local_only_pending_privacy_review", "external_processing_allowed": False,
        })
        label = empty_label(receipt_id)
        label["verification"]["status"] = "pending_manual_transcription"
        label["merchant"] = field(merchant, merchant)
        label["country"] = field("source description", country)
        label["currency"] = field("source country; verify on image", currency)
        label["currency"]["review_required"] = True
        new_labels.append(label)

    original = ROOT / "costco/costco-receipt-1.webp"
    working = ROOT / "costco/physical/user-costco-bristol-001.webp"
    original_bytes = original.read_bytes()
    if not working.exists():
        shutil.copy2(original, working)
    if working.read_bytes() != original_bytes:
        raise RuntimeError("Working copy differs from the original; preserve both and review")
    manifests.append({
        "receipt_id": "user-costco-bristol-001", "file_path": "costco/physical/user-costco-bristol-001.webp",
        "original_file_path": "costco/costco-receipt-1.webp", "original_sha256": digest(original_bytes),
        "retailer": "Costco", "country": "GB", "currency": "GBP", "origin": "physical", "category": "costco/physical",
        "real_receipt": True, "source_url": None, "source_id": "user-supplied-original",
        "source_split": None, "split": "development", "licence": "private-user-supplied",
        "licence_url": None, "permission_status": "user authorised local development/evaluation; no redistribution licence",
        "attribution": "User-supplied Costco Bristol receipt", "changes": "none; byte-identical classified working copy",
        "sha256": digest(original_bytes), "group_id": "transaction-user-costco-bristol-001",
        "image": verify_image(original_bytes),
        "quality_notes": ["paper photo on carpet; folded; pen stroke; footer cropped; membership already obscured; masked payment suffix remains"],
        "annotation_status": "manual_visual_partial", "privacy_status": "private_local_only", "external_processing_allowed": False,
    })
    new_labels.append(empty_label("user-costco-bristol-001"))
    jsonl(ROOT / "annotations/manual-manifest.jsonl", manifests)
    save_json(ROOT / ".cache/addition-download-failures.json", failures)
    label_path = ROOT / "annotations/manual-labels.jsonl"
    existing = {l["receipt_id"]: l for l in map(json.loads, label_path.read_text(encoding="utf-8").splitlines())} if label_path.exists() else {}
    jsonl(label_path, [existing.get(l["receipt_id"], l) for l in new_labels])
    print(f"Prepared {len(manifests)} additions. No Bandcamp image downloaded: album-art rights unresolved.")


if __name__ == "__main__":
    main()
