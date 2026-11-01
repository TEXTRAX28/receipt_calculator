# Financial interpretation and rejected specialist

The app now proposes tax-exclusive purchase prices when an unknown vision basis
can be supported by a complete, strongly read financial section. The proposal
remains blocked for human source review. It changes no amount, tax rate, charge
kind or purchase. This is a limited interpretation improvement, not a complete
financial reader or a new default provider.

## Original-image specialist trial

A frozen three-case development pilot gave the installed Qwen3-VL 4B original
prepared images, a financial-summary-only schema and a fixed prompt. It received
no OCR, labels, currency hint or previous answer. Each case ran once with a
180-second deadline and constrained JSON; all three completed cleanly.

| Diagnostic | Result |
|---|---:|
| Copied summary amounts, multiset in post-extraction IDR context | 15/15 |
| Correct financial role plus amount, multiset | 7/15 |
| Unknown row roles | 5/15 |
| Known positive-tax price basis | 0/2 |
| Unknown zero-tax basis preserved | 1/1 |

The model called one service charge tax, one PB1 tax a fee and a coupon tender a
discount. Its zero-tax response left every row role unknown and invented discount
explanations from a product option. Correct amounts therefore did not make this
a reliable financial interpreter. **The specialist is rejected and is not wired
into the app.** It uses the existing Qwen weights, so agreement with the existing
vision reader would not be independent-model evidence.

The three calls took 34.660–36.171 seconds including fresh CLI loading, with
3.16–4.16 GB measured peak process working set. This smaller output task cannot
establish a speedup over full receipt extraction or a useful p95. API cost and
private uploads were zero; local electricity is unmeasured. The
[68-file pilot packet](advanced-financial-vision-pilot-v1.json) retains requests,
schema, model/runtime hashes, native logs, outputs and source references.

Official [Qwen 8B GGUF assets](https://huggingface.co/Qwen/Qwen3-VL-8B-Instruct-GGUF)
were checked through public metadata only. The recorded 5.78 GB model/projector
would need partial offloading with the observed GPU headroom. Host memory was
also constrained. No larger-model weight was downloaded or benchmarked. This
deferral is not an accuracy result or proof that another deployment cannot run it.

## Guarded source proposal

The verifier accepts only one subtotal-to-final-total section within one photo
and panel. Every intervening row must have a recognized financial label, a
literal parseable amount, real OCR words matching the assembled line and scores
of at least 0.98 for all those words and the line. A positive separately printed
tax is required. Fees, discounts and explicitly printed rounding stay separate.
Exact integer arithmetic rejects inconsistent interpretations; it never fills
a missing row, tax, rate or amount.

Zero tax, identical subtotal/total, unreadable or unknown intervening rows,
multiple sections, photo boundaries, contradictory inclusion text, unresolved
currency and a valid existing vision boolean prevent this recovery. The 0.98
OCR threshold is a guard, not a calibrated 98% probability of correctness.

An accepted proposal replaces only the default display of an unknown vision
basis. The app records the previous unknown basis, copied source labels/amounts
and actual source regions. Its wording calls this an interpretation, and an
unconfirmed check blocks finalization even if arithmetic balances. Editing the
checked basis reopens that check. Existing monetary/role errors stay visible.

Graph/source locations verified for this change are
`src/lib/financial-basis.ts:L23`, `src/lib/verify-readings.ts:L159` and
`src/lib/review-checks.ts:L98`.

## Same-reading result and workflow checks

The final replay processes all fifty original records through frozen before/after
source, automatically and with the predeclared currency supplied after extraction:
200 views, no new native readings or external requests.

| Original fifty | Before | After |
|---|---:|---:|
| Known net-price basis, automatic currency | 0/9 | 0/9 |
| Known net-price basis, explicit currency | 0/9 | 4/9 |
| Trusted reconciliation | 0/49 | 0/49 |

Five explicit-currency proposals remain pending. Four have prior known basis
references. The fifth remains unscored for basis; its original image was checked
after extraction, without amending truth or counting another success. These are
previously inspected development records, not a blind holdout. No amount,
purchase, coupon, fee, unit price, metadata or tax mode changes. All prior known
monetary-field counts remain unchanged. Original complete financial accuracy
remains unscorable with the existing partial references.

Verification passes 645 unit tests, build/typecheck, formatting, a current local
graph and 175 standard browser tests with one existing skip. The new synthetic
workflow requires the source check before sharing £21.00 as £10.50 each. It fits
320/390 px emulation. Visual review corrected the test fixture's initially offset
boxes; the final focused rerun passes both projects and its source screenshot was
inspected. These mocked protocols do not establish native model or physical-phone
accuracy. The old fixture, failed local replay setup logs and corrected evidence
remain separate.

The [601-file recovery packet](advanced-financial-basis-recovery-v1.json) binds
inputs, frozen modules actually loaded, predictions, unchanged references,
unchanged scorer, tests and browser evidence. The preceding global audit still
has thirteen disclosed legacy artifact gaps. The final global audit checks
13,880 unique paths with exactly the same thirteen gaps and no new unresolved
declared hashes. Stable and the original dirty
checkout are unchanged; no merge, push, deployment or new private upload occurred.

```powershell
python -X utf8 receipt_training/scripts/score_financial_vision_trial.py --check
python -X utf8 receipt_training/scripts/build_financial_basis_report.py --check
```

Tax/fee/payment-role recovery, automatic currency ambiguity, complete financial
truth, genuine digital/PDF and handset evidence, stronger extraction and public
release acceptance remain open. The full twelve-phase goal remains active.
