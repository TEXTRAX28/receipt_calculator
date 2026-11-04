import { z } from "zod";
import { recognitionSchema } from "./recognition-schema.mjs";
import { extractionOutputSchema } from "./parser";
import type { Recognition } from "./receipt-layout";
import { polygonReadingLines } from "./polygon-lines";

const sdkResult = z.object({
  image: z.strictObject({
    width: z.number().int().min(8).max(4000),
    height: z.number().int().min(8).max(4000),
  }),
  items: z
    .array(
      z.strictObject({
        text: z.string().max(2000),
        score: z.number().min(0).max(1),
        poly: z.array(z.tuple([z.number(), z.number()])).length(4),
      }),
    )
    .max(2000),
});
type Region = Recognition["panels"][number]["words"][number];
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b),
    mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/** Actual line fragments and polygons; never invent per-word or character boxes. */
export function paddlePanel(
  input: unknown,
  width: number,
  height: number,
  photo: number,
  part: number,
) {
  const result = z.array(sdkResult).length(1).parse(input)[0];
  if (
    result.image.width !== width ||
    result.image.height !== height ||
    width * height > 4_000_000
  )
    throw new Error("Enhanced reader returned mismatched image geometry.");
  extractionOutputSchema.parse({
    text: result.items.map((item) => item.text).join("\n"),
  });
  const words: Region[] = result.items.map(({ text, score, poly }) => ({
    text,
    confidence: score,
    box: [
      Math.max(0, Math.min(...poly.map((p) => p[0])) / width),
      Math.max(0, Math.min(...poly.map((p) => p[1])) / height),
      Math.min(1, Math.max(...poly.map((p) => p[0])) / width),
      Math.min(1, Math.max(...poly.map((p) => p[1])) / height),
    ],
  }));
  const lines = polygonReadingLines(
    words,
    result.items.map((item) => item.poly),
    width,
    height,
    horizontalLines,
  );
  // Browser-only engine identity; remote engines cannot claim this or SDK ownership.
  return recognitionSchema.shape.panels.element.parse({
    photo,
    part,
    width,
    height,
    words,
    lines,
  });
}

// Preserve the previous grouping when usable word directions are unavailable.
function horizontalLines(words: Region[]): Region[] {
  const rows: Region[][] = [];
  for (const token of [...words].sort(
    (a, b) =>
      (a.box[1] + a.box[3]) / 2 - (b.box[1] + b.box[3]) / 2 ||
      a.box[0] - b.box[0],
  )) {
    if (!token.text.trim()) continue;
    const center = (token.box[1] + token.box[3]) / 2,
      height = token.box[3] - token.box[1];
    let best = -1,
      distance = Infinity;
    for (const [index, row] of rows.entries()) {
      const delta = Math.abs(
        center - median(row.map((w) => (w.box[1] + w.box[3]) / 2)),
      );
      if (
        delta <=
          0.45 *
            Math.min(height, median(row.map((w) => w.box[3] - w.box[1]))) &&
        delta < distance
      ) {
        best = index;
        distance = delta;
      }
    }
    if (best >= 0) rows[best].push(token);
    else rows.push([token]);
  }
  return rows.map((row) => ({
    text: row
      .sort((a, b) => a.box[0] - b.box[0])
      .map((w) => w.text.trim())
      .join(" "),
    confidence: Math.min(...row.map((w) => w.confidence)),
    box: [
      Math.min(...row.map((w) => w.box[0])),
      Math.min(...row.map((w) => w.box[1])),
      Math.max(...row.map((w) => w.box[2])),
      Math.max(...row.map((w) => w.box[3])),
    ],
  }));
}
