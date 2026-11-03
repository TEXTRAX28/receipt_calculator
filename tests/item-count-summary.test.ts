import { describe, expect, it } from "vitest";
import { parseReceiptWithSources, PHOTO_SEPARATOR } from "../src/lib/parser";
import { separatePurchaseRows } from "../src/lib/purchase-expression";
import { columnPurchaseRows } from "../src/lib/column-purchases";

describe("printed item-count summaries", () => {
  it.each(["ITEMS:2", "TOTAL NUMBER OF ITEMS SOLD - 2"])(
    "keeps separate and column purchases below the count header %s",
    (count) => {
      const separate = parseReceiptWithSources(
        `Currency GBP\n${count}\nTea\n1x2.00 2.00\nMilk\n1x3.00 3.00\nTOTAL GBP 5.00`,
      ).receipt;
      expect(separate.items.map((item) => item.description)).toEqual([
        "Tea",
        "Milk",
      ]);
      const columns = parseReceiptWithSources(
        `Currency GBP\n${count}\nQty Unit Price Total\nTea 1 2.00 2.00\nMilk 1 3.00 3.00\nTOTAL GBP 5.00`,
      ).receipt;
      expect(columns.items.map((item) => item.description)).toEqual([
        "Tea",
        "Milk",
      ]);
    },
  );
  it("does not charge the subtotal beside ITEMS:1 as another purchase", () => {
    // Actual retained OCR lines from cord-v2-validation-004; the photo has
    // a count and subtotal below the dotted purchase-section divider.
    const text =
      "BBQ Chicken 41,000\n-Sedang 0\nITEMS:1 41,000\nTotal. 41,000\nPay Cash 50.000 Change :9,000";
    const { receipt, fieldSources, sources } = parseReceiptWithSources(text, {
      currency: "IDR",
    });
    expect(receipt.items.map((item) => item.description)).toEqual([
      "BBQ Chicken",
    ]);
    expect(receipt.items[0]).toMatchObject({
      quantity: "",
      unitPrice: "",
      lineTotal: "41000",
    });
    expect(sources[receipt.items[0].id]).toEqual([0]);
    expect(receipt.rawText).toBe(text);
    expect(fieldSources.items).toEqual([2]);
    expect(receipt.reviewChecks).toContainEqual(
      expect.objectContaining({
        scope: "receipt",
        field: "items",
        reason: "classification",
        confirmedValue: "",
      }),
    );
  });

  it.each([
    "ITEMS : 2 5.00",
    "Item count: 2 GBP 5.00",
    "Number of items - 2",
    "TOTAL NUMBER OF ITEMS SOLD - 2",
    "Items sold: 2 £5.00",
  ])(
    "omits only the labelled count %s and retains later purchases",
    (count) => {
      const { receipt } = parseReceiptWithSources(
        `Currency GBP\n${count}\nTea 1x 2.00 2.00\nMilk 1x 3.00 3.00\nTOTAL GBP 5.00`,
      );
      expect(receipt.items.map((item) => item.description)).toEqual([
        "Tea",
        "Milk",
      ]);
      expect(receipt.items.map((item) => item.quantity)).toEqual(["1", "1"]);
      expect(receipt.printedTotal).toBe("5.00");
      expect(receipt.reviewChecks).toContainEqual(
        expect.objectContaining({
          field: "items",
          reason: "classification",
          confirmedValue: "",
        }),
      );
    },
  );

  it("does not use an inconsistent count or its amount to alter purchases or totals", () => {
    const { receipt } = parseReceiptWithSources(
      "Currency GBP\nTea 1x 2.00 2.00\nITEMS:99 999.00\nTOTAL GBP 2.00",
    );
    expect(receipt.items).toHaveLength(1);
    expect(receipt.items[0]).toMatchObject({
      quantity: "1",
      unitPrice: "2.00",
      lineTotal: "2.00",
    });
    expect(receipt.printedTotal).toBe("2.00");
  });

  it.each([
    "Items organizer",
    "Item 42",
    "2 items storage pack",
    "Item count cushion",
    "Items 1 pack",
  ])("keeps the genuine product description %s", (description) => {
    const { receipt } = parseReceiptWithSources(
      `Currency GBP\n${description} 12.00\nTOTAL GBP 12.00`,
    );
    expect(receipt.items).toHaveLength(1);
    expect(receipt.items[0]).toMatchObject({
      description,
      quantity: "",
      lineTotal: "12.00",
    });
    expect(
      receipt.reviewChecks.some(
        (check) => check.field === "items" && check.reason === "classification",
      ),
    ).toBe(false);
  });

  it("keeps an explicit purchase expression after a product named Items", () => {
    const { receipt } = parseReceiptWithSources(
      "Currency GBP\nItems 1x 2.00 2.00\nTOTAL GBP 2.00",
    );
    expect(receipt.items[0]).toMatchObject({
      description: "Items",
      quantity: "1",
      lineTotal: "2.00",
    });
  });

  it("never uses a count as the product title of an adjacent expression", () => {
    const rows = separatePurchaseRows(
      ["ITEMS:1", "1x2.00 2.00"],
      PHOTO_SEPARATOR,
    );
    expect([...rows.rows]).toEqual([]);
    expect(rows.unmatched).toEqual([1]);
  });

  it("does not mistake a count for a column product name", () => {
    const rows = columnPurchaseRows(
      ["Qty Unit Price Total", "ITEMS:1 1 2.00 2.00"],
      "GBP",
      PHOTO_SEPARATOR,
      () => false,
    );
    expect([...rows.rows]).toEqual([]);
  });

  it("keeps both photographs and count source indices without merging purchases", () => {
    const { receipt, fieldSources } = parseReceiptWithSources(
      `Currency GBP\nTea 1x 2.00 2.00\nITEMS:1 2.00\n${PHOTO_SEPARATOR}\nMilk 1x 3.00 3.00\nITEMS:1 3.00\nTOTAL GBP 5.00`,
    );
    expect(receipt.items.map((item) => item.description)).toEqual([
      "Tea",
      "Milk",
    ]);
    expect(fieldSources.items).toEqual([2, 5]);
    expect(
      receipt.reviewChecks.filter(
        (check) => check.field === "items" && check.reason === "classification",
      ),
    ).toHaveLength(1);
  });
});
