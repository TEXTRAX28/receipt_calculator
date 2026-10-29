import { readingBlobs, type ReceiptImage } from "./images";
import { MAX_RECEIPT_IMAGES, MAX_READING_PANELS } from "./scan-limits.mjs";
import { extractionOutputSchema, PHOTO_SEPARATOR } from "./parser";
import type { Worker } from "tesseract.js";

export interface ExtractionProvider {
  name: string;
  extract(
    images: ReceiptImage[],
    signal: AbortSignal,
    progress: (status: string) => void,
  ): Promise<{ text: string; warnings?: string[] }>;
}

/** Only remove an exact suffix/prefix match at a known overlapping window within one photo. */
export function joinDetailText(parts: string[]): string {
  const lines = (text: string) =>
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  const key = (line: string) => line.toUpperCase().replace(/\s+/g, "");
  let joined = lines(parts[0] || "");
  for (const part of parts.slice(1)) {
    const next = lines(part);
    let overlap = 0;
    for (
      let count = Math.min(200, joined.length, next.length);
      count >= 3;
      count--
    ) {
      const tail = joined.slice(-count).map(key);
      if (
        new Set(tail).size >= 3 &&
        tail.every((line, index) => line === key(next[index]))
      ) {
        overlap = count;
        break;
      }
    }
    joined = [...joined, ...next.slice(overlap)];
  }
  return joined.join("\n");
}

/** Replace this provider at the boundary; all output must pass extractionOutputSchema. No receipt text is executable. */
export const localOcrProvider: ExtractionProvider = {
  name: "On-device English OCR",
  async extract(images, signal, progress) {
    if (!images.length || images.length > MAX_RECEIPT_IMAGES)
      throw new Error(
        `Choose between one and ${MAX_RECEIPT_IMAGES} receipt images.`,
      );
    if (
      images.reduce((sum, image) => sum + readingBlobs(image).length, 0) >
      MAX_READING_PANELS
    )
      throw new Error(
        "This receipt has too many detail panels. Choose fewer photos or crop away the background.",
      );
    let worker: Worker | undefined;
    const fetchController = new AbortController();
    let finished = false;
    let deadline: ReturnType<typeof setTimeout>;
    let abortListener: () => void;
    let rejectFailure: (reason: Error) => void;
    const failure = new Promise<never>((_, reject) => {
      rejectFailure = reject;
    });
    const stop = (message: string) => {
      finished = true;
      fetchController.abort();
      void worker?.terminate();
      rejectFailure(new Error(message));
    };
    abortListener = () =>
      stop("Scan cancelled. Your draft and images are still available.");
    signal.addEventListener("abort", abortListener, { once: true });
    deadline = setTimeout(
      () =>
        stop(
          "Scanning took longer than 120 seconds. Try a cropped image or enter the receipt manually.",
        ),
      120000,
    );
    try {
      if (signal.aborted) throw new Error("Scan cancelled.");
      const work = (async () => {
        progress("Preparing private, on-device OCR…");
        // Fail promptly when a static host is missing OCR assets, before creating a worker.
        await Promise.all(
          [
            "worker.min.js",
            "eng.traineddata.gz",
            "tesseract-core-lstm.wasm.js",
          ].map(async (asset) => {
            const response = await fetch(
              new URL(`/ocr/${asset}`, location.origin),
              { method: "HEAD", signal: fetchController.signal },
            );
            if (
              !response.ok ||
              (asset.endsWith(".js") &&
                !/javascript/.test(response.headers.get("content-type") || ""))
            )
              throw new Error(
                "The on-device scanner files are missing. Reload Gather and try again, or use Gemini or manual entry.",
              );
          }),
        ).catch(() => {
          throw new Error(
            "OCR could not start: scanner files are unavailable. Keep Gather's local server running, reload and try again, or use manual entry.",
          );
        });
        const { createWorker, PSM } = await import("tesseract.js");
        if (finished) throw new Error("Scan stopped.");
        const created = await createWorker("eng", 1, {
          workerPath: new URL("/ocr/worker.min.js", location.origin).href,
          corePath: new URL("/ocr/", location.origin).href,
          langPath: new URL("/ocr", location.origin).href,
          workerBlobURL: false,
          cacheMethod: "none",
          errorHandler: () =>
            stop(
              "OCR could not start. Check that the local OCR assets are installed, or use manual entry.",
            ),
        });
        worker = created;
        if (finished) {
          await worker.terminate();
          throw new Error("Scan stopped.");
        }
        await worker.setParameters({
          preserve_interword_spaces: "1",
          tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
        });
        const texts: string[] = [];
        for (let i = 0; i < images.length; i++) {
          if (finished) throw new Error("Scan stopped.");
          const panels = readingBlobs(images[i]);
          const parts: string[] = [];
          for (const [part, blob] of panels.entries()) {
            if (finished) throw new Error("Scan stopped.");
            progress(
              `Reading photo ${i + 1} of ${images.length}${panels.length > 1 ? ` · section ${part + 1} of ${panels.length}` : ""} on your device…`,
            );
            const result = await worker.recognize(blob);
            parts.push(
              extractionOutputSchema.parse({ text: result.data.text }).text,
            );
          }
          texts.push(joinDetailText(parts));
        }
        const output = extractionOutputSchema.parse({
          text: texts.join(`\n${PHOTO_SEPARATOR}\n`),
        });
        return {
          ...output,
          warnings: images.some((image) => readingBlobs(image).length > 1)
            ? [
                "A tall photo was read in overlapping detail sections. Exact joins were merged; check for missing or repeated lines where sections meet.",
              ]
            : [],
        };
      })();
      return await Promise.race([work, failure]);
    } catch (error) {
      throw error instanceof Error
        ? error
        : new Error(
            "OCR could not start. Check the local OCR assets, try again, or use manual entry.",
          );
    } finally {
      finished = true;
      clearTimeout(deadline);
      signal.removeEventListener("abort", abortListener);
      fetchController.abort();
      await worker?.terminate();
    }
  },
};
