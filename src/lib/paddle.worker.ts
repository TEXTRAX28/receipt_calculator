// Dedicated, disposable worker. The model runtime is never imported by the page.
import { PaddleOCR } from "@paddleocr/paddleocr-js";
import cvModule from "@techstark/opencv-js";
import assets from "../../scripts/enhanced-ocr-assets.json";
import { inspectImage, MAX_IMAGE_BYTES } from "./images";
import { MAX_READING_PANELS } from "./scan-limits.mjs";

export type PaddleRequest =
  { id: number; type: "init" } | { id: number; type: "read"; blob: Blob };
export type PaddleReply =
  { id: number; ok: true; result?: unknown } | { id: number; ok: false };
let ocr: Awaited<ReturnType<typeof PaddleOCR.create>> | undefined;
let busy = false,
  initialized = false;

export async function processPaddleMessage(
  data: unknown,
): Promise<PaddleReply | null> {
  if (!data || typeof data !== "object") return null;
  const message = data as Partial<PaddleRequest>;
  if (
    !Number.isInteger(message.id) ||
    message.id! < 1 ||
    message.id! > MAX_READING_PANELS + 1
  )
    return null;
  const id = message.id!;
  if (busy) return { id, ok: false };
  busy = true;
  try {
    if (message.type === "init" && !initialized) {
      initialized = true;
      ocr = await PaddleOCR.create({
        worker: false,
        textDetectionModelName: assets.models[0].name,
        textRecognitionModelName: assets.models[1].name,
        textDetectionModelAsset: {
          url: new URL("/ocr-enhanced/det.tar", location.origin).href,
        },
        textRecognitionModelAsset: {
          url: new URL("/ocr-enhanced/rec.tar", location.origin).href,
        },
        textDetectionBatchSize: 1,
        textRecognitionBatchSize: 1,
        ortOptions: {
          backend: "wasm",
          numThreads: 1,
          simd: true,
          wasmPaths: new URL("/ocr-enhanced/", location.origin).href,
        },
      });
      return { id, ok: true };
    }
    if (
      message.type !== "read" ||
      !ocr ||
      !(message.blob instanceof Blob) ||
      message.blob.size > MAX_IMAGE_BYTES
    )
      return { id, ok: false };
    const size = inspectImage(
      new Uint8Array(await message.blob.arrayBuffer()),
      message.blob.type,
      message.blob.size,
    );
    if (size.width * size.height > 4_000_000) return { id, ok: false };
    const bitmap = await createImageBitmap(message.blob);
    try {
      if (bitmap.width !== size.width || bitmap.height !== size.height)
        return { id, ok: false };
      const canvas = new OffscreenCanvas(size.width, size.height);
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return { id, ok: false };
      context.drawImage(bitmap, 0, 0);
      // SDK initialization has initialized this shared OpenCV module. A real Mat
      // uses its supported direct-matrix path, avoiding its DOM-only converter.
      const cv = cvModule instanceof Promise ? await cvModule : cvModule;
      const mat = cv.matFromImageData(
        context.getImageData(0, 0, size.width, size.height),
      );
      try {
        const result = await ocr.predict(mat, {
          textDetLimitSideLen: 960,
          textDetLimitType: "max",
        });
        return { id, ok: true, result };
      } finally {
        mat.delete();
        canvas.width = 0;
        canvas.height = 0;
      }
    } finally {
      bitmap.close();
    }
  } catch {
    return { id, ok: false };
  } finally {
    busy = false;
  }
}
if (typeof self !== "undefined")
  self.addEventListener("message", async (event: MessageEvent<unknown>) => {
    const reply = await processPaddleMessage(event.data);
    if (reply) self.postMessage(reply);
  });
