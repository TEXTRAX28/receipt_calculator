import { currencies, type Currency } from "./model";

/** Normalize printed evidence without rounding or using binary floating point.
 * Single three-place separators stay ambiguous unless the currency/format
 * supplies enough evidence. In particular, Rp 36.000 means 36000, not 36.
 */
export function printedAmount(
  token: string,
  options: { currency?: Currency } = {},
): string {
  if (token.length > 80) throw new Error("Printed amount is too long.");
  let text = token.trim().replace(/[£$€]/g, "").replace(/−/g, "-").trim();
  if (/\s/.test(text)) {
    if (!/^-?\d{1,3}(?:[ \u00a0\u202f]\d{3})+(?:[.,]\d{1,3})?-?$/.test(text))
      throw new Error("Unclear spaces in a printed amount.");
    text = text.replace(/\s/g, "");
  }
  if (text.startsWith("-") && text.endsWith("-"))
    throw new Error("Unclear amount sign.");
  const negative = text.startsWith("-") || text.endsWith("-");
  text = text.replace(/^-/, "").replace(/-$/, "");
  if (!/^\d[\d.,]*$/.test(text)) throw new Error("Unclear printed amount.");
  const dots = (text.match(/\./g) || []).length;
  const commas = (text.match(/,/g) || []).length;
  let whole: string;
  let fraction = "";
  if (dots && commas) {
    const decimal = text.lastIndexOf(".") > text.lastIndexOf(",") ? "." : ",";
    const grouping = decimal === "." ? "," : ".";
    const pieces = text.split(decimal);
    if (pieces.length !== 2 || !/^\d{1,3}$/.test(pieces[1]))
      throw new Error("Unclear printed separators.");
    const groups = pieces[0].split(grouping);
    if (
      !/^\d{1,3}$/.test(groups[0]) ||
      groups.slice(1).some((g) => !/^\d{3}$/.test(g))
    )
      throw new Error("Unclear thousands grouping.");
    whole = groups.join("");
    fraction = pieces[1];
  } else if (dots || commas) {
    const separator = dots ? "." : ",";
    const groups = text.split(separator);
    if (groups.some((g) => !/^\d+$/.test(g)))
      throw new Error("Unclear printed separators.");
    const grouped =
      /^\d{1,3}$/.test(groups[0]) &&
      groups.slice(1).every((g) => /^\d{3}$/.test(g));
    const precision = options.currency
      ? currencies[options.currency]
      : undefined;
    if (groups.length > 2) {
      if (!grouped) throw new Error("Unclear thousands grouping.");
      whole = groups.join("");
    } else if (groups[1].length === 3) {
      if (precision === 3) [whole, fraction] = groups;
      else if (
        grouped &&
        (options.currency === "IDR" || (options.currency && separator === ","))
      )
        whole = groups.join("");
      else if (groups.every((g) => /^0+$/.test(g))) whole = "0";
      else
        throw new Error(
          "Ambiguous decimal or thousands separator. Check the original amount and currency.",
        );
    } else {
      if (!/^\d{1,2}$/.test(groups[1]))
        throw new Error("Unclear printed decimals.");
      [whole, fraction] = groups;
    }
  } else whole = text;
  whole = whole.replace(/^0+(?=\d)/, "");
  if (whole.length > 12)
    throw new Error("Printed amount exceeds the supported range.");
  const precision = options.currency ? currencies[options.currency] : undefined;
  if (precision !== undefined && fraction.length > precision) {
    if (!/^0*$/.test(fraction.slice(precision)))
      throw new Error("Printed amount has unsupported currency precision.");
    fraction = fraction.slice(0, precision);
  }
  const value = whole + (fraction ? "." + fraction : "");
  return negative && /[1-9]/.test(value) ? "-" + value : value;
}
