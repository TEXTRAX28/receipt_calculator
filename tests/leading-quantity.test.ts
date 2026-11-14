import { describe, expect, it } from "vitest";
import { parseReceiptWithSources } from "../src/lib/parser";
import { calculateReceipt } from "../src/lib/engine";

describe("leading purchased counts with mandatory source review", () => {
  it.each([
    ["2 x Tea", "2"],
    ["2 X Tea", "2"],
    ["2× Tea", "2"],
    ["1.5 x Tea", "1.5"],
    ["1.5 X Tea", "1.5"],
    ["1,5x Tea", "1.5"],
  ])(
    "keeps the printed row total for %s without calculating a unit price",
    (name, quantity) => {
      const { receipt, sources } = parseReceiptWithSources(
        `Market GBP\n${name} 6.00\nTOTAL GBP 6.00`,
      );
      const item = receipt.items[0];
      expect(item).toMatchObject({
        description: "Tea",
        quantity,
        unitPrice: "",
        lineTotal: "6.00",
      });
      expect(sources[item.id]).toEqual([1]);
      expect(receipt.reviewChecks).toContainEqual(
        expect.objectContaining({
          scope: "item",
          itemId: item.id,
          field: "quantity",
          reason: "source",
          confirmedValue: "",
        }),
      );
      expect(calculateReceipt(receipt).issues).toContainEqual(
        expect.objectContaining({ path: "items.0.quantity" }),
      );
    },
  );
  it.each([
    "6x340g Spam",
    "6 x 340g Spam",
    "6 X 340g Spam",
    "Chicken Skewer 15",
    "Ferrero Rocher T48",
    "2xVitamin D",
    "2XVitamin D",
    "475174 Chicken Skewer 15",
    "1 SPGTHY BOLOGNASE",
  ])("preserves the pack/title wording in %s", (description) => {
    const { receipt } = parseReceiptWithSources(
      `Market GBP\n${description} 9.49\nTOTAL GBP 9.49`,
    );
    expect(receipt.items[0]).toMatchObject({
      description,
      quantity: "",
      unitPrice: "",
      lineTotal: "9.49",
    });
  });
  it("gives an explicit trailing purchase expression priority over a leading pack count", () => {
    const { receipt } = parseReceiptWithSources(
      "Market GBP\n6 x Tea 1x 5.00 5.00\nTOTAL GBP 5.00",
    );
    expect(receipt.items[0]).toMatchObject({
      description: "6 x Tea",
      quantity: "1",
      unitPrice: "5.00",
      lineTotal: "5.00",
    });
  });
  it("retains a possible pack count as an editable proposal requiring a source check", () => {
    const { receipt } = parseReceiptWithSources(
      "Market GBP\n6 x Vitamin D 9.49\nTOTAL GBP 9.49",
    );
    expect(receipt.items[0].quantity).toBe("6");
    expect(receipt.reviewChecks[0].other).toMatch(/pack description/);
    expect(calculateReceipt(receipt).issues.length).toBeGreaterThan(0);
  });
  it.each(["x", "X"])(
    "preserves ambiguous-negative-row classification with %s",
    (marker) => {
      const { receipt } = parseReceiptWithSources(
        `Market GBP\n2 ${marker} Tea -6.00\nTOTAL GBP -6.00`,
      );
      expect(receipt.items).toHaveLength(0);
      expect(receipt.adjustments[0]).toMatchObject({
        kind: "discount",
        amount: "6.00",
      });
      expect(receipt.reviewChecks).toContainEqual(
        expect.objectContaining({
          field: "adjustments",
          reason: "classification",
        }),
      );
    },
  );
  it("does not turn a coupon into a purchase or a negative count into a positive quantity", () => {
    const { receipt } = parseReceiptWithSources(
      "Market GBP\n2 x Coupon 1.00\n-2 x Tea 6.00\nTOTAL GBP 5.00",
    );
    expect(receipt.items).toHaveLength(1);
    expect(receipt.items[0]).toMatchObject({
      description: "-2 x Tea",
      quantity: "",
      lineTotal: "6.00",
    });
    expect(receipt.adjustments[0]).toMatchObject({
      kind: "discount",
      amount: "1.00",
    });
  });
  it("does not multiply a grouped printed price after an explicit currency selection", () => {
    const { receipt } = parseReceiptWithSources(
      "Market\n2 x Hot Tea 44,000\nTOTAL 44,000",
      { currency: "IDR" },
    );
    expect(receipt.items[0]).toMatchObject({
      description: "Hot Tea",
      quantity: "2",
      unitPrice: "",
      lineTotal: "44000",
    });
    expect(receipt.printedTotal).toBe("44000");
  });
  it("recovers an uppercase count from saved restaurant OCR while preserving its price and source", () => {
    const { receipt, sources } = parseReceiptWithSources(
      "1 X Bbk Bengil Nasi 125,000\nTOTAL 125,000",
      { currency: "IDR" },
    );
    const item = receipt.items[0];
    expect(item).toMatchObject({
      description: "Bbk Bengil Nasi",
      quantity: "1",
      unitPrice: "",
      lineTotal: "125000",
    });
    expect(sources[item.id]).toEqual([0]);
    expect(receipt.reviewChecks).toContainEqual(
      expect.objectContaining({
        itemId: item.id,
        field: "quantity",
        reason: "source",
        confirmedValue: "",
      }),
    );
  });
  it("keeps identical leading-count purchases separate", () => {
    const { receipt } = parseReceiptWithSources(
      "Market GBP\n2 x Tea 6.00\n2 x Tea 6.00\nTOTAL GBP 12.00",
    );
    expect(receipt.items).toHaveLength(2);
    expect(new Set(receipt.items.map((item) => item.id)).size).toBe(2);
    expect(
      receipt.items.every(
        (item) => item.quantity === "2" && item.lineTotal === "6.00",
      ),
    ).toBe(true);
  });
});
