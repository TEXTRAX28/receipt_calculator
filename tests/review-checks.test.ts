import { describe, expect, it } from "vitest";
import { calculateReceipt, calculateSplit } from "../src/lib/engine";
import { appSchema, receiptStamp, type ReviewCheck } from "../src/lib/model";
import {
  applyItemEdit,
  applyReceiptEdit,
  checkIsPending,
  confirmReviewCheck,
  reviewKey,
} from "../src/lib/review-checks";
import { loadDraft, saveDraft } from "../src/lib/storage";
import { assign, review, shop } from "./helpers";
import { parseReceiptText } from "../src/lib/parser";

function fixture() {
  const state = shop(["10.00"]);
  assign(state, "equal");
  const check: ReviewCheck = {
    scope: "item",
    itemId: state.receipt.items[0].id,
    field: "lineTotal",
    reason: "different",
    other: "9.00",
    confirmedValue: "",
  };
  state.receipt.reviewChecks = [check];
  review(state);
  return { state, check };
}
describe("independent reading disagreements cannot be accepted by arithmetic alone", () => {
  it("explains a purchase-count check without calling the positive receipt a refund", () => {
    let receipt = parseReceiptText(
      "Corner shop GBP\nApples 1x 2.00 2.00\nTOTAL NUMBER OF ITEMS SOLD 1\nTOTAL GBP 2.00",
    );
    const check = receipt.reviewChecks.find(
      (entry) =>
        entry.scope === "receipt" &&
        entry.field === "items" &&
        entry.reason === "classification",
    );
    expect(check).toBeDefined();
    expect(checkIsPending(receipt, check!)).toBe(true);
    const result = calculateReceipt(receipt);
    expect(result.discrepancy).toBe(0n);
    const issue = result.issues.find((entry) => entry.path === "items");
    expect(issue?.message).toContain("item-count summary");
    expect(issue?.message).not.toMatch(/negative row|refund/i);
    receipt = confirmReviewCheck(receipt, reviewKey(check!));
    expect(calculateReceipt(receipt).issues).toEqual([]);
  });
  it("blocks a fully balanced, assigned and globally reviewed draft until the affected value is checked", () => {
    const { state, check } = fixture();
    expect(calculateReceipt(state.receipt).discrepancy).toBe(0n);
    expect(calculateSplit(state).canFinalize).toBe(false);
    state.receipt = confirmReviewCheck(state.receipt, reviewKey(check));
    expect(calculateSplit(state).canFinalize).toBe(true);
    state.receipt.items[0].lineTotal = "9.00";
    expect(checkIsPending(state.receipt, state.receipt.reviewChecks[0])).toBe(
      true,
    );
  });
  it("counts an explicit edit as a human reading, without clearing other disputed fields", () => {
    const { state, check } = fixture();
    state.receipt.reviewChecks.push({
      ...check,
      field: "quantity",
      other: "2",
    });
    state.receipt = applyItemEdit(state.receipt, check.itemId, {
      lineTotal: "10.00",
    });
    expect(checkIsPending(state.receipt, state.receipt.reviewChecks[0])).toBe(
      false,
    );
    expect(checkIsPending(state.receipt, state.receipt.reviewChecks[1])).toBe(
      true,
    );
  });
  it("removes checks only for explicitly deleted purchases and retains receipt-list coverage checks", () => {
    const { state } = fixture();
    state.receipt.reviewChecks.push({
      scope: "receipt",
      field: "items",
      reason: "coverage",
      other: "2 purchase rows",
      confirmedValue: "",
    });
    state.receipt = applyReceiptEdit(state.receipt, { items: [] });
    expect(state.receipt.reviewChecks.map((check) => check.field)).toEqual([
      "items",
    ]);
    expect(
      calculateReceipt(state.receipt).issues.some(
        (issue) => issue.path === "items",
      ),
    ).toBe(true);
  });
  it("allows clearing an unsupported optional subtotal but never lets empty required prices pass", () => {
    const { state } = fixture();
    state.receipt.reviewChecks.push({
      scope: "receipt",
      field: "subtotal",
      reason: "unsupported",
      other: "",
      confirmedValue: "",
    });
    state.receipt.subtotal = "10.00";
    state.receipt = applyReceiptEdit(state.receipt, { subtotal: "" });
    expect(checkIsPending(state.receipt, state.receipt.reviewChecks[1])).toBe(
      false,
    );
    state.receipt.items[0].lineTotal = "";
    expect(
      calculateReceipt(state.receipt).issues.some(
        (issue) => issue.path === "items.0.lineTotal",
      ),
    ).toBe(true);
  });
  it("does not confirm an entire adjustment or tax-rate group because one entry was edited", () => {
    const { state } = fixture();
    state.receipt.reviewChecks = [
      {
        scope: "receipt",
        field: "taxCodes",
        reason: "different",
        other: "",
        confirmedValue: "",
      },
    ];
    state.receipt = applyReceiptEdit(state.receipt, {
      taxCodes: [{ code: "A", rate: "20" }],
    });
    expect(checkIsPending(state.receipt, state.receipt.reviewChecks[0])).toBe(
      true,
    );
  });
  it("keeps old review fingerprints compatible and preserves checked/pending values across refresh without raw source text", () => {
    const { state, check } = fixture();
    const oldStamp = receiptStamp({ ...state.receipt, reviewChecks: [] });
    expect(receiptStamp(state.receipt)).toBe(oldStamp);
    state.receipt = confirmReviewCheck(state.receipt, reviewKey(check));
    let raw = "";
    saveDraft(
      {
        setItem: (_key, value) => {
          raw = value;
        },
      },
      state,
    );
    const loaded = loadDraft({ getItem: () => raw });
    expect(loaded.warning).toBe("");
    expect(calculateSplit(loaded.state).canFinalize).toBe(true);
    const legacy = JSON.parse(raw);
    delete legacy.receipt.reviewChecks;
    expect(appSchema.parse(legacy).receipt.reviewChecks).toEqual([]);
  });
  it("preserves acceptance after schema ordering changes but rejects a later financial edit", () => {
    const { state, check } = fixture();
    state.receipt = confirmReviewCheck(state.receipt, reviewKey(check));
    state.receipt = applyItemEdit(state.receipt, check.itemId, {
      quantity: "1",
    });
    review(state);
    let raw = "";
    const storage = {
      setItem: (_key: string, value: string) => {
        raw = value;
      },
      getItem: () => raw,
    };
    saveDraft(storage, state);
    const loaded = loadDraft(storage).state;
    expect(loaded.reviewedStamp).toBe(receiptStamp(loaded.receipt));
    expect(calculateSplit(loaded).canFinalize).toBe(true);
    expect(loaded.finalizedStamp).toBe("");
    state.receipt = applyItemEdit(state.receipt, check.itemId, {
      lineTotal: "9.00",
    });
    saveDraft(storage, state);
    expect(loadDraft(storage).state.reviewedStamp).not.toBe(
      receiptStamp(loadDraft(storage).state.receipt),
    );
    expect(calculateSplit(loadDraft(storage).state).canFinalize).toBe(false);
  });
  it("reopens a tax-rate check when its tax inclusion or calculation mode changes", () => {
    const { state } = fixture();
    const check: ReviewCheck = {
      scope: "receipt",
      field: "taxCodes",
      reason: "different",
      other: "",
      confirmedValue: "",
    };
    state.receipt.taxCodes = [{ code: "A", rate: "5" }];
    state.receipt.reviewChecks = [check];
    state.receipt = confirmReviewCheck(state.receipt, reviewKey(check));
    state.receipt.taxMode =
      state.receipt.taxMode === "codes" ? "printed" : "codes";
    expect(checkIsPending(state.receipt, state.receipt.reviewChecks[0])).toBe(
      true,
    );
    state.receipt = confirmReviewCheck(state.receipt, reviewKey(check));
    state.receipt.pricesIncludeTax = !state.receipt.pricesIncludeTax;
    expect(checkIsPending(state.receipt, state.receipt.reviewChecks[0])).toBe(
      true,
    );
  });
});
