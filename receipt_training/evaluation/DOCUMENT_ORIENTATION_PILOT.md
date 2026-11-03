# Local document-orientation pilot: reject automatic rotation

3 November 2026. Parent application commit: `8ec8209`.

The small orientation classifier correctly identifies 15/20 transformed receipt
views. Five predictions are wrong, including one with a score of 0.9101. A
predeclared 0.9 cutoff retains 15 views, of which 14 are correct. **Do not add
automatic rotation or promote this model into the app from these results.**
The original images, manual rotation, OCR providers and application defaults are
unchanged. This is a new local model experiment, not an OCR accuracy improvement.

## Candidate and protocol

The official [PaddlePaddle ONNX model card](https://huggingface.co/PaddlePaddle/PP-LCNet_x1_0_doc_ori_onnx)
describes `PP-LCNet_x1_0_doc_ori` as a four-class document-orientation model with
Apache-2.0 licensing. The [upstream module documentation](https://github.com/PaddlePaddle/PaddleOCR/blob/main/docs/version3.x/module_usage/doc_img_orientation_classification.en.md)
describes labels 0, 90, 180 and 270. Its vendor benchmark is not evidence of
accuracy on these receipts or this laptop.

The public model was downloaded once, pinned to revision
`7330ab7039123e46af2dc03154b9969aa412c61d`. The ONNX file is 6,788,069 bytes,
SHA256 `af9a0a4f317ff0709ce752067807f819cb15d883f8ecad89f28df1c6ee2d9c92`.
The weight, config and card total 6,790,605 bytes. They remain in the ignored
research cache; no model was added to the application bundle.

Before inference, the plan bound the model, upstream preprocessing source,
runner, source images and font by hash. Inputs are five already prepared,
visually upright photos from **four familiar development transactions**: three
CORD restaurant receipts and both original UK Costco photos. Each is tested at
0, 90, 180 and 270 degrees clockwise using exact pixel permutations. These are
20 related views, not 20 independent receipts or a held-out test set. A synthetic
text receipt contributes four separate rotation controls; white and black
images contribute two controls with no correct orientation label.

Preprocessing follows the pinned configuration: RGB, linear resize of the short
edge to 256, central 224-square crop, channel normalization and CHW float32.
The model returns four probabilities; no second softmax is applied. Upstream
PaddleX applies the predicted angle as a counterclockwise correction. Thus a
90-degree clockwise input has expected label 90. Labels come from the exact
transform and are never provided to the model.

Inference used the existing ONNX Runtime 1.31.1 CPU environment, one thread,
NumPy 2.3.5 and Pillow 13.0.0. No dependency installation, API key, external receipt
upload or billing activation was involved. The worker blocks Python network
access, disables runtime telemetry and receives a restricted environment. All
26 planned calls completed once; there were no retries or OCR calls.

## Results

| Source photo            | Correct orientation | Errors                                                                        |
| ----------------------- | ------------------: | ----------------------------------------------------------------------------- |
| CORD train-000          |                 0/4 | All four views; the upside-down view is wrongly labelled 90 with score 0.9101 |
| CORD train-005          |                 3/4 | 270-degree view is wrongly labelled 90, score 0.5046                          |
| CORD train-001          |                 4/4 | None in this pilot                                                            |
| UK Costco photo 1       |                 4/4 | None in this pilot                                                            |
| UK Costco photo 2       |                 4/4 | None in this pilot                                                            |
| **Genuine-photo views** |           **15/20** | **Five errors**                                                               |

All four synthetic text views are correct. The blank and black controls produce
maximum scores of 0.2557 and 0.2575, respectively. They are excluded from the
accuracy denominator. The frozen 0.9 cutoff would cover 15/20 genuine views,
but one retained prediction is still wrong. No cutoff was tuned afterward.
Scores are not calibrated correctness probabilities.

The faint CORD train-000 image was inspected again after the result; its printed
text is upright. Its labels were not changed to agree with the model. A possible
effect of the faint text and strong background pattern is a hypothesis, not a
verified explanation. Cropping or multiple-region voting was not tested here.

Initialization took 108.34 ms. Across all 26 calls, mean preprocessing took
1.26 ms and mean inference 5.11 ms, with a maximum inference of 9.36 ms. The
owned run took 3.51 seconds including imports and image handling. These are
single-run desktop measurements, not end-to-end receipt or phone latency.
Peak sampled process-tree working set was 150,560,768 bytes; 250 ms sampling
can miss brief peaks and excludes the controller and unrelated processes.
Available RAM started at 2,968,023,040 bytes and stayed above 2,869,719,040 bytes.
The separate small-trial guards were 2.5 GiB at startup, 1 GiB at runtime and
60 seconds. The existing larger-model guards were not lowered. All observed
owned process identities exited; no user applications were closed.

## Decision and reproduction

Do not run the larger OCR follow-up or add orientation suggestions from this
pilot: confidently incorrect rotation could make a readable receipt worse.
If this candidate is revisited, first freeze a separate crop/region comparison
with upright controls, all failure cases retained and actual OCR field scores.
Its results must remain separate from the original-fifty benchmark.

`document-orientation-pilot-v1.json` binds the preregistered plan, model metadata,
runner, raw observations, controller logs, memory observations and this report.
Receipt pixels and model binaries remain local and ignored. Verify the packet
and reproduce its summary without any inference or network request:

```powershell
python -X utf8 receipt_training/scripts/build_document_orientation_report.py --check
```

The runner is `receipt_training/scripts/benchmark_document_orientation.py`;
the exact guarded command and inputs are retained in the ignored pilot folder.
Existing results are never overwritten. No application source changed, so the
previous 1,064 unit tests and nine browser scenarios were not rerun or counted
as new validation. The stable branch and original checkout remain protected.
The broader twelve-phase goal remains active, including the exhausted cloud
quota, larger-model resource constraints and public-release requirements.
