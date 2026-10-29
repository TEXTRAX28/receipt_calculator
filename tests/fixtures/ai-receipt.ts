import { costcoDemo } from "../../src/lib/demo";

// A schema fixture for protocol/UI tests. This is not a real model response.
export function aiCostcoDraft() {
  const original = costcoDemo();
  return {
    merchant: original.merchant,
    date: original.date,
    currency: original.currency,
    subtotal: original.subtotal,
    printedTotal: original.printedTotal,
    printedTax: original.printedTax,
    pricesIncludeTax: false,
    printedItemCount: 18,
    taxCodes: original.taxCodes,
    items: original.items.map(
      (
        { description, quantity, unitPrice, lineTotal, discount, taxCode },
        index,
      ) => ({
        description,
        quantity,
        unitPrice,
        lineTotal,
        discount,
        taxCode,
        note: "Check photo evidence.",
        sourcePhotos: index < 12 ? [1] : [2],
      }),
    ),
    adjustments: [],
    warnings: [
      "The overlapping last purchases were matched using surrounding rows. Check them against both photos.",
    ],
  };
}
