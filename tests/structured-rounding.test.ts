import { describe, it, expect } from "vitest";
import { receiptFromOpenAi } from "../src/lib/openai-draft";
import { calculateReceipt, calculateSplit } from "../src/lib/engine";
import { aiCostcoDraft } from "./fixtures/ai-receipt";
import { assign, review, shop } from "./helpers";

/** Synthetic protocol/math fixture, not a transcription or real model response. */
function draft(amount = "-0.01", total = "10.00") {
  const base = aiCostcoDraft();
  return {
    ...base,
    merchant: "Synthetic rounding shop",
    subtotal: "10.01",
    printedTotal: total,
    printedTax: "",
    printedItemCount: 1,
    pricesIncludeTax: true,
    taxCodes: [],
    items: [
      {
        ...base.items[0],
        description: "Synthetic item",
        quantity: "1",
        unitPrice: "10.01",
        lineTotal: "10.01",
        discount: "0",
        taxCode: "",
        sourcePhotos: [1],
        note: "",
      },
    ],
    adjustments: [{ label: "Printed cash rounding", kind: "rounding", amount }],
  };
}

describe("explicit structured receipt rounding", () => {
  it.each([
    ["-0.01", "10.00", 1000n],
    ["0.01", "10.02", 1002n],
  ] as const)(
    "preserves sign %s and conserves the exact split",
    (rounding, printed, expected) => {
      const receipt = receiptFromOpenAi(draft(rounding, printed));
      expect(receipt.adjustments[0].amount).toBe(rounding);
      const result = calculateReceipt(receipt);
      expect(result.issues).toEqual([]);
      expect(result.total).toBe(expected);
      const state = shop();
      state.receipt = receipt;
      assign(state, "equal");
      review(state);
      const split = calculateSplit(state);
      expect(split.canFinalize).toBe(true);
      expect(split.totals.reduce((sum, person) => sum + person.total, 0n)).toBe(
        expected,
      );
    },
  );

  it.each(["discount", "fee", "tip", "deposit"])(
    "rejects a negative ordinary %s instead of converting it into rounding",
    (kind) => {
      const source = draft();
      source.adjustments[0].kind = kind;
      expect(() => receiptFromOpenAi(source)).toThrow();
    },
  );

  it("keeps excessive precision unresolved instead of rounding it into valid GBP", () => {
    const receipt = receiptFromOpenAi(draft("-0.001"));
    expect(receipt.adjustments[0].amount).toBe("-0.001");
    expect(calculateReceipt(receipt).issues.length).toBeGreaterThan(0);
  });

  it("supports the same signed adjustment at KWD's three-decimal precision", () => {
    const source = draft("-0.001", "10.000");
    source.currency = "KWD";
    source.subtotal = "10.001";
    source.items[0].unitPrice = source.items[0].lineTotal = "10.001";
    const result = calculateReceipt(receiptFromOpenAi(source));
    expect(result.issues).toEqual([]);
    expect(result.total).toBe(10000n);
  });

  it("does not invent zero for an unreadable rounding amount", () => {
    const receipt = receiptFromOpenAi(draft(""));
    expect(receipt.adjustments[0].amount).toBe("");
    expect(calculateReceipt(receipt).issues.length).toBeGreaterThan(0);
  });

  it("blocks a schema-valid vision draft that counts printed VAT again as a fee", () => {
    const source = draft("-0.01", "4.37");
    source.subtotal = "3.50";
    source.printedTax = "0.73";
    source.pricesIncludeTax = false;
    source.printedItemCount = 2;
    source.items = ["2.00", "1.50"].map((price, index) => ({
      ...source.items[0],
      description: `Synthetic purchase ${index + 1}`,
      unitPrice: price,
      lineTotal: price,
    }));
    source.adjustments = [
      { label: "Service fee", kind: "fee", amount: "0.15" },
      { label: "VAT misclassified by the model", kind: "fee", amount: "0.73" },
      { label: "Printed rounding", kind: "rounding", amount: "-0.01" },
    ];
    const state = shop();
    state.receipt = receiptFromOpenAi(source);
    state.receipt.items.forEach((_, index) =>
      assign(state, "equal", [], index),
    );
    review(state);
    const result = calculateSplit(state);
    expect(result.receipt.total).toBe(510n);
    expect(result.receipt.discrepancy).not.toBe(0n);
    expect(result.canFinalize).toBe(false);
  });

  it.each(["20.00%", "1,234", "Rp 36.000", "١٢٣"])(
    "rejects noncanonical money %s",
    (value) => {
      const raw = draft();
      raw.adjustments[0].amount = value;
      expect(() => receiptFromOpenAi(raw)).toThrow();
    },
  );
});
