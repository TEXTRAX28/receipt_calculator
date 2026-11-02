# PaddleOCR-VL spotting: measured profile, not an app replacement

The documented spotting profile reads text and predicted locations with the
installed PaddleOCR-VL 1.6 weights. Joining fragments on the same physical row
improves conditional price extraction over its older transcription profile.
Quantities, totals and decoding reliability remain insufficient for selecting it
as the app reader. No application source, default provider or cloud allowance
changes in this checkpoint.

## Protocol and compatibility

The official Apache-2.0 [model usage guide](https://huggingface.co/PaddlePaddle/PaddleOCR-VL-1.6-GGUF#usage-tips)
specifies `Spotting:` and a 1,605,632-pixel projector setting. A new copy of the
existing projector changes only two bytes inside that existing scalar metadata
field. Full comparison verifies that tensor bytes and both original weights stay
unchanged. The original and derived hashes are pinned separately. This remains
the VLM component, not PaddleX's full document-layout pipeline.

The pinned llama.cpp CLI hides special tokens by default. Its first synthetic
call therefore showed seven correct text lines without locations. An explicit
text-experiment-only `special_tokens` setting now passes `--special`; the second
call preserves each line's eight coordinate tokens. Native output, original
framing and both attempts stay available. Existing default CLI commands and
structured JSON decoding are unchanged.

On the seven-line synthetic image, all text matches exactly and the minimum
predicted-box/reference-box IoU is **0.7838**. The reference boxes come from
drawing that exact image. This is compatibility evidence, not genuine-receipt
region accuracy or a calibrated confidence score. The model exposes no OCR
confidence in this protocol; records retain null confidence.

## Frozen original-image pilot

Twelve new native calls cover the earlier seven-case pilot's exact nine prepared
panels, plus three previously inspected financial development cases' exact
current panels. There are ten transactions/controls, including the supplied UK
two-photo receipt, Bristol Costco, Taiwan inputs, Tesco and restaurants. Neither
OCR, labels, currency hints nor earlier answers enter inference. Each panel gets
one attempt with a 180-second deadline; there are no automatic retries.

All twelve native processes complete. Ten outputs satisfy the strict located-line
contract. One fiscal certificate emits a long numeric sequence without locations;
Bristol has unlocated/multiline footer text. Both entire readings are withheld
by this profile, with the raw output retained. This does not mean every copied
field was unreadable, or that every alternative decoder would fail.

Two deterministic representations are evaluated: literal generation order and
geometry-based row assembly. The latter uses the existing OCR baseline grouping
rule from `server/local_ocr_models.py:L27`, omitting confidence aggregation.
It knows no receipt labels, preserves duplicates and neither fills nor changes
numbers. The representation is declared before score inspection.

## Same-parser field results

The unchanged current parser/scorer and latest v5/v2 references evaluate both
spotting representations and the retained older Paddle transcription. Currency
is supplied after extraction only in the explicit branch. These are conditional
results, not automatic currency recognition. Reference revisions mean the
denominators differ from the historical 55-product report.

| Earlier six financial cases, explicit currency | Retained Paddle transcription | Spotting + row assembly |
|---|---:|---:|
| Matched priced rows /65 | 41 | 51 |
| Correct known line prices /63 | 41 | 50 |
| Correct purchased quantities /55 | 36 | 29 |
| Correct unit prices /27 | 18 | 18 |
| Correct item discounts /21 | 18 | 18 |
| Correct printed totals /6 | 2 | 1 |
| Trusted reconciliation /6 | 0 | 0 |

Without explicit currency, line prices are 18/63 versus 27/63. Generation-order
spotting alone matches only four products and no line prices on this cohort:
the spatial fragments must be assembled before this parser can interpret them.
The no-purchase control produces zero products without a processing error in all
three representations; repeated currency views are not independent controls.

On the three additional financial cases, row assembly matches all ten referenced
products and 10/10 prices with explicit currency, but returns **five extra rows**,
0/10 quantities, 0/1 unit prices and 2/3 totals. Automatic prices are 0/10.
Correct prices therefore do not establish complete financial interpretation.

Both retained and new readings use identical frozen current application modules.
The newer profile also changes maximum pixels, context/output budgets and
offloading settings, so this is not an isolated prompt ablation. The app's Qwen
hybrid original-fifty score belongs to a different cohort/preparation and is not
directly compared with these fractions. No new full-corpus accuracy is claimed.

## Resource and evidence scope

The twelve real-panel calls take **6.040–25.628 seconds**, averaging **10.266
seconds**, including fresh process/model loading and generation. Peak measured
CLI working set is **1,789,669,376 bytes**. GPU/whole-app memory, preprocessing,
setup and a persistent server's throughput are outside these measurements.
Historical transcription times are not a paired present-day speed comparison.
There are fourteen native calls including compatibility, no private uploads or
external model calls, and zero API cost; laptop electricity is unmeasured.

Twenty-five Python checks pass for transcript framing, exact JSON values,
location grammar, malformed/partial responses, polygon validity, unknown
confidence and row assembly. The original app remains at `4686b8e`; its prior
645 unit/175 browser passes with one skip are prior evidence, not fresh app tests.
The stable branch and original dirty checkout remain unchanged.

The [449-file packet](advanced-paddle-spotting-v2.json) binds requests, native
streams, copied harnesses, actual model/derived metadata, frozen modules loaded,
predictions, references, scoring and checks. Its verifier accepts only exact
expected archived bytes when a mutable producer path changes. Earlier checkpoint
commands that demand original root-source bytes may require that checkpoint.
One unverified report captured its own open stdout stream, and a subsequent
Python tuple/list comparison failed before JSON normalization; those local
attempts are retained. Revision 2 excludes the producer log and verifies all 54
unchanged score views in their complete JSON representation. No native call is
repeated for these reporting fixes.

The final global audit checks 14,259 unique declared paths. Exactly thirteen
previously disclosed legacy artifacts remain unresolved; this checkpoint adds
no new evidence gaps.

```powershell
python -X utf8 receipt_training/scripts/prepare_paddle_spotting.py --check
python -X utf8 receipt_training/scripts/build_paddle_spotting_report.py --check
```

The following fresh-cache procedure is documented but was not rerun here; all
measured calls use the existing verified local models. Use the existing research
Python with NumPy, Pillow and the reader package's non-GUI dependencies available.
The wheel is hash-checked before extraction, and no package is installed globally.

```powershell
python receipt_training/scripts/setup_vision_candidate.py --manifest receipt_training/evaluation/paddle-vl16-candidate-manifest.json
python -m pip download --no-deps --require-hashes -r receipt_training/scripts/requirements-spotting-tools.lock --dest receipt_training/.cache/paddle-spotting-tools
python -m zipfile -e receipt_training/.cache/paddle-spotting-tools/gguf-0.19.0-py3-none-any.whl receipt_training/.cache/paddle-spotting-tools
python receipt_training/scripts/prepare_paddle_spotting.py
```

The separate projector is reproducible from the original; it never overwrites
original weights. Existing plans/attempts are preserved. Local receipt data must
not be uploaded under this procedure.

Independent field recovery, automatic currency ambiguity, complete source truth
and public-release acceptance remain unfinished. The next step is a full
requirement-by-requirement audit of the original objective to select the remaining
implementation work. This profile stays out of the app unless new evidence
justifies an integration. The full goal remains active.
