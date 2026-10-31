import { readingBlobs, type ReceiptImage } from "./images";
import { MAX_RECEIPT_IMAGES, MAX_READING_PANELS } from "./scan-limits.mjs";

export interface ReadingPanel {
  photo: number;
  part: number;
  data: string;
}
/** Transport prepared sections only; originals stay in the capture component. */
export async function panelsForImages(
  images: ReceiptImage[],
  signal: AbortSignal,
): Promise<ReadingPanel[]> {
  if (!images.length || images.length > MAX_RECEIPT_IMAGES)
    throw new Error(
      `Choose between one and ${MAX_RECEIPT_IMAGES} receipt photos.`,
    );
  const panels: ReadingPanel[] = [];
  for (const [photo, image] of images.entries()) {
    for (const [part, blob] of readingBlobs(image).entries()) {
      if (signal.aborted)
        throw new Error("Scan cancelled. Your photos are still available.");
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = "";
      for (let offset = 0; offset < bytes.length; offset += 16384)
        binary += String.fromCharCode(
          ...bytes.subarray(offset, offset + 16384),
        );
      panels.push({ photo: photo + 1, part: part + 1, data: btoa(binary) });
      if (panels.length > MAX_READING_PANELS)
        throw new Error(
          "This receipt has too many detail panels. Choose fewer photos or crop away the background.",
        );
    }
  }
  return panels;
}
