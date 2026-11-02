import type { Currency } from "./model";
import { money, weight, roundDiv, SCALE } from "./money";
import { printedAmount } from "./printed-amount";
import {
  isPurchaseSummaryLine,
  separatePurchaseRows,
} from "./purchase-expression";

const columns =
  /^(?:(?<description>.+?)\s+)?(?<quantity>\d{1,9}(?:[.,]\d{1,6})?)\s+(?<unitPrice>\d[\d,.]*)\s+(?<lineTotal>\d[\d,.]*)\s*(?<taxCode>[A-Z])?\s*$/du;
const header =
  /^(?:(?:description|product|item)\s+)?(?:qty|quantity)\s+(?:unit\s+price|price(?:\s+each)?)\s+(?:line\s+total|total|amount)$/i;
const otherHeader = /\b(?:qty|quantity)\b.*\b(?:price|total|amount)\b/i;
const product = (text: string) =>
  /\p{L}/u.test(text) &&
  !isPurchaseSummaryLine(text) &&
  !/^(?:discount|disc|coupon|savings?|rebate|IRC|receipt|invoice|currency|merchant|phone|tel|date|time|table|server|order|qty|quantity|unit price|description|product|item)\b/i.test(
    text,
  );

/** Read three printed fields; arithmetic rejects a role interpretation, never fills a value. */
function candidate(text: string, currency: Currency) {
  const match = columns.exec(text),
    values = match?.groups;
  const unitSpan = match?.indices?.groups?.unitPrice;
  const lineSpan = match?.indices?.groups?.lineTotal;
  if (
    !values ||
    !unitSpan ||
    !lineSpan ||
    (values.description && !product(values.description))
  )
    return null;
  try {
    const quantity = values.quantity.replace(",", ".");
    const unitPrice = printedAmount(values.unitPrice, { currency });
    const lineTotal = printedAmount(values.lineTotal, { currency });
    const count = weight(quantity);
    if (
      !count ||
      roundDiv(money(unitPrice, currency) * count, SCALE) !==
        money(lineTotal, currency)
    )
      return null;
    return {
      description: values.description || "",
      expression: {
        quantity,
        unitPrice: values.unitPrice,
        lineTotal: values.lineTotal,
        taxCode: values.taxCode || "",
        unitSpan,
        lineSpan,
      },
    };
  } catch {
    return null;
  }
}

/** Column roles need a header or repeated complete rows in one receipt section.
 * Adjacent unnamed rows use the same conservative title-association rules as
 * explicit x/@ expressions. Returned roles always need human source checks.
 */
export function columnPurchaseRows(
  lines: string[],
  currency: Currency | undefined,
  boundary: string,
  isFooter: (line: string, index: number) => boolean,
) {
  const rows = new Map<
    number,
    {
      description: string;
      titleIndex: number;
      expression: NonNullable<ReturnType<typeof candidate>>["expression"];
    }
  >();
  const titles = new Set<number>();
  const unmatched: number[] = [];
  if (!currency) return { rows, titles, unmatched };
  let start = 0;
  while (start < lines.length) {
    let end = start;
    while (
      end < lines.length &&
      lines[end] !== boundary &&
      !isPurchaseSummaryLine(lines[end]) &&
      !isFooter(lines[end], end)
    )
      end++;
    const found = new Map<number, NonNullable<ReturnType<typeof candidate>>>();
    const headers: number[] = [];
    let conflictingHeader = false;
    for (let index = start; index < end; index++) {
      if (header.test(lines[index])) headers.push(index);
      else if (otherHeader.test(lines[index])) conflictingHeader = true;
      const row = candidate(lines[index], currency);
      if (row) found.set(index, row);
    }
    const bare = new Map(
      [...found]
        .filter(([, row]) => !row.description)
        .map(([index, row]) => [index, row.expression]),
    );
    const associations = bare.size
      ? separatePurchaseRows(
          lines,
          boundary,
          (line) => isPurchaseSummaryLine(line),
          bare,
        )
      : null;
    const proposed = [...found].flatMap(([index, row]) => {
      const pair = associations?.rows.get(index);
      if (!row.description && !pair) return [];
      const titleIndex = row.description ? index : pair!.titleIndex;
      if (titleIndex < start || titleIndex >= end) return [];
      // A header must occur before the purchase, never supply its product name.
      if (headers.includes(titleIndex)) return [];
      return [
        {
          index,
          description: row.description || lines[titleIndex],
          titleIndex,
          expression: row.expression,
        },
      ];
    });
    const labelled =
      headers.length === 1 && proposed.every((row) => row.index > headers[0]);
    const repeated =
      headers.length === 0 &&
      proposed.length >= 2 &&
      [...found.values()].some((row) => !!row.description);
    if (!conflictingHeader && (labelled || repeated)) {
      for (const { index, ...row } of proposed) {
        rows.set(index, row);
        if (row.titleIndex !== index) titles.add(row.titleIndex);
      }
      for (const index of bare.keys())
        if (!rows.has(index)) unmatched.push(index);
    }
    // Only another photograph can begin a fresh item section after a summary.
    while (end < lines.length && lines[end] !== boundary) end++;
    start = end + 1;
  }
  return { rows, titles, unmatched };
}
