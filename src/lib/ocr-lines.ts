export const ocrTextLines = (text: string) =>
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

/** Identical overlap semantics for the text and its source rows, within one photo. */
export function joinOcrRows<T extends { text: string }>(parts: T[][]): T[] {
  let joined = [...(parts[0] || [])];
  for (const next of parts.slice(1)) {
    const overlap = overlappingOcrRows(joined, next);
    joined = [...joined, ...next.slice(overlap)];
  }
  return joined;
}
export const ocrRowKey = (text: string) =>
  text.toUpperCase().replace(/\s+/g, "");
export function overlappingOcrRows<T extends { text: string }>(
  joined: T[],
  next: T[],
) {
  for (
    let count = Math.min(200, joined.length, next.length);
    count >= 3;
    count--
  ) {
    const tail = joined.slice(-count).map((row) => ocrRowKey(row.text));
    if (
      new Set(tail).size >= 3 &&
      tail.every((text, index) => text === ocrRowKey(next[index].text))
    )
      return count;
  }
  return 0;
}
