# Paired browser OCR trial: prepared, not run

2 November 2026. This is a preparation checkpoint, **not a new accuracy result**.
The larger PP-OCRv6 medium model and the current tiny model are already cached.
The requested local 8B trial remains separate; its disk and RAM guards are
unchanged and no 8B files were downloaded.

## Current resume checkpoint

The current plan is **`browser-paddle-medium-paired-plan-v2`**, frozen at
`a4071332ccd6897644d084fc70efffda0d038a6f`. Version 1 remains retained below as
historical preparation. The newer plan includes the corrected process observer,
current parser and summary-fragment changes. Models, eight image inputs,
parameters, references, scoring rules, call limits and resource guards are
byte-identical or structurally identical to version 1, as applicable.

The controller now verifies every frozen input hash before process launch.
Three local protocol tests confirm rejection of changed inputs and invalid
version/path arguments, and retention of the original memory guard. JavaScript
syntax/formatting, graph and diff checks pass. These are test-harness changes;
the application's source, dependencies and tests remain unchanged from the
preceding 940-unit / 223-browser-pass checkpoint (one existing browser skip).

The actual version-2 startup check refused at **3,849,785,344 bytes available**,
below 3,885,219,840 required. It created no Node/browser process and consumed
zero synthetic or receipt image attempts. After the protocol tests ended, a
read-only observation still found only 3,773,931,520 bytes available. No new OCR,
model download or private external upload occurred. The paired recognizer,
parser replay and scoring paths remain unexecuted; no accuracy gain is claimed.
Evidence: `advanced-browser-paddle-medium-resume-v2.json`.

When the existing resource guard permits, use new unused output names:

```powershell
python -X utf8 receipt_training/scripts/guard_browser_paddle_probe.py browser-paddle-paired-tiny-v3 browser-paddle-tiny-plan-v1 --medium-study browser-paddle-medium-paired-plan-v2
```

Only after checking that arm's actual success, all eight expected image results,
network/write logs and resource record, run the medium arm with the same plan:

```powershell
python -X utf8 receipt_training/scripts/guard_browser_paddle_probe.py browser-paddle-paired-medium-v1 browser-paddle-medium-plan-v1 --medium-study browser-paddle-medium-paired-plan-v2
```

Adapt both successful results into separate unused directories, then pass the
explicit version-2 plan as the replay's fourth positional argument:

```powershell
node receipt_training/scripts/replay_browser_paddle_medium_study.mjs NEW_REPLAY_TAG TINY_ADAPTED_TAG MEDIUM_ADAPTED_TAG browser-paddle-medium-paired-plan-v2
python -X utf8 receipt_training/scripts/score_browser_paddle_medium_study.py NEW_REPLAY_TAG
```

Do not rerun a started image attempt or replace a failed/partial result. A later
source change requires another preserved plan version before inference.

## Original preparation: fixed comparison

`qa-artifacts/browser-paddle-medium-paired-plan-v1/study-plan.json` was recorded
before any new inference. It freezes the existing JPEG bytes, model archives,
SDK/runtime, parser, scoring code and reference hashes. Both arms use the
official browser SDK 0.4.2, ORT 1.31.1, one WASM thread, batch size one and the
same maximum detection side of 960 pixels.

Each arm permits one synthetic compatibility check followed by eight image
reads, with no retries:

- Three existing UK source-area crops: VAT legend, chicken skewer and tomatoes.
- Five complete-image panels covering four familiar development transactions:
  three CORD receipts and the user's two overlapping UK Costco photographs.

The original fifty remain separate and unchanged. The three crops were selected
for known tiny-reader failures; they are not independent receipts or a holdout.
Neither recognizer receives labels, earlier OCR or supplied currency. Financial
scoring separates automatic currency from explicitly supplied currency context.
Both arms use the same frozen parser, with no financial edits or confirmed checks.

The medium archives total 138,762,240 bytes; tiny totals 6,318,080 bytes. These are
model archive sizes, not complete browser downloads or RAM requirements. The
existing archives are reused directly; no new weight archive is written and the
model preparation tool's separate disk reserve is not weakened.

## Why it did not start

The new study retains a **3,885,219,840-byte startup RAM guard**: the previous
sampled medium browser-process-tree peak of 2,811,478,016 bytes plus a 1 GiB
reserve. Both arms use that same conservative threshold. It is an experimental
guard, not a vendor requirement or assurance of peak fit. Runtime protection
retains a 1 GiB available-RAM floor, a 300-second deadline and bounded logs.
Only processes owned by the trial may be stopped.

At the first guarded start, available RAM had fallen to **2,724,827,136 bytes**.
The controller refused before spawning Node, opening a browser or reading an
image through either model. Later read-only observations of 3,109,249,024 and
3,177,984,000 bytes also remained below the threshold and did not start another
controller. The failed-start record and its exact source snapshots are retained
under `qa-artifacts/browser-paddle-paired-tiny-v1-control/`.

No new tiny or medium receipt inference, model download, private external
upload, paid activation or automatic financial correction occurred. There is
no new medium receipt-accuracy, latency or resource result to compare.

## Checks actually completed

The extended geometry adapter reproduces all five retained tiny receipt panels
across four transactions exactly. It also converts the actual previously saved
medium synthetic result into the same six printed text lines while preserving
the medium engine identity. This verifies adaptation, not private-receipt
recognition by the larger model.

JavaScript syntax, Python syntax and selected JavaScript formatting checks pass.
The frozen study includes a paired parser replay and scorer, but those new paths
have not run because the paired OCR inputs do not yet exist. The application's
source, dependencies and tests remain byte-identical to the parent checkpoint;
the preceding 912 unit passes and 197 browser passes plus one existing skip are
historical evidence, not a newly rerun suite.

## Historical version-1 resume instructions

These commands describe the original checkpoint. Use the version-2 instructions
above with the current source; the controller now rejects stale input hashes.

First verify that current comparison scripts still match their hashes in the
frozen plan. If they changed, preserve this plan and create a new version before
any image inference. Existing cached files must still match their pinned hashes.
The first controller consumed **zero** image attempts.

```powershell
python -X utf8 receipt_training/scripts/guard_browser_paddle_probe.py browser-paddle-paired-tiny-v2 browser-paddle-tiny-plan-v1 --medium-study browser-paddle-medium-paired-plan-v1
```

Only after a successful tiny run and renewed guard eligibility:

```powershell
python -X utf8 receipt_training/scripts/guard_browser_paddle_probe.py browser-paddle-paired-medium-v1 browser-paddle-medium-plan-v1 --medium-study browser-paddle-medium-paired-plan-v1
```

Each successful arm must have its synthetic gate, all eight expected image
results, empty external/write request lists and no resource interruption checked
before adaptation, paired replay and scoring. Partial or failed runs stay
retained and must not be silently retried or scored as successes.

The full twelve-phase goal remains active. This checkpoint does not promote a
model, change the app's reader defaults or establish public/mobile readiness.
