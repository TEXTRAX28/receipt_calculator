# Sources, permissions and collection gaps

Checked 29 October 2026. Image permissions are recorded per file in
`manifest.jsonl`; repository software licences were not used as substitutes.
Images remain local and ignored by Git. Attribution and change notices travel
with each manifest entry.

| Source | Financial receipts | Permission evidence | Suitability |
|---|---:|---|---|
| [CORD v2, NAVER CLOVA](https://huggingface.co/datasets/naver-clova-ix/cord-v2) | 44 | Publisher's dataset card explicitly declares CC BY 4.0; [licence terms](https://creativecommons.org/licenses/by/4.0/) | Indonesian paper receipts; shops/restaurants, quantities, discounts, service/tax and rounding |
| [Costco Taiwan 2012 paper invoice](https://commons.wikimedia.org/wiki/File:Costco_Xizhi_Store_uniform_invoice_20121104.jpg) | 1 | Solomon203, CC BY-SA 3.0 | Aggregate fiscal receipt, no item descriptions |
| [Costco Taiwan 2017 paper invoice](https://commons.wikimedia.org/wiki/File:Costco_Xizhi_Store_uniform_invoice_20170303.jpg) | 1 | Solomon203, CC BY-SA 4.0 | Landscape paper invoice; sale and credit rows |
| [Costco Taiwan 2015 printed e-invoice](https://commons.wikimedia.org/wiki/File:Costco_Xizhi_Store_e-invoice_20151020.jpg) | 1 | Solomon203, CC BY-SA 4.0 | Paper certificate photographed on wood; physical origin |
| [Costco Taiwan 2018 printed e-invoice](https://commons.wikimedia.org/wiki/File:Costco_Xizhi_Store_e-invoice_20180210.jpg) | 1 | Solomon203, CC BY-SA 4.0 | Sideways paper certificate with QR codes; physical origin |
| [Tesco Finchley 1994](https://commons.wikimedia.org/wiki/File:Tesco_grocery_receipt_Finchley_1994.jpg) | 1 | Commons declares factual receipt PD-ineligible; author Tesco, scan contributor Philafrenzy | UK/GBP, faded scan with reduced-price rows; historical layout |
| User's Bristol Costco photograph | 1 | User authorised local development/evaluation; no redistribution licence | UK/GBP, repeated items, quantities and separate apparent deductions |

CORD's [creator documentation](https://github.com/clovaai/cord) describes the
released 1,000-example sample (800 train / 100 validation / 100 test), OCR word
boxes/text and hierarchical semantic labels. The larger collection described
in the paper is not the public 1,000-example release. Published store/payment
semantic classes were removed; merchant/date identifiers are not invented here.
CORD supplies neither Costco nor digital/UK coverage for this pilot. Item
metrics use its top-level menu groups; nested submenus remain raw evidence and
are not silently promoted to additional purchases.

CORD attribution: NAVER CLOVA; Seunghyun Park et al., *CORD: A Consolidated
Receipt Dataset for Post-OCR Parsing*, NeurIPS Document Intelligence Workshop,
2019. Files here are Hugging Face viewer JPEG renditions, not untouched parquet
image bytes. No local edits were made to receipt files. The two rate-limited
Commons originals (Tesco and photo acknowledgement) were retrieved as standard
thumbnail renditions and identified as resized in the manifest.

The [Costco photo-department receipt](https://commons.wikimedia.org/wiki/File:TW_Costco_Photo_receipt_20130612.jpg)
is a licensed Solomon203 CC BY-SA 3.0 photo of an order/collection acknowledgement.
It has no purchase price or total and is retained as one **excluded control**.
It does not increase the 50 financial-receipt count. Share-alike obligations
apply when distributing adaptations of the relevant CC BY-SA images.

## Investigated sources not collected

| Source | Finding and disposition |
|---|---|
| [Official SROIE tasks](https://rrc.cvc.uab.es/?ch=13&com=tasks) | Scanned receipts with OCR boxes/transcripts; key-information targets are company, date, address and total. No full item/discount ground truth is promised. Original image reuse rights for this app were not established; no files downloaded. Some direct portal requests returned 502, although its official task description was available through search. A mirror's CC licence is insufficient evidence of the original image rights. |
| [UK Costco receipt discussion](https://www.reddit.com/r/CostcoUK/comments/1r5lmjj/struggling_to_make_sense_of_receipt_first_time/) | Relevant A/Z and deduction discussion, with no established image reuse permission. Research link only; comments are anecdotal and do not authenticate Costco's code mapping. |
| [Bandcamp email-receipt screenshot](https://commons.wikimedia.org/wiki/File:Example_of_digital_receipt_at_Bandcamp.webp) | Described as an actual album purchase. Screenshot metadata declares public domain, but the included album artwork has no established reuse licence. Research link only; no image downloaded or counted. |
| [Costco's online receipt instructions](https://customerservice.costco.com/app/answers/answer_view/a_id/758/) | Confirms that US online customers can retrieve order invoices. This is not a licence to copy another customer's receipt, and supplies no public evaluation image. |

Genuine Costco digital and other-retailer digital examples remain **zero**.
There are no receipt PDFs, confirmed returns or weighted-product examples in
this pilot. Modern UK receipts are poorly represented: one Costco photo and
one historical Tesco scan, both development data. Taiwan certificates cannot
substitute for UK Costco itemised receipts. The next collection should use
permissioned contemporary UK/GBP transactions, complete footer photographs and
real electronic exports, including returns and weighed goods. Matching physical
and electronic versions must share a transaction group.

## Code and currency evidence

[HMRC's VAT rates](https://www.gov.uk/vat-rates) list the standard 20% and zero 0%
rates. This does not establish the retailer-specific A/Z mapping. No
authoritative Costco UK key was located, and the original photo omits its tax
legend. A, Z, -A and -Z remain exact raw evidence with review flags.

Currency precision is checked against [SIX's ISO 4217 List One](https://www.six-group.com/dam/download/financial-information/data-center/iso-currrency/lists/list-one.xml).
The checked subset and source checksum are saved in
`evaluation/currency-rules-evidence.json`. GBP/IDR/TWD use two minor-unit digits;
printed integer rupiah are whole major units. JPY uses zero, KWD/BHD three.
