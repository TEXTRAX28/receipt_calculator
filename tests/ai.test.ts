import { describe, expect, it } from "vitest";
import { receiptFromOpenAi } from "../src/lib/openai-draft";
import { calculateReceipt, calculateSplit } from "../src/lib/engine";
import { newState, receiptSchema } from "../src/lib/model";
import { confirmReviewCheck, reviewKey } from "../src/lib/review-checks";
import { aiCostcoDraft } from "./fixtures/ai-receipt";
import { reconcileObservedUnits } from "../src/lib/receipt-reconciliation";

it.each(["18.80", ""])(
  "uses exact quantity and line arithmetic for a read unit of %s",
  (unitPrice) => {
    const draft = {
      ...aiCostcoDraft(),
      currency: "GBP",
      subtotal: "45.20",
      printedTotal: "45.20",
      taxRegistrationNumber: "GB 123 4567 89",
      printedTax: "123456789.00",
      pricesIncludeTax: null,
      printedItemCount: null,
      taxCodes: [],
      items: [
        {
          description: "Tori Karaage",
          quantity: "1",
          unitPrice: "8.00",
          lineTotal: "8.00",
        },
        {
          description: "Spicy Tantan Tonkotsu Ramen",
          quantity: "2",
          unitPrice,
          lineTotal: "37.20",
        },
      ].map((row) => ({
        ...row,
        discount: "0",
        taxCode: "",
        note: "",
        sourcePhotos: [1],
      })),
    };
    const receipt = reconcileObservedUnits(
      receiptFromOpenAi(draft, undefined, 1),
    );
    expect(receipt.taxRegistrationNumber).toBe("GB 123 4567 89");
    expect(receipt.printedTax).toBe("");
    expect(receipt.adjustments).toEqual([]);
    expect(receipt.items[0]).toMatchObject({
      description: "Tori Karaage",
      quantity: "1",
    });
    expect(receipt.items[1]).toMatchObject({
      description: "Spicy Tantan Tonkotsu Ramen",
      quantity: "2",
      lineTotal: "37.20",
      unitPrice: "18.60",
      unitPriceDerived: true,
    });
    expect(calculateReceipt(receipt, { readingNotes: "advisory" }).total).toBe(
      4520n,
    );
    expect(() =>
      receiptFromOpenAi({
        ...draft,
        items: [{ ...draft.items[0], quantity: "I" }],
      }),
    ).toThrow();
  },
);

describe("OpenAI receipt drafts and the exact engine", () => {
  const balancedTaxDraft = (pricesIncludeTax: boolean | null) => {
    const draft = aiCostcoDraft();
    return {
      ...draft,
      pricesIncludeTax,
      subtotal: "5.50",
      printedTotal: "5.50",
      printedTax: "",
      printedItemCount: 1,
      taxCodes: [],
      adjustments: [],
      items: [
        {
          ...draft.items[0],
          description: "SYNTHETIC TEA",
          quantity: "1",
          unitPrice: "5.50",
          lineTotal: "5.50",
          discount: "0",
          taxCode: "",
          sourcePhotos: [1],
        },
      ],
    };
  };
  it("keeps an unknown tax basis flagged when provisional totals balance", () => {
    const receipt = receiptFromOpenAi(balancedTaxDraft(null));
    const result = calculateReceipt(receipt);
    expect(result.total).toBe(550n);
    expect(result.discrepancy).toBe(0n);
    expect(result.issues).toEqual([
      expect.objectContaining({ path: "pricesIncludeTax" }),
    ]);
    expect(receipt.reviewChecks).toContainEqual(
      expect.objectContaining({
        scope: "receipt",
        field: "pricesIncludeTax",
        confirmedValue: "",
      }),
    );
  });
  it("binds tax-basis confirmation to persisted values and reopens on a changed value", () => {
    const receipt = receiptFromOpenAi(balancedTaxDraft(null));
    const key = reviewKey(receipt.reviewChecks[0]);
    const confirmed = confirmReviewCheck(receipt, key);
    const restored = receiptSchema.parse(JSON.parse(JSON.stringify(confirmed)));
    expect(calculateReceipt(restored).issues).toEqual([]);
    restored.pricesIncludeTax = false;
    expect(calculateReceipt(restored).issues).toEqual([
      expect.objectContaining({ path: "pricesIncludeTax" }),
    ]);
  });
  it.each([true, false])(
    "keeps an explicitly returned tax basis %s without inventing uncertainty",
    (basis) => {
      const receipt = receiptFromOpenAi(balancedTaxDraft(basis));
      expect(receipt.pricesIncludeTax).toBe(basis);
      expect(
        receipt.reviewChecks.some(
          (check) => check.field === "pricesIncludeTax",
        ),
      ).toBe(false);
      expect(calculateReceipt(receipt).issues).toEqual([]);
    },
  );
  it("preserves 18 Costco purchases, both identical chickens, discounts and exact VAT", () => {
    const receipt = receiptFromOpenAi(aiCostcoDraft());
    expect(receipt.source).toBe("ai");
    expect(receipt.items).toHaveLength(18);
    expect(
      receipt.items.filter((item) => /rotisserie/i.test(item.description)),
    ).toHaveLength(2);
    expect(receipt.items[3].discount).toBe("2.00");
    const result = calculateReceipt(receipt);
    expect(result.issues).toEqual([]);
    expect(result.total).toBe(17678n);
    expect(receipt.rawText).toBe("");
  });
  it("flags missing purchases and unknown currency/tax inclusion instead of inventing evidence", () => {
    const draft = aiCostcoDraft();
    const receipt = receiptFromOpenAi({
      ...draft,
      currency: "",
      pricesIncludeTax: null,
      items: draft.items.slice(1),
    });
    expect(receipt.items).toHaveLength(17);
    expect(receipt.warnings.join(" ")).toMatch(
      /read an item count of 18.*found 17/,
    );
    expect(receipt.warnings.join(" ")).toMatch(/Currency was unclear/);
    expect(receipt.warnings.join(" ")).toMatch(/could not determine/);
    expect(calculateReceipt(receipt).issues.length).toBeGreaterThan(0);
  });
  it("rejects numeric prices, executable actions and unbounded output", () => {
    const draft = aiCostcoDraft();
    for (const invalid of [
      { ...draft, execute: "send secrets" },
      { ...draft, items: [{ ...draft.items[0], lineTotal: 9.49 }] },
      { ...draft, items: Array.from({ length: 301 }, () => draft.items[0]) },
    ])
      expect(() => receiptFromOpenAi(invalid)).toThrow();
  });
  it("preserves explicit signed refund evidence while the normal financial review is still required", () => {
    const draft = aiCostcoDraft();
    draft.items = [
      {
        ...draft.items[0],
        unitPrice: "9.49",
        lineTotal: "-9.49",
        discount: "0",
        taxCode: "",
      },
    ];
    Object.assign(draft, {
      printedItemCount: 1,
      taxCodes: [],
      pricesIncludeTax: true,
      subtotal: "-9.49",
      printedTotal: "-9.49",
      printedTax: "0.00",
      adjustments: [],
    });
    const receipt = receiptFromOpenAi(draft);
    expect(receipt.items[0].lineTotal).toBe("-9.49");
    expect(calculateReceipt(receipt).issues).toEqual([]);
    expect(calculateReceipt(receipt).total).toBe(-949n);
    const state = newState();
    state.receipt = receipt;
    expect(calculateSplit(state).issues).toContainEqual(
      expect.objectContaining({ path: "review" }),
    );
  });
  it("requires an explicit nonzero return before accepting negative ordinary adjustments", () => {
    const draft = aiCostcoDraft();
    draft.items = [
      {
        ...draft.items[0],
        unitPrice: "9.49",
        lineTotal: "-9.49",
        discount: "0",
        taxCode: "",
      },
    ];
    Object.assign(draft, {
      printedItemCount: 1,
      taxCodes: [],
      pricesIncludeTax: true,
      subtotal: "-9.49",
      printedTotal: "-10.49",
      printedTax: "0.00",
      adjustments: [
        { label: "Refunded delivery", kind: "fee", amount: "-1.00" },
      ],
    });
    expect(calculateReceipt(receiptFromOpenAi(draft)).issues).toEqual([]);
    draft.items[0].lineTotal = "0.00";
    expect(() => receiptFromOpenAi(draft)).toThrow();
    draft.items[0].lineTotal = "-0.00";
    expect(() => receiptFromOpenAi(draft)).toThrow();
  });
  it("accepts a blank unreadable amount and lets the engine block confirmation", () => {
    const draft = aiCostcoDraft();
    draft.items[0].lineTotal = "";
    draft.items[0].unitPrice = "";
    const receipt = receiptFromOpenAi(draft);
    expect(receipt.items[0].lineTotal).toBe("");
    expect(calculateReceipt(receipt).issues.length).toBeGreaterThan(0);
  });
});
