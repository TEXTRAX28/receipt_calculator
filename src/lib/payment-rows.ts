import type { Adjustment, Currency } from "./model";
import type { EvidenceLine, Recognition } from "./receipt-layout";
import { money } from "./money";
import { printedAmount } from "./printed-amount";
import { alignedSourceWords } from "./source-words";

const key = (text: string) =>
  text
    .trim()
    .toUpperCase()
    .replace(/[\s:.]+/gu, "");
const paymentLabel =
  /^(?:cash(?:\s+(?:paid|tendered))?|tunai|tendered|amount\s+(?:paid|tendered)|paid(?:\s+(?:by\s+)?(?:cash|card))?|(?:credit|debit|bca)\s+card|card|visa|mastercard|amex|american\s+express)$/i;
const changeLabel = /^(?:change(?:\s+due)?|kembali(?:an)?)$/i;
const amountSuffix = /^\s*[:.]?\s*([£$€]?\s*[-−]?\d[\d., ]*-?)\s*$/;

function row(text: string, total = false) {
  const match = text
    .trim()
    .match(
      total
        ? /^(grand\s+total|total|amount\s+due|balance\s+due)\b(.*)$/i
        : /^([A-Za-z]+(?:\s+[A-Za-z]+)*)(.*)$/,
    );
  if (!match) return null;
  const label = match[1],
    suffix = match[2].match(amountSuffix);
  if (
    !suffix ||
    (!total && !paymentLabel.test(label) && !changeLabel.test(label))
  )
    return null;
  return {
    label,
    literal: suffix[1].trim(),
    change: !total && changeLabel.test(label),
  };
}

/** Source-backed payment exclusions remain proposals requiring human review.
 * No tender arithmetic supplies a role, amount, missing row or final total.
 * Coupon/voucher/reward labels alone do not establish a payment method.
 */
export function findPaymentAdjustments(
  adjustments: Adjustment[],
  lines: (EvidenceLine | null)[],
  recognition: Recognition,
  currency: Currency,
) {
  const totals = lines.flatMap((line, index) => {
    const parsed = line && row(line.text, true);
    return line && parsed ? [{ ...parsed, line, index }] : [];
  });
  const totalHeadings = lines.filter(
    (line) =>
      line &&
      /^\s*(?:grand\s+total|total|amount\s+due|balance\s+due)\b/i.test(
        line.text,
      ) &&
      !/^\s*total\s+(?:items?|number|count)\b/i.test(line.text),
  );
  // Include weak/duplicate total candidates in this count; never choose the one
  // that happens to agree with a model value or with payment arithmetic.
  if (totals.length !== 1 || totalHeadings.length !== 1) return [];
  const strong = (line: EvidenceLine) => {
    if (line.confidence < 0.98) return false;
    const words = alignedSourceWords(line, recognition);
    return !!words?.length && words.every((word) => word.confidence >= 0.98);
  };
  const anchor = totals[0];
  try {
    if (
      !strong(anchor.line) ||
      money(printedAmount(anchor.literal, { currency }), currency) <= 0n
    )
      return [];
  } catch {
    return [];
  }
  const candidates = lines.flatMap((line, index) => {
    const parsed = line && row(line.text);
    return line &&
      parsed &&
      index > anchor.index &&
      line.photo === anchor.line.photo &&
      line.part === anchor.line.part
      ? [{ ...parsed, line, index }]
      : [];
  });
  if (candidates.length > 64) return [];
  const removals = [];
  for (const adjustment of adjustments) {
    const matches = candidates.filter(
      (candidate) => key(candidate.label) === key(adjustment.label),
    );
    if (
      matches.length !== 1 ||
      adjustments.filter((entry) => key(entry.label) === key(adjustment.label))
        .length !== 1
    )
      continue;
    const match = matches[0];
    if (!strong(match.line)) continue;
    try {
      const expected = money(
        printedAmount(match.literal, { currency }),
        currency,
      );
      let value: bigint;
      try {
        // A valid conflicting model value is never reinterpreted as grouping.
        value = money(adjustment.amount, currency, true);
      } catch {
        value = money(
          printedAmount(adjustment.amount, { currency }),
          currency,
          true,
        );
      }
      if (value < 0n || value !== expected) continue;
      removals.push({
        id: adjustment.id,
        label: adjustment.label,
        amount: adjustment.amount,
        reason: match.change ? "payment-change" : "payment-tender",
        sourceIndices: [anchor.index, match.index],
        printedLiteral: match.literal,
      });
    } catch {
      // Unknown separators, currency precision or signs are not evidence.
    }
  }
  return removals;
}
