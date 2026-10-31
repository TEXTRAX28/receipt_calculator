import type { ReceiptImage } from "./images";
import type { Receipt } from "./model";
import { extractWithLocalModel } from "./local-model";
import { extractLocalVisionEvidence } from "./local-vision";
import { parseReceiptWithSources } from "./parser";
import { verifyIndependentReadings } from "./verify-readings";
import { panelsForImages } from "./panel-transport";
import { MAX_LOCAL_VISION_PANELS } from "./scan-limits.mjs";
import { extractLocalVisionBatches } from "./local-vision-batches";
import { joinVisionBatches } from "./join-vision-batches";
import type { ReadingContext } from "./reading-context.mjs";

/** Each model sees the original prepared images; OCR text never enters the vision request. */
export async function extractComparedReceipt(
  images: ReceiptImage[],
  signal: AbortSignal,
  progress: (status: string) => void,
  context?: ReadingContext,
): Promise<
  ReturnType<typeof verifyIndependentReadings> & { comparisonComplete: boolean }
> {
  const primary = await extractWithLocalModel(images, signal, progress);
  try {
    const panels = await panelsForImages(images, signal);
    const compared =
      panels.length > MAX_LOCAL_VISION_PANELS
        ? joinVisionBatches(
            await extractLocalVisionBatches(panels, signal, progress),
            panels,
            primary.recognition,
            context,
          )
        : verifyIndependentReadings(
            await extractLocalVisionEvidence(images, signal, progress),
            primary.recognition,
            context,
          );
    progress("Comparing the independent readings with the printed rows…");
    if (signal.aborted)
      throw new Error("Scan cancelled. Your photos are still available.");
    return {
      ...compared,
      comparisonComplete: true,
    };
  } catch (error) {
    if (signal.aborted) throw error;
    // Preserve a successful first reading, but never label it as independently checked.
    const parsed = parseReceiptWithSources(primary, context);
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
      itemAnchors: [],
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
