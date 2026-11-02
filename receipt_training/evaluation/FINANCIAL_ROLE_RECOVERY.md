# Literal financial-summary roles and mandatory review

The hybrid now proposes fee/tax/discount roles from a complete, strongly read
printed financial section. It copies actual printed amounts and keeps each
proposal blocked for source review. This improves financial fields; it does not
establish a fully correct or automatically payable receipt.

## Source rules

The shared financial-row grammar recognizes subtotal, explicitly labelled tax,
service/fee, discount, rounding and final-total rows. A bare “Service” or “Fee”
can be a purchase name, so the text parser treats it as a charge only after a
subtotal. Other product names, genuine repeated purchases and source indices are
preserved. Financial summaries stop masquerading as additional products.

For hybrid proposals, every row in one subtotal-to-total section must have a
recognized label and an actually printed parseable amount. It must occupy one
photo/panel, with real matching OCR words and at least 0.98 confidence on every
summary line and word. The existing positive-tax and exact section-arithmetic
guard rejects incomplete or contradictory interpretations. It never computes a
missing fee, tax, discount, rounding or aggregate tax amount. Multiple tax rows
are not summed into an invented printed-tax field.

Currency must already be resolved consistently. A cross-batch conflict in any
subtotal, tax or final-total field withholds the entire role proposal. A known tax-inclusive vision
basis or contradictory inclusion text prevents this proposal. A raw unknown
basis needs the existing pending net-price interpretation. Actual item-code
evidence, an unfamiliar code, or incomplete/weak purchase evidence prevents
switching from per-item codes to printed receipt tax. A code confined to strongly
read summary labels can be proposed as a misinterpreted footer role; unsupported
item codes stay visible and pending, rather than being erased.

Matching a model adjustment to a printed row requires one unambiguous label
mapping. Service/SVC wording and the bounded PB1/PBI character variant are
normalized; arbitrary fuzzy financial-label matching is not used. Existing
unmatched adjustments survive. In particular, the supplied restaurant's
post-total Coupon/Card tenders are **not** repaired by this rule and can still
make its calculated bill wrong.

Each changed adjustment, printed-tax amount and tax-calculation convention has
an applicable unconfirmed source check. Unchanged tax calculation does not add
an empty rates-confirmation step. Actual summary boxes are available for the
tax-basis check too. Previous model roles/amounts remain in the review details.
Financial edits reopen their checks. No proposal counts as independent model
agreement, calibrated confidence or human approval.

The helper withholds additions beyond the existing thirty-adjustment budget and
bounds untrusted model labels inside the persisted review schema. The source
rules do not change model weights, prompts, providers, reference labels or split
arithmetic.

Verified graph/source locations:
`src/lib/financial-basis.ts:L20`, `src/lib/financial-basis.ts:L36`,
`src/lib/financial-roles.ts:L20`, `src/lib/parser.ts:L42`,
`src/lib/verify-readings.ts:L163`.

## Same-reading original-fifty result

All fifty original transactions retain their 38-development/12-evaluation split.
The same saved independent OCR/vision readings pass through frozen before/after
source in automatic and explicit-currency modes, for both primary and hybrid
readers: 400 views, not 400 new receipts. The unchanged strict scorer uses the
same v5 financial references. The frozen before hybrid reproduces the preceding
financial-basis checkpoint exactly.

| Known field, explicit currency | Primary before → after | Hybrid before → after |
|---|---:|---:|
| Service/other fees /8 | 1 → 6 | 4 → 7 |
| Printed tax /22 | 2 → 13 | 13 → 16 |
| Receipt discounts /4 | 2 → 2 | 2 → 3 |
| Printed subtotal /34 | 18 → 23 | 27 → 27 |
| Known printed rounding /2 | 0 → 2 | 2 → 2 |
| Known line prices /143 | 119 → 119 | 131 → 131 |
| Trusted reconciliation /49 | 0 → 0 | 0 → 0 |

The primary proposes 141 rather than 158 rows, while retaining all 121 matched
purchases and their known names/quantities/prices. The seventeen removed rows
are source financial labels such as Service, PB1, SUBTTL, DUE and Rounding;
partial truth still limits general precision claims. The hybrid retains all
143 matched purchases, 132 exact names and 119/120 known quantities. Automatic
hybrid field counts remain unchanged, including 116/143 prices and 4/8 fees.
Explicit user currency is not automatic currency recognition.

Four explicit-currency financial-role proposals remain pending: three previously
inspected development receipts and one evaluation receipt. A separate existing
scalar recovery benefits from the newly parsed labelled percentage-tax row.
These paths together account for the three additional known printed-tax matches.
The lower-confidence development fee case remains withheld. No scored per-case
known-field regression occurs against the pre-change app. All fifty drafts still
require review, and strict whole-receipt accuracy remains unscorable.

These are source-informed regression cases, not a fresh blind holdout. Early
local versions, failures and replay scores remain separate. The final parser
requires subtotal context for bare Service/Fee; its primary fee score is 6/8,
rather than the earlier unconstrained draft's 7/8. Preserving ambiguous genuine
purchases is part of the final rule, not an undisclosed score selection.

## Optional-reader and browser controls

The same six saved Azure and Veryfi responses also pass through their actual app
adapters locally. Each retains 25/25 known line prices with explicit currency;
automatic counts remain Azure 18/25 and Veryfi 19/25. Azure's unmatched proposed
row count decreases from one to zero, and Veryfi's from two to one. Other known
purchase-field and copied-total scores are preserved. These are retained-response
checks, not additional cloud extraction tests or new provider permissions.

Azure's word geometry/native-field-poisoning controls remain intact. Veryfi's
transport uses synthetic identifiers and injected responses, with global network
access blocked. Its six simulated POSTs and six simulated DELETEs are not real
uploads or deletions. No real provider identifier is sent anywhere.

Fresh verification passes **674 unit tests**, **177 standard browser tests**
and one existing duplicate-breakpoint skip, production build/typecheck,
formatting and graph refresh. Twenty-one new unit cases cover role correction,
missing fees, genuine item codes, unrelated adjustments, confidence/context
rejection, schema limits and exact checked allocation. The synthetic browser
workflow displays the old/new roles and genuine drawn source rectangles,
withholds confirmation, then splits £21.00 into £10.50 each after checks. It
fits 320/390 px browser emulation. Final phone source/review screenshots were
visually inspected; no physical handset or fresh native/cloud accuracy is claimed.

The first focused browser attempt exposed an unavailable source link for the
existing tax-basis check; its financial-section regions now remain accessible.
Earlier type/fixture/warning failures are retained alongside the passing result.
The final source replay is `financial-role-recovery-v4`; previous versions are
diagnostic snapshots, not extra independent inference samples.

The minified main bundle is 518.35 kB and still emits Vite's 500 kB chunk warning.
No runtime package was added. No new scanner-latency, native-model memory,
electricity or hosting-cost sample is claimed; receipt API cost is zero.

The [sealed result packet](advanced-financial-role-recovery-v2.json) binds the
source actually loaded, predictions, references, unchanged scorer, provider
controls, tests and current app/build files. Thirteen historical evidence gaps
remain disclosed. The stable branch and original dirty checkout are preserved;
no merge, push, deployment, private upload or billing activation occurred.

```powershell
python -X utf8 receipt_training/scripts/build_financial_role_report.py --check
```

The full twelve-phase goal remains active. Missing prices, unresolved financial
roles/tenders, source-completeness evidence, capture geometry, genuine digital
inputs and real-device/public-backend acceptance still require work.
