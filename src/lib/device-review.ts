import {
  receiptSchema,
  type Receipt,
  type ReceiptReviewField,
  type ReviewCheck,
} from "./model";
import type { EvidenceLine, SourceRecognition } from "./receipt-layout";
import { reviewKey } from "./review-checks";
import { readFinancialSummary } from "./financial-basis";
import { recoverFinancialRoles } from "./financial-roles";
import type { parseReceiptWithSources } from "./parser";

/** Propose separately printed tax from a complete, strong source section.
 * Amounts and item codes stay literal. This never confirms a financial field.
 */
export function recoverDeviceFinancialSummary(
  parsed: ReturnType<typeof parseReceiptWithSources>,
  lines: (EvidenceLine | null)[],
  recognition: SourceRecognition | undefined,
  sourceConflicts: number[] = [],
) {
  const receipt = parsed.receipt;
  if (
    !recognition ||
    receipt.currencyUnresolved ||
    sourceConflicts.length ||
    receipt.taxCodes.some((code) => code.rate.trim()) ||
    lines.some(
      (line) =>
        line &&
        /\b(?:includ|inclus|exclud|exclus|excl)[a-z]*\b/i.test(line.text),
    )
  )
    return parsed;
  const section = readFinancialSummary(lines, recognition, receipt.currency);
  if (!section) return parsed;
  for (const [field, role] of [
    ["subtotal", "subtotal"],
    ["printedTax", "tax"],
    ["printedTotal", "total"],
  ] as const) {
    const rows = section.filter((row) => row.role === role);
    if (
      rows.length !== 1 ||
      rows[0].amount !== receipt[field] ||
      !rows[0].sourceIndices.some((index) =>
        parsed.fieldSources[field]?.includes(index),
      )
    )
      return parsed;
  }
  if (
    section[0].value < 0n &&
    !receipt.items.some(
      (item) =>
        item.lineTotal.startsWith("-") &&
        parsed.sources[item.id]?.some((index) => lines[index]),
    )
  )
    return parsed;
  // Conflicting existing charges remain for the user; don't replace an amount
  // that differs from the literal summary, even when a replacement would close.
  const taxRow = section.find((row) => row.role === "tax")!;
  if (
    receipt.adjustments.some(
      (row) => row.kind === "tax" && row.amount !== taxRow.amount,
    )
  )
    return parsed;
  const proposal = recoverFinancialRoles(receipt, section, false);
  const basisOnly =
    receipt.pricesIncludeTax &&
    receipt.taxMode === "printed" &&
    receipt.adjustments.filter((row) => row.kind === "tax").length === 1;
  if (!proposal && !basisOnly) return parsed;
  const next = structuredClone(parsed);
  next.receipt.pricesIncludeTax = false;
  if (proposal) {
    next.receipt.taxMode = proposal.taxMode;
    next.receipt.printedTax = proposal.printedTax;
    next.receipt.adjustments = proposal.adjustments;
  }
  const indices = [
    ...new Set(section.flatMap((row) => row.sourceIndices)),
  ].sort((a, b) => a - b);
  for (const field of [
    "pricesIncludeTax",
    "taxCodes",
    "adjustments",
  ] as const) {
    next.fieldSources[field] = [
      ...new Set([...(next.fieldSources[field] || []), ...indices]),
    ].sort((a, b) => a - b);
    const check: ReviewCheck = {
      scope: "receipt",
      field,
      reason: "recovered",
      confirmedValue: "",
      other:
        "Printed subtotal, separately added tax and total supplied this interpretation. Check the source before confirming.",
      details: [
        {
          label: "Previous item prices",
          value: receipt.pricesIncludeTax ? "Include tax" : "Exclude tax",
        },
        { label: "Previous tax calculation", value: receipt.taxMode },
        ...section.map((row) => ({
          label: row.label.slice(0, 100),
          value: row.literal.slice(0, 80),
        })),
      ],
    };
    const old = next.receipt.reviewChecks.findIndex(
      (entry) => reviewKey(entry) === reviewKey(check),
    );
    if (old < 0) next.receipt.reviewChecks.push(check);
    else next.receipt.reviewChecks[old] = check;
  }
  for (const adjustment of next.receipt.adjustments) {
    const row = section.find(
      (row) =>
        row.label === adjustment.label &&
        row.role === adjustment.kind &&
        row.amount === adjustment.amount,
    );
    if (row) next.sources[adjustment.id] = [...row.sourceIndices];
  }
  const validated = receiptSchema.safeParse(next.receipt);
  return validated.success ? { ...next, receipt: validated.data } : parsed;
}

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
