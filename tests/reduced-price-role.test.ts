import { describe, expect, it } from "vitest";
import { verifyIndependentReadings } from "../src/lib/verify-readings";
import { reducedPriceFixture as fixture } from "./fixtures/reduced-price-role";
import { calculateReceipt, calculateSplit } from "../src/lib/engine";
import { newState, receiptStamp } from "../src/lib/model";
import { confirmReviewCheck, reviewKey } from "../src/lib/review-checks";

describe("source-backed reduced selling-price roles", () => {
  it("moves the literal price out of the deduction and retains both source checks", () => {
    const { raw, recognition } = fixture();
    const originals = structuredClone({ raw, recognition });
    const result = verifyIndependentReadings(raw, recognition);
    expect({ raw, recognition }).toEqual(originals);
    expect(result.receipt.items[0]).toMatchObject({
      quantity: "1",
      unitPrice: "",
      lineTotal: "0.50",
      discount: "0",
    });
    expect(result.priceRecoveries).toHaveLength(1);
    expect(result.priceRecoveries[0].sourceIndices).toHaveLength(2);
    for (const field of ["lineTotal", "discount"])
      expect(result.receipt.reviewChecks).toContainEqual(
        expect.objectContaining({
          field,
          reason: "recovered",
          confirmedValue: "",
          details: [
            { label: "Printed reduced selling price", value: "0.50" },
            { label: "Previous vision deduction", value: "0.50" },
          ],
        }),
      );
    expect(calculateReceipt(result.receipt).total).toBe(50n);
    const state = newState();
    state.receipt = result.receipt;
    state.people = [{ id: "one", name: "One" }];
    state.receipt.items[0].assignment.participants = ["one"];
    for (const check of state.receipt.reviewChecks)
      if (!(check.scope === "item" && check.field === "discount"))
        state.receipt = confirmReviewCheck(state.receipt, reviewKey(check));
    state.reviewedStamp = receiptStamp(state.receipt);
    expect(calculateSplit(state).canFinalize).toBe(false);
    const discount = state.receipt.reviewChecks.find(
      (check) => check.scope === "item" && check.field === "discount",
    )!;
    state.receipt = confirmReviewCheck(state.receipt, reviewKey(discount));
    state.reviewedStamp = receiptStamp(state.receipt);
    expect(calculateSplit(state).canFinalize).toBe(true);
  });

  it.each([
    "line-price",
    "unit-price",
    "different-discount",
    "zero-discount",
    "negative-discount",
    "different-name",
    "different-photo",
    "different-currency",
    "different-tax-code",
    "low-title-word",
    "low-label-word",
    "low-price-word",
    "low-line",
    "missing-word",
    "duplicate-word",
    "overlapping-rows",
    "missing-price",
    "deduction-label",
  ])("abstains with %s evidence", (variant) => {
    const { raw, recognition } = fixture();
    const item = raw.items[0],
      panel = recognition.panels[0];
    if (variant === "line-price") item.lineTotal = "1.00";
    if (variant === "unit-price") item.unitPrice = "1.00";
    if (variant === "different-discount") item.discount = "0.25";
    if (variant === "zero-discount") item.discount = "0";
    if (variant === "negative-discount") item.discount = "-0.50";
    if (variant === "different-name") item.description = "TEACAKES";
    if (variant === "different-photo") item.sourcePhotos = [2];
    if (variant === "different-currency") raw.currency = "USD";
    if (variant === "different-tax-code") item.taxCode = "A";
    if (variant === "low-title-word")
      panel.words.find((word) => word.text === "TEACAKES")!.confidence = 0.97;
    if (variant === "low-label-word")
      panel.words.find((word) => word.text === "REDUCED")!.confidence = 0.97;
    if (variant === "low-price-word")
      panel.words.find((word) => word.text === "0.50")!.confidence = 0.97;
    if (variant === "low-line") panel.lines[3].confidence = 0.97;
    if (variant === "missing-word")
      panel.words = panel.words.filter((word) => word.text !== "REDUCED");
    if (variant === "duplicate-word")
      panel.words.push(
        structuredClone(panel.words.find((word) => word.text === "REDUCED")!),
      );
    if (variant === "overlapping-rows") panel.lines[2].box[3] = 0.35;
    if (variant === "missing-price") panel.lines[3].text = "REDUCED PRICE";
    if (variant === "deduction-label") panel.lines[3].text = "DISCOUNT 0.50";
    if (variant === "negative-discount") {
      expect(() => verifyIndependentReadings(raw, recognition)).toThrow();
      return;
    }
    const result = verifyIndependentReadings(raw, recognition);
    expect(result.priceRecoveries).toHaveLength(0);
    expect(result.receipt.items[0].lineTotal).toBe(item.lineTotal);
    expect(result.receipt.items[0].discount).toBe(item.discount);
  });

  it("honors the existing source-recovery opt-out", () => {
    const { raw, recognition } = fixture();
    const result = verifyIndependentReadings(raw, recognition, undefined, {
      allowPriceRecovery: false,
    });
    expect(result.priceRecoveries).toEqual([]);
    expect(result.receipt.items[0].discount).toBe("0.50");
    expect(result.receipt.items[0].lineTotal).toBe("");
  });

  it("does not use the final total to select or calculate a selling price", () => {
    const { raw, recognition } = fixture();
    raw.printedTotal = "12.34";
    const result = verifyIndependentReadings(raw, recognition);
    expect(result.receipt.items[0].lineTotal).toBe("0.50");
    expect(result.receipt.printedTotal).toBe("12.34");
    expect(calculateReceipt(result.receipt).discrepancy).not.toBe(0n);
  });
});
