import type { ReceiptImage } from "./images";
import { validateGeometry, type ReceiptGeometry } from "./image-geometry";
import type { CaptureQuality } from "./image-quality";

export interface GeometryResult {
  preview: Blob;
  panels?: Blob[];
  width: number;
  height: number;
  quality: CaptureQuality;
}
/** An owned worker bounds decoding/resampling. Cancellation terminates it; stale results cannot apply. */
export function straightenImage(
  image: ReceiptImage,
  geometry: ReceiptGeometry,
  signal: AbortSignal,
): Promise<GeometryResult> {
  validateGeometry(geometry);
  return new Promise((resolve, reject) => {
    let worker: Worker | undefined,
      ended = false;
    const finish = (value?: GeometryResult, error?: Error) => {
      if (ended) return;
      ended = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      worker?.terminate();
      if (error) reject(error);
      else resolve(value!);
    };
    const abort = () =>
      finish(
        undefined,
        new DOMException("Photo correction cancelled", "AbortError"),
      );
    const timer = setTimeout(
      () =>
        finish(
          undefined,
          new Error(
            "Photo correction took too long. Trim the photo or use a smaller image.",
          ),
        ),
      30000,
    );
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) {
      abort();
      return;
    }
    try {
      worker = new Worker(
        new URL("./image-geometry.worker.ts", import.meta.url),
        { type: "module" },
      );
      worker.onerror = () =>
        finish(
          undefined,
          new Error(
            "Photo correction is unavailable. Use trimming or take a flatter photo.",
          ),
        );
      worker.onmessage = (
        event: MessageEvent<GeometryResult & { error?: string }>,
      ) => {
        if (event.data.error) finish(undefined, new Error(event.data.error));
        else if (
          !(event.data.preview instanceof Blob) ||
          event.data.preview.type !== "image/jpeg" ||
          !event.data.preview.size ||
          event.data.preview.size > 5 * 1024 * 1024 ||
          (event.data.panels &&
            (!Array.isArray(event.data.panels) ||
              event.data.panels.length > 24 ||
              event.data.panels.some(
                (blob) =>
                  !(blob instanceof Blob) ||
                  blob.type !== "image/jpeg" ||
                  !blob.size ||
                  blob.size > 5 * 1024 * 1024,
              ))) ||
          !Number.isSafeInteger(event.data.width) ||
          !Number.isSafeInteger(event.data.height) ||
          event.data.width < 8 ||
          event.data.height < 8 ||
          event.data.width > 20000 ||
          event.data.height > 20000 ||
          event.data.width * event.data.height > 25_000_000 ||
          !Array.isArray(event.data.quality?.flags)
        )
          finish(
            undefined,
            new Error("Invalid corrected photo. Use trimming or retake it."),
          );
        else finish(event.data);
      };
      worker.postMessage({ blob: image.sourceBlob || image.blob, geometry });
    } catch {
      finish(
        undefined,
        new Error(
          "Photo correction is unavailable. Use trimming or take a flatter photo.",
        ),
      );
    }
  });
}
