import type { Currency } from "./model";
import { isTaxRegistrationLine } from "./receipt-roles";

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
const financialText = (text: string) => text.replace(/^(?:\*+\s+)+/u, "");
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
