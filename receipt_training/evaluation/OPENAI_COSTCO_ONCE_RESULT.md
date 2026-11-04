# OpenAI last-resort receipt test

4 November 2026. The approved **one request** completed with HTTP 200 using
`gpt-6-astra`. It took **24.756 seconds**, used two existing identifier-reduced
Costco crops and made **no retry**. That authorization is consumed.

The result is a useful improvement over the saved Gemini reading of this
receipt. It does not establish a general winner or enable an OpenAI app provider.
OpenAI remains an operator-run last resort; no automatic credit use is added.

| Field | OpenAI, this request | Historical Gemini 3.5 Flash-Lite, same crops |
| --- | --- | --- |
| Proposed purchase rows | 18; no extra rows | 22; four coupon rows proposed as purchases |
| Matching purchase names | 18/18 exact after existing normalization | 17/18 exact; 18 matched |
| Quantities, unit prices, line totals | 18/18 each | 18/18 each on matched purchases |
| Four discounts attached to their purchase | 4/4 | 0/4 |
| Tax code on each purchase | 18/18 | 18/18 |
| Subtotal / VAT / final total | All three match | VAT and final total match; subtotal differs |
| Currency | Empty; needs confirmation | GBP |

These scores use the existing assistant source-reviewed **partial reference**,
not new independent human labels. Both rotisserie-chicken purchase rows survive.
The two methods used identical original crop bytes, but their provider settings
and output schemas differ. This familiar transaction is neither held out nor
representative of other retailers, difficult captures or long overlapping photos.

Returned item amounts and attached discounts independently sum to **163.16**:
the A group is **68.12** and the Z group **95.04**. Applying the printed A=20%
and Z=0% rates with code-group rounding gives **13.62** tax and **176.78** gross.
No balancing amount, corrected price or reference value was supplied to the model.
The returned decimal tax rates work without the manual percentage edits needed
by the saved Gemini draft. Absence of additional discounts is not scored as
verified truth: only the four labeled coupon amounts have that denominator.

Merchant and date remain empty because they are outside the crops. Currency is
also empty, although the VAT crop retains a clipped pound symbol on its Savings
row. Treat GBP as a manual context choice, rather than claiming perfect extraction.

## Current application compatibility

An additional **offline replay**, with no key access or new inference, passes the
unchanged response through the current shared strict receipt converter and money
engine. The converter's existing generic `Local vision` label is reused only in
this research harness; no OpenAI route, button or production provider is added.

With automatic currency, the app blocks calculation until a currency is chosen.
With explicitly supplied GBP, it calculates **£176.78 with zero discrepancy**;
merchant entry and normal source review remain outstanding. Both replay views
prevent finalization. No amount, discount, tax rate or quantity is edited and no
review check is confirmed. The historical Gemini draft remains blocked by its
percentage-rate literals and incorrect coupon grouping. Its partial accumulator
under invalid rates is not a payable total.

This is core compatibility, not an OpenAI browser, camera or upload-to-split test.
The saved raw response and draft remain unchanged. The replay closes its Vite
server normally in 1.253 seconds; minimum available RAM is 1,561,468,928 bytes.

## Usage, cost and limits

Reported usage is **1,765 input and 1,791 output tokens**, including 263 reasoning
tokens within the output count. At the checked standard $10/M input and $50/M
output rates, the usage estimate is **$0.1072**. Charging every input token at the
listed $12.50/M cache-write rate instead gives **$0.1116125**. Neither number is an
inspected account charge; the actual bill and remaining credits are unverified.
The earlier $0.38–$0.51 estimate used a larger assumed input and the 6,000-token
output ceiling. The $0.60 guard was a local estimate guard, not an account cap.
[Official model and pricing documentation](https://developers.openai.com/api/docs/models/gpt-6-astra).

The approved sender used a 90-second timeout, strict structured output,
`store:false`, no tools, no redirects and an exclusive attempt reservation.
Its source and approval checks precede reading the existing ignored `OPEN_AI_KEY`.
No key is printed, copied, committed or sent to a browser. No Files API request,
billing setting, recharge, other provider call or second generation request is
made. Previously disclosed provider retention and processing limitations still
apply; `store:false` does not establish zero retention.

## Evidence and remaining validation

The immutable raw audit is `advanced-openai-costco-once-v1.json` and can be checked
with `python receipt_training/scripts/score_openai_costco_once.py --check`.
The sealed execution/app/software checkpoint is
`advanced-openai-costco-checkpoint-v1.json`. Private request/response bytes stay in
ignored QA artifacts. The live plan SHA256 is
`214a9cf0d5b852e4efafa3af555d0e92d35b014a0d003dd9630326579e7c4252`;
request SHA256 is
`68506e9a957785c6c13d8c722767f57cb665d9ad39afa64ef9321dc369ca0677`.

All **26 offline sender controls** pass on the actual sender bytes. All **1,402
application unit cases across 78 files** pass on the current working application
through six disjoint guarded batches. This includes the separately validated
partial-zero-row parser fix; those tests are not a receipt-accuracy measurement.
Initial typecheck attempts were held before starting by low RAM. The first
compilation returned zero but crossed the one-GiB reserve; it remains a failed
guarded run and its output is not served. Subsequent checks with more startup
headroom pass the complete strict typecheck and isolated compilation. The new
400-view original-fifty replay preserves all 200 receipt/calculation vectors.
See the [parser implementation checkpoint](PARTIAL_FREE_ORDER_IMPLEMENTATION.md)
for those later results; the earlier sealed OpenAI checkpoint retains its
historical admission/build failures. Historical native phone evidence keeps its
own earlier source/build scope.

The full twelve-phase goal, genuine capture coverage and public-release work
remain unfinished. This one successful receipt supports retaining OpenAI as a
candidate for difficult cases, with explicit cost and upload control.
