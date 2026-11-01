import { z } from "zod";
import { aiReceiptSchema } from "../src/lib/extraction-schema.mjs";
import { RECEIPT_INSTRUCTIONS } from "./extraction-instructions.mjs";

// Fixed positions preserve every item value while avoiding repeated output keys.
export const compactItemFields = Object.freeze([
  "description",
  "quantity",
  "unitPrice",
  "lineTotal",
  "taxCode",
  "discount",
  "sourcePhotos",
]);
const shape = aiReceiptSchema.shape;
const item = shape.items.element.shape;
const tuple = z.tuple(compactItemFields.map((field) => item[field]));
const compactSchema = z.strictObject({
  ...shape,
  items: z.array(tuple).max(300),
  warnings: shape.warnings.max(4),
});
export const compactVisionJsonSchema = z.toJSONSchema(compactSchema);
const nativeTuple = compactVisionJsonSchema.properties.items.items;
// b11960 chooses items before prefixItems and rejects boolean schemas. This
// redundant keyword can be removed only from this fixed seven-position tuple.
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

/** Expand representation without interpreting or recalculating any amount. */
export function expandCompactVision(value) {
  const parsed = compactSchema.parse(value);
  return aiReceiptSchema.parse({
    ...parsed,
    items: parsed.items.map((values) => ({
      ...Object.fromEntries(
        compactItemFields.map((field, index) => [field, values[index]]),
      ),
      note: "",
    })),
  });
}
