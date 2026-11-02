import type { Recognition } from "../../src/lib/receipt-layout";

export function reducedPriceFixture() {
  const texts = [
    "Market",
    "Currency GBP",
    "4 TEACAKES",
    "REDUCED PRICE 0.50",
    "TOTAL GBP 0.50",
    "PRICES INCLUDE TAX",
  ];
  const lines = texts.map((text, index) => ({
    text,
    confidence: 0.99,
    box: [0.1, index / 10, 0.9, index / 10 + 0.06] as [
      number,
      number,
      number,
      number,
    ],
  }));
  const words = lines.flatMap((line) => {
    const pieces = line.text.split(" ");
    return pieces.map((text, index) => ({
      text,
      confidence: 0.99,
      box: [
        0.1 + (0.8 * index) / pieces.length,
        line.box[1],
        0.1 + (0.8 * (index + 0.9)) / pieces.length,
        line.box[3],
      ] as [number, number, number, number],
    }));
  });
  const recognition: Recognition = {
    engine: "paddle-ppocrv6-medium-onnx",
    panels: [{ photo: 1, part: 1, width: 1000, height: 1000, lines, words }],
  };
  const raw = {
    merchant: "Market",
    date: "",
    currency: "GBP",
    subtotal: "",
    printedTotal: "0.50",
    printedTax: "",
    pricesIncludeTax: true,
    printedItemCount: null,
    taxCodes: [],
    adjustments: [],
    warnings: [],
    items: [
      {
        description: "4 TEACAKES",
        quantity: "1",
        unitPrice: "",
        lineTotal: "",
        discount: "0.50",
        taxCode: "",
        note: "",
        sourcePhotos: [1],
      },
    ],
  };
  return { raw, recognition };
}
