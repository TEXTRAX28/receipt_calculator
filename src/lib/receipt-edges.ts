import type { CropBounds } from "./images";
import type { PixelPatch } from "./image-quality";

type Edge = {
  center: number;
  drift: number;
  coverage: number;
  strength: number;
};
type Pair = {
  low: Edge;
  high: Edge;
  score: number;
  start: number;
  end: number;
};
export type EdgeSuggestion = {
  bounds: CropBounds;
  axes: ("horizontal" | "vertical")[];
};

/** Broad light/dark transitions along a document side, rather than individual
 * letter strokes. A crop suggestion is geometry evidence, not OCR confidence.
 * Unclear, full-bleed and competing document outlines deliberately abstain.
 */
export function findReceiptEdges(patch: PixelPatch): EdgeSuggestion | null {
  const { width, height, data } = patch;
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 24 ||
    height < 24 ||
    width > 640 ||
    height > 640 ||
    width * height > 409600 ||
    !(data instanceof Uint8ClampedArray) ||
    data.length !== width * height * 4
  )
    throw new Error("Invalid bounded edge sample");
  const gray = new Uint8Array(width * height);
  for (let i = 0; i < gray.length; i++) {
    if (data[i * 4 + 3] !== 255) throw new Error("Edge sample must be opaque");
    gray[i] = Math.round(
      0.2126 * data[i * 4] +
        0.7152 * data[i * 4 + 1] +
        0.0722 * data[i * 4 + 2],
    );
  }
  function sweep(transpose: boolean, span?: [number, number]): Pair | null {
    const across = transpose ? height : width,
      along = transpose ? width : height;
    const prefixes = new Uint32Array(along * (across + 1));
    for (let y = 0; y < along; y++) {
      const start = y * (across + 1);
      for (let x = 0; x < across; x++)
        prefixes[start + x + 1] =
          prefixes[start + x] + gray[transpose ? x * width + y : y * width + x];
    }
    const band = Math.max(3, Math.round(across * 0.055));
    const gap = Math.max(1, Math.round(across * 0.012));
    const steps = Math.min(80, along);
    const start = span ? Math.max(0, Math.ceil(span[0])) : 0;
    const end = span ? Math.min(along - 1, Math.floor(span[1])) : along - 1;
    if (end - start < along * 0.25) return null;
    const rows = Array.from({ length: steps }, (_, i) =>
      Math.round(start + ((end - start) * i) / (steps - 1)),
    );
    const responses = new Float32Array(rows.length * across);
    const radius = Math.max(1, Math.round(across * 0.02));
    for (const [i, y] of rows.entries()) {
      const base = y * (across + 1);
      for (let x = band + gap; x < across - band - gap; x++) {
        const difference =
          (prefixes[base + x + gap + band] -
            prefixes[base + x + gap] -
            prefixes[base + x - gap] +
            prefixes[base + x - gap - band]) /
          band;
        if (Math.abs(difference) < 9) continue;
        let narrow = 0;
        for (let offset = -radius; offset <= radius; offset++) {
          const at = x + offset;
          if (at < 2 || at + 2 >= across) continue;
          const value =
            (prefixes[base + at + 2] -
              2 * prefixes[base + at] +
              prefixes[base + at - 2]) /
            2;
          narrow =
            difference > 0 ? Math.max(narrow, value) : Math.min(narrow, value);
        }
        responses[i * across + x] = narrow;
      }
    }
    const positive: Edge[] = [],
      negative: Edge[] = [];
    for (let driftIndex = -8; driftIndex <= 8; driftIndex++) {
      const drift = driftIndex * across * 0.025;
      for (let center = band + gap; center < across - band - gap; center++) {
        let plus = 0,
          minus = 0,
          plusSum = 0,
          minusSum = 0,
          valid = 0;
        for (const [i, y] of rows.entries()) {
          const x = Math.round(center + drift * (y / (along - 1) - 0.5));
          if (x - gap - band < 0 || x + gap + band >= across) continue;
          const narrow = responses[i * across + x];
          valid++;
          if (narrow >= 9) {
            plus++;
            plusSum += Math.min(40, narrow);
          }
          if (narrow <= -9) {
            minus++;
            minusSum += Math.min(40, -narrow);
          }
        }
        if (valid < rows.length * 0.9) continue;
        if (plus / rows.length >= 0.72 && plusSum / rows.length >= 10)
          positive.push({
            center,
            drift,
            coverage: plus / rows.length,
            strength: plusSum / rows.length,
          });
        if (minus / rows.length >= 0.72 && minusSum / rows.length >= 10)
          negative.push({
            center,
            drift,
            coverage: minus / rows.length,
            strength: minusSum / rows.length,
          });
      }
    }
    const strongest = (values: Edge[]) => {
      values.sort(
        (a, b) =>
          b.strength - a.strength ||
          b.coverage - a.coverage ||
          Math.abs(a.drift) - Math.abs(b.drift),
      );
      const kept: Edge[] = [];
      for (const value of values) {
        if (
          kept.every(
            (other) => Math.abs(value.center - other.center) > across * 0.075,
          )
        )
          kept.push(value);
        if (kept.length === 6) break;
      }
      return kept;
    };
    const pairs: Pair[] = [];
    for (const low of strongest(positive))
      for (const high of strongest(negative)) {
        const separation = high.center - low.center;
        if (
          separation < across * 0.25 ||
          separation > across * 0.88 ||
          Math.min(
            separation - (high.drift - low.drift) / 2,
            separation + (high.drift - low.drift) / 2,
          ) <
            across * 0.22
        )
          continue;
        pairs.push({
          low,
          high,
          score: low.strength + high.strength + separation / across,
          start: 0,
          end: along - 1,
        });
      }
    pairs.sort((a, b) => b.score - a.score);
    const best = pairs[0];
    if (!best) return null;
    // Several distinct light strips can be separate receipts. Do not silently
    // choose one of two similarly strong documents in the same photograph.
    if (
      pairs.some(
        (pair, i) =>
          pair.score >= best.score * 0.8 &&
          pairs
            .slice(i + 1)
            .some(
              (other) =>
                other.score >= best.score * 0.8 &&
                (pair.low.center > other.high.center ||
                  pair.high.center < other.low.center),
            ),
      )
    )
      return null;
    const support = rows.filter((y, i) => {
      const low = Math.round(
        best.low.center + best.low.drift * (y / (along - 1) - 0.5),
      );
      const high = Math.round(
        best.high.center + best.high.drift * (y / (along - 1) - 0.5),
      );
      return (
        low >= 0 &&
        high < across &&
        responses[i * across + low] >= 9 &&
        responses[i * across + high] <= -9
      );
    });
    if (support.length < rows.length * 0.45) return null;
    best.start = support[0];
    best.end = support[support.length - 1];
    return best;
  }
  const xPair = sweep(false),
    yPair = sweep(true);
  // A horizontal band in a portrait receipt can be a fold, blur/redaction or
  // printed rule. Require paper-side evidence along the photograph's long axis.
  if (width <= height ? !xPair : !yPair) return null;
  const x =
    xPair ||
    (yPair
      ? sweep(false, [
          yPair.low.center + Math.abs(yPair.low.drift) / 2,
          yPair.high.center - Math.abs(yPair.high.drift) / 2,
        ])
      : null);
  const y =
    yPair ||
    (xPair
      ? sweep(true, [
          xPair.low.center + Math.abs(xPair.low.drift) / 2,
          xPair.high.center - Math.abs(xPair.high.drift) / 2,
        ])
      : null);
  const bounds: CropBounds = { left: 0, right: 0, top: 0, bottom: 0 };
  if (x) {
    bounds.left = Math.max(
      0,
      Math.floor(((x.low.center - Math.abs(x.low.drift) / 2) * 100) / width) -
        3,
    );
    bounds.right = Math.max(
      0,
      100 -
        Math.ceil(
          ((x.high.center + Math.abs(x.high.drift) / 2) * 100) / width,
        ) -
        3,
    );
  }
  if (y) {
    bounds.top = Math.max(
      0,
      Math.floor(((y.low.center - Math.abs(y.low.drift) / 2) * 100) / height) -
        3,
    );
    bounds.bottom = Math.max(
      0,
      100 -
        Math.ceil(
          ((y.high.center + Math.abs(y.high.drift) / 2) * 100) / height,
        ) -
        3,
    );
  }
  if (x) {
    bounds.top =
      x.start < height * 0.2
        ? 0
        : Math.min(
            bounds.top,
            Math.max(0, Math.floor((x.start * 100) / height) - 3),
          );
    bounds.bottom =
      x.end > height * 0.8
        ? 0
        : Math.min(
            bounds.bottom,
            Math.max(0, 100 - Math.ceil((x.end * 100) / height) - 3),
          );
  }
  if (y) {
    bounds.left =
      y.start < width * 0.2
        ? 0
        : Math.min(
            bounds.left,
            Math.max(0, Math.floor((y.start * 100) / width) - 3),
          );
    bounds.right =
      y.end > width * 0.8
        ? 0
        : Math.min(
            bounds.right,
            Math.max(0, 100 - Math.ceil((y.end * 100) / width) - 3),
          );
  }
  if (Object.values(bounds).reduce((a, b) => a + b, 0) < 4) return null;
  return {
    bounds,
    axes: [
      ...(x ? ["horizontal" as const] : []),
      ...(y ? ["vertical" as const] : []),
    ],
  };
}
