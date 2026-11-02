# Payment rows remain separate from bill charges

2 November 2026. The independent-reading verifier now proposes excluding a
model adjustment when strong printed evidence identifies it as a cash/card
payment or change. Every exclusion requires source confirmation, including
when the resulting adjustment list is empty. Prices, tax, quantities and printed
totals are not supplied by payment arithmetic.

## Observed problem and result

The retained vision drafts sometimes classify `CASH`, `BCA Card`, `TENDERED`,
`CHANGE`, `Tunai` or `Kembalian` as fees, deposits, tips or discounts. Allocating
those entries as bill components gives people the wrong amounts to share.

The unchanged original-fifty replay produces **17 proposed exclusions across
11 receipts with supplied currency context**. Every affected prepared source
image was visually inspected. All 17 proposed rows visibly represent payment
or change. Six affected receipts are development, four validation and one test.
Three development images informed the rule; the remaining affected images were
inspected after the frozen replay. This corpus has been used repeatedly in the
project, so these are not blind generalization results.

This is a manual audit of the proposals, **not payment recall or a whole-receipt
accuracy score**. The v5 references remain unchanged and do not completely label
all possible payment/adjustment roles. Existing scored fields show no changes or
per-case regressions across 400 before/after reader/currency views:

| Field                                         |  Before |   After |
| --------------------------------------------- | ------: | ------: |
| Hybrid line prices, supplied currency         | 133/143 | 133/143 |
| Hybrid unit prices, supplied currency         |   26/31 |   26/31 |
| Hybrid quantities, supplied currency          | 119/120 | 119/120 |
| Hybrid fees, supplied currency                |     7/8 |     7/8 |
| Hybrid printed tax, supplied currency         |   16/22 |   16/22 |
| Hybrid copied final totals, supplied currency |   41/49 |   41/49 |
| Hybrid line prices, automatic currency        | 116/143 | 116/143 |
| Trusted reconciliation                        |    0/49 |    0/49 |

There are no new payment exclusions in the automatic-currency cohort. All fifty
original complete receipts remain unscorable with the available references.
Removing payment errors does not resolve other incorrect or uncertain fields.
Three more known-currency drafts have zero arithmetic discrepancy (19 to 22),
and nonzero discrepancies fall 30 to 27. All three still have required review
or validation issues. These are explicitly untrusted balances, not verified bills.

## Evidence and abstention

One readable positive final-total row must be unique. Weak, duplicated or
unreadable competing total headings block the proposal; explicit item-count
headings are not money totals. A candidate must follow that total in the same
photo and prepared section. The label must identify a supported payment or
change role and match the model adjustment after case, whitespace and colon/
period normalization. Duplicate source or model labels abstain.

The total and candidate row each need actual aligned OCR words, with row and
word confidence at least 0.98. Exact source-word alignment retains its bounded
search and ambiguity/ownership checks. Labels without their own amounts cannot
borrow a neighboring tender amount. Valid conflicting model money is retained.
An invalid grouped model string can match only the literal source amount under
the resolved currency, using the existing printed-amount decoder. No monetary
decoder or price-recovery threshold changes.

No cash-minus-change equation chooses a role or supplies a missing value.
Cross-batch scalar conflicts, disabled source recovery, unknown/conflicting
currency, missing words, negative payment values and multiple bills abstain.
There are at most 64 candidate payment rows. Coupon, voucher, gift-card, loyalty,
reward, surcharge and discount labels alone are insufficient payment evidence.

For example, the inspected development receipt with `BCA Card 161,333` loses
that false discount, while its `Coupon 100,000` remains for review. Another
receipt's unvalued `Cash` heading and weak `Tendered: 50.000` amount remain,
while its strong `Change: 25.000` row is excluded pending confirmation.

The limited Indonesian labels are grounded in official payment terminology:
[Bank Indonesia's QRIS explanation](https://www.bi.go.id/id/fungsi-utama/sistem-pembayaran/ritel/kanal-layanan/qris/default.aspx)
discusses cash and change; [BCA's cashless explanation](https://www.bca.co.id/id/informasi/Edukatips/2025/06/03/07/50/cashless-solusi-transaksi-yang-nyaman-dan-mudah)
uses `uang tunai` and `uang kembalian`; [BCA's card terms](https://www.bca.co.id/id/Syarat-dan-Ketentuan/kartu-kredit)
identify BCA Card as a payment card. These sources support the terminology,
not a claim that every similarly named receipt row is safe to exclude.

## Verification and remaining limits

All 820 unit tests pass, including 45 new payment-exclusion cases. The focused
desktop/mobile synthetic journeys pass, require source review and finish with
an exact GBP 10.50/10.50 split. The first browser attempt expected six source
regions; four were correct (the payment total, two payment rows and service
charge). That failed expectation and its artifacts are preserved. The fix
changes the assertion, not the source evidence or financial implementation.

The full browser suite passes 189 cases with one existing skip. The build/
typecheck and formatting checks pass. The main bundle is 545.90 kB and retains
its existing size warning. Chromium phone emulation at 320/390 px
does not establish physical camera or Safari acceptance.

Reproduction uses the existing replay/scorer with explicit frozen before-source
and baseline arguments. `qa-artifacts/tender-roles-v1` retains the source
snapshots, 400 predictions, unchanged-reference scores, manual image audit,
software logs and initial failed browser artifacts. Machine evidence is in
`advanced-payment-rows-v1.json`.

No new original-receipt OCR/VLM inference, private upload, dependency, model,
prompt or default-provider change occurred. The 8B resource/configuration gate
and pending Gemini private-crop approval are unchanged. The full goal remains
active; broader financial truth and public/mobile readiness are still open.
