import { describe, expect, it } from "vitest";
import { verifyIndependentReadings } from "../src/lib/verify-readings";
import type { Recognition } from "../src/lib/receipt-layout";
import { calculateReceipt, calculateSplit } from "../src/lib/engine";
import { confirmReviewCheck, reviewKey } from "../src/lib/review-checks";
import { newState, receiptStamp } from "../src/lib/model";

function recognition(texts: string[], low = -1): Recognition {
  const lines = texts.map((text, index) => ({
    text,
    confidence: index === low ? 0.6 : 0.99,
    box: [
      0.1,
      (index + 0.1) / (texts.length + 1),
      0.9,
      (index + 0.8) / (texts.length + 1),
    ] as [number, number, number, number],
  }));
  return {
    engine: "paddle-ppocrv6-medium-onnx",
    panels: [
      { photo: 1, part: 1, width: 1000, height: 1600, words: lines, lines },
    ],
  };
}
const item = (
  description: string,
  price: string,
  taxCode = "",
  discount = "0",
) => ({
  description,
  quantity: "1",
  unitPrice: price,
  lineTotal: price,
  discount,
  taxCode,
  note: "",
  sourcePhotos: [1],
});
const draft = (items: ReturnType<typeof item>[], total = "15.00") => ({
  merchant: "Little Market",
  date: "",
  currency: "GBP",
  subtotal: "",
  printedTotal: total,
  printedTax: "",
  pricesIncludeTax: true,
  printedItemCount: null,
  taxCodes: [],
  items,
  adjustments: [],
  warnings: [],
});
function costco() {
  const texts = [
    "COSTCO UK",
    "CHICKEN SKEWERS",
    "10001 1x 10.00 10.00 Z",
    "IRC CHICKEN",
    "20002 1x 2.00 2.00-Z",
    "KS ROTISS CHICKEN",
    "10533 1x 3.99 3.99 A",
    "KS ROTISS CHICKEN",
    "10533 1x 3.99 3.99 A",
    "TOTAL(INCL VAT) £17.58",
    "VAT Code Excl Vat VAT",
    "A 20.00% 7.98 1.60",
    "Z 0.00% 8.00 0.00",
    "TOTAL(EXCL VAT) 15.98",
    "VAT Amount 1.60",
  ];
  const raw = {
    ...draft(
      [
        item("CHICKEN SKEWERS", "10.00", "Z"),
        item("IRC CHICKEN", "2.00", "Z"),
        item("KS ROTISS CHICKEN", "3.99", "A"),
        item("KS ROTISS CHICKEN", "3.99", "A"),
      ],
      "17.58",
    ),
    merchant: "Costco",
    subtotal: "15.98",
    printedTax: "1.60",
    pricesIncludeTax: false,
    printedItemCount: 3,
    taxCodes: [
      { code: "A", rate: "20" },
      { code: "Z", rate: "0" },
    ],
  };
  return { texts, raw };
}

describe("independent original-image readings are grounded without labels or balance repairs", () => {
  it("keeps a source classification check even when both readers' provisional deduction and total agree", () => {
    const raw = {
      ...draft([item("Groceries", "10.00")], "8.00"),
      adjustments: [
        { label: "CP Club Card", kind: "discount", amount: "2.00" },
      ],
    };
    const result = verifyIndependentReadings(
      raw,
      recognition([
        "Little Market",
        "Groceries 1x 10.00 10.00",
        "CP Club Card -2.00",
        "TOTAL GBP 8.00",
      ]),
    );
    expect(result.ocrPurchases).toBe(1);
    expect(result.receipt.reviewChecks).toContainEqual(
      expect.objectContaining({
        scope: "receipt",
        field: "adjustments",
        reason: "classification",
      }),
    );
    expect(result.fieldSources.adjustments).toContain(2);
    expect(calculateReceipt(result.receipt).total).toBe(800n);
    expect(calculateReceipt(result.receipt).issues).toContainEqual(
      expect.objectContaining({ path: "adjustments" }),
    );
  });
  it.each(["legible", "unclear", "multiple", "bare-dollar"])(
    "uses only explicit reliable currency evidence: %s",
    (variant) => {
      const texts = [
        "Little Market",
        "PRICES INCLUDE TAX",
        "Milk 1x 15.00 15.00",
        "TOTAL GBP 15.00",
      ];
      if (variant === "multiple") texts.push("Currency USD");
      if (variant === "bare-dollar") texts[3] = "TOTAL $15.00";
      const raw = { ...draft([item("Milk", "15.00")]), currency: "" };
      const result = verifyIndependentReadings(
        raw,
        recognition(texts, variant === "unclear" ? 3 : -1),
      );
      expect(result.receipt.currencyUnresolved).toBe(variant !== "legible");
      expect(result.receipt.reviewChecks).toContainEqual(
        expect.objectContaining({
          field: "currency",
          reason:
            variant === "legible"
              ? "recovered"
              : variant === "multiple"
                ? "different"
                : "unsupported",
        }),
      );
      if (variant !== "legible")
        expect(calculateReceipt(result.receipt).issues).toContainEqual(
          expect.objectContaining({ path: "currency" }),
        );
    },
  );
  it("recovers explicit three-decimal currency before comparing any monetary fields", () => {
    const raw = { ...draft([item("Milk", "1.234")], "1.234"), currency: "" };
    const result = verifyIndependentReadings(
      raw,
      recognition([
        "Little Market",
        "PRICES INCLUDE TAX",
        "Milk 1x 1.234 1.234",
        "TOTAL KWD 1.234",
      ]),
    );
    expect(result.receipt.currency).toBe("KWD");
    expect(result.receipt.currencyUnresolved).toBe(false);
    expect(calculateReceipt(result.receipt).total).toBe(1234n);
    expect(result.receipt.reviewChecks.map((check) => check.field)).toEqual([
      "currency",
    ]);
  });
  it("recovers an adjacent printed coupon and preserves both genuinely repeated purchases", () => {
    const { texts, raw } = costco();
    const result = verifyIndependentReadings(raw, recognition(texts));
    expect(result.receipt.items).toHaveLength(3);
    expect(result.receipt.items.map((item) => item.discount)).toEqual([
      "2.00",
      "0",
      "0",
    ]);
    expect(
      result.receipt.items.filter(
        (item) => item.description === "KS ROTISS CHICKEN",
      ),
    ).toHaveLength(2);
    expect(result.corrections).toHaveLength(1);
    expect(result.sources[result.receipt.items[0].id]).toHaveLength(4);
    expect(calculateReceipt(result.receipt).total).toBe(1758n);
    expect(result.receipt.reviewChecks).toEqual([
      expect.objectContaining({ field: "discount", reason: "recovered" }),
    ]);
    const state = newState();
    state.receipt = result.receipt;
    state.people = [{ id: "alice", name: "Alice" }];
    state.receipt.items.forEach((item) => {
      item.assignment.participants = ["alice"];
    });
    state.reviewedStamp = receiptStamp(state.receipt);
    expect(calculateSplit(state).canFinalize).toBe(false);
    state.receipt = confirmReviewCheck(
      state.receipt,
      reviewKey(state.receipt.reviewChecks[0]),
    );
    expect(calculateSplit(state).canFinalize).toBe(true);
  });
  it("does not change a coupon already attached correctly by both independent readers", () => {
    const { texts, raw } = costco();
    raw.items.splice(1, 1);
    raw.items[0].discount = "2.00";
    const result = verifyIndependentReadings(raw, recognition(texts));
    expect(result.corrections).toEqual([]);
    expect(result.receipt.reviewChecks).toEqual([]);
    expect(calculateReceipt(result.receipt).issues).toEqual([]);
  });
  it("recovers a source-confirmed coupon when the merchant header has been cropped out", () => {
    const { texts, raw } = costco();
    texts.shift();
    raw.merchant = "";
    const result = verifyIndependentReadings(raw, recognition(texts));
    expect(result.receipt.items).toHaveLength(3);
    expect(result.receipt.items[0].discount).toBe("2.00");
    expect(result.corrections).toHaveLength(1);
    expect(
      result.receipt.items.filter(
        (entry) => entry.description === "KS ROTISS CHICKEN",
      ),
    ).toHaveLength(2);
    expect(result.receipt.reviewChecks).toContainEqual(
      expect.objectContaining({ field: "discount", reason: "recovered" }),
    );
    expect(calculateReceipt(result.receipt).total).toBe(1758n);
  });
  it("does not use a vision-only merchant claim to apply another retailer's coupon convention", () => {
    const { texts, raw } = costco();
    texts[0] = "Little Market";
    for (const index of [5, 7]) texts[index] = "ROAST CHICKEN";
    raw.items[2].description = raw.items[3].description = "ROAST CHICKEN";
    const result = verifyIndependentReadings(raw, recognition(texts));
    expect(result.corrections).toHaveLength(0);
    expect(result.receipt.items).toHaveLength(4);
    expect(result.receipt.items[0].discount).toBe("0");
  });
  it("does not use a legible zero-rate row to confirm a different unclear rate", () => {
    const { texts, raw } = costco();
    const result = verifyIndependentReadings(raw, recognition(texts, 11));
    expect(result.receipt.reviewChecks).toContainEqual(
      expect.objectContaining({ field: "taxCodes", reason: "unclear" }),
    );
  });
  it("keeps conflicting printed rates unresolved and does not infer a rate from the total", () => {
    const { texts, raw } = costco();
    texts.push("A 5.00% 7.98 0.40");
    const result = verifyIndependentReadings(raw, recognition(texts));
    expect(result.receipt.reviewChecks).toContainEqual(
      expect.objectContaining({ field: "taxCodes", reason: "different" }),
    );
    expect(
      result.receipt.taxCodes.find((entry) => entry.code === "A")?.rate,
    ).toBe("20");
  });
  it("requires review when a source-proven rate for a used code was omitted", () => {
    const { texts, raw } = costco();
    raw.taxCodes = raw.taxCodes.filter((entry) => entry.code !== "A");
    const result = verifyIndependentReadings(raw, recognition(texts));
    expect(result.receipt.reviewChecks).toContainEqual(
      expect.objectContaining({ field: "taxCodes", reason: "coverage" }),
    );
  });
  it.each(["printed", "cropped"])(
    "does not double-count source-confirmed coupon summaries, counts or future loyalty earnings with a %s header",
    (header) => {
      const { texts, raw } = costco();
      if (header === "cropped") texts.shift();
      texts.push(
        "Savings: £2.00 1 Coupon(s)",
        "you have earned £0.32 towards your",
        "annual executive reward.",
      );
      const value = {
        ...raw,
        adjustments: [
          { label: "Savings", kind: "discount", amount: "2.00" },
          { label: "Coupon(s)", kind: "discount", amount: "1" },
          { label: "Executive Reward", kind: "discount", amount: "0.32" },
        ],
      };
      const result = verifyIndependentReadings(value, recognition(texts));
      expect(result.removedAdjustments.map((entry) => entry.reason)).toEqual([
        "coupon-summary",
        "coupon-count",
        "future-reward",
      ]);
      expect(result.receipt.adjustments).toEqual([]);
      const check = result.receipt.reviewChecks.find(
        (check) => check.field === "adjustments",
      )!;
      expect(check.details).toHaveLength(3);
      expect(calculateReceipt(result.receipt).total).toBe(1758n);
      expect(calculateReceipt(result.receipt).issues).toContainEqual(
        expect.objectContaining({ path: "adjustments" }),
      );
    },
  );
  it.each([
    "before-total",
    "count-mismatch",
    "sum-mismatch",
    "redeemed-reward",
    "non-adjacent-coupon",
  ])(
    "retains potentially real adjustments when %s makes summary classification unsafe",
    (variant) => {
      const { texts, raw } = costco();
      raw.items.splice(1, 1);
      raw.items[0].discount = "2.00";
      const summary =
        variant === "count-mismatch"
          ? "Savings: £2.00 2 Coupon(s)"
          : variant === "sum-mismatch"
            ? "Savings: £3.00 1 Coupon(s)"
            : "Savings: £2.00 1 Coupon(s)";
      if (variant === "before-total") texts.splice(9, 0, summary);
      else texts.push(summary);
      if (variant === "non-adjacent-coupon")
        texts.splice(3, 0, "Promotion details");
      if (variant === "redeemed-reward")
        texts.push("EXECUTIVE REWARD", "Applied £0.32 to this purchase");
      texts.push(
        "you have earned £0.32 towards your",
        "annual executive reward.",
      );
      const value = {
        ...raw,
        adjustments: [
          { label: "Savings", kind: "discount", amount: "2.00" },
          { label: "Executive Reward", kind: "discount", amount: "0.32" },
        ],
      };
      const result = verifyIndependentReadings(value, recognition(texts));
      expect(
        result.receipt.adjustments.some(
          (adjustment) =>
            adjustment.label ===
            (variant === "redeemed-reward" ? "Executive Reward" : "Savings"),
        ),
      ).toBe(true);
    },
  );
  it("keeps incorrect but balanced prices disputed instead of choosing values to reconcile", () => {
    const source = recognition([
      "Little Market",
      "PRICES INCLUDE TAX",
      "Milk 1x 10.00 10.00",
      "Bread 1x 5.00 5.00",
      "TOTAL GBP 15.00",
    ]);
    const result = verifyIndependentReadings(
      draft([item("Milk", "11.00"), item("Bread", "4.00")]),
      source,
    );
    const calculated = calculateReceipt(result.receipt);
    expect(calculated.discrepancy).toBe(0n);
    expect(result.receipt.items.map((item) => item.lineTotal)).toEqual([
      "11.00",
      "4.00",
    ]);
    expect(
      result.receipt.reviewChecks.filter(
        (check) => check.scope === "item" && check.field === "lineTotal",
      ),
    ).toHaveLength(2);
    expect(calculated.issues).not.toEqual([]);
  });
  it("does not choose arbitrarily between two indistinguishable physical purchases", () => {
    const source = recognition([
      "Little Market",
      "PRICES INCLUDE TAX",
      "Milk 1x 3.00 3.00",
      "Milk 1x 3.00 3.00",
      "TOTAL GBP 6.00",
    ]);
    const result = verifyIndependentReadings(
      draft([item("Milk", "3.00")], "3.00"),
      source,
    );
    expect(result.matchedPurchases).toBe(0);
    expect(result.receipt.items).toHaveLength(1);
    expect(result.receipt.reviewChecks).toContainEqual(
      expect.objectContaining({ field: "items", reason: "coverage" }),
    );
  });
  it("does not accept both crossing pairs from mutually exclusive optimal alignments", () => {
    const source = recognition([
      "Little Market",
      "PRICES INCLUDE TAX",
      "Bread 1x 5.00 5.00",
      "Milk 1x 10.00 10.00",
      "TOTAL GBP 15.00",
    ]);
    const result = verifyIndependentReadings(
      draft([item("Milk", "10.00"), item("Bread", "5.00")]),
      source,
    );
    expect(result.matchedPurchases).toBe(0);
    expect(result.receipt.reviewChecks).toContainEqual(
      expect.objectContaining({ field: "items", reason: "coverage" }),
    );
  });
  it.each([
    "unclear",
    "different-code",
    "duplicated-coupon",
    "different-price",
    "other-retailer",
  ])("refuses uncertain coupon recovery for %s evidence", (variant) => {
    const { texts, raw } = costco();
    let low = -1;
    if (variant === "unclear") low = 4;
    if (variant === "different-code") texts[4] = texts[4].replace("-Z", "-A");
    if (variant === "duplicated-coupon")
      raw.items.splice(2, 0, { ...raw.items[1] });
    if (variant === "different-price")
      raw.items[0].lineTotal = raw.items[0].unitPrice = "8.00";
    if (variant === "other-retailer") texts[0] = "Other wholesale UK";
    const result = verifyIndependentReadings(raw, recognition(texts, low));
    expect(result.corrections).toEqual([]);
    expect(result.receipt.items).toHaveLength(raw.items.length);
    expect(calculateReceipt(result.receipt).issues.length).toBeGreaterThan(0);
  });
  it("flags unprinted optional metadata and does not invent a source rectangle for it", () => {
    const raw = { ...draft([item("Milk", "15.00")]), subtotal: "15.00" };
    const result = verifyIndependentReadings(
      raw,
      recognition([
        "Little Market",
        "PRICES INCLUDE TAX",
        "Milk 1x 15.00 15.00",
        "TOTAL GBP 15.00",
      ]),
    );
    expect(result.receipt.reviewChecks).toContainEqual(
      expect.objectContaining({
        scope: "receipt",
        field: "subtotal",
        reason: "unsupported",
      }),
    );
    expect(result.receipt.subtotal).toBe("15.00");
  });
  it("does not use a different high-confidence total to confirm a low-confidence one", () => {
    const raw = draft([item("Milk", "15.00")]);
    const result = verifyIndependentReadings(
      raw,
      recognition(
        [
          "Little Market",
          "PRICES INCLUDE TAX",
          "Milk 1x 15.00 15.00",
          "TOTAL GBP 14.00",
          "TOTAL GBP 15.00",
        ],
        4,
      ),
    );
    expect(result.receipt.reviewChecks).toContainEqual(
      expect.objectContaining({ field: "printedTotal", reason: "unsupported" }),
    );
  });
  it("keeps several legible conflicting totals unresolved even when one balances", () => {
    const result = verifyIndependentReadings(
      draft([item("Milk", "15.00")]),
      recognition([
        "Little Market",
        "PRICES INCLUDE TAX",
        "Milk 1x 15.00 15.00",
        "TOTAL GBP 14.00",
        "TOTAL GBP 15.00",
      ]),
    );
    expect(result.receipt.reviewChecks).toContainEqual(
      expect.objectContaining({ field: "printedTotal", reason: "different" }),
    );
  });
  it("aligns generic descriptions without mistaking their explicit purchase expression for part of the name", () => {
    const result = verifyIndependentReadings(
      draft([item("Milk", "1.00"), item("Bread", "2.50")], "3.50"),
      recognition([
        "Little Market",
        "PRICES INCLUDE TAX",
        "Milk 1x 2.00 2.00",
        "Bread 1x 1.50 1.50",
        "TOTAL GBP 3.50",
      ]),
    );
    expect(result.matchedPurchases).toBe(2);
    expect(
      result.receipt.reviewChecks.map((check) => check.field).sort(),
    ).toEqual(["lineTotal", "lineTotal", "unitPrice", "unitPrice"]);
    expect(calculateReceipt(result.receipt).total).toBe(350n);
    expect(calculateReceipt(result.receipt).issues).toHaveLength(4);
  });
});
