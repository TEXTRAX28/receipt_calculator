import {
  receiptSchema,
  type Receipt,
  type ReceiptReviewField,
  type ReviewCheck,
} from "./model";
import type { EvidenceLine, SourceRecognition } from "./receipt-layout";
import { reviewKey } from "./review-checks";

/** Actual OCR scores flag review; they are not probabilities or source verification. */
export function reviewDeviceReading(
  receipt: Receipt,
  sources: Record<string, number[]>,
  lines: (EvidenceLine | null)[],
  recognition: SourceRecognition | undefined,
  fieldSources: Partial<Record<ReceiptReviewField, number[]>> = {},
  sourceConflicts: number[] = [],
  joinedSectionRows = 0,
) {
  const next = structuredClone(receipt),
    keys = new Set(next.reviewChecks.map(reviewKey));
  const add = (check: ReviewCheck) => {
    const key = reviewKey(check);
    const existing = next.reviewChecks.find(
      (entry) => reviewKey(entry) === key,
    );
    if (existing) {
      existing.confirmedValue = "";
      return;
    }
    if (!keys.has(key)) {
      keys.add(key);
      next.reviewChecks.push(check);
    }
  };
  const weak = (indices: number[]) =>
    !indices.length ||
    indices.some((index) => {
      const line = lines[index];
      if (!line || line.confidence < 0.75 || sourceConflicts.includes(index))
        return true;
      const panel = recognition?.panels.find(
        (panel) => panel.photo === line.photo && panel.part === line.part,
      );
      const words = panel?.words.filter((word) => {
        const x = (word.box[0] + word.box[2]) / 2,
          y = (word.box[1] + word.box[3]) / 2;
        return (
          x >= line.box[0] &&
          x <= line.box[2] &&
          y >= line.box[1] &&
          y <= line.box[3]
        );
      });
      return !words?.length || words.some((word) => word.confidence < 0.75);
    });
  let missing = false;
  for (const item of next.items) {
    const indices = sources[item.id] || [];
    if (!indices.length || indices.some((index) => !lines[index]))
      missing = true;
    if (!weak(indices)) continue;
    for (const field of [
      "description",
      "quantity",
      "unitPrice",
      "lineTotal",
      "discount",
      "taxCode",
    ] as const) {
      if (
        !item[field] ||
        (field === "discount" && /^0(?:\.0+)?$/.test(item[field]))
      )
        continue;
      add({
        scope: "item",
        itemId: item.id,
        field,
        reason: "source",
        other:
          "Some on-device words or source areas are uncertain. Check every value in this purchase against the photo.",
        confirmedValue: "",
      });
    }
  }
  if (missing || joinedSectionRows > 0 || sourceConflicts.length > 0)
    add({
      scope: "receipt",
      field: "items",
      reason: "source",
      other:
        "Check the complete purchase list against the photos, including section overlaps and purchases without matched source words.",
      confirmedValue: "",
    });
  for (const field of ["subtotal", "printedTax", "printedTotal"] as const)
    if (
      next[field] &&
      (weak(fieldSources[field] || []) ||
        (field === "printedTotal" &&
          next.warnings.some((warning) =>
            warning.startsWith("Different final totals"),
          )))
    )
      add({
        scope: "receipt",
        field,
        reason: "source",
        other:
          "The on-device amount or its source area needs a check against the receipt.",
        confirmedValue: "",
      });
  for (const field of ["taxCodes", "adjustments"] as const)
    if (next[field].length)
      add({
        scope: "receipt",
        field,
        reason: "source",
        other:
          "Confirm the printed codes, rates and charge/discount roles. Recognized text alone does not establish their meaning.",
        confirmedValue: "",
      });
  const explicitBasis = lines.filter(
    (line): line is EvidenceLine =>
      !!line &&
      /\b(?:item\s+)?prices?\s+(?:include|incl(?:uding)?|exclude|excl(?:uding)?)\b/i.test(
        line.text,
      ),
  );
  const expected = next.pricesIncludeTax
    ? /\bprices?\s+(?:include|incl(?:uding)?)\b/i
    : /\bprices?\s+(?:exclude|excl(?:uding)?)\b/i;
  if (
    explicitBasis.length !== 1 ||
    !expected.test(explicitBasis[0].text) ||
    weak([lines.indexOf(explicitBasis[0])])
  )
    add({
      scope: "receipt",
      field: "pricesIncludeTax",
      reason: "source",
      other:
        "Confirm whether printed item prices include tax. A total labelled including tax does not establish the item-price convention.",
      confirmedValue: "",
    });
  return receiptSchema.parse(next);
}
