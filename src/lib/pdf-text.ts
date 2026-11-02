import type { ReceiptImage } from "./images";
import type { ReadingContext } from "./reading-context.mjs";
import { readingContextSchema } from "./reading-context.mjs";
import type { EvidenceLine, Recognition } from "./receipt-layout";
import {
  PHOTO_SEPARATOR,
  extractionOutputSchema,
  parseReceiptWithSources,
} from "./parser";
import { readPdfInvoice } from "./pdf-invoice";

type TextToken = {
  str: string;
  dir: string;
  width: number;
  height: number;
  transform: number[];
  fontName: string;
};
type TextStyle = { ascent?: number; descent?: number };
export type PdfPageText = {
  width: number;
  height: number;
  lines: Recognition["panels"][number]["lines"];
  words?: (Recognition["panels"][number]["words"][number] & {
    lineIndex?: number;
  })[];
};

/** PDF coordinates supply provenance, not a calibrated probability of correctness. */
export function pdfTextRows(
  items: TextToken[],
  styles: Record<string, TextStyle>,
  viewport: { width: number; height: number; transform: number[] },
): PdfPageText | undefined {
  const { width, height, transform: v } = viewport;
  if (
    ![width, height, ...v].every(Number.isFinite) ||
    width <= 0 ||
    height <= 0 ||
    v.length !== 6
  )
    return;
  const tokens: {
    text: string;
    x: number;
    y: number;
    right: number;
    top: number;
    bottom: number;
    size: number;
  }[] = [];
  let chars = 0;
  for (const item of items) {
    if (!item.str.trim()) continue;
    chars += item.str.length;
    if (
      chars > 60000 ||
      tokens.length >= 10000 ||
      item.str.length > 2000 ||
      /[\u0000-\u0008\u000e-\u001f\ufffd]/.test(item.str)
    )
      return;
    const t = item.transform;
    if (
      t.length !== 6 ||
      ![...t, item.width, item.height].every(Number.isFinite) ||
      item.dir !== "ltr"
    )
      return;
    const a = v[0] * t[0] + v[2] * t[1],
      b = v[1] * t[0] + v[3] * t[1];
    const c = v[0] * t[2] + v[2] * t[3],
      d = v[1] * t[2] + v[3] * t[3];
    const x = v[0] * t[4] + v[2] * t[5] + v[4],
      y = v[1] * t[4] + v[3] * t[5] + v[5];
    const size = Math.hypot(c, d),
      w = item.width * Math.hypot(v[0], v[1]);
    // Complex writing, rotation within a page, or ambiguous overlapping columns use an image reader.
    if (
      a <= 0 ||
      Math.abs(b) > Math.abs(a) * 0.03 ||
      Math.abs(c) > Math.abs(d) * 0.03 ||
      size <= 0 ||
      w <= 0
    )
      return;
    const rawAscent = styles[item.fontName]?.ascent;
    const ascent = Number.isFinite(rawAscent)
      ? Math.max(0.5, Math.min(1.2, rawAscent!))
      : 0.85;
    const top = y - size * ascent,
      bottom = y + size * (1 - ascent);
    if (x + w <= 0 || x >= width || bottom <= 0 || top >= height) continue;
    if (x < -1 || x + w > width + 1 || top < -1 || bottom > height + 1) return;
    tokens.push({
      text: item.str.replace(/\s+/g, " ").trim(),
      x,
      y,
      right: x + w,
      top,
      bottom,
      size,
    });
  }
  tokens.sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: (typeof tokens)[] = [];
  for (const token of tokens) {
    const row = rows.at(-1);
    if (
      row &&
      Math.abs(row[0].y - token.y) <= Math.min(row[0].size, token.size) * 0.3
    )
      row.push(token);
    else rows.push([token]);
  }
  const lines: PdfPageText["lines"] = [];
  const wordLines = new Map<(typeof tokens)[number], number>();
  for (const row of rows) {
    row.sort((a, b) => a.x - b.x);
    if (
      row.some(
        (token, index) =>
          index &&
          row[index - 1].right - token.x >
            Math.min(token.size, row[index - 1].size) * 0.3,
      )
    )
      return;
    const text = row.map((token) => token.text).join(" ");
    if (text.length > 2000) return;
    for (const token of row) wordLines.set(token, lines.length);
    lines.push({
      text,
      confidence: 1,
      box: [
        Math.max(0, row[0].x / width),
        Math.max(0, Math.min(...row.map((token) => token.top)) / height),
        Math.min(1, Math.max(...row.map((token) => token.right)) / width),
        Math.min(1, Math.max(...row.map((token) => token.bottom)) / height),
      ],
    });
  }
  // A lone selectable logo/header does not establish a complete digital receipt.
  if (lines.length < 2 || !lines.some((line) => /\d/.test(line.text))) return;
  if (
    lines.some(
      ({ box: [x0, y0, x1, y1] }) =>
        ![x0, y0, x1, y1].every(Number.isFinite) || x0 >= x1 || y0 >= y1,
    )
  )
    return;
  const words = tokens.map((token) => ({
    text: token.text,
    confidence: 1,
    lineIndex: wordLines.get(token),
    box: [
      Math.max(0, token.x / width),
      Math.max(0, token.top / height),
      Math.min(1, token.right / width),
      Math.min(1, token.bottom / height),
    ] as [number, number, number, number],
  }));
  return { width, height, lines, words };
}

export function canReadPdfText(images: ReceiptImage[]) {
  return (
    images.length > 0 &&
    images.every((image) => image.document?.text && !image.crop)
  );
}

export function readPdfText(images: ReceiptImage[], context?: ReadingContext) {
  if (!canReadPdfText(images))
    throw new Error(
      "Some pages need an image reader. Choose On-device or This computer to read every page.",
    );
  const sourceLines: (EvidenceLine | null)[] = [];
  const panels = images.map((image, index) => {
    const page = image.document!.text!;
    const lines = page.lines.map((line) => ({
      ...line,
      photo: index + 1,
      part: 1,
    }));
    if (index) sourceLines.push(null);
    sourceLines.push(...lines);
    return {
      photo: index + 1,
      part: 1,
      width: page.width,
      height: page.height,
      words: page.words || page.lines,
      lines: page.lines,
    };
  });
  const { text } = extractionOutputSchema.parse({
    text: sourceLines.map((line) => line?.text ?? PHOTO_SEPARATOR).join("\n"),
  });
  const selected = readingContextSchema.optional().parse(context);
  const parsed =
    readPdfInvoice(images, text, selected) ||
    parseReceiptWithSources({ text }, selected);
  parsed.receipt.source = "text";
  parsed.receipt.warnings = [
    ...parsed.receipt.warnings,
    "Read from embedded PDF text on this device. A PDF text layer can omit scanned purchases or differ from its visible page; compare every row and amount with the previews.",
  ].slice(0, 60);
  parsed.receipt.reviewChecks.push({
    scope: "receipt",
    field: "items",
    reason: "document",
    other: "",
    confirmedValue: "",
  });
  return {
    ...parsed,
    text,
    sourceLines,
    recognition: { engine: "pdf-embedded-text" as const, panels },
  };
}
