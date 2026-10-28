import { calculateSplit } from "./engine";
import type { AppState } from "./model";
import { formatMoney } from "./money";
export function readableSummary(state: AppState): string {
  const result = calculateSplit(state);
  const f = (n: bigint) => formatMoney(n, state.receipt.currency);
  const lines = [
    "GATHER · SHARED SHOPPING",
    state.receipt.merchant,
    state.receipt.date || "Date not supplied",
    `Currency: ${state.receipt.currency}`,
    result.canFinalize ? "Checked split" : "DRAFT — unresolved details remain",
    "",
    `Receipt total: ${f(result.receipt.total)}`,
    `Mode: ${state.splitMode === "whole" ? "Whole receipt" : "Item assignments"}`,
    "",
  ];
  result.totals.forEach((entry, i) => {
    lines.push(`${entry.person.name} (person ${i + 1}): ${f(entry.total)}`);
    entry.lines.forEach((line) => {
      lines.push(`  ${line.label}: ${f(line.amount)} · ${line.detail}`);
      lines.push(
        `    Base after discounts ${f(line.net)}; added tax ${f(line.tax)}; other adjustments ${f(line.charges)}${line.rounding ? `; allocation rounding ${f(line.rounding)}` : ""}`,
      );
    });
    lines.push("");
  });
  lines.push(
    `Allocated: ${f(result.assignedTotal)}`,
    "Rounding: largest remainder for each item final cost (or whole receipt); ties follow receipt item order, then person creation order. Component rounding is disclosed separately and nets to zero across people.",
    "Receipt discounts are proportional to item costs before added tax. Proportional charges follow item ownership. Equal-per-person charges are shared by everyone.",
    "Amounts are purchase-cost shares. No reimbursement direction or original payer has been inferred.",
  );
  return lines.join("\n");
}
