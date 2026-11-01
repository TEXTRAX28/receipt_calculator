# Six-crop Azure and Veryfi comparison

The approved Azure screen completed on 1 November 2026 using the configured
resource, reported by the user as **UK South, Free F0**, with six unused pages.
All six extraction POSTs succeeded. There were eight status GETs and six matching
deletion requests; Azure returned HTTP 204 for every deletion. There were no
retries, other-provider uploads, custom training calls or paid activation. The
six-upload authorization is consumed. Account billing, quota and actual region
were not independently inspected through management APIs.

Azure's native structured output was stronger than Veryfi's native output on
these crops. That does not establish a provider winner for a complete bill.

| Same six source-reviewed crops | Azure native | Veryfi native |
| --- | ---: | ---: |
| Matched purchase descriptions | 26/26 | 22/26 |
| Exact normalized descriptions | 23/26 | 20/26 |
| Known purchased quantities | 15/15 | 15/15 |
| Known unit prices | 11/11 | 8/11 |
| Known line prices | 23/25 | 18/25 |
| Attached known coupons | 0/3 | 0/3 |
| Known VAT codes | 0/9 | 0/9 |
| Copied final totals | 5/6 | 3/6 |
| Known tax amounts | 2/2 | 1/2 |

The comparison parses original numeric JSON tokens as exact decimals and uses
the same frozen description-only matcher and unchanged six-crop reference.
Amounts are compared in the reference currency, without converting them using
the provider's currency code. Negative coupons/redemptions remain separate
native rows; they are not silently attached to a purchase. Unknown fields and
the first faint Tesco price remain excluded.

Azure returned the expected currency on only **2/6** cases. Bristol was AUD,
Tesco USD, one Indonesian restaurant MYR and another USD. Taiwan TWD and the
faint Indonesian receipt IDR were correct. A numerically correct price with the
wrong currency is not a correct bill. The country/currency fields were returned
by the provider without a merchant, country, currency or reference hint.

Both Tesco purchases are detected, but Azure attaches 1.45 to the second doughnut
and leaves the cheddar price empty. It copies 43,636 as the faint restaurant's
final total instead of its printed grand total 48,000, while correctly extracting
tax 4,364. Both genuine repeated cashews remain in the Bristol output. The
cropped Bristol total label remains an input limitation; the present crop test
does not establish uncropped-document performance.

## Literal text is a separate extraction path

An offline ablation sends the saved text from both providers through the same
current frozen application parser. It uses no native money, currency or
confidence fields, no new model calls and no manufactured source geometry.

| Literal text plus current parser | Matched names | Known prices | Attached coupons |
| --- | ---: | ---: | ---: |
| Veryfi, automatic currency | 26/26 | 19/25 | 2/3 |
| Veryfi, explicit currency after extraction | 26/26 | 25/25 | 2/3 |
| Azure plain `analyzeResult.content`, either context | 4/26 | 0/25 | 0/3 |

Azure emits descriptions, quantities and prices on separate content lines. The
existing plain-text parser does not reconstruct those columns. This result
identifies an adapter gap; it is not a measure of Azure's available word-box
potential. The response includes genuine words, polygons and confidence, but a
layout adapter using those fields has not yet been tested. No Azure engine
identity or fabricated confidence/boxes were passed into a local-reader schema.

The retained local Qwen comparison on these exact PNG crops previously read
22/25 known prices and matched all 26 names. It precedes the newer single-photo
decoder-order change; no fresh local-model accuracy result on these six PNGs is
claimed here. The [original fifty comparison](ROW_FIRST_DECODER.md) uses different
prepared JPEGs and must not be substituted for this crop comparison.

## Decision and reproducibility

Keep the current default. Azure is still a research harness, not an app reader.
Its stronger native fields merit testing a source-grounded layout adapter and
independent verification with saved Paddle evidence. Veryfi's text/parser path
currently has the best known-price count in this screen with explicit currency,
but still lacks a source-verified complete payable result. No path certifies all
financial fields, coupon/tax basis or a complete receipt.

Observed Azure request-through-cleanup times were 7,720 / 3,227 / 3,243 / 3,216 /
3,206 / 3,203 ms. These include network and polling and cannot be ranked against
warm local inference, fresh model loading or physical-phone latency. No p95 or
billed-cost claim is made from six requests.

Microsoft documents temporary storage in the resource region, automatic deletion
after 24 hours and earlier deletion through the result API. Reported cleanup is
not an independent erasure audit or an account-specific training-use exclusion.
[Microsoft data handling](https://learn.microsoft.com/en-us/azure/foundry/responsible-ai/document-intelligence/data-privacy-security).

The [103-file result checkpoint](advanced-azure-screening-result-v2.json) binds
approval/consumption, exact crop and request hashes, response bytes, strict
projection, same-parser replay and tests. Eight synthetic projection tests,
sixteen protocol tests and five historical-evidence tests pass. The previous
preparer now distinguishes exact archived historical build bytes from live
protocol/crop/review requirements; archives never authorize execution. An early
audit fixture exceeded its documented decimal precision bound and was corrected;
its failed log and unvalidated report remain local. No extraction was repeated.

```powershell
python -X utf8 receipt_training/scripts/test_review_azure_screening.py -v
python -X utf8 receipt_training/scripts/build_azure_screening_result.py --check
```

These commands are offline. Do not rerun the consumed live execution. Images,
full responses, keys and endpoint identity stay in ignored local files. The
tracked report contains derived counts, limitations and exact evidence hashes.
These are six assistant-reviewed development crops, not a blind holdout, full
original-corpus cloud evaluation, complete financial truth or public-release
approval. The wider twelve-phase goal remains active.
