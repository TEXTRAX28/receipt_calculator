import { currencies, type Currency } from "./model";

export const SCALE = 1_000_000n;
export const MAX_MINOR = 100_000_000_000n;
export class InputError extends Error {}

export function decimal(
  value: string,
  precision: number,
  signed = false,
): bigint {
  const text = value.trim();
  if (
    !new RegExp(
      `^${signed ? "-?" : ""}\\d{1,12}(?:\\.\\d{1,${precision || 1}})?$`,
    ).test(text) ||
    (!precision && text.includes("."))
  ) {
    throw new InputError(
      `Enter ${signed ? "a" : "a non-negative"} number with at most ${precision} decimal places.`,
    );
  }
  const negative = text.startsWith("-");
  const [whole, fraction = ""] = text.replace(/^-/, "").split(".");
  return (
    (BigInt(whole) * 10n ** BigInt(precision) +
      BigInt(fraction.padEnd(precision, "0") || "0")) *
    (negative ? -1n : 1n)
  );
}
export function money(
  value: string,
  currency: Currency,
  signed = false,
): bigint {
  const amount = decimal(value, currencies[currency], signed);
  if (amount > MAX_MINOR || amount < -MAX_MINOR)
    throw new InputError(
      "Amount is too large (maximum 100 billion minor units).",
    );
  return amount;
}
export function weight(value: string): bigint {
  const result = decimal(value, 6);
  if (result > 1_000_000_000n * SCALE)
    throw new InputError("Quantity or weight exceeds one billion.");
  return result;
}
export function roundDiv(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new InputError("The divisor must be positive.");
  if (numerator < 0n) return -roundDiv(-numerator, denominator);
  return (numerator * 2n + denominator) / (denominator * 2n);
}
/** Hamilton / largest remainder. Stable ties use the input order. Signed totals conserve money too. */
export function allocate(total: bigint, weights: bigint[]): bigint[] {
  if (weights.some((w) => w < 0n))
    throw new InputError("Shares cannot be negative.");
  const denominator = weights.reduce((a, b) => a + b, 0n);
  if (denominator === 0n) {
    if (total === 0n) return weights.map(() => 0n);
    throw new InputError("Choose at least one positive share.");
  }
  const sign = total < 0n ? -1n : 1n;
  const amount = total * sign;
  const parts = weights.map((w) => (amount * w) / denominator);
  const order = weights
    .map((w, index) => ({ index, remainder: (amount * w) % denominator }))
    .sort((a, b) =>
      a.remainder === b.remainder
        ? a.index - b.index
        : a.remainder > b.remainder
          ? -1
          : 1,
    );
  const left = amount - parts.reduce((a, b) => a + b, 0n);
  for (let i = 0; BigInt(i) < left; i++) parts[order[i].index]++;
  return parts.map((p) => p * sign);
}
export function minorString(amount: bigint, currency: Currency): string {
  const p = currencies[currency];
  const negative = amount < 0n;
  const s = (negative ? -amount : amount).toString().padStart(p + 1, "0");
  return `${negative ? "-" : ""}${p ? `${s.slice(0, -p)}.${s.slice(-p)}` : s}`;
}
const symbols: Record<Currency, string> = {
  GBP: "£",
  USD: "$",
  EUR: "€",
  CAD: "CA$",
  AUD: "A$",
  NZD: "NZ$",
  CHF: "CHF ",
  SEK: "SEK ",
  JPY: "¥",
  KRW: "₩",
  KWD: "KWD ",
  BHD: "BHD ",
  IDR: "Rp ",
  TWD: "NT$",
};
export function formatMoney(amount: bigint, currency: Currency): string {
  const negative = amount < 0n;
  const text = minorString(negative ? -amount : amount, currency);
  const [integer, fraction] = text.split(".");
  return `${negative ? "−" : ""}${symbols[currency]}${BigInt(integer).toLocaleString("en-GB")}${fraction === undefined ? "" : `.${fraction}`}`;
}
