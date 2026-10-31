import { describe, expect, it } from "vitest";
import { normalizeReceiptDate } from "../src/lib/receipt-date";
import { receiptFromAi } from "../src/lib/gemini";
import { calculateReceipt } from "../src/lib/engine";
import { aiCostcoDraft } from "./fixtures/ai-receipt";

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
