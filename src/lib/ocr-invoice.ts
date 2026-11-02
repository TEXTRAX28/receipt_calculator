import type { EvidenceLine, SourceRecognition } from "./receipt-layout";
import type { ReadingContext } from "./reading-context.mjs";
import { alignedSourceWords } from "./source-words";
import { readInvoiceColumns } from "./invoice-columns";
import type { InvoiceRow } from "./invoice-layout";

const key = (text: string) => text.replace(/\s/gu, "");

/** OCR keeps its actual scores/regions; it never impersonates native PDF text. */
export function readOcrInvoice(
  output: unknown,
  text: string,
  context?: ReadingContext,
) {
  try {
    return readRows(output, text, context);
  } catch {
    return null;
  }
}

function readRows(output: unknown, text: string, context?: ReadingContext) {
  if (!output || typeof output !== "object") return null;
  const packet = output as {
    recognition?: SourceRecognition;
    sourceLines?: (EvidenceLine | null)[];
    sourceConflicts?: number[];
  };
  const recognition = packet.recognition,
    lines = packet.sourceLines;
  if (
    !recognition ||
    !lines ||
    packet.sourceConflicts?.length ||
    !recognition.panels.length ||
    recognition.panels.length > 24 ||
    recognition.panels.some(
      (panel) => panel.words.length > 10000 || panel.lines.length > 2000,
    )
  )
    return null;
  const texts = text
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (texts.length !== lines.length || texts.length > 2000) return null;
  // Without a literal purchase header, ordinary receipt parsing remains the path.
  if (
    !texts.some(
      (line) =>
        /\b(?:description|product)\b/i.test(line) &&
        /\b(?:qty|quantity)\b/i.test(line),
    )
  )
    return null;
  const panels = new Map<string, InvoiceRow[]>(),
    used = new Set<string>();
  for (const [index, line] of lines.entries()) {
    if (!line) {
      if (texts[index] === "--- GATHER PHOTO BOUNDARY ---") continue;
      return null;
    }
    if (key(line.text) !== key(texts[index])) return null;
    const words = alignedSourceWords(line, recognition);
    if (
      !words?.length ||
      words.map((word) => key(word.text)).join("") !== key(texts[index])
    )
      return null;
    for (const word of words) {
      if (
        !Number.isFinite(word.confidence) ||
        word.confidence < 0 ||
        word.confidence > 1 ||
        !word.box.every((n) => Number.isFinite(n) && n >= 0 && n <= 1)
      )
        return null;
      const identity = JSON.stringify([
        line.photo,
        line.part,
        word.text,
        word.box,
      ]);
      if (used.has(identity)) return null;
      used.add(identity);
    }
    const id = `${line.photo}:${line.part}`,
      rows = panels.get(id) || [];
    rows.push({ cells: words, text: texts[index], index });
    panels.set(id, rows);
  }
  return readInvoiceColumns([...panels.values()], text, context, "ocr");
}
