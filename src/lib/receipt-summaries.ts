import type { Adjustment, Currency } from "./model";
import type { EvidenceLine } from "./receipt-layout";
import { isFinalTotal, normalizeAmount } from "./parser";
import { money } from "./money";

type Context = {
  lines: (EvidenceLine | null)[];
  currency: Currency;
  couponCount: number;
  couponTotal: bigint | null;
  reliable: (line: EvidenceLine) => boolean;
};
const labelKey = (value: string) => value.toUpperCase().replace(/[^A-Z]/g, "");

/** Identify informational footer entries, not arbitrary values that make a total balance. */
export function matchInformationalAdjustment(
  adjustment: Adjustment,
  context: Context,
): {
  reason: "coupon-summary" | "coupon-count" | "future-reward";
  sourceIndices: number[];
} | null {
  const { lines, currency, reliable } = context;
  let amount: bigint;
  try {
    amount = money(adjustment.amount, currency);
  } catch {
    return null;
  }
  const afterTotal = (index: number, photo: number) =>
    lines
      .slice(0, index)
      .some((line) => line?.photo === photo && isFinalTotal(line.text));
  const value = (token: string) => {
    try {
      return money(normalizeAmount(token, currency), currency);
    } catch {
      return null;
    }
  };
  if (context.couponCount > 0 && context.couponTotal !== null) {
    for (const [index, line] of lines.entries()) {
      if (!line || !reliable(line) || !afterTotal(index, line.photo)) continue;
      const summary = line.text.match(
        /^\s*(?:total\s+)?savings\s*:\s*[£$€]?\s*([\d.,]+)\s+(\d{1,4})\s+coupon(?:\(s\)|s)?\s*$/i,
      );
      if (
        !summary ||
        Number(summary[2]) !== context.couponCount ||
        value(summary[1]) !== context.couponTotal
      )
        continue;
      if (
        /^(?:TOTAL)?SAVINGS$/.test(labelKey(adjustment.label)) &&
        amount === context.couponTotal
      )
        return { reason: "coupon-summary", sourceIndices: [index] };
      if (
        /^COUPONS?$/.test(labelKey(adjustment.label)) &&
        amount === value(summary[2])
      )
        return { reason: "coupon-count", sourceIndices: [index] };
    }
  }
  if (!/EXECUTIVE.*REWARD|ANNUAL.*REWARD/.test(labelKey(adjustment.label)))
    return null;
  // A redeemed/applied reward can be a real transaction component. Never erase it
  // merely because an unrelated future-earnings statement also appears below.
  if (
    lines.some((line, index) => {
      if (!line) return false;
      const nearby = lines
        .slice(Math.max(0, index - 1), index + 2)
        .filter((entry) => entry?.photo === line.photo)
        .map((entry) => entry!.text)
        .join(" ");
      return (
        /reward|certificate/i.test(nearby) &&
        /redeem|appl(?:y|ied)|tender|paid|used/i.test(nearby)
      );
    })
  )
    return null;
  for (const [index, line] of lines.entries()) {
    if (
      !line ||
      !reliable(line) ||
      !afterTotal(index, line.photo) ||
      !/\bearned\b/i.test(line.text)
    )
      continue;
    const following = lines
      .slice(index, index + 3)
      .flatMap((entry) => (entry?.photo === line.photo ? [entry] : []));
    if (!following.every(reliable)) continue;
    const text = following.map((entry) => entry.text).join(" ");
    if (!/earned[\s\S]*towards?[\s\S]*annual[\s\S]*reward/i.test(text))
      continue;
    const token = [...line.text.matchAll(/\d[\d.,]*/g)].at(-1)?.[0];
    if (token && value(token) === amount)
      return {
        reason: "future-reward",
        sourceIndices: following.map((entry) => lines.indexOf(entry)),
      };
  }
  return null;
}
