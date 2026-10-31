/** Canonicalize only dates whose order is explicit or has a unique calendar interpretation. */
export function normalizeReceiptDate(value: string): string {
  const text = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const match = text.match(/^(\d{1,2})([/.])(\d{1,2})\2(\d{4})$/);
  if (!match) return value;
  const first = Number(match[1]),
    second = Number(match[3]);
  let month: number, day: number;
  if (first > 12 && second <= 12) {
    day = first;
    month = second;
  } else if (second > 12 && first <= 12) {
    day = second;
    month = first;
  } else if (first === second) {
    day = first;
    month = second;
  } else return value; // Currency or merchant alone cannot prove an ambiguous day/month order.
  const iso = `${match[4]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const parsed = new Date(iso);
  return !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === iso
    ? iso
    : value;
}
