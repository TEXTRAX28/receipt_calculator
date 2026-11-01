// Literal quantity/unit/total expressions; values are never calculated here.
const quantity = "\\d{1,9}(?:[.,]\\d{1,6})?";
const amount = "[-−]?\\d[\\d,.]*-?";
const prefix = "(?:[£$€]|Rp\\.?|NT\\$)?\\s*";
const unitPrefix = "(?<unitCurrency>[£$€]|Rp\\.?|NT\\$)?\\s*";
const patterns = [
  new RegExp(
    `^\\s*(?<quantity>${quantity})(?<left>\\s*)[x×@](?<right>\\s*)${unitPrefix}(?<unitPrice>${amount})\\s+${prefix}(?<lineTotal>${amount})\\s*(?<taxCode>[A-Z])?\\s*$`,
    "id",
  ),
  new RegExp(
    `^\\s*${unitPrefix}(?<unitPrice>${amount})(?<left>\\s*)[x×](?<right>\\s*)(?<quantity>${quantity})\\s+${prefix}(?<lineTotal>${amount})\\s*(?<taxCode>[A-Z])?\\s*$`,
    "id",
  ),
];

export function matchPurchaseExpression(line: string) {
  if (line.length > 1000) return null;
  const candidates = [];
  for (const [order, pattern] of patterns.entries()) {
    const match = pattern.exec(line);
    const values = match?.groups;
    const span = match?.indices?.groups?.unitPrice;
    if (!values || !span || !/[1-9]/.test(values.quantity)) continue;
    if (values.unitPrice.length > 80 || values.lineTotal.length > 80)
      return null;
    const formatted = (value: string) => /[.,]\d{2,3}-?$/.test(value);
    const bound =
      order === 0
        ? !values.left && !!values.right
        : !!values.left && !values.right;
    const score =
      (order === 0 && line.includes("@") ? 4 : 0) +
      (values.unitCurrency ? 3 : 0) +
      (formatted(values.unitPrice) && !formatted(values.quantity) ? 2 : 0) +
      (bound ? 1 : 0);
    if (!score) continue;
    candidates.push({
      score,
      quantity: values.quantity,
      unitPrice: values.unitPrice,
      lineTotal: values.lineTotal,
      taxCode: values.taxCode?.toUpperCase() || "",
      unitSpan: span,
    });
  }
  candidates.sort((a, b) => b.score - a.score);
  if (!candidates.length || candidates[0].score === candidates[1]?.score)
    return null;
  const { score: _, ...expression } = candidates[0];
  return expression;
}

export const isPurchaseExpressionLine = (line: string) =>
  line.length <= 1000 && patterns.some((pattern) => pattern.test(line));

const summary = {
  test(line: string) {
    const marker = line.match(
      /^[*\s]*(?:sub[- ]?total|subttl|grand\s*total|total|amount due|balance due|cash|card|paid|tender(?:ed)?|change(?:d)?|(?:tax|vat)(?:\s+amount)?|service|svc|delivery|shipping|tip|gratuity|deposit|savings)\b[.:]?\s*(.*)$/i,
    );
    if (!marker) return false;
    const rest = marker[1].replace(/^(?:charge|chg|fee)\b[.:]?\s*/i, "");
    return (
      !rest ||
      /^(?:(?:GBP|USD|EUR|CAD|AUD|NZD|JPY|KWD|BHD|CHF|SEK|KRW|IDR|TWD|Rp\.?|NT\$)\s*)?[-−]?\s*[£$€]?\s*\d|^(?:items?|count|number)\b/i.test(
        rest,
      )
    );
  },
};
const financialLabel =
  /^(?:(?:member|item)\s+)?(?:discount|coupon|savings?|rebate)(?:\s+(?:total|amount|applied))?$|^reduced\s+price$|^IRC\b|^DISC(?:OUNT)?\s+ITEM\b/i;
const partial = new RegExp(
  `^\\s*(?:[x×@]\\s*${quantity}\\s+)?${prefix}${amount}\\s*$`,
  "i",
);
const title = (line: string) =>
  (line.match(/\p{L}/gu) || []).length >= 1 &&
  !summary.test(line) &&
  !financialLabel.test(line) &&
  !/\d[.,]\d{2,3}|%|^\s*(?:receipt|invoice|currency|merchant|phone|tel|date|time|table|server|order|qty|quantity|unit price|description|product|item)\b/i.test(
    line,
  );

/** Associate adjacent names only when direction or local evidence resolves them.
 * Partial numeric rows can witness ordering but never supply a unit price.
 * The input is trimmed receipt lines; indices and genuine repetitions survive.
 */
export function separatePurchaseRows(
  lines: string[],
  boundary: string,
  isFooter: (line: string) => boolean = () => false,
) {
  const rows = new Map<
    number,
    {
      titleIndex: number;
      expression: NonNullable<ReturnType<typeof matchPurchaseExpression>>;
    }
  >();
  const unmatched: number[] = [];
  let start = 0;
  while (start < lines.length) {
    let end = start;
    while (
      end < lines.length &&
      lines[end] !== boundary &&
      !summary.test(lines[end]) &&
      !isFooter(lines[end])
    )
      end++;
    const complete = new Map<
      number,
      NonNullable<ReturnType<typeof matchPurchaseExpression>>
    >();
    const expressionLines: number[] = [];
    for (let i = start; i < end; i++) {
      if (isPurchaseExpressionLine(lines[i])) expressionLines.push(i);
      const expression = matchPurchaseExpression(lines[i]);
      if (expression) complete.set(i, expression);
    }
    const neighbours = (i: number) => ({
      before: i > start && title(lines[i - 1]) ? i - 1 : null,
      after: i + 1 < end && title(lines[i + 1]) ? i + 1 : null,
    });
    const directions = new Set<"before" | "after">();
    const firstComplete = Math.min(...complete.keys());
    for (let i = start; i < end; i++) {
      if (
        !complete.has(i) &&
        !(
          i > firstComplete &&
          partial.test(lines[i]) &&
          [...complete.keys()].some((index) => Math.abs(index - i) <= 3)
        )
      )
        continue;
      const candidates = neighbours(i);
      if (candidates.before !== null && candidates.after === null)
        directions.add("before");
      if (candidates.after !== null && candidates.before === null)
        directions.add("after");
    }
    const direction = directions.size === 1 ? [...directions][0] : null;
    const proposed: {
      index: number;
      titleIndex: number;
      expression: NonNullable<ReturnType<typeof matchPurchaseExpression>>;
    }[] = [];
    for (const [index, expression] of complete) {
      const candidates = neighbours(index);
      const titleIndex = direction
        ? candidates[direction]
        : candidates.before === null
          ? candidates.after
          : candidates.after === null
            ? candidates.before
            : null;
      if (titleIndex !== null) proposed.push({ index, titleIndex, expression });
    }
    for (const proposal of proposed) {
      if (
        proposed.filter((other) => other.titleIndex === proposal.titleIndex)
          .length !== 1
      )
        continue;
      rows.set(proposal.index, {
        titleIndex: proposal.titleIndex,
        expression: proposal.expression,
      });
    }
    for (const index of expressionLines)
      if (!rows.has(index)) unmatched.push(index);
    // Summary text ends this item section; only a photo boundary starts another.
    while (end < lines.length && lines[end] !== boundary) end++;
    start = end + 1;
  }
  return { rows, unmatched };
}
