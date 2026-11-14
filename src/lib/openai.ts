import { z } from "zod";
import type { ReceiptImage } from "./images";
import type { ReadingContext } from "./reading-context.mjs";
import { panelsForImages } from "./panel-transport";
import { receiptFromOpenAi } from "./openai-draft";
import { MAX_AI_BODY_BYTES } from "./scan-limits.mjs";
import { openaiStatusSchema } from "./openai-schema.mjs";

export async function openaiConfiguration(signal: AbortSignal) {
  const response = await fetch("./api/receipts/openai/config", {
    signal,
    cache: "no-store",
  });
  if (!response.ok) throw new Error("OpenAI connection unavailable");
  return openaiStatusSchema.parse(await response.json());
}

export async function extractWithOpenAi(
  images: ReceiptImage[],
  signal: AbortSignal,
  progress: (status: string) => void,
  context?: ReadingContext,
) {
  progress("Preparing receipt sections for OpenAI…");
  const panels = await panelsForImages(images, signal);
  signal.throwIfAborted();
  const body = JSON.stringify({ consent: true, useCredits: true, panels });
  if (new TextEncoder().encode(body).byteLength > MAX_AI_BODY_BYTES)
    throw new Error(
      "These receipt sections are too large together. Crop the photos or choose fewer sections.",
    );
  const deadline = AbortSignal.timeout(95000);
  const requestSignal = AbortSignal.any([signal, deadline]);
  progress("OpenAI is reading your receipt…");
  try {
    const response = await fetch("./api/receipts/openai", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-gather-request": "receipt-scan",
      },
      body,
      signal: requestSignal,
    });
    const result = response.ok
      ? await response.json()
      : await response.json().catch(() => null);
    requestSignal.throwIfAborted();
    if (!response.ok)
      throw new Error(
        typeof result?.error === "string"
          ? result.error.slice(0, 500)
          : "OpenAI could not read this receipt. Your photos are still available.",
      );
    return receiptFromOpenAi(result?.receipt, context, images.length);
  } catch (error) {
    if (signal.aborted || deadline.aborted)
      throw new Error(
        "The OpenAI scan was cancelled or timed out. It may still use API credits. Your photos are still available.",
      );
    if (error instanceof z.ZodError)
      throw new Error(
        "OpenAI returned an invalid or incomplete draft. Your photos are still available.",
      );
    if (error instanceof TypeError || error instanceof SyntaxError)
      throw new Error(
        "The OpenAI connection could not finish. Your photos are still available; no automatic retry was made.",
      );
    throw error;
  }
}
