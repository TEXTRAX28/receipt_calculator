import { describe, expect, it } from "vitest";
import {
  adaptRawPrinted,
  rawPrintedSchema,
} from "../receipt_training/scripts/raw_printed_profile.mjs";
import { printedAmount } from "../src/lib/printed-amount";

const draft = () => ({
  amountEncoding: "printed-v1",
  merchant: "SYNTHETIC SHOP",
  date: "",
  currencyPrinted: "",
  subtotalPrinted: "27.000",
  totalPrinted: "29.700",
  taxPrinted: "2.700",
  pricesIncludeTax: false,
  printedItemCount: 1,
  taxCodes: [],
  items: [
    {
      description: "Tea",
      quantityPrinted: "1x",
      unitPricePrinted: "27.000",
      lineTotalPrinted: "27.000",
      discountPrinted: "",
      taxCode: "",
      sourcePhotos: [1],
    },
  ],
  adjustments: [],
  payments: [
    { label: "Cash", kind: "payment", amountPrinted: "50.000" },
    { label: "Change", kind: "change", amountPrinted: "20.300" },
  ],
  warnings: [],
});

describe("research-only printed-value model contract", () => {
  it("copies raw evidence and normalizes money outside the model with explicit context", () => {
    const raw = draft();
    const result = adaptRawPrinted(raw, { currency: "IDR" }, printedAmount);
    expect(result.data.items[0]).toMatchObject({
      quantity: "1",
      unitPrice: "27000",
      lineTotal: "27000",
      discount: "",
    });
    expect(result.data).toMatchObject({
      printedTotal: "29700",
      printedTax: "2700",
      currency: "IDR",
      adjustments: [],
    });
    expect(result.rawEvidence).toEqual(raw);
    expect(raw.items[0].lineTotalPrinted).toBe("27.000");
    expect(result.currencyBasis).toBe("user-supplied context");
    expect(result.trusted).toBe(false);
  });
  it("keeps ambiguous money and quantities empty rather than inventing defaults", () => {
    const raw = draft();
    raw.items[0].quantityPrinted = "1.000";
    const result = adaptRawPrinted(raw, undefined, printedAmount);
    expect(result.data.currency).toBe("");
    expect(result.data.items[0].lineTotal).toBe("");
    expect(result.data.items[0].quantity).toBe("");
    expect(result.issues.length).toBeGreaterThan(0);
  });
  it("cannot reinterpret the existing canonical profile or a number-valued raw field", () => {
    expect(() =>
      adaptRawPrinted(
        { items: [{ lineTotal: "7.000" }] },
        { currency: "IDR" },
        printedAmount,
      ),
    ).toThrow();
    const raw = draft();
    expect(
      rawPrintedSchema.safeParse({ ...raw, totalPrinted: 29700 }).success,
    ).toBe(false);
    expect(
      rawPrintedSchema.safeParse({ ...raw, amountEncoding: "canonical" })
        .success,
    ).toBe(false);
  });
  it("retains signed credits and applies only the defined discount-magnitude convention", () => {
    const raw = draft();
    raw.items[0].lineTotalPrinted = "-27.000";
    raw.items[0].discountPrinted = "2.000-";
    raw.totalPrinted = "-27.000";
    const result = adaptRawPrinted(raw, { currency: "IDR" }, printedAmount);
    expect(result.data.items[0].lineTotal).toBe("-27000");
    expect(result.data.items[0].discount).toBe("2000");
    expect(result.data.printedTotal).toBe("-27000");
  });
  it("does not promote payment/change rows to receipt charges", () => {
    const raw = draft();
    const result = adaptRawPrinted(raw, { currency: "IDR" }, printedAmount);
    expect(result.excludedPayments).toEqual(raw.payments);
    expect(result.data.adjustments).toEqual([]);
  });
  it("does not convert a three-decimal currency into thousands", () => {
    const raw = {
      ...draft(),
      currencyPrinted: "KWD",
      subtotalPrinted: "1.234",
      taxPrinted: "",
      totalPrinted: "1.234",
    };
    raw.items = [
      { ...raw.items[0], unitPricePrinted: "1.234", lineTotalPrinted: "1.234" },
    ];
    const result = adaptRawPrinted(raw, undefined, printedAmount);
    expect(result.data.printedTotal).toBe("1.234");
  });
  it("retains conflicting currency as an issue without using context to repair money", () => {
    const result = adaptRawPrinted(
      { ...draft(), currencyPrinted: "GBP" },
      { currency: "IDR" },
      printedAmount,
    );
    expect(result.data.currency).toBe("GBP");
    expect(result.data.items[0].lineTotal).toBe("");
    expect(result.issues.some((x) => x.field === "currency")).toBe(true);
  });
});
