import { z } from "zod";
import { receiptFromAi } from "./gemini";
import type { ReceiptImage } from "./images";
import { panelsForImages } from "./panel-transport";
import { MAX_AI_BODY_BYTES, MAX_LOCAL_VISION_PANELS } from "./scan-limits.mjs";

export async function extractWithLocalVision(
  images: ReceiptImage[],
  signal: AbortSignal,
  progress: (status: string) => void,
) {
  progress("Preparing receipt sections for local vision…");
  const panels = await panelsForImages(images, signal);
  if (panels.length > MAX_LOCAL_VISION_PANELS)
    throw new Error(
      `Local vision currently reads up to ${MAX_LOCAL_VISION_PANELS} prepared sections together. This receipt has ${panels.length}; choose another reader for now. No sections were dropped.`,
    );
  const body = JSON.stringify({ panels });
  if (body.length > MAX_AI_BODY_BYTES)
    throw new Error(
      "These photos are too large together. Crop them or choose fewer sections.",
    );
  progress(
    "Local vision is reading your photos… This also loads the model and can take a minute.",
  );
  const deadline = AbortSignal.timeout(125000);
  try {
    const response = await fetch("./api/receipts/vision", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-gather-request": "receipt-scan",
      },
      body,
      signal: AbortSignal.any([signal, deadline]),
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(
        typeof result.error === "string"
          ? result.error.slice(0, 500)
          : "Local vision could not finish. Your photos are still available; choose another reader.",
      );
    return receiptFromAi(result.receipt, "Local vision");
  } catch (error) {
    if (signal.aborted)
      throw new Error("Scan cancelled. Your photos are still available.");
    if (deadline.aborted)
      throw new Error(
        "Local vision took too long. Your photos are still available; choose another reader or try fewer sections.",
      );
    if (
      error instanceof z.ZodError ||
      error instanceof TypeError ||
      error instanceof SyntaxError
    )
      throw new Error(
        "Local vision returned an invalid draft or disconnected. Your photos are still available; choose another reader or try again.",
      );
    throw error;
  }
}
