import { findReceiptEdges } from "./receipt-edges";

self.onmessage = (event: MessageEvent) => {
  try {
    const { width, height, buffer } = event.data;
    if (!(buffer instanceof ArrayBuffer) || buffer.byteLength > 640 * 640 * 4)
      throw new Error("Invalid edge sample");
    const result = findReceiptEdges({
      width,
      height,
      data: new Uint8ClampedArray(buffer),
    });
    self.postMessage({ result });
  } catch {
    self.postMessage({ error: true });
  }
};
