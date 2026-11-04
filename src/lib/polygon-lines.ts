import type { Recognition } from "./receipt-layout";

type Word = Recognition["panels"][number]["words"][number];
type Position = {
  word: Word;
  x: number;
  y: number;
  height: number;
  slope?: number;
};
type Row = {
  tokens: Position[];
  slope: number;
  intercept: number;
  height: number;
};
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/** Group slanted detector fragments; never rotate pixels or alter source words. */
export function polygonReadingLines(
  words: Word[],
  polygons: number[][][],
  width: number,
  height: number,
  fallback: (words: Word[]) => Word[],
): Word[] {
  if (words.length !== polygons.length || words.length > 10000)
    throw new Error("Mismatched or excessive OCR geometry.");
  if (polygons.some((points) => points.length !== 4)) return fallback(words);
  const positions: Position[] = words.map((word, index) => {
    const points = polygons[index];
    if (
      points.some((p) => p.length !== 2 || p.some((v) => !Number.isFinite(v)))
    )
      throw new Error("Invalid OCR quadrilateral.");
    const [a, b, c, d] = points;
    const dx = (b[0] - a[0] + (c[0] - d[0])) / 2;
    const dy = (b[1] - a[1] + (c[1] - d[1])) / 2;
    const h = (d[1] - a[1] + (c[1] - b[1])) / 2;
    const ordered = a[0] < b[0] && d[0] < c[0] && a[1] < d[1] && b[1] < c[1];
    const slope = dx > 0 ? dy / dx : 0;
    return {
      word,
      x: points.reduce((n, p) => n + p[0], 0) / 4,
      y: points.reduce((n, p) => n + p[1], 0) / 4,
      height: ordered && h > 0 ? h : (word.box[3] - word.box[1]) * height,
      slope:
        ordered &&
        h >= 2 &&
        dx >= 2 * h &&
        Math.abs(slope) <= Math.tan((15 * Math.PI) / 180) &&
        word.confidence >= 0.75
          ? slope
          : undefined,
    };
  });
  const directions = positions.flatMap((p) =>
    p.slope === undefined ? [] : [p.slope],
  );
  if (directions.length < 3) return fallback(words);
  const globalSlope = median(directions);
  if (
    Math.abs((Math.atan(globalSlope) * 180) / Math.PI) < 0.5 ||
    (Math.atan(median(directions.map((n) => Math.abs(n - globalSlope)))) *
      180) /
      Math.PI >
      5
  )
    return fallback(words);
  const rows: Row[] = [];
  for (const token of [...positions].sort(
    (a, b) => a.y - globalSlope * a.x - (b.y - globalSlope * b.x) || a.x - b.x,
  )) {
    if (!token.word.text.trim()) continue;
    let best: Row | undefined;
    let distance = Infinity;
    for (const row of rows) {
      const delta = Math.abs(token.y - (row.intercept + row.slope * token.x));
      if (
        delta <= 0.45 * Math.min(token.height, row.height) &&
        delta < distance
      ) {
        best = row;
        distance = delta;
      }
    }
    if (!best) {
      best = {
        tokens: [],
        slope: globalSlope,
        intercept: 0,
        height: token.height,
      };
      rows.push(best);
    }
    best.tokens.push(token);
    const local = best.tokens.flatMap((p) =>
      p.slope === undefined ? [] : [p.slope],
    );
    best.slope = local.length ? median(local) : globalSlope;
    best.intercept = median(best.tokens.map((p) => p.y - best!.slope * p.x));
    best.height = median(best.tokens.map((p) => p.height));
  }
  return rows
    .sort(
      (a, b) =>
        a.intercept +
        a.slope * (width / 2) -
        (b.intercept + b.slope * (width / 2)),
    )
    .map(({ tokens }) => {
      const row = tokens.map((p) => p.word).sort((a, b) => a.box[0] - b.box[0]);
      return {
        text: row.map((w) => w.text.trim()).join(" "),
        confidence: Math.min(...row.map((w) => w.confidence)),
        box: [
          Math.min(...row.map((w) => w.box[0])),
          Math.min(...row.map((w) => w.box[1])),
          Math.max(...row.map((w) => w.box[2])),
          Math.max(...row.map((w) => w.box[3])),
        ],
      };
    });
}
