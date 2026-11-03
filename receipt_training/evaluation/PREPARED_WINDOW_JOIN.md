# Long-photo section overlap repair

3 November 2026. Improvement branch: `feature/advanced-ocr-vision-ai`.
Parent checkpoint: `7f024da`. The full twelve-phase goal remains active.

## Result and scope

The enhanced on-device reader now uses the known positions of sections prepared
from one photograph to avoid counting an overlapping purchase twice. On the
same saved Costco readings, both corrected variants move from 27 proposed
purchases and GBP279.87 to 18 purchases and GBP176.78. The two real rotisserie
chicken purchases remain separate. No receipt amount is rewritten to make a
total balance.

This is an interpretation repair around the existing pinned PaddleOCR.js 0.4.2
and PP-OCRv6 tiny reader. It does not replace the model or enable automatic
cropping. The basic reader and provider defaults are unchanged. No cloud
requests, model downloads, quota increases or billing activation occurred.

## How evidence is joined

`joinWindowRows` (`src/lib/window-overlap.ts:25`) maps detected rows through the
preparation windows into coordinates of the same original photograph. It
requires unique one-to-one physical matches, ordered exact text anchors from
at least three distinct rows, and a complete join: every discarded row must
have a counterpart on the retained side. A cut nearest the centre of the
overlap preserves two complete source sequences. Missing or ambiguous coverage
keeps the rows; invalid metadata falls back to existing assembly.

`assembleRecognition` (`src/lib/receipt-layout.ts:142`) keeps the actual alternate
text and source rectangles. Differing literal readings generate conflicts;
the existing device review requires source checks even when the selected price
balances. No matcher chooses values using the expected answer or receipt total.
Cross-photo footer matching remains separate and now abstains if either matched
purchase has a disputed observation in its prepared sections. A matching chosen
price cannot hide that alternate reading by removing the smaller photo's rows.
Two regression cases fail against the earlier assembly and pass with this
guard, covering a conflict in either the larger or smaller photograph. The
same retained-reading scores are unchanged by this additional guard.

The enhanced provider passes its existing preparation-window metadata into
assembly (`src/lib/paddle-browser.ts`). Its worker, model, image preparation and
raw detections are unchanged. Eleven focused tests cover genuine repeated items,
split/omitted rows, ambiguous geometry, separate photographs, price/sign/tax-code
disagreement and a balancing-but-conflicting price that must remain blocked.

## Paired retained-reading results

`qa-artifacts/prepared-window-join-plan-v1` records the proposed algorithm before
the change. Replayv3 freezes both app source versions and uses identical saved
SDK observations for 50 original cases and twelve preparation variants. Those
variants are three familiar CORD transactions plus the supplied UK transaction;
they are not twelve independent receipts or a held-out accuracy sample. There
are 124 scored views per arm, with automatic and supplied currency kept separate.
Reference annotations and scoring code are unchanged.

| UK image preparation | Proposed purchases before → after | Calculated GBP before → after | Exact names before → after |
| --- | ---: | ---: | ---: |
| Original | 18 → 18 | 176.78 → 176.78 | 15/18 → 15/18 |
| Suggested crop | 27 → 18 | 279.87 → 176.78 | 15/18 → 15/18 |
| Manual straightening | 27 → 18 | 279.87 → 176.78 | 14/18 → 13/18 |

All eighteen known prices and quantities remain correct in each UK variant;
the previous nine unmatched additions disappear. The straightened version
has a real name regression: the chosen source reads `PARMAREGGIO 3OM` rather
than `PARMAREGGIO 30M`. Both observations remain attached and the conflict is
pending review. This loss appears in both currency views of the same variant;
it is one underlying field regression, not two different receipts. No other
scored per-case regression was found.

All original-fifty counts are unchanged: with supplied currency, 107/145 labeled
items match, 72/145 descriptions, 103/143 prices and 11/120 quantities are correct,
and 25/49 printed final totals are correct. Automatic-currency prices remain
19/143 and final totals 2/49. All fifty remain unscorable for strict complete
receipt accuracy; trusted reconciliation remains 0/49. These limitations are
not solved by the overlap repair. All CORD preparation field counts are also
unchanged.

## Actual app verification

The opt-in UK browser journey now supports cropping both original photographs
through the real edge-suggestion and crop controls. The production app reads
four prepared sections locally. At a 320px viewport it produces eighteen
purchases, GBP176.78 and zero arithmetic discrepancy in 13.197 seconds from scan
click to review. This is one familiar development transaction on desktop Chrome
with phone emulation, not physical-handset latency or a p95 estimate.

All fourteen review checks remain pending and confirmation is disabled. Both
actual source sections for purchase 12 are visible and switchable. The original
images remain available, both chicken purchases survive, and the final cloth
coupon remains GBP1.50. There are no external requests, HTTP writes, page errors
or horizontal overflow. Both edge workers and the OCR worker close.

The first two browser attempts exposed test-harness assumptions: exact spacing
in product names, then counting only the OCR worker despite two edge workers.
The app was unchanged between these runs. Their failure logs and screenshots
are retained. Subsequent receipt runs also preserve the raw SDK replies and
exact image bytes before later assertions; the first failed run did not retain
its raw replies. Sixteen local receipt-section reads occurred across four
receipt attempts, including the final conflict-guard build. They are repeated
reads of the same familiar transaction, not independent accuracy observations.

The first build failed TypeScript checking because a pair array lacked a tuple
annotation. Adding that type annotation changed no runtime behavior. All three
build attempts and replay versions are retained; the second and final builds
and typechecks pass. The full unit suite passes 1,064 tests with no failures.

All nine selected Chrome phone browser scenarios pass across the final three
runs: the actual UK scan, five enhanced-reader cases, and three correction cases.
The correction test initially dragged an off-screen corner at 320px and closed
the dialog; scrolling the actual handle into view fixes the test. Its real
OCR-to-source-review-to-exact-split journey then passes. This is a test-only
change; production geometry code is unchanged. The failed run is retained,
and no automatic test retries are enabled.

The successful app run uses the same four prepared image hashes as the paired
replay. All runs keep the 2.5GiB startup and 1GiB runtime RAM guards. Observed
test-tree memory peaks range from 1.45 to 1.72GiB; these are sampled whole test
process trees, not model-only requirements. All 166 observed process identities
have exited, with no inspection errors or user applications closed.

## Limits and reproduction

The full goal remains open. No claim of complete receipt correctness, universal
provider superiority or public-release readiness follows from this repair.
Automatic correction stays optional, ambiguous overlaps stay unresolved, and
the actual phone hardware and larger local-model comparisons remain pending.
The medium comparison is refreshed as `browser-paddle-medium-paired-plan-v12`
with the same models, eight-image limit, cases, scoring and resource guards.

Use a new output tag when replaying; existing results must not be overwritten:

```powershell
node receipt_training/scripts/replay_prepared_windows.mjs <new-tag>
python -X utf8 receipt_training/scripts/score_prepared_windows.py <new-tag>
python receipt_training/scripts/build_prepared_window_join_report.py --check
```

Private images and raw observations remain in ignored local evidence. The
committed packet binds their exact hashes, frozen source, changed tests, build
and browser artifacts. Earlier evidence is preserved by exact-byte archives.
The stable branch and original checkout are protected; no merge, push or deploy
is performed.
