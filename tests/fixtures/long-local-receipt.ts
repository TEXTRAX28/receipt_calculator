import type { Recognition } from "../../src/lib/receipt-layout";
import type { VisionBatch } from "../../src/lib/local-vision-batches";

// Synthetic, literal source geometry and predetermined independent responses; not recognition evidence.
export const longRows = [
  ["Little Market", "Currency GBP", "Milk 1x 2.00 2.00"],
  ["Bread 1x 1.50 1.50"],
  ["Rice 1x 3.00 3.00", "Chicken 1x 4.00 4.00", "Chicken 1x 4.00 4.00"],
  ["Coffee 1x 5.00 5.00", "TOTAL GBP 19.50", "PRICES INCLUDE TAX"],
];
export const longPanels = longRows.map((_, index) => ({
  photo: index + 1,
  part: 1,
  data: "/9j/4AAAMTIzNA==",
}));
export function longRecognition(): Recognition {
  return {
    engine: "paddle-ppocrv6-medium-onnx",
    panels: longRows.map((texts, index) => {
      const lines = texts.map((text, row) => ({
        text,
        confidence: 0.99,
        box: [0.1, 0.1 + row * 0.2, 0.9, 0.18 + row * 0.2] as [
          number,
          number,
          number,
          number,
        ],
      }));
      return {
        photo: index + 1,
        part: 1,
        width: 700,
        height: 700,
        words: structuredClone(lines),
        lines,
      };
    }),
  };
}
export function longDraft(indices: number[]): VisionBatch["receipt"] {
  const choices = [
    [{ description: "Milk", price: "2.00" }],
    [{ description: "Bread", price: "1.50" }],
    [
      { description: "Rice", price: "3.00" },
      { description: "Chicken", price: "4.00" },
      { description: "Chicken", price: "4.00" },
    ],
    [{ description: "Coffee", price: "5.00" }],
  ];
  return {
    merchant: indices.includes(0) ? "Little Market" : "",
    date: "",
    currency: indices.includes(0) || indices.includes(3) ? "GBP" : "",
    subtotal: "",
    printedTotal: indices.includes(3) ? "19.50" : "",
    printedTax: "",
    pricesIncludeTax: indices.includes(3) ? true : null,
    printedItemCount: null,
    taxCodes: [],
    adjustments: [],
    warnings: [],
    items: indices.flatMap((index) =>
      choices[index].map(({ description, price }) => ({
        description,
        quantity: "1",
        unitPrice: price,
        lineTotal: price,
        discount: "0",
        taxCode: "",
        note: "",
        sourcePhotos: [index + 1],
      })),
    ),
  };
}
export function longBatches(): VisionBatch[] {
  return [
    [0, 1, 2],
    [2, 3],
  ].map((indices) => ({ indices, receipt: longDraft(indices) }));
}
