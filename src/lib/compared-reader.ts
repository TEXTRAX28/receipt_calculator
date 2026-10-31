import type { ReceiptImage } from "./images";
import type { Receipt } from "./model";
import { extractWithLocalModel } from "./local-model";
import { extractLocalVisionEvidence } from "./local-vision";
import { parseReceiptWithSources } from "./parser";
import { verifyIndependentReadings } from "./verify-readings";

/** Each model sees the original prepared images; OCR text never enters the vision request. */
export async function extractComparedReceipt(
  images: ReceiptImage[],
  signal: AbortSignal,
  progress: (status: string) => void,
): Promise<
  ReturnType<typeof verifyIndependentReadings> & { comparisonComplete: boolean }
> {
  const primary = await extractWithLocalModel(images, signal, progress);
  try {
    const vision = await extractLocalVisionEvidence(images, signal, progress);
    progress("Comparing the independent readings with the printed rows…");
    if (signal.aborted)
      throw new Error("Scan cancelled. Your photos are still available.");
    return {
      ...verifyIndependentReadings(vision, primary.recognition),
      comparisonComplete: true,
    };
  } catch (error) {
    if (signal.aborted) throw error;
    // Preserve a successful first reading, but never label it as independently checked.
    const parsed = parseReceiptWithSources(primary);
    const receipt: Receipt = {
      ...parsed.receipt,
      source: "ocr",
      reviewChecks: [
        {
          scope: "receipt",
          field: "items",
          reason: "coverage",
          other: "The second reading could not be completed",
          confirmedValue: "",
        },
      ],
    };
    receipt.warnings = [
      ...receipt.warnings,
      ...primary.warnings,
      "The extra vision comparison could not finish. This is the computer OCR draft only. Check the whole purchase list against your photos or try again.",
      error instanceof Error
        ? error.message.slice(0, 350)
        : "Choose another reader if the extra comparison remains unavailable.",
    ].slice(0, 60);
    return {
      receipt,
      sources: parsed.sources,
      fieldSources: {},
      recognition: primary.recognition,
      text: primary.text,
      sourceLines: primary.sourceLines,
      corrections: [],
      removedAdjustments: [],
      agreements: 0,
      matchedPurchases: 0,
      ocrPurchases: receipt.items.length,
      originalVisionPurchases: 0,
      comparisonComplete: false,
    };
  }
}
