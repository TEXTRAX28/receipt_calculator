# Enhanced local rereading of receipt areas

2 November 2026. Improvement branch following `e65d9f6`. The full production
upgrade goal remains active; this is an implemented recovery workflow with
measured benefits and a retained recognition failure.

## Implemented behavior

The item source dialog previously chose the computer reader whenever configured,
or basic Tesseract otherwise, even after the user selected Enhanced on-device.
Receipt-level source dialogs, including the VAT legend, offered no area reread.

`src/ReceiptAreaReader.tsx:L96` now supports the existing enhanced provider.
`src/App.tsx` passes the selected enhanced/basic reader to both item and
receipt-field source dialogs; existing computer and local fallback behavior
remains available for other primary readers. `src/ReceiptSource.tsx:L1` supplies
appropriate purchase/receipt wording. The code introduces no new model or
provider, and the worker/runtime, preprocessing, parser and money engine are
unchanged.

From a purchase's **View source**, choose **Reread this purchase**. From a
receipt-level source check, choose **Reread this area**. Adjust the existing crop
if necessary and choose **Read selected area**. The new text appears beside the
original source evidence for comparison. It does not replace the draft,
confirm checks, change the original highlight or initiate a cloud request.
Corrections remain explicit edits to the receipt.

Cancellation or closing the source dialog terminates the owned enhanced worker.
Missing assets show an error and preserve the existing draft. There is no silent
switch to a configured computer or basic reader after an enhanced reread fails.
Existing computer, basic and native-PDF area workflows remain covered.

## What the real receipt test found

One fresh full scan of the original two-photo UK receipt was followed by three
focused reads using the default source-area crops: VAT legend, chicken skewer
and baby plum tomatoes. These are deliberately selected known failures on one
familiar development transaction, not a blind or representative accuracy sample.
No crop was tuned after seeing its new OCR result and no read was retried.

| Source detail | Full scan | Focused reading |
| --- | --- | --- |
| VAT legend A = 20% | Correct | Correct |
| VAT legend Z = 0% | Z legend row not recognized | Complete correct row |
| Chicken skewer name | `CHICKEN SKEWER` | `CHICKEN SKEWER 15` |
| Chicken skewer tax code | `7` | Still `7`; source prints Z |
| Tomato tax code | `2` | Correctly reads Z |

The observed new text is checked against the unchanged UK-v2 reference and
the actual saved crop images, which were inspected. The tax-code comparison is
0/2 → 1/2 for these two selected items; the two legend definitions are 1/2 → 2/2.
This is a benefit of an optional focused view, not a measured increase in
whole-receipt automation. The tax crop includes a clipped neighboring total
heading that remains garbled; the new text is not treated as verified data.
The unresolved skewer code must be checked directly against the photo rather
than inferred from its coupon, other products, or a balancing total.

The stored draft is **identical before and after every reread**: eighteen
purchases, GBP 176.78, zero arithmetic discrepancy, all eighteen annotated
prices/quantities/discounts, fifteen exact names, but strict complete accuracy
0/1 and trusted reconciliation 0/1. Missing and misread VAT-code rates still
block confirmation. No financial edit or source-check confirmation occurred.
The original images, new exact model input JPEGs, raw SDK responses, crop
settings and UI screenshots remain local, ignored evidence.

## Actual testing and resources

The dedicated enhanced browser suite passes eight desktop/mobile Chromium
cases. It exercises real synthetic OCR, the 320px source flow through an exact
GBP 3.00/3.00 split, real focused rereading, missing assets, cancellation,
dialog closure, preserved draft/source values and a configured-computer case
that must still use the explicitly selected enhanced reader. Model replies are
not mocked. Only provider availability and failure conditions are simulated.

The full suites pass **912 unit tests and 197 browser tests**, with one existing
browser skip. Typecheck, formatting and production build pass; the existing
large-bundle warning remains. The separate private-receipt UI case also passes.

The separate original-receipt app test passes with external origins and HTTP
writes blocked. A passive Worker wrapper records original outgoing Blob bytes
and incoming SDK replies without replacing or modifying either. Four owned
enhanced workers initialize and close: one full-receipt worker plus three
area workers, processing five actual image sections in total.

Full scan-to-review is 9,218 ms in this run, excluding upload preparation and
browser/server startup. The three focused crop-and-read observations take
3,683 / 4,130 / 3,635 ms, including UI observation and worker initialization.
These are individual observations, not p95 estimates or controlled latency wins.
The owned Node/preview/browser process tree has a sampled peak of
1,826,287,616 bytes. Minimum observed system-available RAM is 2,832,080,896
bytes. Sampling can miss transient peaks and sum shared pages; GPU/unrelated
processes are excluded. Passive capture and development tools are included.
No physical phone, Safari or model-only memory claim is made.

The exact suite outputs, source/build bytes, prior evidence, private model
inputs, unchanged reference and protected Git state are bound by
`advanced-enhanced-area-v1.json`. Run its verifier without inference:

```powershell
python -X utf8 receipt_training/scripts/build_enhanced_area_report.py --check
```

The source parser, shared image pipeline, enhanced worker and financial modules
are byte-identical to the parent; the original-fifty paired comparison therefore
remains the previous measured result, not a claimed fresh cohort rerun.
Formatting initially flagged the private test; it was corrected before its run.
There were no failed model attempts in the private area comparison.

No credentials, external receipt uploads, model downloads, dependency changes,
paid activation, merge, push or deployment were needed. Area rereading is not
independent model agreement or calibrated confidence. Generic currency/quantity
recovery, better unresolved-code recognition, complete independent truth,
physical-device validation and public service controls remain open.
