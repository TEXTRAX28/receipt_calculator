# Unknown AI tax inclusion requires a field check

An AI `pricesIncludeTax: null` previously became the receipt's provisional
`true` Boolean and a warning. It did not create a required tax-basis check.
When the provisional arithmetic balanced, that specific uncertainty could pass
the financial review gate without being acknowledged.

New AI imports now add a required source check for **whether item prices include
tax**. The provisional Boolean and every returned amount stay unchanged. The
user must check the original and confirm or explicitly correct that setting
before continuing, even when calculated and printed totals match. Known AI
`true`/`false` values keep their existing behavior. The graph/source entry is
`src/lib/gemini.ts:L13`, `receiptFromAi()`.

The check is saved with the draft and survives refresh. Removing its confirmation
blocks the receipt again. An explicit human edit records the new field value;
a changed value without a matching confirmation stamp becomes pending. Existing
saved Boolean-only drafts do not retain the original model null, so this change
does not retrospectively classify them by parsing warning prose. It also cannot
detect a confidently wrong AI Boolean.

Verification passed **369 unit tests**, including five new cases, and **141
standard browser tests**, with one existing skip. The focused desktop/phone test
uses a mocked £5.50 receipt: matching totals remain blocked until the tax check
is handled, and confirmation persists across refresh. This is a UI protocol
test, not model accuracy or physical-phone evidence. Build, formatting and graph
refresh/check passed.

Reusing the six independent native Qwen outputs added the required check to all
twelve automatic/known-currency variants. Every receipt value and monetary
result remained unchanged. The original 38 development, 12 evaluation and one
supplementary frozen hybrid replays also had zero semantic differences; the
hybrid already performs its own independent source checks. No new inference,
external upload or billing activation was used for this fix.

The [290-file checkpoint](advanced-unknown-tax-review-v1.json) preserves the
source snapshots, real-output replays, synthetic browser screenshots and test
logs. The historical evidence audit still has the same thirteen previously
disclosed area/PDF/refund QA byte gaps and no new gaps. Those missing historical
bytes have not been recovered or replaced by newer tests.

```powershell
python -X utf8 receipt_training/scripts/build_unknown_tax_report.py --check
```

The [six-case Veryfi scope](VERYFI_SCREENING_SCOPE.md) remains unconsumed,
awaiting its separate approval/quota reply. The original dirty checkout and
verified stable branch remain protected. Broader recognition, capture,
uncertainty calibration and public deployment requirements are still open.
