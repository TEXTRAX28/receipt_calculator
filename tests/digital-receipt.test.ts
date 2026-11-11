import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  newReceipt,
  newItem,
  newState,
  receiptStamp,
  type Receipt,
} from "../src/lib/model";
import { calculateReceipt, calculateSplit } from "../src/lib/engine";
import {
  reconcileObservedUnits,
  prepareSavedReceiptReview,
} from "../src/lib/receipt-reconciliation";
import { parseReceiptText } from "../src/lib/parser";
import ReceiptSnapshot from "../src/ReceiptSnapshot";
import ReviewChecks from "../src/ReviewChecks";

function scanned(): Receipt {
  return {
    ...newReceipt(),
    source: "ocr",
    subtotal: "37.20",
    printedTotal: "37.20",
    items: [
      {
        ...newItem(),
        description: "Ramen",
        quantity: "2",
        unitPrice: "18.80",
        lineTotal: "37.20",
      },
    ],
  };
}
describe("receipt-level review and exact observed-unit reconciliation", () => {
  it("preserves an unsigned printed unit on a signed refund line", () => {
    const receipt = scanned();
    receipt.items[0].quantity = "1";
    receipt.items[0].unitPrice = "5.00";
    receipt.items[0].lineTotal = "-5.00";
    receipt.subtotal = receipt.printedTotal = "-5.00";
    expect(reconcileObservedUnits(receipt)).toBe(receipt);
  });
  it("uses balanced printed lines and count without changing any charged amount", () => {
    const before = scanned(),
      after = reconcileObservedUnits(before);
    expect(after.items[0]).toMatchObject({
      unitPrice: "18.60",
      observedUnitPrice: "18.80",
      unitPriceDerived: true,
      lineTotal: "37.20",
      quantity: "2",
    });
    expect(before.items[0].unitPrice).toBe("18.80");
    expect(after.printedTotal).toBe("37.20");
    expect(
      calculateReceipt(after, { readingNotes: "advisory" }).issues,
    ).toEqual([]);
  });
  it.each([
    "missing total",
    "unbalanced total",
    "unresolved currency",
    "manual edit",
    "nonexact division",
    "missing line",
  ])("does not repair with %s", (kind) => {
    const receipt = scanned();
    if (kind === "missing total") receipt.printedTotal = "";
    if (kind === "unbalanced total") receipt.printedTotal = "38.20";
    if (kind === "unresolved currency") receipt.currencyUnresolved = true;
    if (kind === "manual edit") receipt.source = "manual";
    if (kind === "nonexact division") receipt.items[0].quantity = "7";
    if (kind === "missing line") receipt.items[0].lineTotal = "";
    expect(reconcileObservedUnits(receipt).items[0].unitPrice).toBe("18.80");
  });
  it("preserves a separately disputed quantity and a person's explicit unit reading", () => {
    for (const field of ["quantity", "unitPrice"] as const) {
      const receipt = scanned();
      if (field === "unitPrice") receipt.items[0].unitPriceEdited = true;
      receipt.reviewChecks = [
        {
          scope: "item",
          itemId: receipt.items[0].id,
          field,
          reason: "different",
          other: "",
          confirmedValue: field === "unitPrice" ? '"18.80"' : "",
        },
      ];
      expect(reconcileObservedUnits(receipt).items[0].unitPrice).toBe("18.80");
    }
  });
  it("reconciles a legacy scanned draft once and reopens receipt-level acceptance", () => {
    const state = newState();
    state.receipt = scanned();
    state.step = "summary";
    state.receipt.reviewChecks = [
      {
        scope: "item",
        itemId: state.receipt.items[0].id,
        field: "unitPrice",
        reason: "source",
        other: "",
        confirmedValue: '"18.80"',
      },
    ];
    state.reviewedStamp = receiptStamp(state.receipt);
    state.finalizedStamp = "previous";
    const restored = prepareSavedReceiptReview(state);
    expect(restored.receipt.items[0]).toMatchObject({
      unitPrice: "18.60",
      observedUnitPrice: "18.80",
    });
    expect(restored.step).toBe("review");
    expect(restored.reviewedStamp).toBe("");
    expect(restored.finalizedStamp).toBe("");
    expect(prepareSavedReceiptReview(restored)).toBe(restored);
    state.receipt.items[0].unitPriceEdited = true;
    expect(prepareSavedReceiptReview(state)).toBe(state);
  });
  it("does not relabel equivalent formatting as an OCR correction", () => {
    const receipt = scanned();
    receipt.items[0].unitPrice = "18.6";
    expect(
      reconcileObservedUnits(receipt).items[0].observedUnitPrice,
    ).toBeUndefined();
  });
  it("keeps reading notes without inventing individual human confirmations", () => {
    const receipt = reconcileObservedUnits(scanned());
    receipt.reviewChecks = [
      {
        scope: "item",
        itemId: receipt.items[0].id,
        field: "description",
        reason: "source",
        other: "",
        confirmedValue: "",
      },
    ];
    expect(calculateReceipt(receipt).issues.length).toBeGreaterThan(0);
    expect(
      calculateReceipt(receipt, { readingNotes: "advisory" }).issues,
    ).toEqual([]);
    const state = newState();
    state.receipt = receipt;
    state.splitMode = "whole";
    state.people = [{ id: "person", name: "A" }];
    state.wholeAssignment = {
      mode: "equal",
      participants: ["person"],
      values: {},
    };
    expect(
      calculateSplit(state, { readingNotes: "advisory" }).canFinalize,
    ).toBe(false);
    state.reviewedStamp = receiptStamp(receipt);
    expect(
      calculateSplit(state, { readingNotes: "advisory" }).canFinalize,
    ).toBe(true);
    expect(receipt.reviewChecks[0].confirmedValue).toBe("");
    state.receipt.items[0].lineTotal = "40.00";
    expect(
      calculateSplit(state, { readingNotes: "advisory" }).canFinalize,
    ).toBe(false);
  });
  it("retains hard validation of missing counts and malformed monetary fields", () => {
    const receipt = scanned();
    receipt.items[0].quantity = "";
    receipt.items[0].lineTotal = "abc";
    const issues = calculateReceipt(receipt, {
      readingNotes: "advisory",
    }).issues;
    expect(issues.some((issue) => issue.path === "items.0.quantity")).toBe(
      true,
    );
    expect(issues.some((issue) => issue.path === "items.0.lineTotal")).toBe(
      true,
    );
  });
  it("does not promote a suffix artifact or VAT registration into tax", () => {
    const receipt = parseReceiptText(
      "GBP\nVAT: 123456789\nQtyDish Amount\n1 Tart 5.50 L\nTotal to pay: 5.50",
    );
    expect(receipt.items[0].taxCode).toBe("");
    expect(receipt.taxCodes).toEqual([]);
    expect(receipt.printedTax).toBe("");
    expect(receipt.taxRegistrationNumber).toBe("123456789");
  });
  it("preserves real code columns when the receipt supplies a tax legend", () => {
    const receipt = parseReceiptText(
      "GBP\nQtyDish Amount\n1 Soup 10.00 A\n1 Milk 5.00 Z\nA 20.00% 10.00 2.00\nZ 0.00% 5.00 0.00\nTotal to pay: 17.00",
    );
    expect(receipt.items.map((item) => item.taxCode)).toEqual(["A", "Z"]);
  });
  it("renders a receipt without per-field confirmation controls", () => {
    const receipt = reconcileObservedUnits(scanned());
    receipt.taxRegistrationNumber = "123456789";
    const html = renderToStaticMarkup(
      createElement(ReceiptSnapshot, {
        receipt,
        result: calculateReceipt(receipt, { readingNotes: "advisory" }),
        onEdit: () => {},
      }),
    );
    expect(html).toContain("£37.20");
    expect(html).toContain("£18.60");
    expect(html).not.toContain('type="checkbox"');
    expect(html).not.toContain("tax code");
  });
  it("groups a weak row's field notices into one optional note", () => {
    const receipt = scanned();
    receipt.reviewChecks = (
      ["description", "quantity", "unitPrice", "lineTotal"] as const
    ).map((field) => ({
      scope: "item",
      itemId: receipt.items[0].id,
      field,
      reason: "source",
      other: "",
      confirmedValue: "",
      details: [
        { label: "Source row", value: "same row" },
        { label: `${field} reading`, value: "retained" },
      ],
    }));
    const html = renderToStaticMarkup(
      createElement(ReviewChecks, { receipt, checks: receipt.reviewChecks }),
    );
    expect(html.match(/Some text in this row/g)).toHaveLength(1);
    expect(html.match(/Source row/g)).toHaveLength(1);
    for (const field of ["description", "quantity", "unitPrice", "lineTotal"])
      expect(html).toContain(`${field} reading`);
    expect(
      receipt.reviewChecks.every((check) => check.details?.length === 2),
    ).toBe(true);
    expect(html).not.toContain('type="checkbox"');
  });
  it("explains printed tax already included in a fee without adding it twice", () => {
    const receipt = reconcileObservedUnits(scanned());
    receipt.pricesIncludeTax = false;
    receipt.taxMode = "printed";
    receipt.printedTax = "8.44";
    receipt.printedTotal = "50.64";
    receipt.adjustments = [
      {
        id: "fee",
        label: "Carriage",
        kind: "fee",
        amount: "6.00",
        allocation: "proportional",
        includedTaxRate: "20",
      },
      {
        id: "tax",
        label: "VAT",
        kind: "tax",
        amount: "8.44",
        allocation: "proportional",
      },
    ];
    const result = calculateReceipt(receipt, { readingNotes: "advisory" });
    expect(result.issues).toEqual([]);
    expect(result.includedFeeTax).toBe(100n);
    expect(result.total).toBe(5064n);
    const html = renderToStaticMarkup(
      createElement(ReceiptSnapshot, {
        receipt,
        result,
        onEdit: () => {},
      }),
    );
    expect(html).toContain("£1.00");
    expect(html).toContain("already in the fees above");
    expect(html).toContain("£50.64");
  });
});
