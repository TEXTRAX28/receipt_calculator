import { describe, expect, it } from "vitest";
import { parseReceiptWithSources, PHOTO_SEPARATOR } from "../src/lib/parser";

describe("printed quantity, unit-price and line-total columns", () => {
  it("reads repeated named/numeric rows without adding an unprinted operator", () => {
    const { receipt, sources, columnSources } = parseReceiptWithSources(
      "Currency IDR\nRice 1 43,181 43,181\n1 13,000 13,000\nTea\nTOTAL 56,181",
    );
    expect(
      receipt.items.map(({ description, quantity, unitPrice, lineTotal }) => [
        description,
        quantity,
        unitPrice,
        lineTotal,
      ]),
    ).toEqual([
      ["Rice", "1", "43181", "43181"],
      ["Tea", "1", "13000", "13000"],
    ]);
    expect(sources[receipt.items[0].id]).toEqual([1]);
    expect(sources[receipt.items[1].id]).toEqual([2, 3]);
    expect(columnSources[receipt.items[0].id].unitPrice.literal).toBe("43,181");
    expect(
      receipt.items.every((item) =>
        receipt.reviewChecks.some(
          (check) =>
            check.scope === "item" &&
            check.itemId === item.id &&
            check.field === "quantity" &&
            check.reason === "source" &&
            check.confirmedValue === "",
        ),
      ),
    ).toBe(true);
  });

  it.each([
    ["GBP", "1.25", "2.50"],
    ["JPY", "125", "250"],
    ["KWD", "1.250", "2.500"],
  ])(
    "uses explicit column headings with %s precision",
    (currency, unit, total) => {
      const { receipt, columnSources } = parseReceiptWithSources(
        `Currency ${currency}\nDescription QTY UNIT PRICE TOTAL\nTea 2 ${unit} ${total}\nTOTAL ${total}`,
      );
      expect(receipt.items[0]).toMatchObject({
        description: "Tea",
        quantity: "2",
        unitPrice: unit,
        lineTotal: total,
      });
      expect(columnSources[receipt.items[0].id]).toBeDefined();
    },
  );

  it("keeps pack contents in the name and preserves two genuine identical purchases", () => {
    const { receipt } = parseReceiptWithSources(
      "Currency GBP\nSPAM 6x340g 2 3.40 6.80\nSPAM 6x340g 2 3.40 6.80\nTOTAL 13.60",
    );
    expect(
      receipt.items.map((item) => [item.description, item.quantity]),
    ).toEqual([
      ["SPAM 6x340g", "2"],
      ["SPAM 6x340g", "2"],
    ]);
    expect(new Set(receipt.items.map((item) => item.id)).size).toBe(2);
  });

  it.each([
    "Currency GBP\nTea 2 3.40 6.80\nTOTAL 6.80",
    "Currency GBP\nQty Total Unit Price\nTea 2 3.40 6.80\nCoffee 1 2.00 2.00\nTOTAL 8.80",
    "Currency GBP\nQty Unit Price Total\nTea 2 3.40 7.00\nTOTAL 7.00",
    "Currency GBP\nQty Unit Price Total\nTea 2 3.40 -6.80\nTOTAL -6.80",
    "Currency GBP\nQty Unit Price Total\nSPAM 6x340g\nTOTAL 6.80",
    `Currency GBP\nTea 2 3.40 6.80\n${PHOTO_SEPARATOR}\nCoffee 1 2.00 2.00\nTOTAL 8.80`,
    `Currency GBP\nQty Unit Price Total\n${PHOTO_SEPARATOR}\nTea 2 3.40 6.80\nTOTAL 6.80`,
  ])(
    "does not invent column roles without sufficient consistent context: %s",
    (text) => {
      expect(Object.keys(parseReceiptWithSources(text).columnSources)).toEqual(
        [],
      );
    },
  );

  it("does not resolve columns using an unselected or contradictory currency", () => {
    const body = "Qty Unit Price Total\nRice 1 43.181 43.181\nTOTAL 43.181";
    expect(parseReceiptWithSources(body).columnSources).toEqual({});
    expect(
      parseReceiptWithSources("Currency IDR\n" + body, { currency: "GBP" })
        .columnSources,
    ).toEqual({});
  });

  it("does not associate a title across the financial footer or use one title twice", () => {
    const { receipt } = parseReceiptWithSources(
      "Currency GBP\nQty Unit Price Total\n1 3.00 3.00\nTea\n2 4.00 8.00\nSubtotal 11.00\nTOTAL 11.00",
    );
    expect(receipt.items).toEqual([]);
    expect(receipt.reviewChecks).toContainEqual(
      expect.objectContaining({
        scope: "receipt",
        field: "items",
        reason: "coverage",
      }),
    );
    const footer = parseReceiptWithSources(
      "Currency GBP\nQty Unit Price Total\n1 3.00 3.00\nSubtotal 3.00\nAdvertising\nTOTAL 3.00",
    );
    expect(footer.receipt.items).toEqual([]);
  });
});
