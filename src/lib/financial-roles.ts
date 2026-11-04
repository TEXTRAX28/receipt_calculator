import type { Adjustment, Receipt } from "./model";
import type { readFinancialSummary } from "./financial-basis";
import type { parseReceiptWithSources } from "./parser";
import { money, SCALE, weight } from "./money";

type Section = NonNullable<ReturnType<typeof readFinancialSummary>>;
const labelKey = (text: string) => {
  const key = text
    .toUpperCase()
    .replace(/\d+(?:[.,]\d+)?\s*%/g, "")
    .replace(/[^A-Z0-9]/g, "");
  if (/^(?:SERVICE(?:CHARGE|FEE)?|SVC(?:CHRG|CHG)?)$/.test(key))
    return "SERVICE";
  return /^PB[IL]$/.test(key) ? "PB1" : key;
};

/** Propose literal summary roles, never amounts derived to make a bill balance.
 * The caller supplies one complete, strong, source-checked net-price section.
 * Unknown extra adjustments survive for review; genuine source tax codes block
 * replacing item-code calculation with a printed-tax proposal.
 */
export function recoverFinancialRoles(
  receipt: Receipt,
  section: Section,
  codedPurchasesSupported: boolean,
) {
  const taxes = section.filter((row) => row.role === "tax");
  if (taxes.length !== 1 || codedPurchasesSupported) return null;
  const taxesRow = taxes[0];
  const summaries = section.filter(
    (row) => row.role !== "subtotal" && row.role !== "total",
  );
  const keys = summaries.map((row) => labelKey(row.label));
  if (new Set(keys).size !== keys.length) return null;
  const matched = new Map<string, Adjustment | undefined>();
  for (const row of summaries) {
    const key = labelKey(row.label);
    const candidates = receipt.adjustments.filter(
      (adjustment) =>
        adjustment.kind !== "tax" && labelKey(adjustment.label) === key,
    );
    if (candidates.length > 1) return null;
    matched.set(key, candidates[0]);
  }
  const claimed = new Set(
    [...matched.values()].flatMap((row) => (row ? [row.id] : [])),
  );
  const adjustments = receipt.adjustments.filter(
    (row) => row.kind !== "tax" && !claimed.has(row.id),
  );
  const details: { label: string; value: string }[] = [];
  for (const row of summaries) {
    if (row.role === "subtotal" || row.role === "total") continue;
    const old =
      row.role === "tax"
        ? receipt.adjustments.find((entry) => entry.kind === "tax")
        : matched.get(labelKey(row.label));
    const amount =
      row.role === "discount" ? row.amount.replace(/^-/, "") : row.amount;
    const kind = row.role === "tax" ? "tax" : row.role;
    adjustments.push({
      id: old?.id || crypto.randomUUID(),
      label: row.label,
      kind,
      amount,
      allocation: old?.allocation || "proportional",
    });
    const prior = matched.get(labelKey(row.label));
    if (
      !old ||
      old.kind !== kind ||
      old.amount !== amount ||
      (prior && prior.kind !== kind)
    ) {
      details.push({
        label: `Printed ${row.label} (${kind})`,
        value: row.literal,
      });
      if (prior)
        details.push({
          label: `Previous ${prior.label} (${prior.kind})`.slice(0, 100),
          value: prior.amount,
        });
    }
  }
  // Do not turn a schema-valid model draft into an over-budget receipt.
  if (adjustments.length > 30) return null;
  const financial = (entries: Adjustment[]) =>
    entries
      .map(({ kind, amount, allocation }) => `${kind}:${amount}:${allocation}`)
      .sort();
  const changed =
    JSON.stringify(financial(adjustments)) !==
    JSON.stringify(financial(receipt.adjustments));
  if (
    !changed &&
    receipt.printedTax === taxesRow.amount &&
    receipt.taxMode === "printed"
  )
    return null;
  return {
    adjustments,
    printedTax: taxesRow.amount,
    taxMode: "printed" as const,
    sourceIndices: section.flatMap((row) => row.sourceIndices),
    details,
    previous: { printedTax: receipt.printedTax, taxMode: receipt.taxMode },
  };
}

/** Carry an existing invoice-source proposal, never independent model agreement.
 * The caller separately requires original vision scalar/basis agreement and
 * permits source recovery. This changes no amount, role, allocation or identity.
 */
export function proposeIncludedInvoiceFeeTax(
  receipt: Receipt,
  primary: ReturnType<typeof parseReceiptWithSources>,
) {
  const source = primary.receipt;
  const proposed = source.adjustments.filter(
    (row) => row.includedTaxRate !== undefined,
  );
  if (
    !proposed.length ||
    source.source !== "ocr" ||
    source.currencyUnresolved ||
    receipt.currencyUnresolved ||
    source.currency !== receipt.currency ||
    source.pricesIncludeTax ||
    receipt.pricesIncludeTax ||
    source.taxMode !== "printed" ||
    receipt.taxMode !== "printed" ||
    source.taxCodes.length ||
    receipt.taxCodes.length ||
    source.adjustments.filter((row) => row.kind === "tax").length !== 1 ||
    receipt.adjustments.filter((row) => row.kind === "tax").length !== 1 ||
    receipt.adjustments.some((row) => row.includedTaxRate !== undefined)
  )
    return null;
  try {
    for (const field of ["subtotal", "printedTax", "printedTotal"] as const)
      if (
        money(source[field], source.currency) !==
        money(receipt[field], receipt.currency)
      )
        return null;
    const financial = (rows: Adjustment[]) =>
      rows
        .map(
          (row) => `${row.kind}:${money(row.amount, receipt.currency, true)}`,
        )
        .sort();
    if (
      JSON.stringify(financial(source.adjustments)) !==
      JSON.stringify(financial(receipt.adjustments))
    )
      return null;
    const feeKey = (label: string) =>
      label
        .replace(/\s*\((?:incl(?:uding)?)\.?\s+(?:VAT|tax)\)\s*$/i, "")
        .toUpperCase()
        .replace(/[^\p{L}\p{N}]/gu, "");
    const adjustments = receipt.adjustments.map((row) => ({ ...row }));
    const indices = new Set<number>();
    const details: { label: string; value: string }[] = [];
    const claimed = new Set<string>();
    for (const row of proposed) {
      if (
        row.kind !== "fee" ||
        !row.includedTaxRate ||
        weight(row.includedTaxRate) > 100n * SCALE ||
        (primary.sources[row.id]?.length || 0) < 2
      )
        return null;
      const key = feeKey(row.label);
      const matches = adjustments.filter(
        (entry) =>
          entry.kind === "fee" &&
          feeKey(entry.label) === key &&
          money(entry.amount, receipt.currency) ===
            money(row.amount, source.currency),
      );
      if (!key || matches.length !== 1 || claimed.has(matches[0].id))
        return null;
      claimed.add(matches[0].id);
      matches[0].includedTaxRate = row.includedTaxRate;
      for (const index of [
        ...primary.sources[row.id],
        ...(primary.fieldSources.pricesIncludeTax || []),
        ...(primary.fieldSources.adjustments || []),
      ])
        indices.add(index);
      details.push({
        label: `Primary invoice fee: ${row.label}`.slice(0, 100),
        value:
          `${row.includedTaxRate}% included tax proposed on ${row.amount}; confirm the source.`.slice(
            0,
            80,
          ),
      });
    }
    return {
      adjustments,
      sourceIndices: [...indices].sort((a, b) => a - b),
      details,
    };
  } catch {
    return null;
  }
}
