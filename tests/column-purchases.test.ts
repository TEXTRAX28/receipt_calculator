import { describe, expect, it } from "vitest";
import { parseReceiptWithSources, PHOTO_SEPARATOR } from "../src/lib/parser";
import { verifyIndependentReadings } from "../src/lib/verify-readings";
import { calculateReceipt } from "../src/lib/engine";
import type { Recognition } from "../src/lib/receipt-layout";

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

function recognition(): Recognition {
  const texts = [
    "Market",
    "Currency IDR",
    "Tea 1 4,000 4,000",
    "Coffee 1 2,000 2,000",
    "TOTAL 6,000",
  ];
  const lines = texts.map((text, index) => ({
    text,
    confidence: 0.99,
    box: [0.1, (index + 0.1) / 6, 0.9, (index + 0.7) / 6] as [
      number,
      number,
      number,
      number,
    ],
  }));
  const words = lines.flatMap((line) => {
    let offset = 0;
    return line.text.split(" ").map((text) => {
      const x = 0.1 + (0.8 * offset) / line.text.length;
      offset += text.length + 1;
      return {
        text,
        confidence: 0.99,
        box: [
          x,
          line.box[1],
          x + (0.8 * text.length) / line.text.length,
          line.box[3],
        ] as [number, number, number, number],
      };
    });
  });
  return {
    engine: "paddle-ppocrv6-medium-onnx",
    panels: [{ photo: 1, part: 1, width: 1000, height: 1200, lines, words }],
  };
}
const draft = () => ({
  merchant: "Market",
  date: "",
  currency: "IDR",
  subtotal: "",
  printedTotal: "6000",
  printedTax: "",
  pricesIncludeTax: true,
  printedItemCount: null,
  taxCodes: [],
  adjustments: [],
  warnings: [],
  items: [
    {
      description: "Tea",
      quantity: "1",
      unitPrice: "4.000",
      lineTotal: "4.000",
      discount: "0",
      taxCode: "",
      note: "",
      sourcePhotos: [1],
    },
    {
      description: "Coffee",
      quantity: "1",
      unitPrice: "2.000",
      lineTotal: "2.000",
      discount: "0",
      taxCode: "",
      note: "",
      sourcePhotos: [1],
    },
  ],
});

describe("independent source tokens in proposed column prices", () => {
  it.each(["invalid", "empty"])(
    "proposes %s amounts only with actual source spans and keeps role checks pending",
    (kind) => {
      const raw = draft();
      if (kind === "empty")
        raw.items.forEach((item) => {
          item.unitPrice = "";
          item.lineTotal = "";
        });
      const source = recognition(),
        before = structuredClone({ raw, source });
      const result = verifyIndependentReadings(raw, source);
      expect({ raw, source }).toEqual(before);
      expect(
        result.receipt.items.map((item) => [item.unitPrice, item.lineTotal]),
      ).toEqual([
        ["4000", "4000"],
        ["2000", "2000"],
      ]);
      expect(result.priceRecoveries).toHaveLength(2);
      expect(result.unitRecoveries).toHaveLength(2);
      expect(result.receipt.reviewChecks).toContainEqual(
        expect.objectContaining({
          scope: "item",
          field: "quantity",
          reason: "source",
          confirmedValue: "",
        }),
      );
      expect(calculateReceipt(result.receipt).issues.length).toBeGreaterThan(0);
    },
  );

  it.each(["unitPrice", "lineTotal"] as const)(
    "cannot borrow another equal price token's confidence for %s",
    (field) => {
      const source = recognition();
      const tea = source.panels[0].words.filter(
        (word) => word.text === "4,000",
      );
      tea[field === "unitPrice" ? 0 : 1].confidence = 0.97;
      const result = verifyIndependentReadings(draft(), source);
      expect(result.receipt.items[0][field]).toBe("4.000");
      expect(
        result.receipt.items[0][
          field === "unitPrice" ? "lineTotal" : "unitPrice"
        ],
      ).toBe("4000");
    },
  );

  it("keeps valid conflicting amounts and mismatched quantities unresolved", () => {
    const raw = draft();
    raw.items[0].lineTotal = "4";
    raw.items[0].quantity = "2";
    const result = verifyIndependentReadings(raw, recognition());
    expect(result.receipt.items[0].lineTotal).toBe("4");
    expect(result.receipt.items[0].unitPrice).toBe("4.000");
  });
});
