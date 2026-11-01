import { describe, expect, it } from "vitest";
import {
  matchPurchaseExpression,
  separatePurchaseRows,
} from "../src/lib/purchase-expression";
import { parseReceiptWithSources, PHOTO_SEPARATOR } from "../src/lib/parser";
import { calculateReceipt } from "../src/lib/engine";

describe("product titles and financial labels around separate expressions", () => {
  it.each(["XL", "奶茶", "茶"])(
    "supports a short or non-Latin literal title %s",
    (name) => {
      const { receipt } = parseReceiptWithSources(
        `Currency GBP\n${name}\n1x2.00 2.00\nTOTAL GBP 2.00`,
      );
      expect(receipt.items[0]).toMatchObject({
        description: name,
        quantity: "1",
        unitPrice: "2.00",
        lineTotal: "2.00",
      });
    },
  );
  it("does not use a numeric header before the first complete expression to choose ordering", () => {
    const { receipt } = parseReceiptWithSources(
      "Currency IDR\n店\n00000\n1x20.000 20.000\n茶\n1x0.000 0.000\n水\nTOTAL 20.000",
    );
    expect(receipt.items.map((item) => item.description)).toEqual(["茶", "水"]);
  });
  it.each([
    "Member Savings",
    "Coupon",
    "Discount",
    "Rebate",
    "IRC MEMBER OFFER",
  ])("does not turn %s into a returned product", (label) => {
    const { receipt } = parseReceiptWithSources(
      `Currency GBP\n${label}\n1x2.00 -2.00\nTOTAL GBP -2.00`,
    );
    expect(receipt.items).toEqual([]);
    expect(receipt.reviewChecks).toContainEqual(
      expect.objectContaining({
        field: "items",
        reason: "coverage",
        confirmedValue: "",
      }),
    );
  });
  it.each([
    "Total repair kit",
    "Tax free tea",
    "Service manual",
    "Cash register rolls",
    "Coupon book",
  ])("preserves the genuine title %s", (name) => {
    const { receipt } = parseReceiptWithSources(
      `Currency GBP\n${name}\n1x2.00 2.00\nTOTAL GBP 2.00`,
    );
    expect(receipt.items).toHaveLength(1);
    expect(receipt.items[0]).toMatchObject({
      description: name,
      quantity: "1",
      unitPrice: "2.00",
      lineTotal: "2.00",
    });
  });
  it("keeps a reduced-price marker attached to its preceding real product", () => {
    const { receipt } = parseReceiptWithSources(
      "Currency GBP\nMilk six pack\nREDUCED PRICE\n1x2.00 2.00\nTOTAL GBP 2.00",
    );
    expect(receipt.items).toHaveLength(1);
    expect(receipt.items[0].description).toBe("Milk six pack");
    expect(receipt.reviewChecks).toContainEqual(
      expect.objectContaining({
        field: "items",
        reason: "coverage",
        confirmedValue: "",
      }),
    );
  });
  it("does not bypass the receipt footer when matching a later expression", () => {
    const { receipt } = parseReceiptWithSources(
      "Currency GBP\nMilk\n1x2.00 2.00\nTOTAL (INCL VAT) 2.00\nFooter advertising\n3x4.00 12.00\n4x1.00 4.00",
    );
    expect(receipt.items.map((item) => item.description)).toEqual(["Milk"]);
    expect(
      receipt.reviewChecks.some(
        (check) =>
          check.scope === "receipt" &&
          check.field === "items" &&
          check.reason === "coverage",
      ),
    ).toBe(false);
  });
});

describe("separate literal purchase expressions", () => {
  it.each([
    ["2 @20.000 40.000", "2", "20.000", "40.000"],
    ["1× 36.000 36.000", "1", "36.000", "36.000"],
    ["22.000 x1 22.000", "1", "22.000", "22.000"],
    ["1×0.000 RP0.000", "1", "0.000", "0.000"],
    ["2x £5.00 -10.00", "2", "5.00", "-10.00"],
    ["0.25 @ 3.995 1.000 A", "0.25", "3.995", "1.000"],
  ])(
    "preserves literal roles in %s",
    (text, quantity, unitPrice, lineTotal) => {
      const result = matchPurchaseExpression(text)!;
      expect(result).toMatchObject({ quantity, unitPrice, lineTotal });
      expect(text.slice(...result.unitSpan)).toBe(unitPrice);
    },
  );
  it.each([
    "SPAM 6x340g",
    "6x3.40",
    "Tea 2x3.40 6.80",
    "2 3.40 6.80",
    "0x5.00 0.00",
    "4.00",
    "x1 0",
    "2x5.00 10.00 and 12.00",
    "1x" + "9".repeat(81) + " 1.00",
  ])("does not manufacture a complete expression from %s", (text) => {
    expect(matchPurchaseExpression(text)).toBeNull();
  });
  it("pairs two titles before prices, using an adjacent incomplete free row only as ordering evidence", () => {
    const lines = [
      "Currency IDR",
      "1001-Choco Bun",
      "22.000 x1 22.000",
      "2001-Hokkaido Milk Toast",
      "22.000 x1 22.000",
      "6002-Plastic Bag Medium",
      "0",
      "TOTAL 44.000",
    ];
    const { receipt, sources } = parseReceiptWithSources(lines.join("\n"));
    // The incomplete free row does not supply an invented unit price or product.
    expect(
      receipt.items.map((i) => [
        i.description,
        i.quantity,
        i.unitPrice,
        i.lineTotal,
      ]),
    ).toEqual([
      ["1001-Choco Bun", "1", "22000", "22000"],
      ["2001-Hokkaido Milk Toast", "1", "22000", "22000"],
    ]);
    expect(sources[receipt.items[0].id]).toEqual([1, 2]);
    expect(sources[receipt.items[1].id]).toEqual([3, 4]);
    expect(receipt.reviewChecks).toContainEqual(
      expect.objectContaining({
        field: "description",
        reason: "source",
        confirmedValue: "",
      }),
    );
  });
  it("pairs price-first names and keeps the printed free option as its own purchase", () => {
    const { receipt, sources } = parseReceiptWithSources(
      "Currency IDR\n1×36.000 36.000\nKimchi p\n1×0.000 RP0.000\nFree ice green tea\n***TOTAL 36.000",
    );
    expect(
      receipt.items.map((i) => [
        i.description,
        i.quantity,
        i.unitPrice,
        i.lineTotal,
      ]),
    ).toEqual([
      ["Kimchi p", "1", "36000", "36000"],
      ["Free ice green tea", "1", "0", "0"],
    ]);
    expect(sources[receipt.items[0].id]).toEqual([1, 2]);
    expect(sources[receipt.items[1].id]).toEqual([3, 4]);
  });
  it("preserves repeated products as separate physical occurrences", () => {
    const { receipt, sources } = parseReceiptWithSources(
      "Currency GBP\nMilk\n2x1.25 2.50\nMilk\n2x1.25 2.50\nTOTAL 5.00",
    );
    expect(receipt.items.map((i) => i.description)).toEqual(["Milk", "Milk"]);
    expect(sources[receipt.items[0].id]).toEqual([1, 2]);
    expect(sources[receipt.items[1].id]).toEqual([3, 4]);
  });
  it("does not reuse an ambiguous middle title for two price rows", () => {
    const lines = ["2x1.00 2.00", "Milk", "3x1.00 3.00"];
    const result = separatePurchaseRows(lines, PHOTO_SEPARATOR);
    expect(result.rows.size).toBe(0);
    expect(result.unmatched).toEqual([0, 2]);
    const { receipt } = parseReceiptWithSources(lines.join("\n"), {
      currency: "GBP",
    });
    expect(receipt.items).toEqual([]);
    expect(receipt.reviewChecks).toContainEqual(
      expect.objectContaining({
        field: "items",
        reason: "coverage",
        confirmedValue: "",
      }),
    );
  });
  it("does not cross photo boundaries, summaries or payment sections", () => {
    const lines = [
      "Currency GBP",
      "Milk",
      PHOTO_SEPARATOR,
      "2x1.25 2.50",
      "TOTAL GBP 2.50",
      "Bread",
      "1x3.00 3.00",
    ];
    const result = separatePurchaseRows(lines, PHOTO_SEPARATOR);
    expect(result.rows.size).toBe(0);
    expect(result.unmatched).toEqual([3]);
  });
  it("does not treat a pack name as the purchased count or calculate a missing total", () => {
    const { receipt } = parseReceiptWithSources(
      "Currency GBP\nCanned peas 6x340g\n2x 10.00 25.00\nTOTAL 25.00",
    );
    expect(receipt.items[0]).toMatchObject({
      description: "Canned peas 6x340g",
      quantity: "2",
      unitPrice: "10.00",
      lineTotal: "25.00",
    });
    expect(calculateReceipt(receipt).issues.length).toBeGreaterThan(0);
  });
  it("preserves unresolved number formats and valid three-decimal currencies", () => {
    const text = "Milk\n2x3.995 7.990\nTOTAL 7.990";
    const unknown = parseReceiptWithSources(text).receipt;
    expect(unknown.items[0].unitPrice).toBe("");
    expect(unknown.items[0].lineTotal).toBe("");
    const kwd = parseReceiptWithSources(text, { currency: "KWD" }).receipt;
    expect(kwd.items[0]).toMatchObject({
      quantity: "2",
      unitPrice: "3.995",
      lineTotal: "7.990",
    });
  });
});
