import { z } from "zod";
import type { ReceiptImage } from "./images";
import type { ExtractionProvider } from "./ocr";
import type { ReadingContext } from "./reading-context.mjs";
import type { Recognition } from "./receipt-layout";
import { panelsForImages } from "./panel-transport";
import { validateRecognition } from "./recognition-schema.mjs";
import { assembleRecognition } from "./receipt-layout";
import { parseReceiptWithSources, extractionOutputSchema } from "./parser";
import {
  AZURE_NOTICE,
  azureRequestSchema,
  azureResultSchema,
} from "./azure-schema.mjs";
import { MAX_AI_BODY_BYTES } from "./scan-limits.mjs";
import { recoverAzureQuantities } from "./azure-quantities";

export function receiptFromAzureWords(
  recognition: Recognition,
  context?: ReadingContext,
  quantityHints: unknown = [],
) {
  const assembled = assembleRecognition(recognition);
  extractionOutputSchema.parse({ text: assembled.text });
  const parsed = parseReceiptWithSources(assembled, context);
  parsed.receipt.source = "ocr";
  parsed.receipt.warnings = [
    "Azure source words prepared this draft. Check every purchase, quantity, discount, tax setting and amount against the original photos.",
    ...parsed.receipt.warnings,
    ...assembled.warnings,
  ].slice(0, 60);
  for (const item of parsed.receipt.items) {
    if (
      !(parsed.sources[item.id] || []).some(
        (index) => (assembled.sourceLines[index]?.confidence ?? 0) < 0.75,
      )
    )
      continue;
    for (const field of [
      "description",
      "quantity",
      "unitPrice",
      "lineTotal",
    ] as const)
      if (
        !parsed.receipt.reviewChecks.some(
          (check) =>
            check.scope === "item" &&
            check.itemId === item.id &&
            check.field === field,
        )
      )
        parsed.receipt.reviewChecks.push({
          scope: "item",
          itemId: item.id,
          field,
          reason: "unclear",
          other:
            "Some source words in this purchase were hard to read. Check the highlighted rows and every field.",
          confirmedValue: "",
        });
  }
  recoverAzureQuantities(
    parsed.receipt,
    parsed.sources,
    assembled.sourceLines,
    recognition,
    quantityHints,
  );
  for (const field of ["items", "adjustments", "pricesIncludeTax"] as const)
    if (
      !parsed.receipt.reviewChecks.some(
        (check) => check.scope === "receipt" && check.field === field,
      )
    )
      parsed.receipt.reviewChecks.push({
        scope: "receipt",
        field,
        reason: "source",
        other: "Azure word draft; check every original photo",
        confirmedValue: "",
      });
  return { ...parsed, ...assembled, recognition };
}

export async function extractWithAzure(
  images: ReceiptImage[],
  signal: AbortSignal,
  progress: (status: string) => void,
) {
  progress("Preparing receipt sections for Azure…");
  const panels = await panelsForImages(images, signal);
  const body = JSON.stringify(
    azureRequestSchema.parse({
      consent: true,
      privacyNotice: AZURE_NOTICE,
      panels,
    }),
  );
  if (body.length > MAX_AI_BODY_BYTES)
    throw new Error(
      "These receipt sections are too large together. Crop them or choose fewer photos.",
    );
  const deadline = AbortSignal.timeout(205000);
  progress(
    `Azure is reading ${panels.length} receipt ${panels.length === 1 ? "section" : "sections"}…`,
  );
  try {
    signal.throwIfAborted();
    const response = await fetch("./api/receipts/azure", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-gather-request": "receipt-scan",
      },
      body,
      signal: AbortSignal.any([signal, deadline]),
    });
    const data = await response.json();
    if (!response.ok)
      throw new Error(
        (typeof data?.error === "string"
          ? data.error.slice(0, 500)
          : "Azure could not finish. Your photos are still available; no automatic retry was made.") +
          (data?.cleanup === "unknown"
            ? " Deletion of uploaded Azure sections could not be confirmed."
            : ""),
      );
    signal.throwIfAborted();
    const result = azureResultSchema.parse(data);
    const recognition = validateRecognition(result.recognition, panels);
    const assembled = assembleRecognition(recognition);
    extractionOutputSchema.parse({ text: assembled.text });
    return { ...result, ...assembled, recognition };
  } catch (error) {
    if (signal.aborted || deadline.aborted)
      throw new Error(
        "Azure reading was cancelled or timed out. Uploaded sections can still use the allowance; deletion may be unconfirmed. Your photos are still available.",
      );
    if (
      error instanceof z.ZodError ||
      error instanceof SyntaxError ||
      error instanceof TypeError
    )
      throw new Error(
        "Azure returned invalid evidence or disconnected. Your photos are still available; no automatic retry was made.",
      );
    throw error;
  }
}
export const azureOcrProvider = {
  name: "Azure receipt OCR",
  extract: extractWithAzure,
} satisfies ExtractionProvider;
