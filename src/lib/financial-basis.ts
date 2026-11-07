import type { Currency } from "./model";
import { money } from "./money";
import { printedAmount } from "./printed-amount";
import type { EvidenceLine, SourceRecognition } from "./receipt-layout";
import { findTaxRegistrations, isTaxRegistrationLine } from "./receipt-roles";

const labels = [
  ["subtotal", /^(?:sub[-\s]?total|subttl)\b/i],
  [
    "tax",
    /^(?:(?:sales\s+|restaurant\s+)?tax|vat|gst|hst|pst|pb1|pajak\s+restoran)(?:\s+amount)?\b/i,
  ],
  ["fee", /^(?:service(?:\s+charge)?|svc\s+(?:chrg|chg)|fee)\b/i],
  ["discount", /^(?:discount|disc)\b/i],
  ["rounding", /^rounding\b/i],
  [
    "total",
    /^(?:grand\s+total|total(?:\s+to\s+pay)?|amount\s+due|balance\s+due|due)\b/i,
  ],
] as const;
const compact = (text: string) => text.replace(/\s/g, "");
const financialText = (text: string) => text.replace(/^(?:\*+\s+)+/u, "");
const informationalTotal =
  /^total\s+(?:tax\b|number\s+of\s+items\b|items?\b|savings\b)/i;
const amountOnly = /^[-−]?\d[\d., ]*-?$/;
function headingRole(text: string) {
  text = financialText(text);
  if (isTaxRegistrationLine(text)) return undefined;
  return labels.find(([, pattern]) => {
    const prefix = text.match(pattern);
    return (
      prefix &&
      /^\s*(?:\d+(?:[.,]\d+)?\s*%)?\s*:?\s*$/.test(text.slice(prefix[0].length))
    );
  })?.[0];
}
type FinancialEntry = {
  line: EvidenceLine | null;
  sourceIndices: number[];
  wordsVerified?: boolean;
};

/** Printed roles and tokens only; no confidence or arithmetic is inferred here. */
export function matchFinancialSummaryRow(text: string, currency?: Currency) {
  text = financialText(text);
  if (isTaxRegistrationLine(text, currency)) return null;
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

function strongWords(line: EvidenceLine, recognition: SourceRecognition) {
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
  if (words.map((word) => compact(word.text)).join("") !== compact(line.text))
    return false;
  // Only standalone leading asterisk words can explain a weak decorated row.
  // Labels, signs and monetary words retain the same 0.98 threshold.
  const title = financialText(line.text);
  let first = 0;
  if (title !== line.text)
    while (first < words.length && /^\*+$/u.test(words[first].text)) first++;
  const financialWords = words.slice(first);
  return (
    (line.confidence >= 0.98 || first > 0) &&
    financialWords.length > 0 &&
    financialWords.every((word) => word.confidence >= 0.98) &&
    financialWords.map((word) => compact(word.text)).join("") === compact(title)
  );
}

/** A slanted footer can put a value on the neighbouring OCR line. Recover only
 * an isolated, complete two-column section. Order and geometry choose all pairs
 * before parsing money; neither balance nor a model draft chooses an amount.
 */
function financialColumns(
  lines: (EvidenceLine | null)[],
  recognition: SourceRecognition,
): FinancialEntry[] | null {
  if (
    lines.length > 512 ||
    recognition.panels.reduce((sum, panel) => sum + panel.words.length, 0) >
      4000
  )
    return null;
  const proposals: FinancialEntry[][] = [];
  const cy = (word: { box: EvidenceLine["box"] }) =>
    (word.box[1] + word.box[3]) / 2;
  for (const panel of recognition.panels) {
    const headings = panel.words
      .filter((word) => headingRole(word.text))
      .sort((a, b) => cy(a) - cy(b));
    const starts = headings.filter(
      (word) => headingRole(word.text) === "subtotal",
    );
    const ends = headings.filter((word) => headingRole(word.text) === "total");
    if (starts.length !== 1 || ends.length !== 1) continue;
    const selected = headings.filter(
      (word) => cy(word) >= cy(starts[0]) && cy(word) <= cy(ends[0]),
    );
    if (selected.length < 4 || selected.length > 8) continue;
    const heights = selected
      .map((word) => word.box[3] - word.box[1])
      .sort((a, b) => a - b);
    const middle = Math.floor(heights.length / 2);
    const height =
      (heights[middle] + heights[Math.floor((heights.length - 1) / 2)]) / 2;
    if (height <= 0) continue;
    const band = panel.words.filter(
      (word) =>
        cy(word) >= cy(starts[0]) - height && cy(word) <= cy(ends[0]) + height,
    );
    const amounts = band
      .filter((word) => amountOnly.test(word.text.trim()))
      .sort((a, b) => cy(a) - cy(b));
    if (
      amounts.length !== selected.length ||
      band.length !== selected.length + amounts.length ||
      band.some((word) => word.confidence < 0.98) ||
      Math.min(...amounts.map((word) => word.box[0])) <=
        Math.max(...selected.map((word) => word.box[2]))
    )
      continue;
    const offsets = selected.map(
      (word, index) => cy(amounts[index]) - cy(word),
    );
    if (
      offsets.some((offset) => Math.abs(offset) > height) ||
      Math.max(...offsets) - Math.min(...offsets) > height / 4 ||
      [selected, amounts].some((column) =>
        column.some(
          (word, index) =>
            index > 0 && cy(word) - cy(column[index - 1]) < height / 2,
        ),
      )
    )
      continue;
    const sources = band.map((word) => {
      const x = (word.box[0] + word.box[2]) / 2,
        y = cy(word);
      return lines.flatMap((line, index) =>
        line &&
        line.photo === panel.photo &&
        line.part === panel.part &&
        x >= line.box[0] &&
        x <= line.box[2] &&
        y >= line.box[1] &&
        y <= line.box[3] &&
        compact(line.text).includes(compact(word.text))
          ? [index]
          : [],
      );
    });
    if (sources.some((indices) => indices.length !== 1)) continue;
    const indices = [...new Set(sources.flat())].sort((a, b) => a - b);
    if (
      indices.at(-1)! - indices[0] > 12 ||
      indices.some((index, offset) => index !== indices[0] + offset) ||
      indices.some((index) => {
        const line = lines[index]!;
        const words = band
          .filter((_, word) => sources[word][0] === index)
          .sort((a, b) => a.box[0] - b.box[0]);
        return (
          line.confidence < 0.98 ||
          words.map((word) => compact(word.text)).join("") !==
            compact(line.text)
        );
      })
    )
      continue;
    const recovered = selected.map((heading, index): FinancialEntry => {
      const amount = amounts[index];
      return {
        sourceIndices: [
          ...new Set([
            sources[band.indexOf(heading)][0],
            sources[band.indexOf(amount)][0],
          ]),
        ].sort((a, b) => a - b),
        // This proof is constructed here from literal raw words, never accepted
        // from a provider flag. A union rectangle may include neighbouring rows.
        wordsVerified: true,
        line: {
          photo: panel.photo,
          part: panel.part,
          text: `${heading.text} ${amount.text}`,
          confidence: Math.min(heading.confidence, amount.confidence),
          box: [
            Math.min(heading.box[0], amount.box[0]),
            Math.min(heading.box[1], amount.box[1]),
            Math.max(heading.box[2], amount.box[2]),
            Math.max(heading.box[3], amount.box[3]),
          ],
        },
      };
    });
    proposals.push(
      lines.flatMap((line, index) =>
        index === indices[0]
          ? recovered
          : indices.includes(index)
            ? []
            : [{ line, sourceIndices: [index] }],
      ),
    );
  }
  return proposals.length === 1 ? proposals[0] : null;
}

/** Prefer complete word columns, then uniquely pair unjoined fragments.
 * Geometry chooses the pairs before any arithmetic.
 * Original lines/words stay untouched; consumers highlight both original indices.
 */
function financialEntries(
  lines: (EvidenceLine | null)[],
  recognition: SourceRecognition,
): FinancialEntry[] {
  const columns = financialColumns(lines, recognition);
  if (columns) return columns;
  const entries = lines.map((line, index) => ({
    line,
    sourceIndices: [index],
  }));
  // Optional recovery must stay bounded on a very large or hostile document.
  if (lines.length > 512) return entries;
  const headings = entries.filter(({ line }) => line && headingRole(line.text));
  const amounts = entries.filter(
    ({ line }) => line && amountOnly.test(line.text.trim()),
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
  recognition: SourceRecognition,
  currency: Currency,
) {
  const registrations = findTaxRegistrations(
    lines.map((line) => line?.text || ""),
    currency,
  );
  const rows = financialEntries(lines, recognition).map(
    ({ line, sourceIndices, wordsVerified }) => {
      if (
        !line ||
        sourceIndices.some((index) => registrations.indices.has(index))
      )
        return null;
      const row = matchFinancialSummaryRow(line.text, currency);
      if (!row || (!wordsVerified && !strongWords(line, recognition)))
        return null;
      try {
        const amount = printedAmount(row.literal, { currency });
        const value = money(amount, currency, true);
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
    if (!first || first.role !== "subtotal" || first.value === 0n) continue;
    const direction = first.value < 0n ? -1n : 1n;
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
    if (!taxes.length || taxes.some((row) => row.value * direction <= 0n))
      continue;
    const last = known.at(-1)!;
    if (
      last.value * direction <= 0n ||
      known.some((row) => row.role === "fee" && row.value * direction < 0n) ||
      // Refund discount conventions differ. Do not invent a coupon reversal.
      (direction < 0n && known.some((row) => row.role === "discount"))
    )
      continue;
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
    (line) => line && labels[0][1].test(financialText(line.text)),
  ).length;
  const totalCount = lines.filter(
    (line) =>
      line &&
      labels[5][1].test(financialText(line.text)) &&
      !informationalTotal.test(financialText(line.text)),
  ).length;
  return candidates.length === 1 && subtotalCount === 1 && totalCount === 1
    ? candidates[0]
    : null;
}

export function recoverExclusivePriceBasis(
  lines: (EvidenceLine | null)[],
  recognition: SourceRecognition,
  currency: Currency,
) {
  const section = readFinancialSummary(lines, recognition, currency);
  return section
    ? {
        sourceIndices: [
          ...new Set(section.flatMap((row) => row.sourceIndices)),
        ],
        rows: section.map(({ label, literal }) => ({ label, literal })),
      }
    : null;
}
