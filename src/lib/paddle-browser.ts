import assets from "../../scripts/enhanced-ocr-assets.json";
import { inspectImage, readingBlobs } from "./images";
import { MAX_RECEIPT_IMAGES, MAX_READING_PANELS } from "./scan-limits.mjs";
import { assembleRecognition, type SourceRecognition } from "./receipt-layout";
import { extractionOutputSchema } from "./parser";
import { paddlePanel } from "./paddle-layout";
import type { ExtractionProvider } from "./ocr";
import type { PaddleRequest, PaddleReply } from "./paddle.worker";

const unavailable =
  "Enhanced reader files are unavailable. You can still enter or correct the receipt manually.";
const failed =
  "The receipt reader could not read this image. Try a clearer crop, fewer photos or manual entry.";
/** No image has been recognised. The combined device flow may use its local fallback. */
export class EnhancedReaderUnavailableError extends Error {}
export const enhancedOcrProvider: ExtractionProvider = {
  name: "Enhanced on-device OCR",
  async extract(images, signal, progress) {
    if (!images.length || images.length > MAX_RECEIPT_IMAGES)
      throw new Error(
        `Choose between one and ${MAX_RECEIPT_IMAGES} receipt images.`,
      );
    if (
      images.reduce((n, image) => n + readingBlobs(image).length, 0) >
      MAX_READING_PANELS
    )
      throw new Error(
        "This receipt has too many detail sections. Choose fewer photos or crop the background.",
      );
    if (signal.aborted)
      throw new Error("Scan cancelled. Your photos are still available.");
    if (
      typeof OffscreenCanvas !== "function" ||
      typeof createImageBitmap !== "function"
    )
      throw new EnhancedReaderUnavailableError(
        "The enhanced reader is not supported in this browser. Choose On-device or enter the receipt manually.",
      );
    let ownedWorker: Worker | undefined;
    let recognitionStarted = false;
    let stopped = false,
      nextId = 0;
    let waiting:
      | {
          id: number;
          resolve(value: unknown): void;
          reject(error: Error): void;
        }
      | undefined;
    const fetching = new AbortController();
    let rejectFailure!: (error: Error) => void;
    const failure = new Promise<never>((_, reject) => {
      rejectFailure = reject;
    });
    const stop = (message: string, unavailableBeforeReading = false) => {
      const error = unavailableBeforeReading
        ? new EnhancedReaderUnavailableError(message)
        : new Error(message);
      stopped = true;
      fetching.abort();
      ownedWorker?.terminate();
      waiting?.reject(error);
      waiting = undefined;
      rejectFailure(error);
    };
    const cancelled = () =>
      stop("Scan cancelled. Your photos and draft are still available.");
    signal.addEventListener("abort", cancelled, { once: true });
    const deadline = setTimeout(
      () =>
        stop(
          "Scanning took longer than 120 seconds. Try fewer photos, a clearer crop or manual entry.",
        ),
      120000,
    );
    const send = (
      request:
        | Omit<Extract<PaddleRequest, { type: "read" }>, "id">
        | Omit<Extract<PaddleRequest, { type: "init" }>, "id">,
    ) =>
      new Promise<unknown>((resolve, reject) => {
        if (stopped || !ownedWorker || waiting) {
          reject(new Error("Scan stopped."));
          return;
        }
        const id = ++nextId;
        waiting = { id, resolve, reject };
        ownedWorker.postMessage({ ...request, id });
      });
    try {
      return await Promise.race([
        failure,
        (async () => {
          progress("Loading the enhanced reader on your device…");
          await Promise.all(
            [...assets.models, ...assets.runtime].map(async (file) => {
              const response = await fetch(
                new URL(`/ocr-enhanced/${file.file}`, location.origin),
                {
                  method: "HEAD",
                  signal: AbortSignal.any([
                    fetching.signal,
                    AbortSignal.timeout(6000),
                  ]),
                  credentials: "omit",
                  redirect: "error",
                },
              );
              const type = response.headers.get("content-type") || "",
                length = response.headers.get("content-length");
              if (
                !response.ok ||
                /html/i.test(type) ||
                (file.file.endsWith(".mjs") && !/javascript/i.test(type)) ||
                (length !== null && Number(length) !== file.bytes)
              )
                throw new EnhancedReaderUnavailableError(unavailable);
            }),
          ).catch(() => {
            throw new EnhancedReaderUnavailableError(unavailable);
          });
          if (stopped) throw new Error("Scan stopped.");
          ownedWorker = new Worker(
            new URL("./paddle.worker.ts", import.meta.url),
            { type: "module" },
          );
          ownedWorker.addEventListener(
            "error",
            () =>
              stop(
                "The receipt reader stopped unexpectedly. Try fewer photos or manual entry.",
                !recognitionStarted,
              ),
            { once: true },
          );
          ownedWorker.addEventListener(
            "message",
            (event: MessageEvent<PaddleReply>) => {
              if (stopped || !waiting) return;
              const reply = event.data;
              if (
                !reply ||
                reply.id !== waiting.id ||
                typeof reply.ok !== "boolean"
              ) {
                stop(
                  "The receipt reader returned an invalid response. Try manual entry.",
                  !recognitionStarted,
                );
                return;
              }
              const current = waiting;
              waiting = undefined;
              if (reply.ok) current.resolve(reply.result);
              else current.reject(new Error(failed));
            },
          );
          await send({ type: "init" });
          recognitionStarted = true;
          const panels: SourceRecognition["panels"] = [];
          for (const [photo, image] of images.entries()) {
            const blobs = readingBlobs(image);
            for (const [part, blob] of blobs.entries()) {
              if (stopped) throw new Error("Scan stopped.");
              const size = inspectImage(
                new Uint8Array(await blob.arrayBuffer()),
                blob.type,
                blob.size,
              );
              if (size.width * size.height > 4_000_000) throw new Error(failed);
              progress(
                `Reading photo ${photo + 1} of ${images.length}${blobs.length > 1 ? ` · section ${part + 1} of ${blobs.length}` : ""} on your device…`,
              );
              const raw = await send({ type: "read", blob });
              if (stopped) throw new Error("Scan stopped.");
              panels.push(
                paddlePanel(raw, size.width, size.height, photo + 1, part + 1),
              );
            }
          }
          const recognition: SourceRecognition = {
            engine: "paddle-ppocrv6-tiny-browser-wasm",
            panels,
          };
          const assembled = assembleRecognition(
            recognition,
            images.map((image) => image.readingWindows),
          );
          extractionOutputSchema.parse({ text: assembled.text });
          return {
            ...assembled,
            recognition,
            warnings: [
              ...assembled.warnings,
              ...(images.some((image) => readingBlobs(image).length > 1)
                ? [
                    "A tall photo was read in overlapping detail sections. Check for missing or repeated purchases where sections meet. Available source views retain overlapping readings.",
                  ]
                : []),
              "This experimental reader prepared a draft. Check every purchase, quantity, discount, amount and overlapping row against the photos.",
            ],
            rawSections: panels.map((panel) => ({
              photo: panel.photo,
              part: panel.part,
              text: panel.lines.map((line) => line.text).join("\n"),
            })),
          };
        })(),
      ]);
    } catch (error) {
      if (stopped || error instanceof EnhancedReaderUnavailableError)
        throw error;
      if (!recognitionStarted && !signal.aborted)
        throw new EnhancedReaderUnavailableError(failed);
      throw new Error(failed);
    } finally {
      clearTimeout(deadline);
      signal.removeEventListener("abort", cancelled);
      fetching.abort();
      stopped = true;
      waiting?.reject(new Error("Scan stopped."));
      waiting = undefined;
      ownedWorker?.terminate();
    }
  },
};
