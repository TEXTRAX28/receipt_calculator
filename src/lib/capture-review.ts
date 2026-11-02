import type { Receipt } from "./model";

/** A geometric correction does not verify the OCR's purchases or amounts. */
export function requireCorrectedPhotoReview(
  receipt: Receipt,
  corrected: boolean,
): Receipt {
  if (!corrected) return receipt;
  const next = structuredClone(receipt);
  const coverage = next.reviewChecks.find(
    (check) => check.scope === "receipt" && check.field === "items",
  );
  if (coverage) coverage.confirmedValue = "";
  else
    next.reviewChecks.push({
      scope: "receipt",
      field: "items",
      reason: "source",
      other:
        "A photo was rotated or straightened. Compare every purchase and amount with the corrected copy and original photo.",
      confirmedValue: "",
    });
  return next;
}
