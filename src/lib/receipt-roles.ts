import type { Currency } from "./model";
import { money, minorString, weight, SCALE } from "./money";
import { printedAmount } from "./printed-amount";

const explicitRegistration =
  /^(?:vat|gst|hst|pst|tax)\s*(?:reg(?:istration)?\.?\s*(?:(?:no|number|id)\b\.?)?|no\b\.?|number\b|id\b)\s*[:#.-]?\s*(.*)$/i;
const bareVat = /^vat\s*[:#]?\s*((?:(?:GB|XI)\s*)?\d[\d\s]*\d)\s*$/i;
const vatIdentifier = (value: string) =>
  /^(?:(?:GB|XI))?(?:\d{9}|\d{12})$/i.test(value.replace(/\s/g, ""));
const cleanIdentifier = (value: string) =>
  value.replace(/\s+/g, "").toUpperCase();

/** Registration metadata is not a monetary amount, even without an explicit No label. */
export function isTaxRegistrationLine(
  text: string,
  currency?: Currency,
): boolean {
  text = text.replace(/^[*\s]+/, "").trim();
  const bare = text.match(bareVat);
  return (
    explicitRegistration.test(text) ||
    /^gstin\s*[:#]/i.test(text) ||
    Boolean(
      bare &&
      vatIdentifier(bare[1]) &&
      (!currency || currency === "GBP" || /^(?:GB|XI)/i.test(bare[1])),
    )
  );
}

/** Preserve identifiers as strings; never repair digits or claim registry validity. */
export function findTaxRegistrations(lines: string[], currency?: Currency) {
  currency ||= lines
    .join("\n")
    .match(
      /\b(GBP|USD|EUR|CAD|AUD|NZD|CHF|SEK|JPY|KRW|KWD|BHD|IDR|TWD)\b/,
    )?.[1] as Currency | undefined;
  const values = new Set<string>(),
    indices = new Set<number>();
  for (const [index, original] of lines.entries()) {
    const text = original.replace(/^[*\s]+/, "").trim();
    const explicit =
      text.match(explicitRegistration) || text.match(/^gstin\s*[:#]\s*(.*)$/i);
    const bare = text.match(bareVat);
    if (explicit) {
      indices.add(index);
      let value = explicit[1].trim();
      if (
        !value &&
        /^[A-Z0-9][A-Z0-9\s./-]{3,59}$/i.test(lines[index + 1] || "")
      ) {
        value = lines[index + 1];
        indices.add(index + 1);
      }
      if (/^[A-Z0-9][A-Z0-9\s./-]{3,59}$/i.test(value))
        values.add(cleanIdentifier(value));
    } else if (
      bare &&
      vatIdentifier(bare[1]) &&
      isTaxRegistrationLine(text, currency)
    ) {
      values.add(cleanIdentifier(bare[1]));
      indices.add(index);
    } else if (
      /^vat\s*[:#]?\s*$/i.test(text) &&
      vatIdentifier(lines[index + 1] || "") &&
      isTaxRegistrationLine(`VAT: ${lines[index + 1]}`, currency)
    ) {
      values.add(cleanIdentifier(lines[index + 1]));
      indices.add(index);
      indices.add(index + 1);
    }
  }
  return { values: [...values], indices };
}

/** An explicitly printed rate is informational; it never supplies an absent tax amount. */
export function printedTaxRate(text: string): string | null {
  if (isTaxRegistrationLine(text)) return null;
  const match = text.match(
    /^(?:(?:sales|restaurant)\s+tax|vat|tax|gst|hst|pst)(?:\s+amount)?\s*:?\s*(\d{1,3}(?:[.,]\d{1,6})?)\s*%/i,
  );
  if (!match) return null;
  const value = match[1].replace(",", ".");
  return Number(value) <= 100 ? value : null;
}

const header = (text: string) =>
  /^(?:qty|quantity|oty|0ty|\(ty)(?:dish|description|item|product|name)?(?:unitprice|priceeach)?(?:amount|linetotal|total)$/i.test(
    text.replace(/[\s:|]/g, ""),
  );
const endOfItems =
  /^(?:sub[-\s]?total|subttl|grand\s+total|total\b|amount\s+due|balance\s+due|vat\b|tax\b|service\s+(?:charge|fee)|cash\b|card\b|paid\b|tender\b)/i;
const amount = "[£$€]?\\s*\\d[\\d,.]*[.,]\\d{2,3}";
const countedRow = new RegExp(
  `^(?<count>[1-9]\\d{0,2}|[Il|])\\s+(?<description>.+?)\\s+(?<total>${amount})\\s*(?<suffix>[A-Za-z|.])?\\s*$`,
  "u",
);
const unitAtEnd = new RegExp(`^(.+?)\\s+(${amount})$`, "u");
/** Exact minor-unit arithmetic, shared by extraction and explicit user corrections. */
export function exactUnitPrice(
  quantity: string,
  lineTotal: string,
  currency: Currency,
): string {
  try {
    const count = weight(quantity),
      total = money(lineTotal, currency, true) * SCALE;
    return count > 0n && total % count === 0n
      ? minorString(total / count, currency)
      : "";
  } catch {
    return "";
  }
}
export type CountedPurchaseRow = {
  description: string;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
  taxCode: string;
  repairedQuantity: boolean;
  calculatedUnitPrice: boolean;
  inconsistentUnitPrice: boolean;
};

/** Recognise the quantity column, rather than stripping numbers from arbitrary names.
 * I/l/| is proposed as one only with a table header and two numeric peer counts.
 * Division supplies a unit price only when exact in the selected currency.
 */
export function countedPurchaseRows(
  lines: string[],
  currency: Currency | undefined,
  boundary: string,
) {
  const rows = new Map<number, CountedPurchaseRow>(),
    headings = new Set<number>();
  for (let start = 0; start < lines.length; start++) {
    const width = [1, 2, 3].find((count) =>
      header(lines.slice(start, start + count).join(" ")),
    );
    if (!width) continue;
    for (let offset = 0; offset < width; offset++) headings.add(start + offset);
    const candidates: { index: number; values: Record<string, string> }[] = [];
    let end = start + width;
    for (
      ;
      end < lines.length &&
      lines[end] !== boundary &&
      !endOfItems.test(lines[end]);
      end++
    ) {
      if (header(lines[end])) break;
      const values = countedRow.exec(lines[end])?.groups;
      if (values && /\p{L}/u.test(values.description))
        candidates.push({ index: end, values });
    }
    const numericPeers = candidates.filter(({ values }) =>
      /^\d/.test(values.count),
    ).length;
    for (const { index, values } of candidates) {
      const repairedQuantity = !/^\d/.test(values.count);
      if (repairedQuantity && numericPeers < 2) continue;
      const quantity = repairedQuantity ? "1" : values.count;
      const possibleUnit = values.description.match(unitAtEnd);
      const description = (possibleUnit ? possibleUnit[1] : values.description)
        .replace(/\s+/g, " ")
        .trim();
      if (!/\p{L}{2}/u.test(description)) continue;
      let lineTotal = values.total,
        unitPrice = possibleUnit?.[2] || "",
        calculatedUnitPrice = false,
        inconsistentUnitPrice = false;
      try {
        lineTotal = printedAmount(lineTotal, { currency });
        if (unitPrice) unitPrice = printedAmount(unitPrice, { currency });
        if (currency) {
          const count = BigInt(quantity),
            total = money(lineTotal, currency);
          if (unitPrice)
            inconsistentUnitPrice =
              money(unitPrice, currency) * count !== total;
          else {
            unitPrice = exactUnitPrice(quantity, lineTotal, currency);
            calculatedUnitPrice = Boolean(unitPrice);
          }
        }
      } catch {
        continue;
      }
      rows.set(index, {
        description,
        quantity,
        unitPrice,
        lineTotal,
        taxCode: /^[A-Z]$/.test(values.suffix || "") ? values.suffix : "",
        repairedQuantity,
        calculatedUnitPrice,
        inconsistentUnitPrice,
      });
    }
    start = end - 1;
  }
  return { rows, headings };
}
