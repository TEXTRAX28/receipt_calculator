import { z } from "zod";
import { recognitionSchema } from "./recognition-schema.mjs";
import type {
  Recognition,
  SourceRecognition,
  EvidenceLine,
} from "./receipt-layout";
import { ocrTextLines } from "./ocr-lines";

export const DEVICE_OCR_ENGINE = "tesseract-js-6-eng" as const;
// A local browser engine is not an allowed claim on the remote-reader boundary.
const browserSchema = recognitionSchema.extend({
  engine: z.literal(DEVICE_OCR_ENGINE),
  panels: z
    .array(
      recognitionSchema.shape.panels.element.extend({
        wordRows: z
          .array(z.number().int().min(0).max(1999))
          .max(10000)
          .optional(),
      }),
    )
    .max(24),
});
type Panel = SourceRecognition["panels"][number];
export interface DeviceSourceRow {
  text: string;
  source: EvidenceLine | null;
  alternatives?: EvidenceLine[];
}
export interface DevicePanel {
  panel?: Panel;
  rows: DeviceSourceRow[];
  complete: boolean;
}
const nativeRegion = z.object({
  text: z.string().max(2000),
  confidence: z.number().min(0).max(100),
  bbox: z.object({
    x0: z.number(),
    y0: z.number(),
    x1: z.number(),
    y1: z.number(),
  }),
});
const textKey = (text: string) => text.trim().replace(/\s+/gu, " ");
class LayoutBudgetError extends Error {}

/** Copy actual SDK geometry only. A malformed layout cannot invalidate valid plain text. */
export function devicePanel(
  data: unknown,
  text: string,
  width: number,
  height: number,
  photo: number,
  part: number,
): DevicePanel {
  const rows = ocrTextLines(text).map((text) => ({
    text,
    source: null as EvidenceLine | null,
  }));
  const empty = { photo, part, width, height, words: [], lines: [] };
  if (
    !browserSchema.safeParse({ engine: DEVICE_OCR_ENGINE, panels: [empty] })
      .success
  )
    return { rows, complete: false };
  try {
    let visited = 0;
    const list = (value: unknown, maximum: number): unknown[] => {
      if (!Array.isArray(value) || value.length > maximum)
        throw new LayoutBudgetError("Invalid SDK layout budget");
      visited += value.length;
      if (visited > 20000)
        throw new LayoutBudgetError("SDK layout budget exceeded");
      return value;
    };
    const object = (value: unknown) => {
      if (!value || typeof value !== "object")
        throw Error("Invalid SDK layout");
      return value as Record<string, unknown>;
    };
    const region = (value: unknown): Panel["lines"][number] => {
      const parsed = nativeRegion.parse(value),
        b = parsed.bbox;
      if (
        ![b.x0, b.y0, b.x1, b.y1].every(Number.isFinite) ||
        b.x0 < 0 ||
        b.y0 < 0 ||
        b.x1 > width ||
        b.y1 > height ||
        b.x0 >= b.x1 ||
        b.y0 >= b.y1 ||
        /[\r\n]/.test(parsed.text.trim())
      )
        throw Error("Invalid SDK region");
      return {
        text: parsed.text.trim(),
        confidence: parsed.confidence / 100,
        box: [b.x0 / width, b.y0 / height, b.x1 / width, b.y1 / height],
      };
    };
    const panel: Panel = { ...empty, words: [], lines: [], wordRows: [] };
    for (const block of list(object(data).blocks, 2000))
      for (const paragraph of list(object(block).paragraphs, 2000))
        for (const rawLine of list(object(paragraph).lines, 2000)) {
          try {
            const line = region(rawLine);
            if (!line.text) continue;
            const words = list(object(rawLine).words, 10000)
              .map(region)
              .filter((word) => word.text);
            if (
              !words.length ||
              textKey(words.map((word) => word.text).join(" ")) !==
                textKey(line.text) ||
              words.some((word) => {
                const x = (word.box[0] + word.box[2]) / 2,
                  y = (word.box[1] + word.box[3]) / 2;
                return (
                  x < line.box[0] ||
                  x > line.box[2] ||
                  y < line.box[1] ||
                  y > line.box[3]
                );
              })
            )
              throw Error("Incomplete SDK word evidence");
            panel.wordRows!.push(...words.map(() => panel.lines.length));
            panel.lines.push(line);
            panel.words.push(...words);
            if (panel.lines.length > 2000 || panel.words.length > 10000)
              throw new LayoutBudgetError("SDK region budget exceeded");
          } catch (error) {
            if (error instanceof LayoutBudgetError) throw error;
            // One unusable row cannot authorize a box, or discard other valid rows.
          }
        }
    const validated = browserSchema.parse({
      engine: DEVICE_OCR_ENGINE,
      panels: [panel],
    }).panels[0];
    const equalSequence =
      rows.length === validated.lines.length &&
      rows.every(
        (row, i) => textKey(row.text) === textKey(validated.lines[i].text),
      );
    const counts = (texts: string[]) => {
      const map = new Map<string, number>();
      for (const text of texts) {
        const key = textKey(text);
        map.set(key, (map.get(key) || 0) + 1);
      }
      return map;
    };
    const pageCounts = counts(rows.map((row) => row.text)),
      layoutCounts = counts(validated.lines.map((line) => line.text));
    const unique = new Map(
      validated.lines
        .filter((line) => layoutCounts.get(textKey(line.text)) === 1)
        .map((line) => [textKey(line.text), line]),
    );
    for (const [i, row] of rows.entries()) {
      const source = equalSequence
        ? validated.lines[i]
        : pageCounts.get(textKey(row.text)) === 1
          ? unique.get(textKey(row.text))
          : undefined;
      if (source) row.source = { ...source, text: row.text, photo, part };
    }
    return {
      panel: validated,
      rows,
      complete: rows.every((row) => row.source !== null),
    };
  } catch {
    return { panel: empty, rows, complete: false };
  }
}

export function deviceRecognition(
  panels: Panel[],
): SourceRecognition | undefined {
  if (!panels.length) return;
  return browserSchema.parse({ engine: DEVICE_OCR_ENGINE, panels });
}
