import type { ReceiptImage } from "./images";
import { extractionOutputSchema, PHOTO_SEPARATOR } from "./parser";
import type { Worker } from "tesseract.js";

export interface ExtractionProvider {
  name: string;
  extract(
    images: ReceiptImage[],
    signal: AbortSignal,
    progress: (status: string) => void,
  ): Promise<{ text: string }>;
}

/** Replace this provider at the boundary; all output must pass extractionOutputSchema. No receipt text is executable. */
export const localOcrProvider: ExtractionProvider = {
  name: "On-device English OCR",
  async extract(images, signal, progress) {
    if (!images.length || images.length > 3)
      throw new Error("Choose between one and three receipt images.");
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
                "OCR could not start: local OCR assets are missing. Run npm run prepare:ocr, or use manual entry.",
              );
          }),
        ).catch(() => {
          throw new Error(
            "OCR could not start: local OCR assets are unavailable. Try again or use manual entry.",
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
          progress(
            `Reading image ${i + 1} of ${images.length} on your device…`,
          );
          const result = await worker.recognize(
            images[i].ocrBlob || images[i].blob,
          );
          texts.push(
            extractionOutputSchema.parse({ text: result.data.text }).text,
          );
        }
        return extractionOutputSchema.parse({
          text: texts.join(`\n${PHOTO_SEPARATOR}\n`),
        });
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
