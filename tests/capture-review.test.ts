import { describe, expect, it } from "vitest";
import { requireCorrectedPhotoReview } from "../src/lib/capture-review";
import { newReceipt, newItem } from "../src/lib/model";
import {
  checkIsPending,
  confirmReviewCheck,
  applyItemEdit,
  reviewKey,
} from "../src/lib/review-checks";

describe("corrected-photo source review", () => {
  it("leaves ordinary scans untouched and preserves original model output", () => {
    const receipt = newReceipt();
    receipt.items = [newItem()];
    expect(requireCorrectedPhotoReview(receipt, false)).toBe(receipt);
    const bytes = JSON.stringify(receipt),
      next = requireCorrectedPhotoReview(receipt, true);
    expect(JSON.stringify(receipt)).toBe(bytes);
    expect(next.reviewChecks).toHaveLength(1);
    expect(checkIsPending(next, next.reviewChecks[0])).toBe(true);
  });
  it("deduplicates coverage, revokes old confirmations and reopens after later edits", () => {
    const receipt = newReceipt();
    receipt.items = [newItem()];
    const pending = requireCorrectedPhotoReview(receipt, true),
      key = reviewKey(pending.reviewChecks[0]);
    const checked = confirmReviewCheck(pending, key, true);
    expect(checkIsPending(checked, checked.reviewChecks[0])).toBe(false);
    const reread = requireCorrectedPhotoReview(checked, true);
    expect(reread.reviewChecks).toHaveLength(1);
    expect(checkIsPending(reread, reread.reviewChecks[0])).toBe(true);
    const edited = applyItemEdit(checked, checked.items[0].id, {
      description: "Apples",
    });
    expect(checkIsPending(edited, edited.reviewChecks[0])).toBe(true);
  });
});
