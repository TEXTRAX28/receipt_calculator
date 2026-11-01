// Research only: fixed-position items reduce repeated output keys, not evidence.
import { z } from "zod";
import { aiReceiptSchema } from "../../src/lib/extraction-schema.mjs";
import { RECEIPT_INSTRUCTIONS } from "../../server/extraction-instructions.mjs";

export const itemFields = [
  "description",
  "quantity",
  "unitPrice",
  "lineTotal",
  "taxCode",
  "discount",
  "sourcePhotos",
];
const shape = aiReceiptSchema.shape;
const item = shape.items.element.shape;
const tuple = z.tuple(itemFields.map((field) => item[field]));
export const compactVisionSchema = z.strictObject({
  ...shape,
  items: z.array(tuple).max(300),
  warnings: shape.warnings.max(4),
});
export const compactVisionJsonSchema = z.toJSONSchema(compactVisionSchema);
// The pinned native parser chooses `items` before `prefixItems` and rejects a
// boolean schema. With exactly seven prefix fields and min=max=7, items:false
// is redundant: removing it preserves the accepted JSON values and lets that
// parser compile its strict seven-position tuple. Zod still checks every result.
const nativeTuple = compactVisionJsonSchema.properties.items.items;
if (
  nativeTuple.items !== false ||
  nativeTuple.prefixItems.length !== 7 ||
  nativeTuple.minItems !== 7 ||
  nativeTuple.maxItems !== 7
)
  throw new Error("The fixed native tuple contract changed");
delete nativeTuple.items;
export const compactVisionPrompt =
  RECEIPT_INSTRUCTIONS +
  `
LOCAL OUTPUT FORMAT: Only the representation of items changes. Each item is a fixed seven-element JSON array in this exact order:
[description, quantity, unitPrice, lineTotal, taxCode, discount, sourcePhotos].
For example ["Printed product", "1", "3.99", "3.99", "A", "0", [1]]. The example is format guidance, never source data.
Use the same printed evidence and empty-string rules for every field. Keep all real purchases and all required receipt fields. sourcePhotos is an array of original photo numbers. Do not output item objects or an item note. Do not shorten descriptions, omit fields, infer missing amounts or change any amount to make a balance. All other receipt fields keep their ordinary object structure.`;

/** Lossless representation expansion only; full original financial validation follows. */
export function expandCompactVision(value) {
  const parsed = compactVisionSchema.parse(value);
  return aiReceiptSchema.parse({
    ...parsed,
    items: parsed.items.map((values) => ({
      ...Object.fromEntries(
        itemFields.map((field, index) => [field, values[index]]),
      ),
      note: "",
    })),
  });
}
