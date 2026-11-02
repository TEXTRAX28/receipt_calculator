import { describe, expect, it } from "vitest";
import { verifyIndependentReadings } from "../src/lib/verify-readings";
import { parseReceiptWithSources } from "../src/lib/parser";
import { calculateReceipt, calculateSplit } from "../src/lib/engine";
import { confirmReviewCheck, reviewKey } from "../src/lib/review-checks";
import type { Recognition } from "../src/lib/receipt-layout";
import { shop, assign, review } from "./helpers";
import { receiptSchema } from "../src/lib/model";

const summary = [
  "Subtotal 18.00",
  "Service charge 1.00",
  "Tax 2.00",
  "Total 21.00",
];
function evidence(rows = summary): Recognition {
  const texts = [
    "Little Market",
    "Currency GBP",
    "Meal 1 x 18.00 18.00",
    ...rows,
  ];
  const lines = texts.map((text, i) => ({
    text,
    confidence: 0.99,
    box: [
      0.1,
      (i + 0.1) / (texts.length + 1),
      0.9,
      (i + 0.8) / (texts.length + 1),
    ] as [number, number, number, number],
  }));
  return {
    engine: "paddle-ppocrv6-medium-onnx",
    panels: [
      {
        photo: 1,
        part: 1,
        width: 1000,
        height: 1200,
        words: structuredClone(lines),
        lines,
      },
    ],
  };
}
function draft() {
  return {
    merchant: "Little Market",
    date: "",
    currency: "GBP",
    subtotal: "18.00",
    printedTotal: "21.00",
    printedTax: "1.00",
    pricesIncludeTax: false,
    printedItemCount: null,
    taxCodes: [],
    warnings: [],
    items: [
      {
        description: "Meal",
        quantity: "1",
        unitPrice: "18.00",
        lineTotal: "18.00",
        discount: "0",
        taxCode: "",
        note: "",
        sourcePhotos: [1],
      },
    ],
    adjustments: [
      { label: "Service charge", kind: "discount", amount: "1.00" },
      { label: "Tax", kind: "fee", amount: "2.00" },
    ],
  };
}

describe("literal financial-role proposals from complete source sections", () => {
  it("corrects a fee/tax role mix-up, keeps printed values and blocks until source review", () => {
    const raw = draft(),
      source = evidence();
    const before = structuredClone({ raw, source });
    const result = verifyIndependentReadings(raw, source);
    expect({ raw, source }).toEqual(before);
    expect(result.financialRoleRecovery).not.toBeNull();
    expect(
      result.receipt.adjustments.map(({ kind, amount }) => [kind, amount]),
    ).toEqual([
      ["fee", "1.00"],
      ["tax", "2.00"],
    ]);
    expect(result.receipt.printedTax).toBe("2.00");
    expect(result.receipt.taxMode).toBe("printed");
    expect(result.fieldSources.pricesIncludeTax).toEqual([3, 4, 5, 6]);
    const money = calculateReceipt(result.receipt);
    expect(money.total).toBe(2100n);
    expect(money.discrepancy).toBe(0n);
    for (const field of ["adjustments", "printedTax"]) {
      expect(result.receipt.reviewChecks).toContainEqual(
        expect.objectContaining({
          scope: "receipt",
          field,
          confirmedValue: "",
        }),
      );
      expect(result.fieldSources[field as "adjustments"]).toEqual(
        expect.arrayContaining([3, 4, 5, 6]),
      );
      expect(money.issues).toContainEqual(
        expect.objectContaining({ path: field }),
      );
    }
    expect(
      result.receipt.reviewChecks.some((check) => check.field === "taxCodes"),
    ).toBe(false);
    const state = shop(["18.00"], ["Alice", "Bob"]);
    state.receipt = result.receipt;
    assign(state, "equal");
    expect(calculateSplit(state).canFinalize).toBe(false);
    for (const check of state.receipt.reviewChecks)
      state.receipt = confirmReviewCheck(state.receipt, reviewKey(check));
    review(state);
    const split = calculateSplit(state);
    expect(split.issues).toEqual([]);
    expect(split.canFinalize).toBe(true);
    expect(split.totals.map((person) => person.total)).toEqual([1050n, 1050n]);
    const check = state.receipt.reviewChecks.find(
      (entry) => entry.field === "adjustments",
    )!;
    state.receipt = confirmReviewCheck(state.receipt, reviewKey(check));
    state.receipt.adjustments[0].amount = "2.00";
    expect(calculateReceipt(state.receipt).issues).toContainEqual(
      expect.objectContaining({ path: "adjustments" }),
    );
  });

  it("adds a missing printed service charge, without deriving its amount from a total", () => {
    const raw = draft();
    raw.adjustments = [];
    raw.printedTax = "2.00";
    const result = verifyIndependentReadings(raw, evidence());
    expect(
      result.receipt.adjustments
        .filter((row) => row.kind === "fee")
        .map((row) => row.amount),
    ).toEqual(["1.00"]);
    expect(result.financialRoleRecovery?.details).toContainEqual({
      label: "Printed Service charge (fee)",
      value: "1.00",
    });
  });

  it.each(["subtotal", "printedTotal", "printedTax"] as const)(
    "does not let a complete section override a cross-batch %s conflict",
    (field) => {
      const result = verifyIndependentReadings(draft(), evidence(), undefined, {
        blockedScalarFields: [field],
      });
      expect(result.financialRoleRecovery).toBeNull();
      expect(result.receipt.adjustments).toContainEqual(
        expect.objectContaining({
          label: "Service charge",
          kind: "discount",
          amount: "1.00",
        }),
      );
      expect(calculateReceipt(result.receipt).issues.length).toBeGreaterThan(0);
    },
  );

  it("keeps long untrusted model labels inside the persisted review schema", () => {
    const raw = draft();
    raw.adjustments[0].label = "Service charge" + " ".repeat(86);
    const result = verifyIndependentReadings(raw, evidence());
    expect(result.financialRoleRecovery).not.toBeNull();
    expect(receiptSchema.safeParse(result.receipt).success).toBe(true);
  });

  it("withholds additions that would exceed the receipt adjustment budget", () => {
    const raw = draft();
    raw.printedTax = "";
    raw.adjustments = Array.from({ length: 30 }, (_, index) => ({
      label: `Unknown extra ${index}`,
      kind: "fee",
      amount: "1.00",
    }));
    const result = verifyIndependentReadings(raw, evidence());
    expect(result.financialRoleRecovery).toBeNull();
    expect(result.receipt.adjustments).toHaveLength(30);
    expect(receiptSchema.safeParse(result.receipt).success).toBe(true);
  });

  it("preserves unrelated model adjustments and their unresolved discrepancy", () => {
    const raw = draft();
    raw.adjustments.push({
      label: "Unprinted extra",
      kind: "fee",
      amount: "5.00",
    });
    const result = verifyIndependentReadings(raw, evidence());
    expect(result.receipt.adjustments).toContainEqual(
      expect.objectContaining({ label: "Unprinted extra", amount: "5.00" }),
    );
    expect(calculateReceipt(result.receipt).discrepancy).not.toBe(0n);
  });

  it("reclassifies a footer service-code interpretation only with complete strong purchase evidence", () => {
    const raw = {
      ...draft(),
      taxCodes: [{ code: "SVC", rate: "6" }],
      items: [{ ...draft().items[0], taxCode: "SVC" }],
    };
    const rows = [
      "Subtotal 18.00",
      "SVC CHG 6% 1.00",
      "Tax 2.00",
      "Total 21.00",
    ];
    raw.adjustments[0].label = "SVC CHG 6%";
    const result = verifyIndependentReadings(raw, evidence(rows));
    expect(result.financialRoleRecovery).not.toBeNull();
    expect(result.receipt.taxMode).toBe("printed");
    // The unsupported product code is still visible and pending; no absence is invented.
    expect(result.receipt.reviewChecks).toContainEqual(
      expect.objectContaining({
        scope: "receipt",
        field: "taxCodes",
        confirmedValue: "",
      }),
    );
    expect(result.receipt.items[0].taxCode).toBe("SVC");
    expect(result.receipt.reviewChecks).toContainEqual(
      expect.objectContaining({
        scope: "item",
        field: "taxCode",
        confirmedValue: "",
      }),
    );
  });

  it("retains genuine printed item-code calculations", () => {
    const raw = {
      ...draft(),
      taxCodes: [{ code: "A", rate: "10" }],
      items: [{ ...draft().items[0], taxCode: "A" }],
    };
    const source = evidence();
    source.panels[0].lines[2].text += " A";
    source.panels[0].words[2].text += " A";
    const result = verifyIndependentReadings(raw, source);
    expect(result.financialRoleRecovery).toBeNull();
    expect(result.receipt.taxMode).toBe("codes");
  });

  it.each([
    "line",
    "word",
    "unknown-row",
    "second-total",
    "currency",
    "inclusive",
    "disabled",
    "duplicate-model-fee",
  ])("withholds a role proposal for %s evidence", (change) => {
    const raw = draft(),
      source = evidence();
    if (change === "line") source.panels[0].lines[4].confidence = 0.97;
    if (change === "word") source.panels[0].words[4].confidence = 0.97;
    if (change === "unknown-row") {
      source.panels[0].lines[4].text = "Unclear 1.00";
      source.panels[0].words[4].text = "Unclear 1.00";
    }
    if (change === "second-total")
      source.panels[0].lines.push({ ...source.panels[0].lines[6] });
    if (change === "currency") raw.currency = "USD";
    if (change === "inclusive") raw.pricesIncludeTax = true;
    if (change === "duplicate-model-fee")
      raw.adjustments.push({ ...raw.adjustments[0] });
    const result = verifyIndependentReadings(
      raw,
      source,
      { currency: "GBP" },
      { allowPriceRecovery: change !== "disabled" },
    );
    expect(result.financialRoleRecovery).toBeNull();
  });

  it("does not turn a financial label into a product, or a similarly named product into a charge", () => {
    const { receipt } = parseReceiptWithSources(
      "Currency IDR\nService manual 10,000\nSUBTTL 10,000\nService 1,000\nPB1 10% 1,100\nTOTAL 12,100",
    );
    expect(receipt.items.map((item) => item.description)).toEqual([
      "Service manual",
    ]);
    expect(
      receipt.adjustments.map(({ kind, amount }) => [kind, amount]),
    ).toEqual([
      ["tax", "1100"],
      ["fee", "1000"],
    ]);
    expect(receipt.subtotal).toBe("10000");
  });

  it.each(["Service", "Fee"])(
    "keeps a purchased %s before the subtotal instead of assuming it is an added charge",
    (name) => {
      const { receipt } = parseReceiptWithSources(
        `Currency GBP\n${name} 10.00\nSubtotal 10.00\nTax 1.00\nTotal 11.00`,
      );
      expect(receipt.items.map((item) => item.description)).toEqual([name]);
      expect(receipt.adjustments.filter((row) => row.kind === "fee")).toEqual(
        [],
      );
    },
  );
});
