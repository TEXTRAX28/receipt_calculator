import { z } from "zod";
import type { ReceiptImage } from "./images";
import type { ExtractionProvider } from "./ocr";
import type { ReadingContext } from "./reading-context.mjs";
import { panelsForImages } from "./panel-transport";
import { MAX_AI_BODY_BYTES } from "./scan-limits.mjs";
import { parseReceiptText } from "./parser";
import { receiptSchema } from "./model";
import {
  VERYFI_NOTICE,
  veryfiRequestSchema,
  veryfiResultSchema,
} from "./veryfi-schema.mjs";

/** Uses literal OCR text only. Provider money/currency/confidence is not evidence. */
export function receiptFromVeryfiText(text: string, context?: ReadingContext) {
  const receipt = parseReceiptText({ text }, context);
  receipt.source = "ocr";
  receipt.warnings = [
    "Veryfi prepared a text draft. Compare every purchase, quantity, discount, tax setting and amount with every original photo. A matching total does not prove the reading is correct.",
    ...receipt.warnings,
  ].slice(0, 60);
  for (const field of ["items", "adjustments", "pricesIncludeTax"] as const)
    if (
      !receipt.reviewChecks.some(
        (check) => check.scope === "receipt" && check.field === field,
      )
    )
      receipt.reviewChecks.push({
        scope: "receipt",
        field,
        reason: "source",
        other: "Veryfi text draft; check every original photo",
        confirmedValue: "",
      });
  return receiptSchema.parse(receipt);
}

export async function extractWithVeryfi(
  images: ReceiptImage[],
  signal: AbortSignal,
  progress: (status: string) => void,
) {
  progress("Preparing receipt sections for Veryfi…");
  const panels = await panelsForImages(images, signal);
  if (panels.length > 15)
    throw new Error(
      "Veryfi accepts up to 15 receipt sections. Crop the photos, choose fewer sections or use another reader.",
    );
  const body = JSON.stringify(
    veryfiRequestSchema.parse({
      consent: true,
      privacyNotice: VERYFI_NOTICE,
      panels,
    }),
  );
  if (body.length > MAX_AI_BODY_BYTES)
    throw new Error(
      "These receipt sections are too large together. Crop them or choose fewer photos.",
    );
  const deadline = AbortSignal.timeout(145000);
  progress("Veryfi is reading these sections as one receipt…");
  try {
    signal.throwIfAborted();
    const response = await fetch("./api/receipts/veryfi", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-gather-request": "receipt-scan",
      },
      body,
      signal: AbortSignal.any([signal, deadline]),
    });
    const data = await response.json();
    if (!response.ok) {
      const message =
        typeof data?.error === "string"
          ? data.error.slice(0, 500)
          : "Veryfi could not finish. Your photos are still available; no automatic retry was made.";
      throw new Error(
        message +
          (data?.cleanup === "unknown"
            ? " Deletion of any new provider record could not be confirmed."
            : ""),
      );
    }
    signal.throwIfAborted();
    return veryfiResultSchema.parse(data);
  } catch (error) {
    if (signal.aborted || deadline.aborted)
      throw new Error(
        "Veryfi reading was cancelled or timed out. The request may have reached the provider and used an attempt. Your photos are still available.",
      );
    if (
      error instanceof z.ZodError ||
      error instanceof SyntaxError ||
      error instanceof TypeError
    )
      throw new Error(
        "Veryfi returned an invalid result or disconnected. Your photos are still available; no automatic retry was made.",
      );
    throw error;
  }
}

export const veryfiOcrProvider = {
  name: "Veryfi OCR",
  extract: extractWithVeryfi,
} satisfies ExtractionProvider;
