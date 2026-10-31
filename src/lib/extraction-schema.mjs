import { z } from "zod";

// This module is shared by the browser and the local server. It contains no secrets.
const amount = z
  .string()
  .max(40)
  .regex(/^(?:[0-9]{1,12}(?:[.][0-9]{1,6})?)?$/);
const signedAmount = z
  .string()
  .max(40)
  .regex(/^(?:-?[0-9]{1,12}(?:[.][0-9]{1,6})?)?$/);
// Disjoint kinds keep negative values exclusive to an explicitly printed rounding row.
// A union emits anyOf, which is supported by the Gemini and local decoder schemas.
const adjustment = z.union([
  z.strictObject({
    label: z.string().max(100),
    kind: z.enum(["discount", "fee", "tip", "deposit"]),
    amount,
  }),
  z.strictObject({
    label: z.string().max(100),
    kind: z.enum(["rounding"]),
    amount: signedAmount,
  }),
]);
const code = z.string().max(12);
const photo = z.number().int().min(1).max(12);
export const aiReceiptSchema = z.strictObject({
  merchant: z.string().max(100),
  date: z.string().max(20),
  currency: z.enum([
    "",
    "GBP",
    "USD",
    "EUR",
    "CAD",
    "AUD",
    "NZD",
    "CHF",
    "SEK",
    "JPY",
    "KRW",
    "KWD",
    "BHD",
    "IDR",
    "TWD",
  ]),
  subtotal: amount,
  printedTotal: amount,
  printedTax: amount,
  pricesIncludeTax: z.boolean().nullable(),
  printedItemCount: z.number().int().min(0).max(300).nullable(),
  taxCodes: z.array(z.strictObject({ code, rate: amount })).max(20),
  items: z
    .array(
      z.strictObject({
        description: z.string().max(180),
        quantity: amount,
        unitPrice: amount,
        lineTotal: amount,
        discount: amount,
        taxCode: code,
        note: z.string().max(200),
        sourcePhotos: z.array(photo).min(1).max(12),
      }),
    )
    .max(300),
  adjustments: z.array(adjustment).max(30),
  warnings: z.array(z.string().max(350)).max(30),
});
// Keep decoding constraints small. Large nested array/numeric bounds can make
// Gemini reject or stall a request. The full strict Zod schema above is still
// applied to every returned result on the server and in the browser.
function compactProviderSchema(value) {
  if (Array.isArray(value)) return value.map(compactProviderSchema);
  if (!value || typeof value !== "object") return value;
  const localOnly = new Set([
    "$schema",
    "minItems",
    "maxItems",
    "minLength",
    "maxLength",
    "minimum",
    "maximum",
    "pattern",
  ]);
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !localOnly.has(key))
      .map(([key, child]) => [key, compactProviderSchema(child)]),
  );
}
export const aiReceiptJsonSchema = compactProviderSchema(
  z.toJSONSchema(aiReceiptSchema),
);
