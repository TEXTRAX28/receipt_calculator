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
import { reviewDeviceReading } from "./device-review";
import type { ReadingContext } from "./reading-context.mjs";
import {
  localCheckDecision,
  type LocalCheckMode,
  type LocalCheckDecision,
} from "./local-check-policy";

/** Each model sees the original prepared images; OCR text never enters the vision request. */
export async function extractComparedReceipt(
  images: ReceiptImage[],
  signal: AbortSignal,
  progress: (status: string) => void,
  context?: ReadingContext,
  mode: Exclude<LocalCheckMode, "off"> = "always",
): Promise<
  ReturnType<typeof verifyIndependentReadings> & {
    comparisonComplete: boolean;
    comparisonAttempted: boolean;
    decision: LocalCheckDecision;
  }
> {
  const primary = await extractWithLocalModel(images, signal, progress);
  if (signal.aborted)
    throw new Error("Scan cancelled. Your photos are still available.");
  const parsed = parseReceiptWithSources(primary, context);
  const decision = localCheckDecision(
    parsed.receipt,
    parsed.sources,
    primary.sourceLines,
    primary.recognition,
  );
  const firstReading = (failed: boolean, error?: unknown) => {
    const receipt: Receipt = reviewDeviceReading(
      { ...parsed.receipt, source: "ocr" },
      parsed.sources,
      primary.sourceLines,
      primary.recognition,
      parsed.fieldSources,
    );
    if (
      !receipt.reviewChecks.some(
        (check) => check.scope === "receipt" && check.field === "items",
      )
    )
      receipt.reviewChecks.push({
        scope: "receipt",
        field: "items",
        reason: failed ? "coverage" : "source",
        other: failed
          ? "The second reading could not be completed"
          : "Computer OCR draft; check every purchase against the originals",
        confirmedValue: "",
      });
    receipt.warnings = [
      ...receipt.warnings,
      ...primary.warnings,
      ...(failed
        ? [
            "The extra vision comparison could not finish. This is the computer OCR draft only. Check the whole purchase list against your photos or try again.",
            error instanceof Error
              ? error.message.slice(0, 350)
              : "Choose another reader if the extra comparison remains unavailable.",
          ]
        : []),
    ].slice(0, 60);
    return {
      receipt,
      itemAnchors: [],
      sources: parsed.sources,
      fieldSources: parsed.fieldSources,
      recognition: primary.recognition,
      text: primary.text,
      sourceLines: primary.sourceLines,
      corrections: [],
      priceRecoveries: [],
      unitRecoveries: [],
      scalarRecoveries: [],
      taxBasisRecovery: null,
      financialRoleRecovery: null,
      removedAdjustments: [],
      agreements: 0,
      matchedPurchases: 0,
      ocrPurchases: receipt.items.length,
      originalVisionPurchases: 0,
      comparisonComplete: false,
      comparisonAttempted: failed,
      decision,
    };
  };
  if (mode === "auto" && !decision.needed) return firstReading(false);
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
      comparisonAttempted: true,
      decision,
    };
  } catch (error) {
    if (signal.aborted) throw error;
    // Keep every existing source/classification check when a second reader fails.
    return firstReading(true, error);
  }
}
