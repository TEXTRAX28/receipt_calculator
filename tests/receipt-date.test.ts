import { describe, expect, it } from "vitest";
import { normalizeReceiptDate } from "../src/lib/receipt-date";
import { receiptFromAi } from "../src/lib/gemini";
import { calculateReceipt } from "../src/lib/engine";
import { aiCostcoDraft } from "./fixtures/ai-receipt";
import { parseReceiptWithSources } from "../src/lib/parser";

describe("printed dates retain their evidence without guessing locale", () => {
  it.each([
    ["31/10/2026", "2026-10-31"],
    ["10/31/2026", "2026-10-31"],
    ["26.10.2026", "2026-10-26"],
    ["2/2/2026", "2026-02-02"],
    [" 2026-10-31 ", "2026-10-31"],
    ["", ""],
  ])("canonicalizes the unambiguous date %s", (input, expected) => {
    expect(normalizeReceiptDate(input)).toBe(expected);
  });
  it.each([
    "03/04/2026",
    "2026-02-30",
    "31/02/2026",
    "13/14/2026",
    "31/00/2026",
    "31/10.2026",
    "not a date",
  ])("keeps %s unresolved and blocked by independent validation", (date) => {
    const receipt = receiptFromAi({ ...aiCostcoDraft(), date }, "Local vision");
    expect(receipt.date).toBe(date);
    expect(calculateReceipt(receipt).issues).toContainEqual(
      expect.objectContaining({ path: "date" }),
    );
  });
  it("accepts the native printed-date format without changing any financial field", () => {
    const draft = aiCostcoDraft();
    const expected = calculateReceipt(receiptFromAi(draft));
    const receipt = receiptFromAi(
      { ...draft, date: "31/10/2026" },
      "Local vision",
    );
    expect(receipt.date).toBe("2026-10-31");
    const result = calculateReceipt(receipt);
    expect(result.issues).toEqual([]);
    expect(result.total).toBe(expected.total);
    expect(result.items.map((item) => item.total)).toEqual(
      expected.items.map((item) => item.total),
    );
  });
});

describe("OCR dates use the same calendar evidence as structured readings", () => {
  const text = (date: string) =>
    `Date Market\nUSD\nDate: ${date}\nCoffee 1x 3.00 3.00\nTOTAL USD 3.00`;

  it.each([
    ["07/21/2026", "2026-07-21"],
    ["26/10/2026", "2026-10-26"],
    ["2.2.2026", "2026-02-02"],
    ["2026-07-21", "2026-07-21"],
  ])(
    "reads the uniquely interpretable %s and retains its printed source",
    (literal, expected) => {
      const parsed = parseReceiptWithSources(text(literal));
      expect(parsed.receipt.date).toBe(expected);
      expect(parsed.fieldSources.date).toEqual([2]);
      expect(parsed.receipt.items[0]).toMatchObject({
        description: "Coffee",
        quantity: "1",
        unitPrice: "3.00",
        lineTotal: "3.00",
      });
      const calculation = calculateReceipt(parsed.receipt);
      expect(calculation.issues.some((issue) => issue.path === "date")).toBe(
        false,
      );
      expect(calculation.total).toBe(300n);
    },
  );

  it.each([
    "03/04/2026",
    "31/02/2026",
    "13/14/2026",
    "31/10.2026",
    "2026-02-30",
  ])(
    "keeps ambiguous or invalid %s unresolved despite the printed USD currency",
    (literal) => {
      const parsed = parseReceiptWithSources(text(literal));
      expect(parsed.receipt.date).toBe(literal);
      expect(parsed.fieldSources.date).toEqual([2]);
      expect(calculateReceipt(parsed.receipt).issues).toContainEqual(
        expect.objectContaining({ path: "date" }),
      );
      expect(parsed.receipt.items[0].lineTotal).toBe("3.00");
    },
  );

  it("retains repeated observations of the same printed date without inventing a second event", () => {
    const parsed = parseReceiptWithSources(
      text("07/21/2026") + "\n07/21/2026 15:05",
    );
    expect(parsed.receipt.date).toBe("2026-07-21");
    expect(parsed.fieldSources.date).toEqual([2, 5]);
    expect(parsed.receipt.items).toHaveLength(1);
  });
});
