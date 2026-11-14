import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { calculateReceipt, calculateSplit } from "../src/lib/engine";
import { newItem, type Currency } from "../src/lib/model";
import { minorString, money, roundDiv } from "../src/lib/money";
import { assign, review, shop } from "./helpers";

function transaction(
  prices: string[],
  currency: Currency = "GBP",
  people = ["Alice", "Bob", "Charlie"],
) {
  const state = shop(["0.00"], people);
  state.receipt.currency = currency;
  state.receipt.items = prices.map((price, i) => ({
    ...newItem(),
    description: `Line ${i + 1}`,
    quantity: "1",
    lineTotal: price,
  }));
  state.receipt.printedTotal = minorString(
    prices.reduce((sum, price) => sum + money(price, currency, true), 0n),
    currency,
  );
  return state;
}

describe("signed purchases, refund credits and exact ownership", () => {
  it("retains explicit return context when an original coupon cancels the goods credit but delivery is refunded", () => {
    const s = transaction(["-10.00"], "GBP", ["Alice", "Bob"]);
    s.receipt.items[0].discount = "10.00";
    s.receipt.adjustments = [
      {
        id: "delivery",
        label: "Refunded delivery",
        kind: "fee",
        amount: "-1.00",
        allocation: "equal-people",
      },
    ];
    s.receipt.printedTotal = "-1.00";
    assign(s, "equal");
    review(s);
    const result = calculateSplit(s);
    expect(result.issues).toEqual([]);
    expect(result.receipt.hasRefunds).toBe(true);
    expect(result.receipt.items[0].net).toBe(0n);
    expect(result.totals.map((person) => person.total)).toEqual([-50n, -50n]);
    expect(result.canFinalize).toBe(true);
  });
  it("shares a pure refund without losing a penny or inferring an original payer", () => {
    const s = transaction(["-10.00"]);
    assign(s, "equal");
    review(s);
    const result = calculateSplit(s);
    expect(result.issues).toEqual([]);
    expect(result.totals.map((person) => person.total)).toEqual([
      -334n,
      -333n,
      -333n,
    ]);
    expect(result.assignedTotal).toBe(-1000n);
    expect(result.canFinalize).toBe(true);
  });

  it("keeps a purchase and a return assigned to their own people", () => {
    const s = transaction(["12.00", "-5.00"], "GBP", ["Alice", "Bob"]);
    for (const [index, person] of s.people.entries())
      s.receipt.items[index].assignment = {
        mode: "equal",
        participants: [person.id],
        values: {},
      };
    review(s);
    const result = calculateSplit(s);
    expect(result.issues).toEqual([]);
    expect(result.totals.map((person) => person.total)).toEqual([1200n, -500n]);
    expect(result.canFinalize).toBe(true);
    s.splitMode = "whole";
    s.wholeAssignment = {
      mode: "equal",
      participants: s.people.map((person) => person.id),
      values: {},
    };
    expect(calculateSplit(s).totals.map((person) => person.total)).toEqual([
      350n,
      350n,
    ]);
  });

  it.each([
    ["quantity", ["1", "2", "3"], [-200n, -400n, -600n]],
    ["ratio", ["1", "1", "2"], [-300n, -300n, -600n]],
    ["percent", ["25", "25", "50"], [-300n, -300n, -600n]],
  ] as const)(
    "supports %s shares of returned units",
    (mode, shares, expected) => {
      const s = transaction(["-12.00"]);
      s.receipt.items[0].packSize = "6";
      assign(s, mode, [...shares]);
      review(s);
      const result = calculateSplit(s);
      expect(result.issues).toEqual([]);
      expect(result.totals.map((person) => person.total)).toEqual(expected);
      expect(result.canFinalize).toBe(true);
    },
  );

  it("reduces a returned gross price by its original coupon before reversing VAT", () => {
    const s = transaction(["-10.00"]);
    Object.assign(s.receipt.items[0], {
      quantity: "2",
      unitPrice: "5.00",
      discount: "2.00",
      taxCode: "A",
    });
    Object.assign(s.receipt, {
      pricesIncludeTax: false,
      taxMode: "codes",
      taxCodes: [{ code: "A", rate: "20" }],
      subtotal: "-8.00",
      printedTax: "-1.60",
      printedTotal: "-9.60",
    });
    assign(s, "equal");
    review(s);
    const result = calculateSplit(s);
    expect(result.issues).toEqual([]);
    expect(result.receipt.items[0]).toMatchObject({
      net: -800n,
      tax: -160n,
      total: -960n,
    });
    expect(result.totals.map((person) => person.total)).toEqual([
      -320n,
      -320n,
      -320n,
    ]);
    expect(result.canFinalize).toBe(true);
  });

  it("retains signed per-item VAT when a tax-code group's purchases and returns cancel", () => {
    const s = transaction(["0.06", "-0.06"], "GBP", ["Alice", "Bob"]);
    Object.assign(s.receipt, {
      pricesIncludeTax: false,
      taxMode: "codes",
      taxCodes: [{ code: "A", rate: "20" }],
      printedTax: "0.00",
    });
    for (const [index, item] of s.receipt.items.entries()) {
      item.taxCode = "A";
      item.assignment = {
        mode: "equal",
        participants: [s.people[index].id],
        values: {},
      };
    }
    review(s);
    const result = calculateSplit(s);
    expect(result.issues).toEqual([]);
    expect(result.receipt.items.map((item) => item.tax)).toEqual([1n, -1n]);
    expect(result.totals.map((person) => person.total)).toEqual([7n, -7n]);
    expect(result.canFinalize).toBe(true);
  });

  it("applies purchase discounts and return coupon reversals to their own eligible lines", () => {
    const s = transaction(["10.00", "-10.00"], "GBP", ["Alice", "Bob"]);
    s.receipt.adjustments = [
      {
        id: "purchase-coupon",
        label: "Purchase coupon",
        kind: "discount",
        amount: "1.00",
        allocation: "proportional",
      },
      {
        id: "return-coupon",
        label: "Original coupon reversal",
        kind: "discount",
        amount: "-2.00",
        allocation: "proportional",
      },
    ];
    s.receipt.printedTotal = "1.00";
    for (const [index, person] of s.people.entries())
      s.receipt.items[index].assignment = {
        mode: "equal",
        participants: [person.id],
        values: {},
      };
    review(s);
    const result = calculateSplit(s);
    expect(result.issues).toEqual([]);
    expect(result.receipt.items.map((item) => item.receiptDiscount)).toEqual([
      100n,
      -200n,
    ]);
    expect(result.totals.map((person) => person.total)).toEqual([900n, -800n]);
    expect(result.canFinalize).toBe(true);
  });

  it("requires explicit shared-charge allocation for mixed purchases and returns", () => {
    const s = transaction(["10.00", "-5.00"], "GBP", ["Alice", "Bob"]);
    s.receipt.adjustments = [
      {
        id: "fee",
        label: "Shared fee",
        kind: "fee",
        amount: "2.00",
        allocation: "proportional",
      },
    ];
    s.receipt.printedTotal = "7.00";
    for (const [index, person] of s.people.entries())
      s.receipt.items[index].assignment = {
        mode: "equal",
        participants: [person.id],
        values: {},
      };
    review(s);
    expect(calculateSplit(s).canFinalize).toBe(false);
    expect(calculateReceipt(s.receipt).issues).toContainEqual(
      expect.objectContaining({
        path: "adjustments.fee.allocation",
        message: expect.stringMatching(/mixed|purchases and returns/i),
      }),
    );
    s.receipt.adjustments[0].allocation = "equal-people";
    review(s);
    const result = calculateSplit(s);
    expect(result.issues).toEqual([]);
    expect(result.totals.map((person) => person.total)).toEqual([1100n, -400n]);
    expect(result.canFinalize).toBe(true);
  });

  it("supports an explicit negative printed-tax refund and proportional refunded charges", () => {
    const s = transaction(["-10.00", "-5.00"]);
    Object.assign(s.receipt, {
      pricesIncludeTax: false,
      printedTax: "-3.00",
      printedTotal: "-19.00",
    });
    s.receipt.adjustments = [
      {
        id: "tax",
        label: "Refunded VAT",
        kind: "tax",
        amount: "-3.00",
        allocation: "proportional",
      },
      {
        id: "shipping",
        label: "Refunded delivery",
        kind: "fee",
        amount: "-1.00",
        allocation: "proportional",
      },
    ];
    s.receipt.items.forEach((_, i) => assign(s, "equal", [], i));
    review(s);
    const result = calculateSplit(s);
    expect(result.issues).toEqual([]);
    expect(result.receipt.tax).toBe(-300n);
    expect(result.receipt.otherCharges).toBe(-100n);
    expect(result.assignedTotal).toBe(-1900n);
    expect(result.canFinalize).toBe(true);
  });

  it("blocks excessive coupon reversal, invalid quantity, missing ownership and an incorrect refund total", () => {
    const s = transaction(["-1.00"]);
    s.receipt.adjustments = [
      {
        id: "reversal",
        label: "Coupon reversal",
        kind: "discount",
        amount: "-2.00",
        allocation: "proportional",
      },
    ];
    expect(calculateReceipt(s.receipt).issues).toContainEqual(
      expect.objectContaining({ path: "adjustments" }),
    );
    s.receipt.adjustments = [];
    s.receipt.items[0].quantity = "-1";
    expect(calculateReceipt(s.receipt).issues).toContainEqual(
      expect.objectContaining({ path: "items.0.quantity" }),
    );
    s.receipt.items[0].quantity = "1";
    review(s);
    expect(calculateSplit(s).canFinalize).toBe(false);
    assign(s, "equal");
    s.receipt.printedTotal = "1.00";
    review(s);
    expect(calculateSplit(s).canFinalize).toBe(false);
    expect(calculateReceipt(s.receipt).discrepancy).toBe(-200n);
  });

  it("conserves signed VAT, credits and allocations in 500 generated transactions across three currency precisions", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: -100000, max: 100000 }), {
          minLength: 1,
          maxLength: 15,
        }),
        fc.constantFrom<Currency>("GBP", "JPY", "KWD"),
        fc.integer({ min: 1, max: 8 }),
        (prices, currency, people) => {
          const s = transaction(
            prices.map((value) => minorString(BigInt(value), currency)),
            currency,
            Array.from({ length: people }, (_, i) => `Person ${i}`),
          );
          Object.assign(s.receipt, {
            pricesIncludeTax: false,
            taxMode: "codes",
            taxCodes: [{ code: "X", rate: "17.5" }],
          });
          s.receipt.items.forEach((item, i) => {
            item.taxCode = "X";
            assign(
              s,
              "ratio",
              s.people.map((_, j) => String(j + 1)),
              i,
            );
          });
          const net = prices.reduce(
            (total, value) => total + BigInt(value),
            0n,
          );
          const expectedTax = roundDiv(net * 175n, 1000n);
          s.receipt.printedTotal = minorString(net + expectedTax, currency);
          s.receipt.printedTax = minorString(expectedTax, currency);
          review(s);
          const before = JSON.stringify(s);
          const result = calculateSplit(s);
          expect(result.issues).toEqual([]);
          expect(result.receipt.tax).toBe(expectedTax);
          if (
            prices.some((price) => price > 0) &&
            prices.some((price) => price < 0)
          )
            result.receipt.items.forEach((item, i) => {
              const numerator = BigInt(prices[i]) * 175n;
              const error = item.tax * 1000n - numerator;
              expect(error > -1000n && error < 1000n).toBe(true);
              expect(prices[i] >= 0 ? item.tax >= 0n : item.tax <= 0n).toBe(
                true,
              );
            });
          expect(
            result.totals.reduce((sum, person) => sum + person.total, 0n),
          ).toBe(net + expectedTax);
          expect(result.canFinalize).toBe(true);
          expect(JSON.stringify(s)).toBe(before);
        },
      ),
      { numRuns: 500, seed: 20261031 },
    );
  });
});
