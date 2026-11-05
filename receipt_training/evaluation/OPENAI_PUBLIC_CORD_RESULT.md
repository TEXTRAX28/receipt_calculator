# OpenAI public CORD comparison: six approved tests completed

5 November 2026. Six requests completed, six HTTP 200 responses and six valid
structured drafts, with one attempt per original image and no retries. OpenAI
remains the explicit last resort; application defaults and its US$0.60 estimate
guard are unchanged. The separate research guard was US$0.80 per request.

## Measured result

Both methods use the same six publicly anonymized original CORD PNGs 012–017,
the existing source-reviewed partial references and unchanged name/field matching.
The local baseline replays five saved actual Paddle readings and preserves 014's
raw research input-size refusal. OpenAI is fresh inference. No private Costco
photos, labels, supplied currency, prior reading or history were sent to OpenAI.

| Known field, all six sources | Saved Paddle + current parser | OpenAI |
|---|---:|---:|
| Matched visible components | 10/23 | 23/23 |
| Matched components / proposed rows | 10/12 | 23/23 |
| Exact normalized descriptions | 3/23 | 22/23 |
| Line amounts, IDR supplied after extraction | 10/23 | 23/23 |
| Printed quantities | 0/23 | 23/23 |
| Explicit unit prices | 0/4 | 4/4 |
| Printed subtotals | 2/4 | 4/4 |
| Printed tax amounts | 0/3 | 3/3 |
| Printed final totals, IDR supplied | 4/6 | 6/6 |
| Printed final totals, automatic context | 1/6 | 6/6 |

Zero-price included components remain in coverage. On the five sources where
Paddle returned a reading, its line amounts are 10/17 versus OpenAI's 17/17,
and its totals are 4/5 versus 5/5. This secondary view shows the gain is not
solely the preserved 014 refusal; the six-source table remains primary.

OpenAI keeps all nineteen unprinted/unknown unit-price fields blank, rather
than deriving unit prices from totals. The one exact description difference
is printed `MANGGO` returned as `MANGO`, which still matches the same component.
Unknown reference fields remain unknown. Returned zero item discounts and
merchant guesses are listed separately and receive no unsupported correctness
credit. In 013, `A FUNG` is visible on the background bag; the receipt merchant
is obscured. The existing merchant reference remains unknown.

## Financial checks and limits

The draft values and current application converter are tested offline with no
financial edits. Five sources have no legible currency designation; OpenAI
leaves them blank. Automatic currency identification is therefore 1/6 against
dataset context. Supplying IDR after extraction fixes context without converting
or reinterpreting any amount; this is not model currency accuracy.

With IDR supplied, arithmetic is zero-discrepancy on four sources, but only one
has no deterministic validation issues. Sources 013 and 016 read tax amounts
correctly yet return unusable or unassigned tax-code mappings, so the application
detects discrepancies of IDR 4,664 and 6,364. Source 012 correctly reads a free
bag's printed unit price and net zero line, but its inline 100% discount still
needs explicit review. Three drafts retain an unknown tax-inclusion check.
All six remain reviewable drafts. A correct printed total alone does not verify
tax/discount treatment or make the whole receipt financially complete.

These are six familiar public Indonesian sources with assistant-reviewed
partial references, not independent human truth, a blind cohort, complete
financial accuracy, physical-phone verification or general production accuracy.
No prompt, model, parser, schema, reference, matching threshold, retry policy,
application source or provider default was changed to obtain the result.

## Time and cost

The six API adapter/capture times average **11.415 seconds**, with a small-sample
p95 of **16.353 seconds**. The complete guarded run takes **165.168 seconds**,
including minimum 31-second spacing. These are not handset upload-to-split
latency or a speed ratio against the historical native captures.

Returned usage is 17,653 input tokens, including 17,635 cache-write tokens,
and 3,232 output tokens including reasoning. At the checked
[official rates](https://developers.openai.com/api/docs/pricing),
the usage-based estimate is **US$0.3822175** if writes use the 30-minute rate;
the 12-hour cache-write sensitivity is **US$0.602655**. Treat these as estimates:
actual account charges, taxes and remaining credits were not verified. The
approved conservative pre-run estimate was US$3.17 for all six requests.

This batch consumes the approval in call_48c593bbdfeb4b4b934d695abe385166.
No request was retried, no billing settings changed and no further receipt
upload is authorized by it. The local result scorer reads no key and sends no
network request. See the existing [data-control documentation](https://developers.openai.com/api/docs/guides/your-data)
for the previously disclosed retention/training scope; no new privacy promise
or zero-retention claim is made.

## Verification and next work

All real-run and offline analysis processes close normally within the unchanged
memory guards; executable/test source remains byte-identical to `1fe22c1`.
The previous 1,470 unit cases, strict TypeScript, formatting and isolated build
are carried forward by source identity, not rerun. No dependencies are changed,
models downloaded, user apps closed or stable/original checkout files modified.

The separately authorized 320/390/1440px saved-response browser flow is checked
again after this batch. Its admission observation peaks at 2,673,762,304 bytes,
below the unchanged 2,684,354,560-byte requirement; no browser/server child
starts. This is a retained resource hold, not a phone-layout pass. The prior
protected-worktree read initially meets a sandbox permission denial; the same
read-only verification then passes with permitted access and all fingerprints
match. No application process or user tab is closed to force either check.

This evidence supports keeping OpenAI as a useful last-resort checked reader.
The broader twelve-phase objective remains incomplete: selected-reader/recovery
coverage, full financial truth, current browser flow, genuine capture/device and
public-release operations still need their own evidence.

Raw records: `qa-artifacts/provider-review/openai-public-six-v1/run/`.
Frozen offline comparison and source review:
`qa-artifacts/openai-public-six-result-v1/`.
Aggregate packet: `advanced-openai-public-cord-result-v1.json`.
