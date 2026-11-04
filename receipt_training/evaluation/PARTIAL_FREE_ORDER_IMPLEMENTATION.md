# Incomplete zero rows preserve purchase ordering

4 November 2026. A narrow change to
[separatePurchaseRows](../../src/lib/purchase-expression.ts#L100) lets a literal
zero amount with an explicit positive count, such as `0 x1`, provide ordering
evidence for a nearby complete purchase expression. The incomplete row supplies
no product, missing count or price. Pack-like nonzero text stays excluded.
Photo boundaries, summary/footer boundaries and ambiguous directions still stop
an association. The [earlier diagnostic](PARTIAL_FREE_ORDER_DIAGNOSTIC.md) remains
a historical research checkpoint.

The actual full parser and financial engine were compared on 96 saved views of
twelve development receipts, with four separate native Costco crop controls.
The change recovers one previously skipped Double Cheddar association in a Rapid
reading, in each currency context. With supplied IDR, known line-price matches
increase **10/20 → 11/20**, quantities **4/16 → 5/16**, and unit prices **4/10 →
5/10**. Automatic line prices remain 5/20; supplied-IDR printed totals stay 5/11.
Tesseract views and the four Costco controls keep the same financial values.
These are partial assistant source-reviewed component labels, not complete or
independently human-verified receipt truth. Missing fields remain missing.

The working helper is byte-identical to the executed candidate. A separate
original-fifty replay produces **400 views / 200 before-after pairs**, covering
38 original development and twelve original evaluation receipts. **Every full
receipt and calculation vector is unchanged**, after canonicalizing generated
IDs. Both variants use current application source and differ only in this helper.
No historical-output reproduction, new inference, reserved-source evaluation,
fresh browser accuracy or latency improvement is claimed.

All **1,402 unit cases in 78 files** pass through six disjoint guarded batches,
including twelve new focused cases. The complete strict TypeScript check passes
in 11.529 seconds. Isolated frontend compilation passes its guard in 2.255
seconds, verifies twelve output artifacts and retains seven unchanged asset
aliases. It is not a complete deployment package. Minimum available RAM is
1,438,957,568 bytes for typecheck and 1,590,026,240 for compilation; the one-GiB
runtime reserve remains unchanged. Changed application files also pass formatting.

Earlier admission holds, one stopped unit batch, a compilation that crossed the
reserve, and an original-fifty output-parent startup error are preserved. The
successful follow-ups use more startup headroom and a fresh output directory;
they do not erase failures or weaken the runtime floor. No failed build is served.

The immutable checkpoint is `advanced-partial-free-order-fix-v1.json`. No model,
dependency, provider default, source label, financial amount, review confirmation,
stable branch, merge, push or deployment changes. Original-photo overlapping
capture and broader release work remain outstanding.
