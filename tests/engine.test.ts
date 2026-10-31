import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  calculateReceipt,
  calculateSplit,
  removePerson,
} from "../src/lib/engine";
import { costcoDemo } from "../src/lib/demo";
import { minorString } from "../src/lib/money";
import { receiptStamp } from "../src/lib/model";
import { assign, review, shop } from "./helpers";

const amounts = (state: ReturnType<typeof shop>) =>
  calculateSplit(state).totals.map((p) => p.total);
describe("financial and allocation journeys", () => {
  it("assigns the whole item to one person", () => {
    const s = shop(["12.00"], ["Alice"]);
    assign(s, "equal");
    expect(amounts(s)).toEqual([1200n]);
    expect(calculateSplit(s).canFinalize).toBe(true);
  });
  it("shares £12 equally between two people", () => {
    const s = shop(["12.00"], ["Alice", "Bob"]);
    assign(s, "equal");
    expect(amounts(s)).toEqual([600n, 600n]);
  });
  it("shares the final taxed cost equally and discloses component rounding", () => {
    const s = shop(["1.00"]);
    s.receipt.pricesIncludeTax = false;
    s.receipt.adjustments = [
      {
        id: "tax",
        label: "Tax",
        kind: "tax",
        amount: "0.20",
        allocation: "proportional",
      },
    ];
    s.receipt.printedTotal = "1.20";
    assign(s, "equal");
    review(s);
    const r = calculateSplit(s);
    expect(amounts(s)).toEqual([40n, 40n, 40n]);
    expect(r.totals.map((p) => p.lines[0].rounding)).toEqual([-1n, 0n, 1n]);
    expect(r.canFinalize).toBe(true);
  });
  it("avoids negative person totals from the Hamilton component paradox", () => {
    const s = shop(["0.26"], ["A", "B", "C", "D", "E", "F"]);
    s.receipt.adjustments = [
      {
        id: "round",
        label: "Explicit receipt adjustment",
        kind: "rounding",
        amount: "-0.25",
        allocation: "proportional",
      },
    ];
    s.receipt.printedTotal = "0.01";
    assign(s, "ratio", ["1500", "1500", "900", "500", "500", "200"]);
    review(s);
    const r = calculateSplit(s);
    expect(r.canFinalize).toBe(true);
    expect(r.totals.every((p) => p.total >= 0n)).toBe(true);
    expect(r.assignedTotal).toBe(1n);
  });
  it("splits £10 equally among three people", () => {
    const s = shop();
    assign(s, "equal");
    expect(amounts(s)).toEqual([334n, 333n, 333n]);
    expect(calculateSplit(s).canFinalize).toBe(true);
  });
  it("allocates eight £16 cans as 1/3/4 → £2/£6/£8", () => {
    const s = shop(["16.00"]);
    s.receipt.items[0].packSize = "8";
    assign(s, "quantity", ["1", "3", "4"]);
    review(s);
    expect(amounts(s)).toEqual([200n, 600n, 800n]);
    expect(calculateSplit(s).canFinalize).toBe(true);
  });
  it("blocks 1/3/5 for eight cans and preserves all inputs", () => {
    const s = shop(["16.00"]);
    s.receipt.items[0].packSize = "8";
    assign(s, "quantity", ["1", "3", "5"]);
    const r = calculateSplit(s);
    expect(r.canFinalize).toBe(false);
    expect(r.issues.some((i) => i.message.includes("1 units too many"))).toBe(
      true,
    );
    expect(Object.values(s.receipt.items[0].assignment.values)).toEqual([
      "1",
      "3",
      "5",
    ]);
  });
  it("blocks under-allocation and a missing confirmed pack size", () => {
    const s = shop(["16.00"]);
    assign(s, "quantity", ["1", "3", "3"]);
    expect(
      calculateSplit(s).issues.some((i) => /Confirm units/.test(i.message)),
    ).toBe(true);
    s.receipt.items[0].packSize = "8";
    expect(
      calculateSplit(s).issues.some((i) => /1 units still/.test(i.message)),
    ).toBe(true);
  });
  it("accounts for purchased packs separately from pack contents", () => {
    const s = shop(["32.00"]);
    s.receipt.items[0].quantity = "2";
    s.receipt.items[0].packSize = "8";
    assign(s, "quantity", ["2", "6", "8"]);
    review(s);
    expect(amounts(s)).toEqual([400n, 1200n, 1600n]);
    expect(calculateSplit(s).canFinalize).toBe(true);
  });
  it("allows measured decimals and rejects fractional indivisible cans", () => {
    const s = shop(["10.00"], ["Alice", "Bob"]);
    const item = s.receipt.items[0];
    item.packSize = "1";
    assign(s, "quantity", ["0.25", "0.75"]);
    expect(calculateSplit(s).canFinalize).toBe(false);
    item.unitKind = "measured";
    expect(amounts(s)).toEqual([250n, 750n]);
    expect(calculateSplit(s).canFinalize).toBe(true);
  });
  it("splits £18 in ratio 1:3:5 → £2/£6/£10", () => {
    const s = shop(["18.00"]);
    assign(s, "ratio", ["1", "3", "5"]);
    expect(amounts(s)).toEqual([200n, 600n, 1000n]);
    expect(calculateSplit(s).canFinalize).toBe(true);
  });
  it("requires positive selected weights", () => {
    const s = shop();
    assign(s, "ratio", ["0", "1", "2"]);
    expect(
      calculateSplit(s).issues.some((i) => /positive share/.test(i.message)),
    ).toBe(true);
  });
  it("supports one-third each without requiring repeating decimal input", () => {
    const s = shop(["9.00"]);
    assign(s, "ratio", ["1", "1", "1"]);
    expect(amounts(s)).toEqual([300n, 300n, 300n]);
  });
  it("checks percentages and allocates 20/30/50", () => {
    const s = shop();
    assign(s, "percent", ["20", "30", "50"]);
    expect(amounts(s)).toEqual([200n, 300n, 500n]);
    expect(calculateSplit(s).canFinalize).toBe(true);
    s.receipt.items[0].assignment.values["person-2"] = "49.99";
    expect(calculateSplit(s).canFinalize).toBe(false);
  });
  it("keeps whole-receipt allocations distinct from item allocations", () => {
    const s = shop(["10.00", "8.00"]);
    s.receipt.items.forEach((_, i) => assign(s, "equal", [], i));
    s.wholeAssignment = assign(s, "ratio", ["1", "3", "5"]);
    s.splitMode = "whole";
    expect(amounts(s)).toEqual([200n, 600n, 1000n]);
    expect(calculateSplit(s).canFinalize).toBe(true);
  });
  it("reconciles all 18 Costco purchases with A/Z and four separate discounts", () => {
    const s = shop();
    s.receipt = costcoDemo();
    s.receipt.items.forEach((_, i) => assign(s, "equal", [], i));
    review(s);
    const r = calculateSplit(s);
    expect(r.receipt.subtotal).toBe(16316n);
    expect(r.receipt.tax).toBe(1362n);
    expect(r.receipt.total).toBe(17678n);
    expect(r.canFinalize).toBe(true);
    expect(r.totals.reduce((n, p) => n + p.total, 0n)).toBe(17678n);
    expect(r.receipt.items[3].total).toBe(749n);
  });
  it("does not reuse Costco code definitions for an unknown code", () => {
    const s = shop();
    s.receipt.pricesIncludeTax = false;
    s.receipt.taxMode = "codes";
    s.receipt.items[0].taxCode = "B";
    expect(
      calculateReceipt(s.receipt).issues.some((i) =>
        /define its rate/.test(i.message),
      ),
    ).toBe(true);
  });
  it("supports explicitly defined custom tax codes", () => {
    const s = shop();
    s.receipt.pricesIncludeTax = false;
    s.receipt.taxMode = "codes";
    s.receipt.taxCodes = [{ code: "R", rate: "5" }];
    s.receipt.items[0].taxCode = "R";
    s.receipt.printedTotal = "10.50";
    assign(s, "equal");
    review(s);
    expect(calculateSplit(s).receipt.tax).toBe(50n);
    expect(calculateSplit(s).canFinalize).toBe(true);
  });
  it("does not add already included tax twice", () => {
    const s = shop(["12.00"]);
    s.receipt.adjustments = [
      {
        id: "tax",
        label: "VAT already included",
        kind: "tax",
        amount: "2.00",
        allocation: "proportional",
      },
    ];
    assign(s, "equal");
    review(s);
    expect(calculateSplit(s).receipt.total).toBe(1200n);
    expect(calculateSplit(s).canFinalize).toBe(true);
  });
  it("adds printed exclusive tax, fee, tip and deposit exactly", () => {
    const s = shop();
    s.receipt.pricesIncludeTax = false;
    s.receipt.adjustments = ["tax", "fee", "tip", "deposit"].map((kind, i) => ({
      id: `adj-${i}`,
      kind: kind as "tax" | "fee" | "tip" | "deposit",
      label: kind,
      amount: "1.00",
      allocation: "proportional",
    }));
    s.receipt.printedTotal = "14.00";
    assign(s, "equal");
    review(s);
    expect(calculateSplit(s).canFinalize).toBe(true);
    expect(amounts(s).reduce((a, b) => a + b, 0n)).toBe(1400n);
  });
  it("prevents simultaneous printed tax and tax-code charging", () => {
    const r = costcoDemo();
    r.adjustments = [
      {
        id: "tax",
        label: "Extra VAT",
        kind: "tax",
        amount: "13.62",
        allocation: "proportional",
      },
    ];
    expect(
      calculateReceipt(r).issues.some((i) =>
        /avoid adding tax twice/.test(i.message),
      ),
    ).toBe(true);
  });
  it("allocates receipt discounts before tax and applies item discounts", () => {
    const s = shop(["10.00", "20.00"], ["Alice"]);
    s.receipt.items[0].discount = "2.00";
    s.receipt.adjustments = [
      {
        id: "discount",
        label: "Money off",
        kind: "discount",
        amount: "4.00",
        allocation: "proportional",
      },
    ];
    s.receipt.printedTotal = "24.00";
    s.receipt.items.forEach((_, i) => assign(s, "equal", [], i));
    review(s);
    const r = calculateSplit(s);
    expect(r.receipt.subtotal).toBe(2800n);
    expect(r.receipt.receiptDiscount).toBe(400n);
    expect(r.canFinalize).toBe(true);
    expect(amounts(s)).toEqual([2400n]);
  });
  it("shares an equal-per-person charge across everyone, regardless of item ownership", () => {
    const s = shop(["10.00"], ["Alice", "Bob"]);
    s.receipt.items[0].assignment = {
      mode: "equal",
      participants: ["person-0"],
      values: {},
    };
    s.receipt.adjustments = [
      {
        id: "fee",
        label: "Delivery",
        kind: "fee",
        amount: "2.00",
        allocation: "equal-people",
      },
    ];
    s.receipt.printedTotal = "12.00";
    review(s);
    expect(amounts(s)).toEqual([1100n, 100n]);
    expect(calculateSplit(s).canFinalize).toBe(true);
  });
  it("makes a named rounding adjustment explicit", () => {
    const s = shop();
    s.receipt.adjustments = [
      {
        id: "round",
        label: "Printed cash rounding",
        kind: "rounding",
        amount: "-0.01",
        allocation: "proportional",
      },
    ];
    s.receipt.printedTotal = "9.99";
    assign(s, "equal");
    review(s);
    expect(calculateSplit(s).canFinalize).toBe(true);
    expect(amounts(s).reduce((a, b) => a + b, 0n)).toBe(999n);
  });
  it("invalidates a financial review after a price edit and recalculates live", () => {
    const s = shop();
    assign(s, "equal");
    s.receipt.items[0].lineTotal = "12.00";
    s.receipt.printedTotal = "12.00";
    expect(calculateSplit(s).receipt.total).toBe(1200n);
    expect(calculateSplit(s).canFinalize).toBe(false);
    review(s);
    expect(calculateSplit(s).canFinalize).toBe(true);
  });
  it("does not invalidate review for assignments or a confirmed physical pack size", () => {
    const s = shop();
    s.receipt.items[0].packSize = "8";
    assign(s, "equal");
    expect(s.reviewedStamp).toBe(receiptStamp(s.receipt));
    expect(calculateSplit(s).canFinalize).toBe(true);
  });
  it("removes a person safely and flags now-invalid quantity assignments", () => {
    const s = shop(["16.00"]);
    s.receipt.items[0].packSize = "8";
    assign(s, "quantity", ["1", "3", "4"]);
    const changed = removePerson(s, "person-1");
    expect(changed.people).toHaveLength(2);
    expect(changed.receipt.items[0].assignment.participants).not.toContain(
      "person-1",
    );
    expect(calculateSplit(changed).canFinalize).toBe(false);
  });
  it("keeps duplicate participant names and repeated purchases separate", () => {
    const s = shop(["5.00", "5.00"], ["Alex", "Alex"]);
    s.receipt.items[1].description = "Item 1";
    s.receipt.items[0].assignment = {
      mode: "equal",
      participants: ["person-0"],
      values: {},
    };
    s.receipt.items[1].assignment = {
      mode: "equal",
      participants: ["person-1"],
      values: {},
    };
    review(s);
    expect(amounts(s)).toEqual([500n, 500n]);
    expect(calculateSplit(s).canFinalize).toBe(true);
  });
  it("blocks unassigned items, missing totals, bad unit arithmetic and inconsistent receipts", () => {
    const s = shop();
    expect(calculateSplit(s).canFinalize).toBe(false);
    assign(s, "equal");
    s.receipt.printedTotal = "";
    expect(calculateSplit(s).canFinalize).toBe(false);
    s.receipt.printedTotal = "9.99";
    expect(calculateSplit(s).canFinalize).toBe(false);
    s.receipt.printedTotal = "10.00";
    s.receipt.items[0].unitPrice = "5.00";
    expect(
      calculateReceipt(s.receipt).issues.some((i) =>
        /unit price differs/.test(i.message),
      ),
    ).toBe(true);
  });
  it("rejects extreme quantities, unreconciled signed prices and excessive discounts", () => {
    const s = shop();
    s.receipt.items[0].quantity = "100000000000";
    expect(calculateReceipt(s.receipt).issues.length).toBeGreaterThan(0);
    s.receipt.items[0].quantity = "1";
    s.receipt.items[0].lineTotal = "-1";
    expect(calculateReceipt(s.receipt).issues.length).toBeGreaterThan(0);
    s.receipt.items[0].lineTotal = "10.00";
    s.receipt.items[0].discount = "11.00";
    expect(
      calculateReceipt(s.receipt).issues.some((i) =>
        /discount exceeds/.test(i.message),
      ),
    ).toBe(true);
  });
  it("conserves total across 500 generated multi-item tax and discount receipts", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 1000000 }), {
          minLength: 1,
          maxLength: 20,
        }),
        fc.integer({ min: 1, max: 12 }),
        (prices, count) => {
          const s = shop(
            prices.map((c) => minorString(BigInt(c), "GBP")),
            Array.from({ length: count }, (_, i) => `Person ${i}`),
          );
          s.receipt.pricesIncludeTax = false;
          s.receipt.taxMode = "codes";
          s.receipt.taxCodes = [{ code: "X", rate: "17.5" }];
          s.receipt.items.forEach((item, i) => {
            item.taxCode = "X";
            item.discount = minorString(BigInt(prices[i]) / 10n, "GBP");
            assign(
              s,
              "ratio",
              s.people.map((_, p) => String(p + 1)),
              i,
            );
          });
          const net = prices.reduce(
            (total, price) => total + BigInt(price) - BigInt(price) / 10n,
            0n,
          );
          s.receipt.adjustments = [
            {
              id: "receipt-discount",
              label: "Receipt discount",
              kind: "discount",
              amount: minorString(net / 20n, "GBP"),
              allocation: "proportional",
            },
          ];
          s.receipt.printedTotal = minorString(
            calculateReceipt(s.receipt).total,
            "GBP",
          );
          review(s);
          const r = calculateSplit(s);
          expect(r.canFinalize).toBe(true);
          expect(r.totals.reduce((a, p) => a + p.total, 0n)).toBe(
            r.receipt.printed,
          );
        },
      ),
      { numRuns: 500, seed: 20261028 },
    );
  });
});
