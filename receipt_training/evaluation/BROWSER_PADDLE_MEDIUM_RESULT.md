# Browser medium reader: bounded trial did not finish

3 November 2026. **Keep the current browser reader.** Tiny delivered all eight
planned image results in a 23.672-second guarded run. Medium delivered seven,
then the unchanged 300-second deadline stopped its owned process tree. Its
sampled available RAM remained above the runtime floor. This is a latency and
completion failure on this host, not an out-of-memory result.

Medium correctly read the selected chicken-skewer fragment as `9.49 Z`; tiny
read `9.49 7`. That useful local observation does not establish a complete
receipt or outweigh the unfinished whole-receipt run. No model is promoted,
and no partial result is presented as a successful paired financial benchmark.

The previously pending synthetic source-review phone journey also passed.
Application code, dependencies, test code and financial reference values are
unchanged from `1df78e7680006c8ccd95e969a937fec302eed964`.

## Frozen comparison and actual coverage

The existing `browser-paddle-medium-paired-plan-v14/study-plan.json` was frozen
before either run. The controller checked its input hashes before launch.
Tiny and medium ran sequentially with the same official SDK 0.4.2, ORT 1.31.1,
WASM backend, one thread, batch sizes of one and maximum detection side 960.
Cached model archives were reused; no downloads occurred. Archive sizes are
6,318,080 bytes for tiny and 138,762,240 for medium, excluding SDK/runtime files.

Each arm had one synthetic compatibility gate and eight planned genuine image
reads, one attempt per image. Both gates returned the six expected text lines.
Neither recognizer received references, previous OCR, currency or calculated
totals. The images were three existing selected Costco crops, three complete
CORD photographs and the user's two overlapping UK Costco photographs.
The whole photographs represent four familiar development transactions; the
three crops are not additional transactions or a holdout. Original-fifty
evaluation images, labels, scores and reader outputs remain unchanged.

| Image section | Tiny warm read | Medium warm read |
|---|---:|---:|
| Selected VAT legend | 0.543 s | 10.840 s |
| Selected chicken skewer | 0.940 s | 16.610 s |
| Selected tomatoes | 0.542 s | 11.889 s |
| CORD train-000 | 2.525 s | 63.176 s |
| CORD train-005 | 1.037 s | 18.858 s |
| CORD train-001 | 0.942 s | 23.989 s |
| UK Costco photo 1 | 3.651 s | 89.764 s |
| UK Costco photo 2 / VAT footer | 2.349 s | No result before deadline |

These times cover image decode/prediction after initialization and the
synthetic gate. SDK import/initialization took 7.357 seconds for tiny and 6.283
seconds for medium; cache/order effects make this one observation unsuitable
for initialization-speed claims. Whole guarded runs include browser setup,
initialization, inference and shutdown. They took 23.672 and 300.776 seconds.
There is no representative p95, isolated time for the interrupted footer,
model-only memory measurement or physical-phone timing.

Fifteen genuine image results and two synthetic results are retained. Medium's
final footer has no saved result and its complete transaction result was not
written. The runner records individual completions but not individual starts;
the absent footer's exact start/time must not be invented. No section is retried.
The prepared all-input adapter/replay/scorer was not run because the medium arm
did not deliver every frozen input. Restaurant readings and the partial Costco
reading remain available locally, unedited and unscored in this checkpoint.

## Resources, network evidence and cleanup

The unchanged startup guard is 3,885,219,840 available bytes for both arms;
the runtime floor is 1,073,741,824 bytes. Startup availability was
4,184,010,752 / 4,372,099,072 bytes, tiny / medium. Minimum sampled availability
was 2,169,004,032 / 1,819,095,040 bytes. No memory guard was weakened.

Sampled owned process-tree working-set peaks were 2,243,768,320 / 2,847,604,736
bytes, approximately 2.09 / 2.65 GiB. This includes Node, browser and native
children, excludes the sibling observer, GPU and unrelated applications, and
uses 250 ms sampling that can miss brief peaks. Exact PID/creation-time checks
found no surviving identities among the twelve tiny and thirteen medium
observed processes. No user application was closed.

The isolated server disables environment-file loading, uses an allowlisted
subprocess environment and serves cached weights locally. The browser route
blocks external origins and requests other than GET/HEAD throughout. Tiny's
complete ledger and both synthetic-gate ledgers contain no external or write
requests. **Medium's final request/error ledger was not emitted on termination**;
an empty synthetic ledger must not be substituted for a complete-run ledger.
No external receipt-upload path, secret access, API request, quota probe or
billing activation was enabled. API cost is zero; local compute cost is not
priced. The user's exhausted API quota remains unchanged.

## Phone source review now verified

The preserved v4 phone plan ran once against the isolated production frontend
build, using synthetic intercepted local OCR/vision responses. It passed:

- The source-supported price proposal is `17500`; its previous invalid model
  value `17.500` and actual source link remain attached.
- The disagreeing name remains visible, unit price stays blank, and all initial
  checks are pending. Receipt confirmation is disabled.
- The source dialog shows one highlighted region, the recognized source line
  and the previous invalid price. Neither 320 px nor 390 px overflows horizontally.
- Explicit price confirmation checks only that field; other checks still block
  receipt confirmation. There are two intercepted local POSTs, zero external
  requests and no page errors.

One test passed with no skips, failures or retries. Playwright duration was
10.163 seconds; the guarded process lifetime was 11.292 seconds. The sampled
owned tree peaked at 1,062,514,688 bytes and all eighteen observed identities
exited. The retained 390 CSS-pixel screenshot was visually inspected; its
source, wrapping and disagreement are readable. The modal scrolls to lower
fields. The 320-pixel result is an automated layout assertion, not a second
retained screenshot. This verifies review behavior with synthetic responses,
not recognition accuracy, a real handset or Safari.

Graph navigation and source inspection locate this test in
`tests/e2e/copied-price-review.spec.ts:L1`, its state helper at `L112`, and the
exclusive artifact helper in `tests/e2e/qa-artifacts.ts:L9`. The graph links the
test to the model, synthetic fixture and artifact helper. Test source is
unchanged; the earlier 1,095-unit pass and frontend build are retained evidence,
not newly rerun suites.

## Evidence and remaining work

`browser-paddle-medium-result-v1.json` binds the frozen plans, model/input hashes,
runner snapshots, all completed and partial outputs, controllers, sampled
resources, exact process-exit checks, phone build/test/screenshot and protected
Git invariants. Receipt pixels and raw outputs remain in ignored local artifacts.
Verify the exact bytes without inference:

```powershell
python -X utf8 receipt_training/scripts/build_browser_paddle_medium_result.py --check
```

Stable remains `ee725ba45e799bee8501d3de034e0302c0127afd`. The original checkout
remains at `29a187af7347be94c0728f4785be674500833748`, with its same three dirty
files and binary-diff hash. Work stays on `feature/advanced-ocr-vision-ai`;
there is no push, merge or deployment. Earlier preparation/refusal reports are
historical and remain intact. This new result closes the pending phone check
and establishes that this medium browser configuration misses the bounded
trial's completion requirement. It does not complete the full goal or resolve
the larger local VLM, capture calibration, complete financial truth, real-device
and public-release gaps.
