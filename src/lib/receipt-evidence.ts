import type { Item, Receipt } from "./model";
import { readingBlobs, type ReceiptImage } from "./images";
import { PHOTO_SEPARATOR } from "./parser";
import type { EvidenceLine, Recognition } from "./receipt-layout";

export type SourcePanel = {
  photo: number;
  part: number;
  width: number;
  height: number;
  blob: Blob;
  regions: EvidenceLine[];
  unclear: boolean;
};
export type ItemEvidence = { fieldsStamp: string; panels: SourcePanel[] };
export type ReceiptEvidence = {
  receiptId: string;
  items: Record<string, ItemEvidence>;
};

export const itemReadStamp = (item: Item) =>
  JSON.stringify([
    item.description,
    item.quantity,
    item.unitPrice,
    item.lineTotal,
    item.discount,
    item.taxCode,
  ]);

/** Missing or misaligned provenance never authorizes a guessed source rectangle. */
export function collectReceiptEvidence(
  receipt: Receipt,
  text: string,
  sources: Record<string, number[]>,
  sourceLines: (EvidenceLine | null)[],
  recognition: Recognition,
  images: ReceiptImage[],
): ReceiptEvidence | null {
  const normalized = text
    .replace(/\r/g, "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  if (
    normalized.length !== sourceLines.length ||
    normalized.some(
      (line, index) => line !== (sourceLines[index]?.text ?? PHOTO_SEPARATOR),
    )
  )
    return null;
  const items: ReceiptEvidence["items"] = {};
  for (const item of receipt.items) {
    const panels = new Map<string, SourcePanel>();
    for (const index of new Set(sources[item.id] || [])) {
      const region = sourceLines[index];
      if (!region) continue;
      const input = recognition.panels.find(
        (p) => p.photo === region.photo && p.part === region.part,
      );
      const image = images[region.photo - 1];
      const blob = image && readingBlobs(image)[region.part - 1];
      if (!input || !blob) continue;
      const key = `${input.photo}:${input.part}`;
      let panel = panels.get(key);
      if (!panel) {
        panel = {
          photo: input.photo,
          part: input.part,
          width: input.width,
          height: input.height,
          blob,
          regions: [],
          unclear: false,
        };
        panels.set(key, panel);
      }
      panel.regions.push(region);
      const [x0, y0, x1, y1] = region.box;
      panel.unclear ||=
        region.confidence < 0.75 ||
        input.words.some((word) => {
          const x = (word.box[0] + word.box[2]) / 2,
            y = (word.box[1] + word.box[3]) / 2;
          return (
            word.confidence < 0.75 && x >= x0 && x <= x1 && y >= y0 && y <= y1
          );
        });
    }
    if (panels.size)
      items[item.id] = {
        fieldsStamp: itemReadStamp(item),
        panels: [...panels.values()],
      };
  }
  return { receiptId: receipt.id, items };
}

/** A little context around the literal source rows, within the validated panel. */
export function sourceViewport(panel: SourcePanel) {
  if (!panel.regions.length) throw new Error("No source region is available");
  const boxes = panel.regions.map((r) => r.box);
  const left = Math.max(0, Math.min(...boxes.map((b) => b[0])) - 0.035);
  const right = Math.min(1, Math.max(...boxes.map((b) => b[2])) + 0.035);
  const top = Math.max(0, Math.min(...boxes.map((b) => b[1])) - 0.025);
  const bottom = Math.min(1, Math.max(...boxes.map((b) => b[3])) + 0.025);
  return {
    x: left * panel.width,
    y: top * panel.height,
    width: (right - left) * panel.width,
    height: (bottom - top) * panel.height,
  };
}
