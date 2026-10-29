# Receipt development and evaluation pilot

Prepared 29 October 2026 on `codex/receipt-dataset-evaluation`. Start with the
existing pretrained scanner and fix measured extraction/parsing failures before
considering fine-tuning. This folder's name does not imply a training dataset.

The pilot contains **50 distinct financial receipts**: five Costco paper
receipts and 45 other paper receipts. There are no verified digital receipts.
One additional Costco photo-order acknowledgement is an excluded control.
The original `costco/costco-receipt-1.webp` remains byte-for-byte intact; its
classified working copy is the same transaction, not another example.

Read [evaluation/REPORT.md](evaluation/REPORT.md) for actual results, limitations
and priorities, [SOURCES.md](SOURCES.md) for image rights and collection gaps,
and [annotations/ORIGINAL_RECEIPT.md](annotations/ORIGINAL_RECEIPT.md) for the
Bristol receipt inspection. `manifest.jsonl` records source, origin, rights,
SHA256, transaction group, split and review status for every downloaded file.

## Layout and privacy

| Folder | Purpose |
|---|---|
| `costco/physical/` | Photos/scans of printed Costco receipts, plus the labelled excluded control |
| `costco/digital/` | Genuine electronic Costco receipts; currently empty |
| `non_costco/physical/cord/` | 44 CORD viewer JPEG renditions |
| `non_costco/physical/tesco/` | One historical UK Tesco paper-receipt scan |
| `non_costco/digital/` | Genuine electronic receipts from other merchants; currently empty |
| `unclassified/` | Unknown retailer/origin; currently empty |
| `synthetic/` | Generated examples only; currently empty and never counted as real |
| `annotations/` | Schema, evidence labels, visual notes and verification status |
| `annotations/raw/` | Original upstream labels; ignored by Git |
| `evaluation/` | Frozen scoring rules, public aggregate results and error analysis |
| `evaluation/runs/` | Private raw OCR, draft predictions and saved scanner sources; ignored |
| `evaluation/contact-sheets/` | Private visual-inspection aids; ignored and not additional receipts |
| `scripts/` | Collection, validation, actual browser OCR, scoring and arithmetic checks |

All receipt images, private originals, raw labels and OCR outputs are ignored by
Git. Working images have **not** received a new privacy clearance: visible
membership/payment details remain in some sources. They are restricted to local
processing. No third-party receipt API was used. Before sharing any working
image or sending it to a provider, redact customer names/addresses, membership
and payment identifiers, barcodes/QR codes that encode them, and image metadata;
then verify the redaction against the image. Keep its original private and
preserve its transaction group. A copyright licence does not itself clear those
customer fields. The labels deliberately omit customer/payment identifiers.

## Reproduce the preparation

Commands below are PowerShell, from the populated project checkout. Node 24,
the project's existing npm dependencies and Chrome were available during this
run. Python 3.13 was used; its new dependencies are isolated under `.cache/`.

```powershell
Set-Location -LiteralPath 'C:\Users\natan\VSC Code\costco_calc'
python -m venv receipt_training/.cache/venv
$receiptPython = Join-Path $PWD 'receipt_training/.cache/venv/Scripts/python.exe'
& $receiptPython -m pip install -r receipt_training/scripts/requirements.txt
& $receiptPython -X utf8 receipt_training/scripts/collect_additions.py
& $receiptPython -X utf8 receipt_training/scripts/record_review.py
& $receiptPython -X utf8 receipt_training/scripts/collect.py
& $receiptPython -X utf8 receipt_training/scripts/validate.py
& $receiptPython -X utf8 receipt_training/scripts/test_evaluation.py
& $receiptPython -X utf8 receipt_training/scripts/monetary_audit.py
```

The additions script requires the preserved original at its established path.
It leaves reviewed annotations intact and records failed downloads separately
in `.cache/addition-download-failures.json`. Failed files never count as
collected. On a source rate limit it tries Wikimedia's recommended standard
thumbnail rendition. CORD is pinned to revision
`7f0115a4b758a71d6473b8d085751692da2fef98`. The collection uses the first 24 train,
eight validation and 12 test rows, a disclosed convenience sample. It checks
image decoding and records the actual rendition's checksum.

`record_review.py` replays observations made in this session; it is not a new
visual inspection of later replacement images. Reinspect and update those
observations if source bytes change. `validate.py` works offline after collection.

## Reproduce extraction and scoring

The completed runs are `baseline-development` and `baseline-evaluation`. Their
private source snapshots are retained locally. To rescore those outputs:

```powershell
& $receiptPython -X utf8 receipt_training/scripts/score.py baseline-development baseline-evaluation
```

To create fresh runs using the exact saved baseline source:

```powershell
$receiptRunTag = Get-Date -Format 'yyyyMMdd-HHmmss'
$receiptDevRun = "repeat-development-$receiptRunTag"
$receiptEvalRun = "repeat-evaluation-$receiptRunTag"
node receipt_training/scripts/evaluate.mjs --split development --run $receiptDevRun --source-run baseline-development
node receipt_training/scripts/evaluate.mjs --split evaluation --run $receiptEvalRun --source-run $receiptDevRun
& $receiptPython -X utf8 receipt_training/scripts/score.py $receiptDevRun $receiptEvalRun
```

Omit `--source-run` on the development command to benchmark the current scanner
instead. A fresh checkout needs the project dependencies (`npm ci`), receipt
files and, for exact historical reproduction, the private source snapshot from
this working copy. The runner prepares local OCR assets, serves a blank local
test page on port 5268 and invokes the existing browser modules. It blocks
non-loopback receipt traffic, saves raw outputs locally and measures real
per-receipt latency. No ground-truth labels are read by the extraction runner.
The scorer rejects altered prediction/source bytes and mixed scanner versions.
Do not overwrite a recorded run name; choose a new one.

The held-out set has now been measured once. These receipts were not used to
change the scanner. Further tuning prompted by these results needs a fresh
untouched evaluation group. The Bristol receipt is permanently development
data. Keep photos, crops, enhancements, pages and digital copies of the same
transaction in one group; respect upstream splits.

## Annotation contract

`annotations/schema.json` is JSON Schema 2020-12. Every field stores `raw`,
normalised `value`, and `review_required`; missing/unreadable/ambiguous values
are null. Money is stored as decimal strings and compared in exact integer
minor units. Purchased quantity, pack contents, unit prices, line totals,
discount associations, subtotal, tax, fees, rounding, payments and raw codes are
separate. A payment amount is never a purchase total.

44 records retain CORD's upstream semantic annotations. Six have partial
assistant visual transcriptions checked against source images, explicitly
marked model-generated with no independent human verification. The control has
no financial transcription. No OCR baseline predictions became labels. Currency
for CORD comes from dataset context; the UK/Taiwan currencies are country
inferences, disclosed separately from printed currency codes. Empty item lists
on untranscribed/aggregate-only certificates do not mean zero purchases: those
records are excluded from item metrics.
