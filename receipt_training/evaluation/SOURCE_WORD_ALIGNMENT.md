# Exact word alignment for overlapping receipt rows

The independent local reader now recovers one additional line price and unit
price from actual OCR words when neighboring row rectangles overlap. It does
not change amount parsing, OCR/model output, confidence thresholds or the
selected provider.

| Same original fifty, unchanged v5 partial truth | Before | After |
| --- | ---: | ---: |
| Hybrid line prices with explicit currency | 132/143 | 133/143 |
| Hybrid known unit prices with explicit currency | 25/31 | 26/31 |
| Hybrid automatic-currency line prices | 116/143 | 116/143 |
| Copied final totals with explicit currency | 41/49 | 41/49 |
| Trusted reconciliation | 0/49 | 0/49 |

Both gains occur on **one previously inspected development receipt**,
`cord-v2-train-006`. The printed BASO TAHU row visibly contains quantity 1, unit
43,181 and line price 43,181. With IDR supplied after extraction, the unchanged
printed-amount decoder reads those tokens as 43181. The vision draft's invalid
`43.181` strings remain available in pending source-review details. No amount
is derived from another field or chosen to balance the receipt.

There are no scored per-case regressions across 400 frozen before/after
primary/hybrid and automatic/known-currency views. Neither automatic results nor
the reused evaluation split improves. This is a development interpretation gain
on retained native readings, not a blind study, raw-recognition gain, provider
win or verified whole receipt. Complete original receipts remain unscorable.

## Cause and bounded change

The earlier decoder already handled grouped literals correctly, and `money()`
already rejected three fractional places. The initial hypothesis that `25.000`
was accepted as 25.00 was incorrect; the inspection amendment preserves that
correction. The actual failure was in the source evidence: a tall purchase-row
rectangle also included the next row's 13,000 word. Requiring every contained
word to concatenate into the purchase text correctly withheld a proposal.

The new helper seeks an exact, unique left-to-right subsequence of actual words
that reproduces the full source-row text, ignoring whitespace only. It does not
match fuzzy names, change digits/case, choose the highest confidence or use
arithmetic to select an alignment. Duplicate possible alignments abstain.
Selected slow-path boxes must not horizontally overprint beyond two image pixels.

Every ignored word must have a distinct reported source row containing its exact
token and physical centre; unexplained words block recovery. A selected word
with another reported owner also blocks recovery. These safeguards reject the
initial prototype's ability to discard arbitrary extra words. Both prototype
and final replay results are retained.

The existing identity, role, source-photo, resolved currency and sign checks
still apply. Valid conflicting model amounts remain unchanged. A copied
monetary word still needs its own 0.98 threshold and explicit human review; the
new values add no independent agreement. The adjacent ES JERUK unit word below
that threshold remains withheld. SDK confidence is not a calibrated probability.

Rows over 2000 characters, more than 256 candidate words or intersecting
neighbor rows, or more than 50,000 alignment/ownership comparisons abstain.
The legacy complete-word sequence remains unchanged. No source rectangle,
unreadable token or field value is invented.

## Verification

All 775 unit tests and 187 browser cases pass, with one existing browser skip.
New coverage includes ambiguous equal amounts,
unexplained words, conflicting row ownership, low confidence, overprinted boxes,
literal mismatches and budgets. A 250-case seeded property test compares the
bounded matcher with independent exhaustive enumeration of small sequences.

The existing column browser journey now deliberately extends one synthetic OCR
row rectangle over the next printed row. It checks pending proposals against
the source, fits 320/390-pixel views and completes an exact GBP 1.50/1.50 split.
It uses mocked computer/vision responses and real UI interactions, not live
Paddle/Qwen extraction accuracy. The final full browser and integrity results
are bound in [the evidence packet](advanced-source-word-alignment-v1.json).

The replay freezes both libraries, verifies inputs and loaded source hashes,
disables network access and never loads labels during interpretation:

```powershell
node receipt_training/scripts/replay_grouped_amounts.mjs grouped-amounts-v3
python receipt_training/scripts/score_grouped_amounts.py grouped-amounts-v3
python receipt_training/scripts/build_source_word_alignment_report.py --check
```

Choose a fresh run name; historical runs cannot be overwritten. The versioned
reference, 38-development/12-evaluation split, original inputs and every external
processing permission remain unchanged. Two 400-view replays make no new
original-receipt model calls or external uploads. Standard browser regression
tests separately retain their existing real on-device synthetic OCR/PDF paths.
No fresh scanner-latency or phone-memory claim is made.

The final main chunk is 543.60 kB, retaining the existing size warning. No
dependency, model, prompt, default reader or live allowance changes. The stable
branch and original dirty checkout remain protected. Missing products, other
prices, financial roles, taxes and totals remain; this receipt is still a checked
draft. Physical-phone/Safari, broader new-source accuracy, public readiness and
the existing thirteen historical artifact gaps remain open. The full goal is active.

Graph-backed implementation locations, verified against current source:
`src/lib/source-words.ts:L6` and `src/lib/recover-invalid-price.ts:L18`.
