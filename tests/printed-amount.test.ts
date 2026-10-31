import { describe, expect, it } from "vitest";
import { printedAmount } from "../src/lib/printed-amount";
import { currencies } from "../src/lib/model";
import { money, allocate, formatMoney } from "../src/lib/money";
import { aiReceiptSchema } from "../src/lib/extraction-schema.mjs";
import { aiCostcoDraft } from "./fixtures/ai-receipt";
import { parseReceiptText } from "../src/lib/parser";
import { calculateReceipt } from "../src/lib/engine";

describe("printed monetary evidence", () => {
  it("distinguishes rupiah thousands from three-decimal currencies", () => {
    expect(printedAmount("36.000", { currency: "IDR" })).toBe("36000");
    expect(printedAmount("1,591,600", { currency: "IDR" })).toBe("1591600");
    expect(printedAmount("1.591.600", { currency: "IDR" })).toBe("1591600");
    expect(printedAmount("1.234", { currency: "KWD" })).toBe("1.234");
    expect(printedAmount("1,234", { currency: "BHD" })).toBe("1.234");
    expect(printedAmount("1,234", { currency: "TWD" })).toBe("1234");
  });
  it("keeps a single three-place separator unresolved without enough context", () => {
    expect(() => printedAmount("36.000")).toThrow(/Ambiguous/);
    expect(() => printedAmount("1.234", { currency: "GBP" })).toThrow(
      /Ambiguous/,
    );
    expect(() => printedAmount("1.234", { currency: "TWD" })).toThrow(
      /Ambiguous/,
    );
    expect(printedAmount("0.000")).toBe("0");
  });
  it("validates grouping instead of deleting punctuation indiscriminately", () => {
    expect(printedAmount("1.234,56", { currency: "EUR" })).toBe("1234.56");
    expect(printedAmount("1,234.56", { currency: "GBP" })).toBe("1234.56");
    expect(printedAmount("1\u202f234,56", { currency: "EUR" })).toBe("1234.56");
    for (const value of [
      "12,34.56",
      "1.23.456",
      "1 2",
      "1..00",
      "-1.00-",
      "1.0000",
      "1e5",
    ])
      expect(() => printedAmount(value)).toThrow();
  });
  it("preserves signed evidence and enforces exact currency precision", () => {
    expect(printedAmount("−7.00", { currency: "GBP" })).toBe("-7.00");
    expect(printedAmount("7.00-", { currency: "GBP" })).toBe("-7.00");
    expect(printedAmount("1234.00", { currency: "JPY" })).toBe("1234");
    expect(() => printedAmount("1234.01", { currency: "JPY" })).toThrow(
      /precision/,
    );
    expect(() => printedAmount("9".repeat(81))).toThrow(/long/);
  });
  it("keeps the AI schema and exact money engine consistent for every offered currency", () => {
    for (const currency of Object.keys(currencies))
      expect(
        aiReceiptSchema.safeParse({ ...aiCostcoDraft(), currency }).success,
      ).toBe(true);
    for (const currency of ["IDR", "TWD"] as const) {
      const total = money("36000.01", currency);
      expect(total).toBe(3600001n);
      const shares = allocate(total, [1n, 1n, 1n]);
      expect(shares.reduce((sum, value) => sum + value, 0n)).toBe(total);
    }
  });
  it("parses printed rupiah quantities and totals without crashing or dividing prices by 1000", () => {
    const receipt = parseReceiptText(
      "SHOP\nTea 2x 10.000 20.000\nTOTAL Rp 20.000",
    );
    expect(receipt.currency).toBe("IDR");
    expect(receipt.items).toHaveLength(1);
    expect(receipt.items[0]).toMatchObject({
      quantity: "2",
      unitPrice: "10000",
      lineTotal: "20000",
    });
    const result = calculateReceipt(receipt);
    expect(result.issues).toEqual([]);
    expect(result.total).toBe(2000000n);
    expect(result.discrepancy).toBe(0n);
  });
  it("labels the new currencies in payment summaries", () => {
    expect(formatMoney(3600001n, "IDR")).toBe("Rp 36,000.01");
    expect(formatMoney(3600001n, "TWD")).toBe("NT$36,000.01");
  });
  it("retains an editable draft and blocks confirmation for ambiguous prices", () => {
    const receipt = parseReceiptText(
      "SHOP\nMilk 1x 1.234 1.234\nTOTAL GBP 1.234",
    );
    expect(receipt.items[0].lineTotal).toBe("");
    expect(receipt.printedTotal).toBe("");
    expect(receipt.warnings.join(" ")).toMatch(/Ambiguous/);
    expect(calculateReceipt(receipt).issues.length).toBeGreaterThan(0);
  });
  it("does not apply UK Costco rates to a Taiwan receipt or invent a missing VAT legend", () => {
    const tw = parseReceiptText(
      "COSTCO TAIWAN\nTWD\nTEA\n12345 1x 2.00 2.00 A\nTOTAL TWD 2.00\nPrices include tax",
    );
    expect(tw.currency).toBe("TWD");
    expect(tw.taxCodes.some((code) => code.rate === "20")).toBe(false);
    const uk = parseReceiptText(
      "COSTCO UK\nTEA\n12345 1x 2.00 2.00 A\nTOTAL GBP 2.40",
    );
    expect(uk.taxCodes).toContainEqual({ code: "A", rate: "" });
    expect(calculateReceipt(uk).issues.length).toBeGreaterThan(0);
  });
});
