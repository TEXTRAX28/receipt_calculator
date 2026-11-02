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
// Ordinary negative adjustments need a signed return line, checked after parsing.
// A union emits anyOf, which is supported by the Gemini and local decoder schemas.
const adjustment = z.union([
  z.strictObject({
    label: z.string().max(100),
    kind: z.enum(["discount", "fee", "tip", "deposit"]),
    amount: signedAmount,
  }),
  z.strictObject({
    label: z.string().max(100),
    kind: z.enum(["rounding"]),
    amount: signedAmount,
  }),
]);
const code = z.string().max(12);
const photo = z.number().int().min(1).max(12);
const receiptStructure = z.strictObject({
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
  subtotal: signedAmount,
  printedTotal: signedAmount,
  printedTax: signedAmount,
  pricesIncludeTax: z.boolean().nullable(),
  printedItemCount: z.number().int().min(0).max(300).nullable(),
  taxCodes: z.array(z.strictObject({ code, rate: amount })).max(20),
  items: z
    .array(
      z.strictObject({
        description: z.string().max(180),
        quantity: amount,
        unitPrice: signedAmount,
        lineTotal: signedAmount,
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
function validateAdjustments(receipt, context) {
  const hasReturn = receipt.items.some((item) => {
    const value = item.lineTotal || item.unitPrice;
    return value.startsWith("-") && /[1-9]/.test(value);
  });
  if (!hasReturn)
    receipt.adjustments.forEach((entry, index) => {
      if (entry.kind !== "rounding" && entry.amount.startsWith("-"))
        context.addIssue({
          code: "custom",
          path: ["adjustments", index, "amount"],
          message:
            "A negative non-rounding adjustment needs an explicit returned item.",
        });
    });
}
export const aiReceiptSchema =
  receiptStructure.superRefine(validateAdjustments);

// Gemini can copy printed grouping despite the canonical request contract.
// Preserve these bounded literals as invalid financial inputs, never normalize
// them here. Quantities, tax rates, keys, photo references and bounds stay strict.
const groupedAmount = z
  .string()
  .max(40)
  .regex(/^[0-9]{1,3}(?:,[0-9]{3}){1,3}(?:[.][0-9]{1,6})?$/);
const groupedSignedAmount = z
  .string()
  .max(40)
  .regex(/^-?[0-9]{1,3}(?:,[0-9]{3}){1,3}(?:[.][0-9]{1,6})?$/);
const draftAmount = amount.or(groupedAmount);
const draftSignedAmount = signedAmount.or(groupedSignedAmount);
export const geminiReceiptDraftSchema = receiptStructure
  .extend({
    subtotal: draftSignedAmount,
    printedTotal: draftSignedAmount,
    printedTax: draftSignedAmount,
    items: z
      .array(
        receiptStructure.shape.items.element.extend({
          unitPrice: draftSignedAmount,
          lineTotal: draftSignedAmount,
          discount: draftAmount,
        }),
      )
      .max(300),
    adjustments: z
      .array(
        z.union([
          adjustment.options[0].extend({ amount: draftSignedAmount }),
          adjustment.options[1].extend({ amount: draftSignedAmount }),
        ]),
      )
      .max(30),
  })
  .superRefine(validateAdjustments);
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
  z.toJSONSchema(receiptStructure),
);
