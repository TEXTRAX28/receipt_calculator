// Synthetic printed rows for protocol/UI tests, never model-accuracy evidence.
export const comparedRows = [
  "COSTCO UK",
  "CHICKEN SKEWERS",
  "10001 1x 10.00 10.00 Z",
  "IRC CHICKEN",
  "20002 1x 2.00 2.00-Z",
  "KS ROTISS CHICKEN",
  "10533 1x 3.99 3.99 A",
  "KS ROTISS CHICKEN",
  "10533 1x 3.99 3.99 A",
  "TOTAL(INCL VAT) £17.58",
  "VAT Code Excl Vat VAT",
  "A 20.00% 7.98 1.60",
  "Z 0.00% 8.00 0.00",
  "TOTAL(EXCL VAT) 15.98",
  "VAT Amount 1.60",
  "Savings: £2.00 1 Coupon(s)",
  "you have earned £0.32 towards your",
  "annual executive reward.",
];
export function comparedDraft() {
  const item = (description: string, price: string, taxCode: string) => ({
    description,
    quantity: "1",
    unitPrice: price,
    lineTotal: price,
    taxCode,
    discount: "0",
    note: "",
    sourcePhotos: [1],
  });
  return {
    merchant: "Costco",
    date: "",
    currency: "GBP",
    subtotal: "15.98",
    printedTotal: "17.58",
    printedTax: "1.60",
    pricesIncludeTax: false,
    printedItemCount: 3,
    taxCodes: [
      { code: "A", rate: "20" },
      { code: "Z", rate: "0" },
    ],
    items: [
      item("CHICKEN SKEWERS", "10.00", "Z"),
      item("IRC CHICKEN", "2.00", "Z"),
      item("KS ROTISS CHICKEN", "3.99", "A"),
      item("KS ROTISS CHICKEN", "3.99", "A"),
    ],
    adjustments: [
      { label: "Savings", kind: "discount", amount: "2.00" },
      { label: "Coupon(s)", kind: "discount", amount: "1" },
      { label: "Executive Reward", kind: "discount", amount: "0.32" },
    ],
    warnings: [],
  };
}
export function comparedRecognition(
  panels: { photo: number; part: number }[],
  texts = comparedRows,
) {
  const lines = texts.map((text, index) => ({
    text,
    confidence: 0.99,
    box: [
      0.08,
      (index + 0.1) / (texts.length + 1),
      0.92,
      (index + 0.8) / (texts.length + 1),
    ],
  }));
  return {
    recognition: {
      engine: "paddle-ppocrv6-medium-onnx",
      panels: panels.map((panel) => ({
        ...panel,
        width: 700,
        height: 1400,
        words: lines,
        lines,
      })),
    },
  };
}
