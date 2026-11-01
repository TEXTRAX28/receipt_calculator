import { z } from "zod";
import type { ReceiptImage } from "./images";
import { panelsForImages } from "./panel-transport";
import { validateRecognition } from "./recognition-schema.mjs";
import { assembleRecognition } from "./receipt-layout";
import { extractionOutputSchema } from "./parser";
import { MAX_AI_BODY_BYTES } from "./scan-limits.mjs";
import { veryfiStatusSchema } from "./veryfi-schema.mjs";

const capabilities = z.object({
  veryfi: veryfiStatusSchema.optional(),
  localModel: z.object({
    configured: z.boolean(),
    name: z.enum(["PaddleOCR", "docTR"]),
  }),
  localVision: z
    .object({
      configured: z.boolean(),
      name: z.string().max(100),
      maxPanels: z.number().int().min(1).max(3),
      maxReceiptPanels: z.number().int().min(1).max(24).optional(),
      supportsBatches: z.boolean().optional(),
    })
    .optional(),
});
export async function localReaderConfiguration(signal: AbortSignal) {
  const response = await fetch("./api/receipts/providers", {
    signal,
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Computer reader unavailable");
  return capabilities.parse(await response.json());
}
export async function localModelConfiguration(signal: AbortSignal) {
  return (await localReaderConfiguration(signal)).localModel;
}

export async function extractWithLocalModel(
  images: ReceiptImage[],
  signal: AbortSignal,
  progress: (status: string) => void,
) {
  progress("Preparing receipt sections for this computer…");
  const panels = await panelsForImages(images, signal);
  const body = JSON.stringify({ panels });
  if (body.length > MAX_AI_BODY_BYTES)
    throw new Error(
      "These photos are too large together. Crop them or choose fewer sections.",
    );
  const deadline = AbortSignal.timeout(125000);
  progress(
    "Reading on this computer… The first scan also loads the receipt model.",
  );
  try {
    const response = await fetch("./api/receipts/recognize", {
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
          : "The computer reader could not finish. Your photos are still available.",
      );
    const recognition = validateRecognition(result.recognition, panels);
    const assembled = assembleRecognition(recognition);
    const text = assembled.text;
    extractionOutputSchema.parse({ text });
    const warnings = [
      "The computer model prepared this draft. Check every purchase, quantity, discount and amount against the originals.",
      ...assembled.warnings,
    ];
    if (
      recognition.panels.some((panel) =>
        panel.words.some((word) => word.confidence < 0.75),
      )
    )
      warnings.push(
        "Some text was difficult to read. Check unclear names and numbers against the photos.",
      );
    if (images.length > 1)
      warnings.push(
        "Check overlapping photos for repeated rows. Separate purchases with identical names must remain separate.",
      );
    return { text, warnings, recognition, sourceLines: assembled.sourceLines };
  } catch (error) {
    if (signal.aborted)
      throw new Error("Scan cancelled. Your photos are still available.");
    if (deadline.aborted)
      throw new Error(
        "The computer reader took too long. Try fewer sections or use the on-device reader.",
      );
    if (
      error instanceof z.ZodError ||
      error instanceof TypeError ||
      error instanceof SyntaxError
    )
      throw new Error(
        "The computer reader returned invalid evidence or disconnected. Your photos are still available; try the on-device reader.",
      );
    throw error;
  }
}
