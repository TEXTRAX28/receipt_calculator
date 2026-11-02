import type { Adjustment, Receipt } from "./model";
import type { readFinancialSummary } from "./financial-basis";

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
    sourceIndices: section.map((row) => row.index),
    details,
    previous: { printedTax: receipt.printedTax, taxMode: receipt.taxMode },
  };
}
