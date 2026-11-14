# Receipt scanning and review

The React app imports images, renders PDFs in a bounded worker and prepares JPEG sections before scanning. The production entry point serves the build and the OpenAI adapter from a loopback-only Node server. The phone preview gates the same adapter behind TLS and a pairing code. Both modes use the same finite allowance when they share a server.

## Request and receipt validation

- The server validates the local host and POST origin, a custom request header, explicit upload and credit consent, JSON size and panel count. It checks canonical base64 and the JPEG envelope and dimensions before reserving an allowance slot. The browser also decodes the original image and checks its signature and dimensions.
- The adapter sends one request to the OpenAI Responses endpoint with a fixed model, strict structured output, store: false and an output limit. It rejects redirects, partial outputs, refusals, unexpected fields and source references to unsupplied photos. Provider error bodies are discarded. A failed request consumes its reservation and surfaces a recovery message.
- The server reads the OpenAI key from its environment or the ignored .env.local. The browser receives only the model and allowance status. Build output comes from the source and generated PDF assets. The static server exposes indexed build assets rather than serving repository files.
- VAT registration numbers remain text metadata. Only a printed tax amount or printed tax-code rates can affect the calculation. A read amount that repeats the registration number is cleared for review. Quantities and amounts are separate fields. When the complete receipt balances and a trustworthy quantity divides its line amount exactly, the displayed unit price is derived in minor units. The original read unit value remains available for review. An invalid field is focused on Continue, and amounts that fail reconciliation block the split.

## Final hands-on review

Scan the restaurant receipt on a desktop browser and an iPhone. Verify the registration number is separate from the tax amount, Tori Karaage has quantity 1, and the two ramen bowls show £18.60 each with a £37.20 line total. Check the names and £110.70 total against the photo. Then scan the two overlapping Costco images as one receipt. Compare all 18 purchases, discounts, £13.62 VAT and £176.78 final total with the originals.

On the iPhone, clear a quantity and tap Continue. The field should scroll into view and receive focus with an error. Correct it, split the bill and verify the shares sum to the receipt total. Check that cancelling a scan or encountering an error leaves the photos and manual entry available.

The synthetic tests verify the application and arithmetic paths. The real scans verify whether the model reads the photos accurately in the intended browser and network conditions.
