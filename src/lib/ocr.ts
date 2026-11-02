import { readingBlobs, type ReceiptImage } from "./images";
import { MAX_RECEIPT_IMAGES, MAX_READING_PANELS } from "./scan-limits.mjs";
import { extractionOutputSchema, PHOTO_SEPARATOR } from "./parser";
import type { Worker } from "tesseract.js";
import type {
  Recognition,
  SourceRecognition,
  EvidenceLine,
} from "./receipt-layout";
import { inspectImage } from "./images";
import { joinOcrRows, ocrTextLines } from "./ocr-lines";
import {
  devicePanel,
  deviceRecognition,
  type DeviceSourceRow,
} from "./device-evidence";
import { joinDeviceRows } from "./device-overlap";

export interface ExtractionProvider {
  name: string;
  extract(
    images: ReceiptImage[],
    signal: AbortSignal,
    progress: (status: string) => void,
  ): Promise<{
    text: string;
    warnings?: string[];
    recognition?: SourceRecognition;
    sourceLines?: (EvidenceLine | null)[];
    sourceAlternatives?: Record<number, EvidenceLine[]>;
    sourceConflicts?: number[];
    joinedSectionRows?: number;
    rawSections?: { photo: number; part: number; text: string }[];
  }>;
}

/** Only remove an exact suffix/prefix match at a known overlapping window within one photo. */
export function joinDetailText(parts: string[]): string {
  return joinOcrRows(
    parts.map((text) => ocrTextLines(text).map((text) => ({ text }))),
  )
    .map((row) => row.text)
    .join("\n");
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
        const sourceLines: (EvidenceLine | null)[] = [];
        const sourceAlternatives: Record<number, EvidenceLine[]> = {};
        const sourceConflicts: number[] = [];
        const rawSections: { photo: number; part: number; text: string }[] = [];
        let joinedSectionRows = 0;
        const evidencePanels: Recognition["panels"] = [];
        let incompleteEvidence = false;
        for (let i = 0; i < images.length; i++) {
          if (finished) throw new Error("Scan stopped.");
          const panels = readingBlobs(images[i]);
          const sourceParts: DeviceSourceRow[][] = [];
          const frames: Parameters<typeof joinDeviceRows>[1] = [];
          for (const [part, blob] of panels.entries()) {
            if (finished) throw new Error("Scan stopped.");
            progress(
              `Reading photo ${i + 1} of ${images.length}${panels.length > 1 ? ` · section ${part + 1} of ${panels.length}` : ""} on your device…`,
            );
            const result = await worker.recognize(
              blob,
              {},
              { text: true, blocks: true },
            );
            const text = extractionOutputSchema.parse({
              text: result.data.text,
            }).text;
            rawSections.push({ photo: i + 1, part: part + 1, text });
            let width = 0,
              height = 0;
            try {
              ({ width, height } = inspectImage(
                new Uint8Array(await blob.arrayBuffer()),
                blob.type,
                blob.size,
              ));
            } catch {
              /* Valid text survives unavailable image metadata. */
            }
            const evidence = devicePanel(
              result.data,
              text,
              width,
              height,
              i + 1,
              part + 1,
            );
            if (evidence.panel) evidencePanels.push(evidence.panel);
            if (!evidence.complete) incompleteEvidence = true;
            sourceParts.push(evidence.rows);
            frames.push({
              panel: evidence.panel,
              window: images[i].readingWindows?.[part],
            });
          }
          const joined = joinDeviceRows(sourceParts, frames);
          texts.push(joined.rows.map((row) => row.text).join("\n"));
          if (i) sourceLines.push(null);
          const offset = sourceLines.length;
          for (const [index, row] of joined.rows.entries()) {
            sourceLines.push(row.source);
            if (row.alternatives?.length)
              sourceAlternatives[offset + index] = row.alternatives;
          }
          sourceConflicts.push(
            ...joined.conflicts.map((index) => offset + index),
          );
          joinedSectionRows += joined.dropped;
        }
        const output = extractionOutputSchema.parse({
          text: texts.join(`\n${PHOTO_SEPARATOR}\n`),
        });
        return {
          ...output,
          recognition: deviceRecognition(evidencePanels),
          sourceLines,
          sourceAlternatives,
          sourceConflicts,
          joinedSectionRows,
          rawSections,
          warnings: [
            ...(images.some((image) => readingBlobs(image).length > 1)
              ? [
                  "A tall photo was read in overlapping detail sections. Check for missing or repeated purchases where sections meet. Available source views retain overlapping readings.",
                ]
              : []),
            ...(incompleteEvidence
              ? [
                  "Some on-device source areas could not be matched. Compare those values with the full receipt photo.",
                ]
              : []),
            ...(sourceConflicts.length
              ? [
                  "Overlapping sections read some source rows differently. Conflicting amounts keep the original text assembly; compare both source sections before accepting those values.",
                ]
              : []),
          ],
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
