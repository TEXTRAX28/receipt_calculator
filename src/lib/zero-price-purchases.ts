import { newItem, type Item } from "./model";
import { isFinalTotal, type parseReceiptWithSources } from "./parser";
import { matchFinancialSummaryRow } from "./financial-basis";
import { isItemCountLine } from "./purchase-expression";
import { money } from "./money";
import type { EvidenceLine, SourceRecognition } from "./receipt-layout";

export type ZeroPriceRow = {
  item: Item;
  sourceIndex: number;
  anchorIndices: number[];
  existing: boolean;
};
const compact = (text: string) => text.replace(/\s/gu, "");
const zero = /^0(?:[.,]0{2,3})?$/u;
const numeric = /^[£$€]?\s*\d[\d.,]*$/u;
const metadata =
  /^(?:cash|credit|debit|card|visa|mastercard|change|balance|paid|payment|tender|items?|qty|quantity|count|subtotal|total|tax|vat|gst|hst|tip|service|fee|saving|discount|amount|amt|coupon|auth|approval|member|account|code)\b/i;

/** Source proposals only. A separate model must support the price-column anchors
 * before a missing purchase is added. No role or word score confirms a field.
 */
export function readZeroPriceRows(
  parsed: ReturnType<typeof parseReceiptWithSources>,
  lines: (EvidenceLine | null)[],
  recognition: SourceRecognition,
): ZeroPriceRow[] {
  if (
    lines.length > 512 ||
    recognition.panels.reduce((n, p) => n + p.words.length, 0) > 4000
  )
    return [];
  const row = (index: number) => {
    const line = lines[index];
    if (!line || line.confidence < 0.98) return null;
    const panels = recognition.panels.filter(
      (p) => p.photo === line.photo && p.part === line.part,
    );
    if (panels.length !== 1) return null;
    const words = panels[0].words
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
      words.length < 2 ||
      words.some((word) => word.confidence < 0.98) ||
      words.map((word) => compact(word.text)).join("") !== compact(line.text)
    )
      return null;
    const price = words.at(-1)!,
      names = words.slice(0, -1);
    if (
      !numeric.test(price.text.trim()) ||
      Math.max(...names.map((word) => word.box[2])) >= price.box[0]
    )
      return null;
    return {
      line,
      words,
      price,
      description: names
        .map((word) => word.text)
        .join(" ")
        .trim(),
    };
  };
  const anchors = parsed.receipt.items.flatMap((item) => {
    const indices = parsed.sources[item.id] || [];
    if (indices.length !== 1) return [];
    const source = row(indices[0]);
    return source && /[1-9]/.test(source.price.text)
      ? [{ ...source, index: indices[0] }]
      : [];
  });
  const result: ZeroPriceRow[] = [];
  for (let index = 0; index < lines.length; index++) {
    const source = row(index);
    if (
      !source ||
      !zero.test(source.price.text.trim()) ||
      /^[-−•]/u.test(source.description) ||
      metadata.test(source.description) ||
      (source.description.match(/\p{L}/gu) || []).length < 2 ||
      matchFinancialSummaryRow(source.line.text) ||
      isItemCountLine(source.line.text)
    )
      continue;
    const owned = parsed.receipt.items.filter((item) =>
      (parsed.sources[item.id] || []).includes(index),
    );
    let existing: Item | undefined;
    if (owned.length) {
      if (owned.length !== 1 || parsed.sources[owned[0].id].length !== 1)
        continue;
      try {
        if (money(owned[0].lineTotal, parsed.receipt.currency, true) !== 0n)
          continue;
      } catch {
        continue;
      }
      existing = owned[0];
    } else if (/\d/u.test(source.description) || source.price.text !== "0")
      continue;
    const aligned = anchors.filter(
      (anchor) =>
        anchor.line.photo === source.line.photo &&
        anchor.line.part === source.line.part &&
        Math.abs(anchor.price.box[2] - source.price.box[2]) <= 0.02 &&
        Math.abs(anchor.words[0].box[0] - source.words[0].box[0]) <= 0.04,
    );
    if (
      aligned.length < 2 ||
      index <= Math.min(...aligned.map((anchor) => anchor.index))
    )
      continue;
    const start = Math.min(...aligned.map((anchor) => anchor.index));
    const firstY = Math.min(
      ...aligned.map((anchor) => (anchor.line.box[1] + anchor.line.box[3]) / 2),
    );
    const sourceY = (source.line.box[1] + source.line.box[3]) / 2;
    if (
      sourceY <= firstY ||
      lines.some(
        (line, i) =>
          line &&
          line.photo === source.line.photo &&
          line.part === source.line.part &&
          ((i > start && i <= index) ||
            ((line.box[1] + line.box[3]) / 2 > firstY &&
              (line.box[1] + line.box[3]) / 2 <= sourceY)) &&
          (isFinalTotal(line.text) ||
            isItemCountLine(line.text) ||
            ["subtotal", "tax", "fee"].includes(
              matchFinancialSummaryRow(line.text)?.role || "",
            )),
      )
    )
      continue;
    const item = existing ? structuredClone(existing) : newItem();
    if (!existing) {
      item.description = source.description.slice(0, 180);
      item.quantity = item.unitPrice = "";
      item.lineTotal = "0";
    }
    item.note =
      "Zero read in the item-price column. Confirm this is a separate purchase and check any missing quantity against the original.";
    result.push({
      item,
      sourceIndex: index,
      anchorIndices: aligned.map((anchor) => anchor.index),
      existing: !!existing,
    });
  }
  return result;
}
