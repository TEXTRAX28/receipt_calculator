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

function strongWords(line: EvidenceLine, recognition: Recognition) {
  if (line.confidence < 0.98) return false;
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
  return (
    words.length > 0 &&
    words.every((word) => word.confidence >= 0.98) &&
    words.map((word) => compact(word.text)).join("") === compact(line.text)
  );
}

/** Join only unpaired fragments. Geometry chooses the pair before any arithmetic.
 * Original lines/words stay untouched; consumers highlight both original indices.
 */
function financialEntries(
  lines: (EvidenceLine | null)[],
  recognition: Recognition,
) {
  const entries = lines.map((line, index) => ({
    line,
    sourceIndices: [index],
  }));
  // Optional recovery must stay bounded on a very large or hostile document.
  if (lines.length > 512) return entries;
  const headings = entries.filter(
    ({ line }) =>
      line &&
      labels.some(([, pattern]) => {
        const prefix = line.text.match(pattern);
        return (
          prefix &&
          /^\s*(?:\d+(?:[.,]\d+)?\s*%)?\s*:?\s*$/.test(
            line.text.slice(prefix[0].length),
          )
        );
      }),
  );
  const amounts = entries.filter(
    ({ line }) => line && /^[-−]?\d[\d., ]*-?$/.test(line.text.trim()),
  );
  const pairs = headings.map((heading) => ({
    heading,
    candidates: amounts.filter((amount) => {
      const left = heading.line!,
        right = amount.line!;
      if (left.photo !== right.photo || left.part !== right.part) return false;
      const panel = recognition.panels.find(
        (p) => p.photo === left.photo && p.part === left.part,
      );
      const overlap =
        Math.min(left.box[3], right.box[3]) -
        Math.max(left.box[1], right.box[1]);
      const height = Math.min(
        left.box[3] - left.box[1],
        right.box[3] - right.box[1],
      );
      return (
        !!panel &&
        height > 0 &&
        overlap >= height / 2 &&
        right.box[0] > left.box[0] &&
        (right.box[0] - left.box[2]) * panel.width >= -2 - 1e-6
      );
    }),
  }));
  const joined = new Map<number, (typeof entries)[number]>(),
    consumed = new Set<number>();
  for (const { heading, candidates } of pairs) {
    if (candidates.length !== 1) continue;
    const amount = candidates[0];
    if (pairs.filter((pair) => pair.candidates.includes(amount)).length !== 1)
      continue;
    const indices = [heading.sourceIndices[0], amount.sourceIndices[0]].sort(
      (a, b) => a - b,
    );
    if (indices[1] - indices[0] !== 1) continue;
    const left = heading.line!,
      right = amount.line!;
    const line: EvidenceLine = {
      ...left,
      text: `${left.text} ${right.text}`,
      confidence: Math.min(left.confidence, right.confidence),
      box: [
        Math.min(left.box[0], right.box[0]),
        Math.min(left.box[1], right.box[1]),
        Math.max(left.box[2], right.box[2]),
        Math.max(left.box[3], right.box[3]),
      ],
    };
    if (
      !strongWords(left, recognition) ||
      !strongWords(right, recognition) ||
      !strongWords(line, recognition)
    )
      continue;
    joined.set(indices[0], { line, sourceIndices: indices });
    consumed.add(indices[1]);
  }
  return entries.flatMap((entry, index) =>
    consumed.has(index) ? [] : [joined.get(index) || entry],
  );
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
  const rows = financialEntries(lines, recognition).map(
    ({ line, sourceIndices }) => {
      if (!line) return null;
      const row = matchFinancialSummaryRow(line.text);
      if (!row || !strongWords(line, recognition)) return null;
      try {
        const amount = printedAmount(row.literal, { currency });
        const value = money(amount, currency, true);
        if (value < 0n && row.role !== "rounding" && row.role !== "discount")
          return null;
        return {
          ...row,
          amount,
          value,
          index: sourceIndices[0],
          sourceIndices,
          line,
        };
      } catch {
        return null;
      }
    },
  );
  const candidates = [];
  for (const [start, first] of rows.entries()) {
    if (!first || first.role !== "subtotal" || first.value <= 0n) continue;
    const end = rows.findIndex(
      (row, index) => index > start && row?.role === "total",
    );
    if (end < 0 || Math.max(...rows[end]!.sourceIndices) - first.index > 12)
      continue;
    const section = rows.slice(start, end + 1);
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
        sourceIndices: section.flatMap((row) => row.sourceIndices),
        rows: section.map(({ label, literal }) => ({ label, literal })),
      }
    : null;
}
