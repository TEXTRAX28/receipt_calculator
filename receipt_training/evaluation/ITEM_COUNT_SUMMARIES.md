# Keep printed item counts out of purchases

3 November 2026. Parent: `73ff5b8`. This is a parser correction using retained
reader outputs, with no new inference or provider requests.

The original-fifty comparison removes two false purchases from the primary
OCR parser in both currency modes. All previously matched products and other
scored fields are retained. The selected hybrid's accuracy is unchanged.

## Source evidence and change

Two inspected photographs print an item count beside the subtotal below the
purchase divider. Their retained OCR joins those columns into a single row:

- `cord-v2-train-012`: `ITEMS:4 87,275` became an extra purchase for `87275`.
- `cord-v2-validation-004`: `ITEMS:1 41,000` became an extra purchase for `41000`.

Only a complete labelled integer count, optionally followed by a printed
monetary amount, receives this classification. The original text and exact
source indices remain available, with an unconfirmed receipt-level item-list
check. The count does not supply a product quantity, subtotal, total or missing
item. The adjoining amount is not recovered as a subtotal by this change.

Count rows cannot name an adjacent purchase expression or column purchase.
They do not end the item section: some receipts put counts above purchases.
Names such as `Items organizer`, `Item 42` and `Items 1 pack` remain products;
an explicit purchase expression for a product named `Items` also survives.
Photo boundaries and later purchases are preserved. This narrow English-label
rule does not establish multilingual or arbitrary-layout count recognition.

The refreshed graph locates `isItemCountLine` at
`src/lib/purchase-expression.ts:77`, its title guard at line 87,
`parseReceiptWithSources` at `src/lib/parser.ts:57` (count handling at line 360),
and the column product guard at `src/lib/column-purchases.ts:15`.

## Paired measurement

`grouped-amounts-v14` freezes the same 68 parent library files and uses the same
fifty observations, 38/12 split, v5 partial references, matcher and scorer.
It produces 400 before/after views: primary/hybrid and automatic/supplied
currency. These are familiar development cases, not blind validation.
The initial `grouped-amounts-v13` experiment is retained separately; the final
version additionally preserves separate/column purchases below count headers.

| Field                                               |  Before |   After |
| --------------------------------------------------- | ------: | ------: |
| Primary unmatched predictions, either currency mode |      20 |      18 |
| Primary matched products, supplied currency         | 122/145 | 122/145 |
| Primary known line prices, supplied currency        | 120/143 | 120/143 |
| Hybrid matched products                             | 143/145 | 143/145 |
| Hybrid known line prices, supplied currency         | 134/143 | 134/143 |
| Hybrid trusted reconciliation                       |    0/49 |    0/49 |

Primary predicted rows fall from 141 to 139 in automatic mode and 142 to 140
with currency supplied. No other scored count changes; no scored regression
occurs. Partial references leave complete-receipt accuracy unscorable for all
fifty. This correction does not solve the missing zero-price modifier, missing
bag, name errors or other financial failures. All drafts still need review.

## Verification and unresolved Windows cleanup

The first sixteen regression cases give six passes and ten failures on the
unchanged parent. All eighteen final count-summary cases pass, and the combined
parser/purchase-expression/column suite passes **122/122**. Typechecking and an
isolated frontend production build pass. No environment files or API middleware
are loaded for these checks; the build emits the previously known OpenCV
externalization and large-chunk warnings.

The full unit run on the initial implementation **does not pass**: 1,080 pass
and thirteen fail in local-reader/local-vision process shutdown and cancellation.
The exact failures and logs are retained. A separate synthetic worker probe
reproduces Windows `taskkill.exe` exceeding its five-second deadline at 5,108 ms;
the direct fallback then closes that owned fixture at 5,118 ms. The bridge
implementations are unchanged by this parser patch. No new full-suite pass is
claimed after the two final header tests were added. Resolve and verify the
shutdown failure before calling the branch fully tested; do not just suppress
these tests or count the earlier 1,077-test pass as current evidence.

The pending copied-price phone journey is rebound to the new build in
`qa-artifacts/copied-price-browser-v3`. It has not run: 2,053,361,664 bytes were
available against the unchanged 2,684,354,560-byte startup floor. The next
medium-reader plan is `browser-paddle-medium-paired-plan-v14`, with the same
models, cases, limits, parameters, scoring and timing as v13. No model runs,
guard reductions, private uploads, quota probes or billing changes occurred.

`stable/receipt-verified` remains `ee725ba`, and the original checkout remains
`29a187a` with its exact previous dirty diff. Nothing is pushed or merged.
The twelve-phase goal remains active and public readiness remains incomplete.

The machine-readable packet is `item-count-summaries-v1.json`. It binds both
replays, sources, photographs, references, scores, tests (including failures),
build, shutdown probe, prepared future plans and protection checks. Reproduce
the hash audit with `python -X utf8 receipt_training/scripts/audit_evidence_integrity.py --run <new-name>`;
the thirteen separately documented legacy missing declarations remain gaps.
