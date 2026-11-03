# Broader orientation comparison: neither classifier supports automatic rotation

3 November 2026. Application parent: `a91397f`.

A second lightweight classifier passes the small pilot but fails the broader
receipt set, including confident mistakes on already upright photos. Keep
manual rotation and the original images. Do not add automatic rotation from
either classifier or tune a cutoff against these observed failures.

## Candidate and preprocessing verification

The new candidate is OnnxTR's `mobilenet_v3_small_page_orientation`, using the
FP32 weight selected by the pinned
[upstream configuration](https://github.com/felixdittrich92/OnnxTR/blob/0ec6e88555a99f35919f14f4c9d58625f02e8cc7/onnxtr/models/classification/models/mobilenet.py).
Its v0.6.0 release asset is 6,097,456 bytes, SHA256
`60606ce4e1796327717ba546ff23106208893a26c90a4c4bfcfebad0f2b1aa67`.
The project declares Apache-2.0 licensing. The initially inspected related
Hugging Face card points to an older weight; that older weight was not downloaded
or used. One public weight download preserves the existing 10 GiB disk reserve.
No provider key, dependency installation or receipt upload is involved.

This candidate fits the whole page into 512×512 with PIL bilinear resizing and
symmetric black padding, then uses its own mean/std normalization and NCHW
float32 layout. Paddle's earlier candidate instead uses a central 224-square
crop. Their required preprocessing is deliberately different.

Before inference, 27 input tensors match the pinned upstream `Resize` and
`Normalize` implementations exactly: seven generated shapes and twenty genuine
rotation views. The comparison executes only those two extracted classes with
an image-only `Sample` value; it does not install or verify the full OnnxTR
package. An initial preprocessing check fails before loading a model because
SciPy is absent. The retained second check compares the stable softmax formula
to scalar `math` within 1e-7 instead; no package is installed.

The angle mapping is frozen from the
[upstream classification tests](https://github.com/felixdittrich92/OnnxTR/blob/0ec6e88555a99f35919f14f4c9d58625f02e8cc7/tests/common/test_models_classification.py).
Those tests associate one counterclockwise `np.rot90` turn with class -90 and
three turns with class 90. The raw class modulo 360 therefore matches this
study's clockwise input angle. One softmax is applied to logits; its unrounded
maximum is a model score, not calibrated correctness.

## Small pilot and broader comparison

The first trial repeats the earlier five photos from four familiar transactions
at four exact quarter turns, plus four synthetic text views and blank/dark
controls. All 26 transformed RGB hashes match the earlier Paddle pilot.
OnnxTR gets 20/20 genuine views right versus Paddle's 15/20; its frozen 0.9
cutoff retains 19/20, all correct. This promising small result is not the final
selection evidence.

A separate protocol is then frozen for all original fifty transactions: 51
prepared frames, including two overlapping Tesco sections, each viewed at four
quarter turns. Five contact sheets are inspected before either cohort run;
their printed text is upright at the quarter-turn level. Minor tilt, faint text,
clipped content and vertical logos remain in the set. No frame is excluded by a
model result. These are familiar corpus images, not a blind holdout or 204
independent receipts. Three transactions overlap the small pilot.

Both models run sequentially on exactly the same 204 transformed frame pixels,
plus six identical controls each. No labels, cutoff, crop or model is adjusted
after seeing the cohort outputs. All 420 planned classifications complete.

| Orientation outcome | Paddle | OnnxTR |
| --- | ---: | ---: |
| All frame views correct | 188/204 | 191/204 |
| Other 47 transactions, excluding pilot overlap | 181/192 | 179/192 |
| Views retained at score ≥0.9 | 152/204 | 185/204 |
| Correct among retained views | 150/152 | 180/185 |
| Already upright frames correct | 47/51 | 47/51 |
| Confident wrong rotations of upright frames | 0 | 2 |

The new model's aggregate gain comes from the overlapping pilot cases; it does
worse on the other transactions. Five of its mistakes exceed 0.9, including
upright `cord-v2-train-016` and `cord-v2-validation-007`. Paddle also makes two
errors above 0.9 on rotated views. Neither passes the predeclared safety rule.
All four synthetic text controls are correct for each model; blank/dark controls
have no orientation truth and remain outside accuracy denominators.

An explicitly post-result agreement diagnostic finds 145/204 views where both
scores exceed 0.9 and their angles agree; all 145 are correct here. This is an
exploratory candidate requiring separately frozen new-data validation, not an
accepted policy or proof of zero risk. It does not justify app integration.

## Resources, retained evidence and decision

CPU ONNX Runtime 1.31.1 runs with one thread in the existing environment. Across
each cohort's 210 calls, mean preprocessing/inference times are 1.26/5.87 ms for
Paddle and 19.71/12.89 ms for OnnxTR. Initialization takes 81.03/42.11 ms; owned
runs take 7.28/12.30 seconds. Sequential single-run desktop timing does not prove
phone latency. Sampled owned process-tree peaks are 147,902,464 and 168,382,464
bytes, excluding the controller, browser, GPU and unrelated apps; 250 ms sampling
can miss brief peaks. Both preserve the 2.5 GiB startup, 1 GiB runtime and
60-second small-trial guards. Larger-model guards remain unchanged.

The new small pilot adds 26 classifications, bringing this checkpoint to 446
new orientation calls, zero receipt OCR calls and zero private uploads. Network
access is disabled inside the inference workers. All nine observed process
identities exit. The failed preprocessing check, plans, raw scores/logits,
per-call timings, image/tensor hashes, resource observations and losing results
remain retained. Nothing is retried, automatically corrected or promoted.

`onnxtr-orientation-comparison-v1.json` binds the evidence. Verify hashes and
reproduce summaries without inference or network access:

```powershell
python -X utf8 receipt_training/scripts/build_onnxtr_orientation_report.py --check
```

Application source, financial references, reader defaults and previous
original-fifty OCR scores remain unchanged. The current 1,104-unit pass and
build belong to `a91397f`; they are not rerun as new validation of this research
checkpoint. Syntax, graph, evidence and Git protection checks pass. Stable and
original checkouts remain protected, with no push, merge or deployment.
The full twelve-phase goal remains active. Automatic orientation still needs
stronger independent evidence and an actual OCR/review-flow comparison.
