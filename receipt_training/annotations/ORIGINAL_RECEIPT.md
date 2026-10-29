# Bristol Costco source inspection

Source: `receipt_training/costco/costco-receipt-1.webp`, preserved unchanged.
The classified copy is `costco/physical/user-costco-bristol-001.webp`, the same
transaction. SHA256 equality is checked by `scripts/validate.py`.

The 962 × 2099 still WebP contains a **photograph of a paper receipt** on carpet.
It names Bristol Warehouse and Costco Wholesale UK Limited. Country GB and
currency GBP are supported by the UK merchant/location context; no ISO currency
code is visible. The date and VAT legend are outside the cropped footer.
The image shows a horizontal fold, warm uneven lighting, a large vertical gap
and a pen stroke through the amount area. The membership field was already
obscured, but a masked card suffix remains; working images stay private.

Descriptions appear above item-number/quantity/unit-price/line-total rows. These
are the nine visible purchases, preserving the two separate cashew rows:

| Description | Item number | Purchased quantity | Unit/line amount | Raw code | Adjacent apparent deduction |
|---|---|---:|---:|---|---|
| M.CHOC B.PARTS 675 | 664662 | 1x | 9.99 | A | GOOEY BODY PARTS; 687328; `7.00-A` |
| RIYAS PANEER 1KG | 447578 | 1x | 6.99 | Z | unknown/not explicitly printed |
| MYTAGALONGS B/PACK | 2052553 | 1x | 14.99 | A | IRC MYTAGALONGS BA; 689100; `5.00-A` |
| TROLLI ALL IN ONE | 460598 | 1x | 6.89 | A | unknown/not explicitly printed |
| PANIPURI 3X200G | 527362 | 1x | 5.99 | Z | unknown/not explicitly printed |
| BENYLIN 300ML | 617693 | 1x | 5.99 | A | unknown/not explicitly printed |
| SHEN DAN DUCK EGGS | 8523735 | 1x | 3.99 | Z | IRC SHEN DAN BOILE; 689761; `1.00-Z` |
| KS SALTED CASHEWS | 1671933 | 1x | 11.49 | A | unknown/not explicitly printed |
| KS SALTED CASHEWS | 1671933 | 1x | 11.49 | A | unknown/not explicitly printed |

The deductions each also show `1x` and a positive unit-price magnitude in the
middle column. Their rightmost tokens preserve a minus **between the amount
and letter**, not a standalone sign on the letter. Association with preceding
purchases is supported by adjacent placement and matching descriptions, and is
still flagged for review. The code alone is not a universal rule for a negative
amount. A/Z tax rates remain unresolved because no legend is visible and no
authoritative merchant key was found. `PANIPURI 3X200G` describes contents; its
purchased quantity is the separate `1x`. Pack size is not silently substituted.

The footer reads `**** TOTAL(INCL VAT)` and **74.57**. That establishes the final
total's stated inclusion of VAT, not whether each purchase row includes VAT.
The visible purchase magnitudes total 77.81; apparent deductions total 13.00,
leaving a computed 64.81. This is not labelled as a printed subtotal.

`scripts/monetary_audit.py` tests the explicitly hypothetical interpretation
A=20%, Z=0%, item prices exclusive of VAT, rounding once per code. It produces
A-net 48.84, Z-net 15.97, VAT 9.77 and final 74.58: **one penny above** the visible
74.57. The missing footer, rate key and rounding treatment need further evidence.
No amount, discount or rounding row was altered or invented to make it balance.

The source-checked assistant transcription is partial and has no independent
human verification. Missing values remain null, and raw codes/positions remain
in `manual-labels.jsonl` and merged `labels.jsonl`. This image guided development
and is excluded from the held-out evaluation group permanently.

The existing demo/correction fixture uses a different 176.78 total. Its demo
transcription was not used as ground truth for this 74.57 image.
