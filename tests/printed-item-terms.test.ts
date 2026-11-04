import { describe, expect, it } from "vitest";
import { parseReceiptWithSources } from "../src/lib/parser";
import { calculateReceipt } from "../src/lib/engine";

describe("printed item terms across adjacent rows", () => {
  it("keeps explicit counts, unit prices, zero-price items and separate item discounts", () => {
    const { receipt, sources } = parseReceiptWithSources(
      [
        "Sample shop",
        "1X @8000",
        "AREM - AREM 8,000",
        "DISC ITEM -40.000%",
        "AMOUNT -3,200",
        "1X @9000",
        "LEMPER 9,000",
        "DISC ITEM -40.000%",
        "AMOUNT -3,600",
        "1X @0",
        "PLASTIK KECIL 0",
        "SUBTOTAL 10,200",
        "TOTAL 10,200",
      ].join("\n"),
      { currency: "IDR" },
    );
    expect(
      receipt.items.map(
        ({ description, quantity, unitPrice, lineTotal, discount }) => ({
          description,
          quantity,
          unitPrice,
          lineTotal,
          discount,
        }),
      ),
    ).toEqual([
      {
        description: "AREM - AREM",
        quantity: "1",
        unitPrice: "8000",
        lineTotal: "8000",
        discount: "3200",
      },
      {
        description: "LEMPER",
        quantity: "1",
        unitPrice: "9000",
        lineTotal: "9000",
        discount: "3600",
      },
      {
        description: "PLASTIK KECIL",
        quantity: "1",
        unitPrice: "0",
        lineTotal: "0",
        discount: "0",
      },
    ]);
    expect(receipt.adjustments.filter((a) => a.kind === "discount")).toEqual(
      [],
    );
    expect(sources[receipt.items[0].id]).toEqual([1, 2, 3, 4]);
    for (const item of receipt.items)
      for (const field of ["quantity", "unitPrice"])
        expect(
          receipt.reviewChecks.some(
            (c) =>
              c.scope === "item" &&
              c.itemId === item.id &&
              c.field === field &&
              c.confirmedValue === "",
          ),
        ).toBe(true);
    expect(
      receipt.reviewChecks.filter((c) => c.field === "discount"),
    ).toHaveLength(2);
    expect(calculateReceipt(receipt).total).toBe(1020000n);
  });

  it("keeps printed values when the multiplication disagrees", () => {
    const { receipt } = parseReceiptWithSources(
      "Shop\n2X @4.00\nBread 9.00\nTOTAL 9.00",
      { currency: "GBP" },
    );
    expect(receipt.items[0]).toMatchObject({
      quantity: "2",
      unitPrice: "4.00",
      lineTotal: "9.00",
    });
    expect(calculateReceipt(receipt).issues.length).toBeGreaterThan(0);
  });

  it("does not make a bare zero an item or use a pack description as terms", () => {
    const { receipt } = parseReceiptWithSources(
      "Shop\nBag 0\nPACK 6X @4.00\nBread 8.00\nTOTAL 8.00",
      { currency: "GBP" },
    );
    expect(receipt.items.some((i) => i.description === "Bag")).toBe(false);
    expect(receipt.items.find((i) => i.description === "Bread")).toMatchObject({
      quantity: "",
      unitPrice: "",
    });
  });

  it("leaves receipt discounts and nonadjacent discounts unassigned", () => {
    const { receipt } = parseReceiptWithSources(
      "Shop\nBread 8.00\nDISC TOTAL -10.00%\nAMOUNT -0.80\nFruit 3.00\nOther note\nDISC ITEM -10.00%\nAMOUNT -0.30\nTOTAL 9.90",
      { currency: "GBP" },
    );
    expect(receipt.items.every((i) => i.discount === "0")).toBe(true);
    expect(calculateReceipt(receipt).issues.length).toBeGreaterThan(0);
  });

  it("does not take terms from another photo or an invalid zero count", () => {
    for (const text of [
      "2X @4.00\n--- GATHER PHOTO BOUNDARY ---\nBread 8.00",
      "0X @4.00\nBread 8.00",
    ]) {
      const { receipt } = parseReceiptWithSources(
        "Shop\n" + text + "\nTOTAL 8.00",
        { currency: "GBP" },
      );
      expect(
        receipt.items.find((i) => i.description === "Bread"),
      ).toMatchObject({ quantity: "", unitPrice: "" });
    }
  });
});
