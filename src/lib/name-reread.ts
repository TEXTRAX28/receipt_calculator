import type { Item } from "./model";
import type { ExtractionProvider } from "./ocr";
import { localOcrProvider } from "./ocr";
import { enhancedOcrProvider } from "./paddle-browser";
import { readingBlobs, type ReceiptImage } from "./images";
import type { parseReceiptWithSources } from "./parser";
import { countedPurchaseRows } from "./receipt-roles";
import { MAX_READING_PANELS } from "./scan-limits.mjs";

type Output = Awaited<ReturnType<ExtractionProvider["extract"]>>;
type Parsed = ReturnType<typeof parseReceiptWithSources>;
const normal = (value: string) =>
  value.trim().replace(/\s+/g, " ").toLowerCase();
const stripCount = (value: string, quantity: string) => {
  const match = value.trim().match(/^(\d+)\s+(.+)$/);
  return match && match[1] === quantity ? match[2] : value.trim();
};
function fragmentContainsName(text: string, item: Item) {
  const value = normal(stripCount(text, item.quantity)),
    name = normal(item.description);
  if (value === name) return true;
  if (!value.startsWith(name + " ")) return false;
  // A recognizer may put the optional unit column in the name fragment.
  // Keep it eligible for a source re-read; the acceptance rule still requires
  // identical purchased count and line amount and changes only the name.
  return /^(?:[£$€]?\s*\d[\d,.]*[.,]\d{2,3})(?:\s+[£$€]?\s*\d[\d,.]*[.,]\d{2,3})?$/.test(
    value.slice(name.length + 1),
  );
}
function oneCharacterApart(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 1 || a === b) return false;
  let i = 0,
    j = 0,
    differences = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++differences > 1) return false;
    if (a.length >= b.length) i++;
    if (b.length >= a.length) j++;
  }
  return differences + (i < a.length || j < b.length ? 1 : 0) === 1;
}

/** Agreement is evidence, not a confidence percentage. Never changes money/counts.
 * The second reader must support the changed word strongly and the full name in
 * order. Restrict automatic repairs to one ASCII-letter edit in one name token.
 */
export function supportedNameRepair(
  item: Item,
  paddle: Output,
  tesseract: Output,
): string | null {
  const row = countedPurchaseRows(
    ["Qty Dish Amount", paddle.text.trim()],
    undefined,
    "\u0000",
  ).rows.get(1);
  if (
    !row ||
    row.quantity !== item.quantity ||
    row.lineTotal !== item.lineTotal
  )
    return null;
  const before = item.description.trim().split(/\s+/),
    after = row.description.trim().split(/\s+/);
  if (
    before.length !== after.length ||
    before.some((word) => !/^[A-Za-z]+$/.test(word)) ||
    after.some((word) => !/^[A-Za-z]+$/.test(word))
  )
    return null;
  const changed = before.flatMap((word, index) =>
    normal(word) !== normal(after[index]) ? [index] : [],
  );
  if (
    changed.length !== 1 ||
    !oneCharacterApart(normal(before[changed[0]]), normal(after[changed[0]]))
  )
    return null;
  const fragments = paddle.recognition?.panels
    .flatMap((panel) => panel.words)
    .filter((word) => /[A-Za-z]{2}/.test(word.text));
  if (!fragments?.length || fragments.some((word) => word.confidence < 0.75))
    return null;
  const words =
    tesseract.recognition?.panels
      .flatMap((panel) => panel.words)
      .map((word) => ({
        ...word,
        text: normal(word.text).replace(/^[^a-z]+|[^a-z]+$/g, ""),
      })) || [];
  const agreed = words.some((_, start) =>
    after.every((word, index) => {
      const observed = words[start + index];
      return (
        observed &&
        observed.text === normal(word) &&
        observed.confidence >= (index === changed[0] ? 0.9 : 0.7)
      );
    }),
  );
  if (!agreed) return null;
  return before
    .map((word, index) =>
      index !== changed[0]
        ? word
        : word === word.toUpperCase()
          ? after[index].toUpperCase()
          : /^[A-Z]/.test(word)
            ? after[index][0].toUpperCase() + after[index].slice(1)
            : after[index].toLowerCase(),
    )
    .join(" ");
}

/** A bounded local name check after successful browser OCR. Keep the first draft
 * on unavailable assets, weak/disagreeing readings or an eight-second deadline.
 * Both readers share the original panel budget; their workers run sequentially.
 */
export async function rereadUncertainNames(
  parsed: Parsed,
  output: Output,
  images: ReceiptImage[],
  parent: AbortSignal,
  progress: (message: string) => void,
): Promise<Parsed> {
  parent.throwIfAborted();
  if (output.recognition?.engine !== "paddle-ppocrv6-tiny-browser-wasm")
    return parsed;
  const limit = Math.min(
    8,
    Math.floor((MAX_READING_PANELS - output.recognition.panels.length) / 2),
  );
  if (limit < 1) return parsed;
  const candidates = parsed.receipt.items
    .flatMap((item) => {
      if (
        !item.quantity ||
        !item.lineTotal ||
        !/^[A-Za-z ]+$/.test(item.description)
      )
        return [];
      const sources = parsed.sources[item.id] || [];
      if (sources.length !== 1) return [];
      const line = output.sourceLines?.[sources[0]];
      if (!line) return [];
      const panel = output.recognition!.panels.find(
        (panel) => panel.photo === line.photo && panel.part === line.part,
      );
      const fragment = panel?.words.find(
        (word) =>
          (word.box[0] + word.box[2]) / 2 >= line.box[0] &&
          (word.box[0] + word.box[2]) / 2 <= line.box[2] &&
          (word.box[1] + word.box[3]) / 2 >= line.box[1] &&
          (word.box[1] + word.box[3]) / 2 <= line.box[3] &&
          fragmentContainsName(word.text, item) &&
          word.confidence >= 0.6 &&
          word.confidence < 0.96,
      );
      return fragment && line.box[3] - line.box[1] < 0.12
        ? [{ item, line }]
        : [];
    })
    .slice(0, limit);
  if (!candidates.length) return parsed;
  const controller = new AbortController(),
    signal = AbortSignal.any([parent, controller.signal]);
  const timer = setTimeout(
    () => controller.abort(new Error("Name reading deadline")),
    8000,
  );
  const temporary: ReceiptImage[] = [];
  const ownedUrls: string[] = [];
  try {
    for (const { line } of candidates) {
      signal.throwIfAborted();
      const blob = readingBlobs(images[line.photo - 1])[line.part - 1];
      const bitmap = await createImageBitmap(blob);
      try {
        const margin = 6,
          x = Math.max(0, Math.floor(line.box[0] * bitmap.width) - margin),
          y = Math.max(0, Math.floor(line.box[1] * bitmap.height) - margin);
        const width = Math.min(
            bitmap.width - x,
            Math.ceil((line.box[2] - line.box[0]) * bitmap.width) + margin * 2,
          ),
          height = Math.min(
            bitmap.height - y,
            Math.ceil((line.box[3] - line.box[1]) * bitmap.height) + margin * 2,
          );
        if (width < 8 || height < 8 || width * height > 200000) return parsed;
        const canvas = document.createElement("canvas");
        canvas.width = width + 40;
        canvas.height = height + 40;
        try {
          const context = canvas.getContext("2d");
          if (!context) return parsed;
          context.fillStyle = "white";
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.drawImage(bitmap, x, y, width, height, 20, 20, width, height);
          const cropped = await new Promise<Blob>((resolve, reject) =>
            canvas.toBlob(
              (blob) =>
                blob
                  ? resolve(blob)
                  : reject(new Error("Name crop unavailable")),
              "image/png",
            ),
          );
          const url = URL.createObjectURL(cropped);
          ownedUrls.push(url);
          temporary.push({
            id: crypto.randomUUID(),
            name: "Local name detail",
            url,
            blob: cropped,
          });
        } finally {
          canvas.width = canvas.height = 0;
        }
      } finally {
        bitmap.close();
      }
    }
    signal.throwIfAborted();
    progress("Checking unclear names on your device…");
    const first = await enhancedOcrProvider.extract(
      temporary,
      signal,
      () => {},
    );
    const enlarged: ReceiptImage[] = [];
    for (const image of temporary) {
      signal.throwIfAborted();
      const bitmap = await createImageBitmap(image.blob);
      try {
        const canvas = document.createElement("canvas");
        canvas.width = (bitmap.width - 40) * 2 + 40;
        canvas.height = (bitmap.height - 40) * 2 + 40;
        try {
          const context = canvas.getContext("2d");
          if (!context) return parsed;
          context.fillStyle = "white";
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.drawImage(
            bitmap,
            20,
            20,
            bitmap.width - 40,
            bitmap.height - 40,
            20,
            20,
            (bitmap.width - 40) * 2,
            (bitmap.height - 40) * 2,
          );
          const blob = await new Promise<Blob>((resolve, reject) =>
            canvas.toBlob(
              (blob) =>
                blob
                  ? resolve(blob)
                  : reject(new Error("Name crop unavailable")),
              "image/png",
            ),
          );
          const url = URL.createObjectURL(blob);
          ownedUrls.push(url);
          const next = { ...image, blob, url };
          enlarged.push(next);
        } finally {
          canvas.width = canvas.height = 0;
        }
      } finally {
        bitmap.close();
      }
    }
    temporary.push(...enlarged);
    const second = await localOcrProvider.extract(enlarged, signal, () => {});
    signal.throwIfAborted();
    const changes = new Map<string, string>();
    for (const [index, { item }] of candidates.entries()) {
      const panel = first.recognition?.panels.find(
        (panel) => panel.photo === index + 1,
      );
      const alternative = second.recognition?.panels.find(
        (panel) => panel.photo === index + 1,
      );
      if (!panel || !alternative) continue;
      const row = panel.lines.map((line) => line.text).join("\n");
      const name = supportedNameRepair(
        item,
        { text: row, recognition: { ...first.recognition!, panels: [panel] } },
        {
          text: "",
          recognition: { ...second.recognition!, panels: [alternative] },
        },
      );
      if (name) changes.set(item.id, name);
    }
    if (!changes.size) return parsed;
    return {
      ...parsed,
      receipt: {
        ...parsed.receipt,
        items: parsed.receipt.items.map((item) =>
          changes.has(item.id)
            ? {
                ...item,
                description: changes.get(item.id)!,
                observedDescription:
                  item.observedDescription || item.description,
              }
            : item,
        ),
      },
    };
  } catch (error) {
    if (parent.aborted) throw error;
    return parsed;
  } finally {
    clearTimeout(timer);
    for (const url of ownedUrls) URL.revokeObjectURL(url);
  }
}
