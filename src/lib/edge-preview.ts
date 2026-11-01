import type { EdgeSuggestion } from "./receipt-edges";

/** Bounded local preview analysis; original pixels/crops are never modified.
 * Late decodes are closed and cancelled/expired workers cannot return a frame.
 */
export function suggestReceiptEdges(
  preview: Blob,
  signal: AbortSignal,
): Promise<EdgeSuggestion | null> {
  return new Promise((resolve, reject) => {
    let ended = false;
    let worker: Worker | undefined;
    let timer: ReturnType<typeof setTimeout>;
    const finish = (result: EdgeSuggestion | null, error?: Error) => {
      if (ended) return;
      ended = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      worker?.terminate();
      if (error) reject(error);
      else resolve(result);
    };
    const abort = () =>
      finish(null, new DOMException("Edge search cancelled", "AbortError"));
    timer = setTimeout(
      () =>
        finish(
          null,
          new Error("Edge search timed out. Adjust the frame manually."),
        ),
      5000,
    );
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) {
      abort();
      return;
    }
    void createImageBitmap(preview)
      .then((bitmap) => {
        if (ended) {
          bitmap.close();
          return;
        }
        const canvas = document.createElement("canvas");
        try {
          if (
            bitmap.width * bitmap.height > 4_000_000 ||
            bitmap.width > 3200 ||
            bitmap.height > 3200
          )
            throw new Error("Preview exceeds the edge-search budget");
          const scale = Math.min(
            1,
            640 / Math.max(bitmap.width, bitmap.height),
          );
          canvas.width = Math.round(bitmap.width * scale);
          canvas.height = Math.round(bitmap.height * scale);
          if (canvas.width < 24 || canvas.height < 24) {
            finish(null);
            return;
          }
          const context = canvas.getContext("2d", { willReadFrequently: true });
          if (!context) throw new Error("Canvas pixels unavailable");
          context.fillStyle = "#fff";
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
          const pixels = context.getImageData(
            0,
            0,
            canvas.width,
            canvas.height,
          );
          worker = new Worker(
            new URL("./receipt-edges.worker.ts", import.meta.url),
            { type: "module" },
          );
          worker.onerror = () =>
            finish(
              null,
              new Error("Could not find edges. Adjust the frame manually."),
            );
          worker.onmessage = (
            event: MessageEvent<{
              result?: EdgeSuggestion | null;
              error?: boolean;
            }>,
          ) => {
            if (event.data.error || event.data.result === undefined) {
              finish(
                null,
                new Error("Could not find edges. Adjust the frame manually."),
              );
            } else finish(event.data.result);
          };
          const buffer = pixels.data.buffer as ArrayBuffer;
          worker.postMessage(
            { buffer, width: pixels.width, height: pixels.height },
            [buffer],
          );
        } catch {
          finish(
            null,
            new Error(
              "Could not inspect this preview. Adjust the frame manually.",
            ),
          );
        } finally {
          bitmap.close();
          canvas.width = canvas.height = 0;
        }
      })
      .catch(() =>
        finish(
          null,
          new Error(
            "Could not inspect this preview. Adjust the frame manually.",
          ),
        ),
      );
  });
}
