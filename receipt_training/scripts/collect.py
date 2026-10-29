"""Collect a fixed, licensed pilot. Originals/raw labels stay local and ignored.

Run from any directory: python -X utf8 receipt_training/scripts/collect.py
Requires Pillow; network access is only to the named source hosts.
"""
import hashlib
import io
import json
import re
import shutil
import time
import urllib.parse
import urllib.request
import urllib.error
from decimal import Decimal, InvalidOperation
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parents[1]
DATASET = "naver-clova-ix/cord-v2"
REVISION = "7f0115a4b758a71d6473b8d085751692da2fef98"
PLAN = {"train": 24, "validation": 8, "test": 12}
USER_AGENT = "GatherReceiptPilot/1.0 (local receipt evaluation; attribution recorded)"


def digest(data):
    return hashlib.sha256(data).hexdigest()


def get(url, retries=3):
    for attempt in range(retries):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(request, timeout=45) as response:
                return response.read()
        except urllib.error.HTTPError as error:
            if error.code == 429 or attempt + 1 == retries:
                raise
            time.sleep(1 + attempt)
        except Exception:
            if attempt + 1 == retries:
                raise
            time.sleep(1 + attempt)


def save_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def jsonl(path, records):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in records), encoding="utf-8")


def rupiah(raw):
    """Only accept explicit decimal or consistent three-digit grouping; keep raw."""
    if raw is None or isinstance(raw, (dict, list)):
        return None
    value = re.sub(r"^(?:Rp\.?|@)\s*", "", str(raw).strip(), flags=re.I).strip()
    if re.fullmatch(r"-?\d+", value):
        return str(int(value))
    if re.fullmatch(r"-?\d{1,3}(?:,\d{3})+", value) or re.fullmatch(r"-?\d{1,3}(?:\.\d{3})+", value):
        return str(int(value.replace(",", "").replace(".", "")))
    if re.fullmatch(r"-?\d+[.,]\d{1,2}", value):
        return format(Decimal(value.replace(",", ".")), "f")
    return None


def quantity(raw):
    if raw is None:
        return None
    value = re.sub(r"[xX×\s]", "", str(raw))
    if re.fullmatch(r"\d+(?:[.,]\d+)?", value):
        return format(Decimal(value.replace(",", ".")), "f")
    return None


def field(raw, normalized):
    return {"raw": raw, "value": normalized, "review_required": normalized is None}


def empty_label(receipt_id):
    return {
        "schema_version": "1.0", "receipt_id": receipt_id,
        "verification": {"status": "upstream_annotations", "model_generated": False,
                         "visual_review": "pending", "notes": []},
        "merchant": field(None, None), "date": field(None, None),
        "country": field(None, None), "currency": field(None, None),
        "items": [], "discounts": [], "fees": [], "raw_codes": [],
        "subtotal": field(None, None), "tax": field(None, None),
        "rounding": field(None, None), "grand_total": field(None, None),
        "payments": [], "prices_include_tax": None,
        "review_flags": [],
    }


def cord_label(receipt_id, gt):
    label = empty_label(receipt_id)
    label["verification"]["notes"].append("Semantic labels imported from CORD v2, not model predictions. No merchant/date/payment identifiers inferred.")
    label["country"] = field("CORD corpus: Indonesian receipts", "ID")
    # Corpus context is explicit; this is not a claim that IDR was printed on every image.
    label["currency"] = field("CORD corpus context", "IDR")
    label["currency"]["evidence"] = "dataset_context"
    parsed = gt["gt_parse"]
    menu = parsed.get("menu", [])
    if isinstance(menu, dict):
        menu = [menu]
    for index, item in enumerate(menu):
        label["items"].append({
            "id": f"item-{index + 1}", "description": field(item.get("nm"), item.get("nm")),
            "item_number": field(item.get("num"), item.get("num")),
            "quantity": field(item.get("cnt"), quantity(item.get("cnt"))),
            "unit": field(None, None), "pack_size": field(None, None),
            "unit_price": field(item.get("unitprice"), rupiah(item.get("unitprice"))),
            "line_total": field(item.get("price"), rupiah(item.get("price"))),
            "discount": field(item.get("discountprice"), rupiah(item.get("discountprice"))),
            "tax_code": field(item.get("vatyn"), item.get("vatyn")),
            "line_total_basis": "printed_menu_price", "raw": item,
        })
        if item.get("discountprice") is not None:
            label["discounts"].append({"item_id": f"item-{index + 1}", "amount": field(item["discountprice"], rupiah(item["discountprice"])), "association": "upstream_menu_group"})
        if item.get("sub"):
            label["review_flags"].append(f"item-{index + 1}: submenu preserved in raw; not automatically counted as a purchased item")
    sub = parsed.get("sub_total", {})
    total = parsed.get("total", {})
    for output, source, key in [("subtotal", sub, "subtotal_price"), ("tax", sub, "tax_price"), ("grand_total", total, "total_price")]:
        label[output] = field(source.get(key), rupiah(source.get(key)))
    for key in ["service_price", "othersvc_price"]:
        if key in sub:
            label["fees"].append({"kind": key, "amount": field(sub[key], rupiah(sub[key]))})
    if "discount_price" in sub:
        label["discounts"].append({"item_id": None, "amount": field(sub["discount_price"], rupiah(sub["discount_price"])), "association": "receipt; subtotal treatment unresolved"})
    if "etc" in sub:
        label["review_flags"].append("sub_total.etc retained in raw labels; its accounting meaning requires review")
    for key in ["cashprice", "changeprice", "creditcardprice", "emoneyprice"]:
        if key in total:
            label["payments"].append({"kind": key, "amount": field(total[key], rupiah(total[key]))})
    label["review_flags"].append("Tax inclusion and missing semantic fields are unknown; absent values are null, not zero.")
    return label


def verify_image(data):
    with Image.open(io.BytesIO(data)) as image:
        image.verify()
    with Image.open(io.BytesIO(data)) as image:
        image.load()
        # Difference hash is a review aid only, never automatic transaction deduplication.
        grey = image.convert("L").resize((9, 8))
        pixels = list(grey.getdata())
        bits = sum((pixels[y * 9 + x] > pixels[y * 9 + x + 1]) << (y * 8 + x) for y in range(8) for x in range(8))
        return {"format": image.format, "width": image.width, "height": image.height, "dhash": f"{bits:016x}"}


def collect_cord():
    cache = ROOT / ".cache"
    info = json.loads(get(f"https://huggingface.co/api/datasets/{DATASET}"))
    if info["sha"] != REVISION:
        raise RuntimeError("CORD revision changed. Review and update the pinned plan before collecting.")
    save_json(cache / "cord-repository.json", info)
    if "cc-by-4.0" not in json.dumps(info.get("cardData", {})).lower():
        raise RuntimeError("Dataset image licence is no longer explicitly CC BY 4.0.")
    manifest, labels = [], []
    for split, count in PLAN.items():
        url = "https://datasets-server.huggingface.co/first-rows?" + urllib.parse.urlencode({"dataset": DATASET, "config": "default", "split": split})
        # Do not persist signed asset URLs. Retain only source labels and stable provenance.
        rows = json.loads(get(url))["rows"]
        if len(rows) < count:
            raise RuntimeError(f"Only {len(rows)} cached {split} rows available; need {count}")
        for row in rows[:count]:
            idx = row["row_idx"]
            receipt_id = f"cord-v2-{split}-{idx:03}"
            gt = json.loads(row["row"]["ground_truth"])
            if gt["meta"]["split"] not in {split, "valid" if split == "validation" else split}:
                raise RuntimeError("Unexpected upstream split")
            relative = f"non_costco/physical/cord/{receipt_id}.jpg"
            path = ROOT / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            if not path.exists():
                data = get(row["row"]["image"]["src"])
                verify_image(data)  # HTML or a broken image must not enter the collection.
                path.write_bytes(data)
            data = path.read_bytes()
            image_info = verify_image(data)
            save_json(ROOT / "annotations/raw" / f"{receipt_id}.json", gt)
            transaction = digest(json.dumps(gt["gt_parse"], sort_keys=True).encode())
            manifest.append({
                "receipt_id": receipt_id, "file_path": relative,
                "retailer": None, "retailer_status": "not included in released semantic labels",
                "country": "ID", "currency": "IDR", "geography_evidence": "dataset_context",
                "origin": "physical", "category": "non_costco/physical", "real_receipt": True,
                "source_url": f"https://huggingface.co/datasets/{DATASET}",
                "source_id": f"{DATASET}@{REVISION}:{split}:{idx}", "source_split": split,
                "split": "evaluation" if split == "test" else "development",
                "licence": "CC-BY-4.0", "licence_url": "https://creativecommons.org/licenses/by/4.0/",
                "permission_status": "publisher explicitly licenses receipt dataset; attribution required",
                "attribution": "CORD v2, NAVER CLOVA; Park et al., CORD, NeurIPS Document Intelligence Workshop 2019.",
                "changes": "Hugging Face viewer JPEG rendition; original parquet bytes not downloaded; no local image edits",
                "sha256": digest(data), "group_id": f"cord-transaction-{transaction}",
                "image": image_info, "quality_notes": ["awaiting visual inspection"],
                "annotation_status": "upstream_annotations", "privacy_status": "local_only_pending_privacy_review",
                "external_processing_allowed": False,
            })
            labels.append(cord_label(receipt_id, gt))
        print(f"Collected and decoded {count} CORD {split} receipts", flush=True)
    return manifest, labels


def contact_sheets(manifest):
    out = ROOT / "evaluation/contact-sheets"
    out.mkdir(parents=True, exist_ok=True)
    for start in range(0, len(manifest), 4):
        sheet = Image.new("RGB", (1600, 2200), "#dddddd")
        draw = ImageDraw.Draw(sheet)
        for slot, record in enumerate(manifest[start:start + 4]):
            with Image.open(ROOT / record["file_path"]) as original:
                preview = ImageOps.contain(original.convert("RGB"), (780, 1030))
                x, y = (slot % 2) * 800 + 10, (slot // 2) * 1100 + 50
                sheet.paste(preview, (x, y))
                draw.text((x, y - 35), record["receipt_id"], fill="black")
        sheet.save(out / f"sheet-{start // 4 + 1:02}.jpg", quality=90)


def main():
    for folder in ["costco/physical", "costco/digital", "non_costco/physical", "non_costco/digital", "unclassified", "synthetic"]:
        (ROOT / folder).mkdir(parents=True, exist_ok=True)
    manifest, labels = collect_cord()
    # Hand-reviewed additions live separately so recollection never overwrites their labels.
    for name, target in [("manual-manifest.jsonl", manifest), ("manual-labels.jsonl", labels)]:
        path = ROOT / "annotations" / name
        if path.exists():
            target.extend(json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip())
    review_path = ROOT / "annotations/visual-review.json"
    reviews = json.loads(review_path.read_text(encoding="utf-8")) if review_path.exists() else {}
    for record in manifest:
        review = reviews.get(record["receipt_id"])
        if review:
            record["quality_notes"] = review["quality_notes"]
            record["visual_inspection"] = review["status"]
    for label in labels:
        review = reviews.get(label["receipt_id"])
        if review:
            label["verification"]["visual_review"] = review["status"]
            label["verification"]["notes"].extend(review.get("notes", []))
    # Merge exact image aliases even if annotations differ. A hash alone cannot
    # distinguish crops; those need the semantic transaction key/manual review.
    parents, owners = {}, {}
    def find(group):
        parents.setdefault(group, group)
        if parents[group] != group:
            parents[group] = find(parents[group])
        return parents[group]
    for record in manifest:
        group = find(record["group_id"])
        if record["sha256"] in owners:
            other = find(owners[record["sha256"]])
            parents[max(group, other)] = min(group, other)
        owners[record["sha256"]] = group
    for record in manifest:
        record["group_id"] = find(record["group_id"])
    groups = {}
    for record in manifest:
        groups.setdefault(record["group_id"], set()).add(record["split"])
    for record in manifest:
        if len(groups[record["group_id"]]) > 1:
            record["split"] = "excluded_cross_split_duplicate"
    jsonl(ROOT / "manifest.jsonl", manifest)
    jsonl(ROOT / "annotations/labels.jsonl", labels)
    contact_sheets(manifest)
    print(f"Manifest: {len(manifest)} records; images remain ignored by Git")


if __name__ == "__main__":
    main()
