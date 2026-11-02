import type { Currency } from "./model";
import { money } from "./money";
import { printedAmount } from "./printed-amount";
import type { EvidenceLine, Recognition } from "./receipt-layout";

const labels = [
  ["subtotal", /^(?:sub[-\s]?total|subttl)\b/i],
  [
    "tax",
    /^(?:(?:sales\s+|restaurant\s+)?tax|vat|gst|hst|pst|pb1|pajak\s+restoran)\b/i,
  ],
  ["fee", /^(?:service(?:\s+charge)?|svc\s+(?:chrg|chg)|fee)\b/i],
  ["discount", /^(?:discount|disc)\b/i],
  ["rounding", /^rounding\b/i],
  ["total", /^(?:grand\s+total|total|amount\s+due|balance\s+due|due)\b/i],
] as const;
const compact = (text: string) => text.replace(/\s/g, "");

/** Printed roles and tokens only; no confidence or arithmetic is inferred here. */
export function matchFinancialSummaryRow(text: string) {
  const role = labels.find(([, pattern]) => pattern.test(text));
  if (!role) return null;
  const prefix = text.match(role[1])![0];
  const suffix = text
    .slice(prefix.length)
    .match(/^\s*(?:\d+(?:[.,]\d+)?\s*%)?\s*:?\s*([-−]?\d[\d., ]*-?)\s*$/);
  return suffix
    ? { role: role[0], label: prefix, literal: suffix[1].trim() }
    : null;
}

/** A source-layout proposal, never independent model agreement or a confirmed bill.
 * Every amount is printed. Arithmetic only rejects inconsistent interpretations;
 * it cannot supply a missing amount, row, rate or adjustment.
 */
export function readFinancialSummary(
  lines: (EvidenceLine | null)[],
  recognition: Recognition,
  currency: Currency,
) {
  const rows = lines.map((line, index) => {
    if (!line || line.confidence < 0.98) return null;
    const row = matchFinancialSummaryRow(line.text);
    if (!row) return null;
    const panel = recognition.panels.find(
      (panel) => panel.photo === line.photo && panel.part === line.part,
    );
    const words = (panel?.words || [])
      .filter((word) => {
        const x = (word.box[0] + word.box[2]) / 2,
          y = (word.box[1] + word.box[3]) / 2;
        return (
          x >= line.box[0] &&
          x <= line.box[2] &&
          y >= line.box[1] &&
          y <= line.box[3]
        );
      })
      .sort((a, b) => a.box[0] - b.box[0]);
    if (
      !words.length ||
      words.some((word) => word.confidence < 0.98) ||
      words.map((word) => compact(word.text)).join("") !== compact(line.text)
    )
      return null;
    try {
      const amount = printedAmount(row.literal, { currency });
      const value = money(amount, currency, true);
      if (value < 0n && row.role !== "rounding" && row.role !== "discount")
        return null;
      return { ...row, amount, value, index, line };
    } catch {
      return null;
    }
  });
  const candidates = [];
  for (const first of rows) {
    if (!first || first.role !== "subtotal" || first.value <= 0n) continue;
    const end = rows.findIndex(
      (row, index) => index > first.index && row?.role === "total",
    );
    if (end < 0 || end - first.index > 12) continue;
    const section = rows.slice(first.index, end + 1);
    if (
      section.some(
        (row) =>
          !row ||
          row.line.photo !== first.line.photo ||
          row.line.part !== first.line.part,
      )
    )
      continue;
    const known = section.filter((row) => row !== null);
    if (known.filter((row) => row.role === "subtotal").length !== 1) continue;
    const taxes = known.filter((row) => row.role === "tax");
    if (!taxes.length || taxes.some((row) => row.value <= 0n)) continue;
    const last = known.at(-1)!;
    const expected = known
      .slice(1, -1)
      .reduce(
        (sum, row) =>
          sum +
          (row.role === "discount"
            ? -(row.value < 0n ? -row.value : row.value)
            : row.value),
        first.value,
      );
    if (expected !== last.value || last.value === first.value) continue;
    candidates.push(known);
  }
  // Multiple sections can be separate bills or overlapping photos. Do not choose
  // the one that happens to balance, or turn unclear source rows into absence.
  const subtotalCount = lines.filter(
    (line) => line && labels[0][1].test(line.text),
  ).length;
  const totalCount = lines.filter(
    (line) => line && labels[5][1].test(line.text),
  ).length;
  return candidates.length === 1 && subtotalCount === 1 && totalCount === 1
    ? candidates[0]
    : null;
}

export function recoverExclusivePriceBasis(
  lines: (EvidenceLine | null)[],
  recognition: Recognition,
  currency: Currency,
) {
  const section = readFinancialSummary(lines, recognition, currency);
  return section
    ? {
        sourceIndices: section.map((row) => row.index),
        rows: section.map(({ label, literal }) => ({ label, literal })),
      }
    : null;
}
