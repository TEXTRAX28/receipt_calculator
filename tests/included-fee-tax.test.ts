import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { calculateReceipt, calculateSplit } from "../src/lib/engine";
import {
  appSchema,
  receiptStamp,
  type Adjustment,
  type Currency,
} from "../src/lib/model";
import {
  checkIsPending,
  confirmReviewCheck,
  reviewKey,
} from "../src/lib/review-checks";
import ReviewChecks from "../src/ReviewChecks";
import { assign, review, shop } from "./helpers";

// Manual transcription of the separate Western Towing source invoice, not an OCR result.
function invoice() {
  const state = shop(["16.32", "3.75"], ["Alice", "Bob"]);
  Object.assign(state.receipt, {
    merchant: "Western Towing",
    subtotal: "20.07",
    printedTax: "4.84",
    printedTotal: "29.06",
    pricesIncludeTax: false,
    taxMode: "printed",
  });
  state.receipt.adjustments = [
    {
      id: "carriage",
      label: "Carriage (incl. VAT)",
      kind: "fee",
      amount: "4.98",
      allocation: "proportional",
      includedTaxRate: "20",
    },
    {
      id: "vat",
      label: "VAT @ 20%",
      kind: "tax",
      amount: "4.84",
      allocation: "proportional",
    },
  ];
  return state;
}

describe("net goods with an explicitly tax-inclusive fee", () => {
  it("keeps every source amount and reconciles 20.07 net goods + 4.98 gross carriage + 4.84 total VAT to 29.06", () => {
    const state = invoice();
    const source = JSON.stringify(state.receipt);
    const result = calculateReceipt(state.receipt);
    expect(result.issues).toEqual([]);
    expect(result.subtotal).toBe(2007n);
    expect(result.includedFeeTax).toBe(83n);
    expect(result.tax).toBe(401n);
    expect(result.otherCharges).toBe(498n);
    expect(result.total).toBe(2906n);
    expect(result.discrepancy).toBe(0n);
    expect(result.items.reduce((sum, item) => sum + item.total, 0n)).toBe(
      2906n,
    );
    expect(JSON.stringify(state.receipt)).toBe(source);
  });

  it("preserves legacy calculations and JSON when no fee basis was supplied", () => {
    const state = invoice();
    delete state.receipt.adjustments[0].includedTaxRate;
    const source = JSON.stringify(state);
    const stamp = receiptStamp(state.receipt);
    const restored = appSchema.parse(JSON.parse(source));
    expect(JSON.stringify(restored)).toBe(source);
    expect(receiptStamp(restored.receipt)).toBe(stamp);
    const result = calculateReceipt(restored.receipt);
    expect(result.total).toBe(2989n);
    expect(result).not.toHaveProperty("includedFeeTax");
    expect(result.discrepancy).toBe(83n);
  });

  it("includes the fee component in the printed-tax check when goods use explicit tax codes", () => {
    const { receipt } = invoice();
    receipt.taxMode = "codes";
    receipt.taxCodes = [{ code: "USER", rate: "20" }];
    receipt.items.forEach((item) => {
      item.taxCode = "USER";
    });
    receipt.adjustments = receipt.adjustments.filter(
      (row) => row.kind !== "tax",
    );
    const result = calculateReceipt(receipt);
    expect(result.issues).toEqual([]);
    expect(result.tax).toBe(401n);
    expect(result.includedFeeTax).toBe(83n);
    expect(result.total).toBe(2906n);
    receipt.printedTax = "4.01";
    expect(
      calculateReceipt(receipt).issues.some(
        (issue) => issue.path === "printedTax",
      ),
    ).toBe(true);
  });

  it("does not subtract or add the fee VAT again when goods already include tax", () => {
    const { receipt } = invoice();
    receipt.pricesIncludeTax = true;
    receipt.items[0].lineTotal = "19.58";
    receipt.items[1].lineTotal = "4.50";
    receipt.subtotal = "24.08";
    const result = calculateReceipt(receipt);
    expect(result.issues).toEqual([]);
    expect(result.tax).toBe(0n);
    expect(result.includedFeeTax).toBe(83n);
    expect(result.otherCharges).toBe(498n);
    expect(result.total).toBe(2906n);
  });

  it.each([0, 1, 2, 3])(
    "accounts for multiple explicit fee rates once, independent of tax-row position %i",
    (rotation) => {
      const state = shop(["100.00"]);
      Object.assign(state.receipt, {
        pricesIncludeTax: false,
        printedTax: "20.25",
        printedTotal: "123.24",
      });
      const rows: Adjustment[] = [
        {
          id: "tax",
          label: "Total VAT",
          kind: "tax",
          amount: "20.25",
          allocation: "proportional",
        },
        {
          id: "standard",
          label: "Gross fee",
          kind: "fee",
          amount: "1.20",
          includedTaxRate: "20",
          allocation: "proportional",
        },
        {
          id: "reduced",
          label: "Reduced gross fee",
          kind: "fee",
          amount: "1.05",
          includedTaxRate: "5",
          allocation: "proportional",
        },
        {
          id: "zero",
          label: "Zero-rated fee",
          kind: "fee",
          amount: "0.99",
          includedTaxRate: "0",
          allocation: "proportional",
        },
      ];
      state.receipt.adjustments = [
        ...rows.slice(rotation),
        ...rows.slice(0, rotation),
      ];
      const result = calculateReceipt(state.receipt);
      expect(result.issues).toEqual([]);
      expect(result.includedFeeTax).toBe(25n);
      expect(result.tax).toBe(2000n);
      expect(result.total).toBe(12324n);
    },
  );

  it.each(["", "-1", "100.000001", "NaN", "1e2", "0.0000001", "20%"])(
    "blocks an absent or invalid included fee rate %j",
    (rate) => {
      const { receipt } = invoice();
      receipt.adjustments[0].includedTaxRate = rate;
      const result = calculateReceipt(receipt);
      expect(
        result.issues.some(
          (issue) => issue.path === "adjustments.carriage.includedTaxRate",
        ),
      ).toBe(true);
    },
  );

  it.each(["discount", "tax", "tip", "deposit", "rounding"] as const)(
    "rejects fee-only tax metadata on a %s",
    (kind) => {
      const { receipt } = invoice();
      receipt.adjustments[0].kind = kind;
      receipt.adjustments[0].includedTaxRate = "0";
      expect(
        calculateReceipt(receipt).issues.some(
          (issue) => issue.path === "adjustments.carriage.includedTaxRate",
        ),
      ).toBe(true);
    },
  );

  it.each([0, 2])(
    "requires one unambiguous printed tax row, rather than guessing among %i",
    (count) => {
      const { receipt } = invoice();
      const tax = receipt.adjustments[1];
      receipt.adjustments = [
        receipt.adjustments[0],
        ...Array.from({ length: count }, (_, i) => ({
          ...tax,
          id: `tax-${i}`,
        })),
      ];
      expect(
        calculateReceipt(receipt).issues.some(
          (issue) =>
            issue.path === "adjustments" &&
            /one printed tax/.test(issue.message),
        ),
      ).toBe(true);
    },
  );

  it("permits an explicit zero-rate fee without inventing a tax row", () => {
    const { receipt } = invoice();
    receipt.adjustments = [{ ...receipt.adjustments[0], includedTaxRate: "0" }];
    receipt.printedTax = "0.00";
    receipt.printedTotal = "25.05";
    const result = calculateReceipt(receipt);
    expect(result.issues).toEqual([]);
    expect(result.includedFeeTax).toBe(0n);
    expect(result.total).toBe(2505n);
  });

  it("blocks a fee tax component larger than the full VAT on purchase-only goods", () => {
    const { receipt } = invoice();
    receipt.adjustments[1].amount = receipt.printedTax = "0.50";
    receipt.printedTotal = "24.72";
    const result = calculateReceipt(receipt);
    expect(result.discrepancy).toBe(0n);
    expect(
      result.issues.some((issue) =>
        /included fee tax.*printed tax/i.test(issue.message),
      ),
    ).toBe(true);
  });

  it("keeps negative fees invalid without an explicit refunded item", () => {
    const { receipt } = invoice();
    receipt.adjustments[0].amount = "-4.98";
    expect(
      calculateReceipt(receipt).issues.some(
        (issue) => issue.path === "adjustments.carriage",
      ),
    ).toBe(true);
  });

  it("supports source-signed refunded goods, fee and total tax without changing their directions", () => {
    const state = invoice();
    state.receipt.items.forEach((item) => {
      item.lineTotal = `-${item.lineTotal}`;
    });
    state.receipt.adjustments.forEach((row) => {
      row.amount = `-${row.amount}`;
    });
    Object.assign(state.receipt, {
      subtotal: "-20.07",
      printedTax: "-4.84",
      printedTotal: "-29.06",
    });
    state.receipt.items.forEach((_, index) =>
      assign(state, "equal", [], index),
    );
    review(state);
    const result = calculateSplit(state);
    expect(result.issues).toEqual([]);
    expect(result.receipt.tax).toBe(-401n);
    expect(result.receipt.includedFeeTax).toBe(-83n);
    // Each of the two odd-minor-unit item credits assigns its residual in stable person order.
    expect(result.totals.map((person) => person.total)).toEqual([
      -1454n,
      -1452n,
    ]);
    expect(result.canFinalize).toBe(true);
  });

  it("still blocks ambiguous proportional charges across mixed purchases and returns", () => {
    const state = invoice();
    state.receipt.items[0].lineTotal = "10.00";
    state.receipt.items[1].lineTotal = "-5.00";
    Object.assign(state.receipt, {
      subtotal: "5.00",
      printedTax: "1.02",
      printedTotal: "6.12",
    });
    state.receipt.adjustments[0].amount = "0.12";
    state.receipt.adjustments[1].amount = "1.02";
    const result = calculateReceipt(state.receipt);
    expect(result.discrepancy).toBe(0n);
    expect(
      result.issues.some((issue) =>
        /mixes purchases and returns/.test(issue.message),
      ),
    ).toBe(true);
  });

  it.each([
    ["JPY", "100", "12", "20", "22", "132", 2n, 20n],
    ["KWD", "1.000", "0.120", "20", "0.220", "1.320", 20n, 200n],
    ["GBP", "0.01", "0.03", "20", "0.01", "0.04", 1n, 0n],
    ["GBP", "0.01", "0.01", "100", "0.02", "0.03", 1n, 1n],
    ["GBP", "10.00", "1.41", "17.5", "1.96", "13.16", 21n, 175n],
  ] as const)(
    "respects %s precision for a %s good and %s gross fee at %s%%",
    (currency, goods, fee, rate, tax, total, included, added) => {
      const state = shop(["1.00"]);
      Object.assign(state.receipt, {
        currency: currency as Currency,
        pricesIncludeTax: false,
        printedTax: tax,
        printedTotal: total,
      });
      state.receipt.items[0].lineTotal = goods;
      state.receipt.adjustments = [
        {
          id: "fee",
          label: "Gross fee",
          kind: "fee",
          amount: fee,
          includedTaxRate: rate,
          allocation: "proportional",
        },
        {
          id: "tax",
          label: "Total VAT",
          kind: "tax",
          amount: tax,
          allocation: "proportional",
        },
      ];
      const result = calculateReceipt(state.receipt);
      expect(result.issues).toEqual([]);
      expect(result.includedFeeTax).toBe(included);
      expect(result.tax).toBe(added);
      expect(result.discrepancy).toBe(0n);
    },
  );

  it("rejects invalid fee currency precision instead of rounding a source amount to make it balance", () => {
    const { receipt } = invoice();
    receipt.adjustments[0].amount = "4.981";
    expect(
      calculateReceipt(receipt).issues.some(
        (issue) => issue.path === "adjustments.carriage",
      ),
    ).toBe(true);
  });

  it.each(["equal", "ratio", "percent", "quantity"] as const)(
    "conserves 29.06 through %s item shares and equal-person fee/tax allocation",
    (mode) => {
      const state = invoice();
      const values = mode === "percent" ? ["25", "75"] : ["1", "3"];
      state.receipt.items.forEach((item, index) => {
        item.packSize = "4";
        assign(state, mode, values, index);
      });
      state.receipt.adjustments.forEach((row) => {
        row.allocation = "equal-people";
      });
      review(state);
      const result = calculateSplit(state);
      expect(result.issues).toEqual([]);
      expect(result.assignedTotal).toBe(2906n);
      expect(result.canFinalize).toBe(true);
      for (const person of result.totals) {
        expect(person.lines.reduce((sum, line) => sum + line.amount, 0n)).toBe(
          person.total,
        );
        for (const line of person.lines)
          expect(line.net + line.tax + line.charges + line.rounding).toBe(
            line.amount,
          );
      }
    },
  );

  it("splits the corrected whole receipt into two exact 14.53 shares", () => {
    const state = invoice();
    state.splitMode = "whole";
    state.wholeAssignment = {
      mode: "equal",
      participants: state.people.map((person) => person.id),
      values: {},
    };
    review(state);
    const result = calculateSplit(state);
    expect(result.totals.map((person) => person.total)).toEqual([1453n, 1453n]);
    expect(result.canFinalize).toBe(true);
  });

  it("persists the explicit basis and invalidates both receipt and adjustment confirmations when it changes", () => {
    let state = invoice();
    state.receipt.items.forEach((_, index) =>
      assign(state, "equal", [], index),
    );
    const check = {
      scope: "receipt" as const,
      field: "adjustments" as const,
      reason: "source" as const,
      other: "",
      confirmedValue: "",
    };
    state.receipt.reviewChecks = [check];
    state.receipt = confirmReviewCheck(state.receipt, reviewKey(check));
    review(state);
    state = appSchema.parse(JSON.parse(JSON.stringify(state)));
    expect(state.receipt.adjustments[0].includedTaxRate).toBe("20");
    expect(calculateSplit(state).canFinalize).toBe(true);
    const stamp = state.reviewedStamp;
    state.receipt.adjustments[0].includedTaxRate = "5";
    expect(receiptStamp(state.receipt)).not.toBe(stamp);
    expect(checkIsPending(state.receipt, state.receipt.reviewChecks[0])).toBe(
      true,
    );
    expect(calculateSplit(state).canFinalize).toBe(false);
  });

  it("discloses the rate in the value a person is asked to confirm", () => {
    const { receipt } = invoice();
    const markup = renderToStaticMarkup(
      createElement(ReviewChecks, {
        receipt,
        checks: [
          {
            scope: "receipt",
            field: "adjustments",
            reason: "source",
            other: "",
            confirmedValue: "",
          },
        ],
      }),
    );
    expect(markup).toContain("includes tax at 20%");
    expect(markup).not.toContain('type="checkbox"');
  });
});
