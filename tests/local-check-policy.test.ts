import { describe, expect, it } from "vitest";
import { localCheckDecision } from "../src/lib/local-check-policy";
import { parseReceiptWithSources } from "../src/lib/parser";
import {
  assembleRecognition,
  type Recognition,
} from "../src/lib/receipt-layout";
import { comparedRecognition } from "./fixtures/compared-receipt";
import { calculateReceipt } from "../src/lib/engine";

const clear = [
  "MARKET",
  "Tea 1x 5.50 5.50",
  "Prices include tax",
  "TOTAL GBP 5.50",
];
function reading(texts = clear, context?: { currency: "GBP" | "IDR" }) {
  const recognition = comparedRecognition([{ photo: 1, part: 1 }], texts)
    .recognition as Recognition;
  const assembled = assembleRecognition(recognition);
  const { receipt, sources } = parseReceiptWithSources(assembled.text, context);
  return { receipt, sources, recognition, sourceLines: assembled.sourceLines };
}
const decide = (source: ReturnType<typeof reading>) =>
  localCheckDecision(
    source.receipt,
    source.sources,
    source.sourceLines,
    source.recognition,
  );

describe("automatic local comparison uses only first-reading evidence", () => {
  it("skips the second model for complete, source-supported clear text without editing or verifying it", () => {
    const source = reading();
    const before = JSON.stringify(source);
    expect(calculateReceipt(source.receipt).issues).toEqual([]);
    expect(decide(source)).toEqual({ needed: false, reasons: [] });
    expect(JSON.stringify(source)).toBe(before);
    expect(source.receipt.reviewChecks).toEqual([]);
  });
  it("a balanced amount still requests comparison when item tax inclusion lacks source support", () => {
    const source = reading(clear.filter((line) => !line.startsWith("Prices")));
    expect(calculateReceipt(source.receipt).discrepancy).toBe(0n);
    expect(decide(source).reasons).toContain("parser-warning");
  });
  it.each([
    ["Tea 5.50", "TOTAL GBP 5.50"],
    ["Tea 1x 5.50 6.50", "TOTAL GBP 6.50"],
    ["Tea 1x 5.50 5.50", "TOTAL 5.50"],
  ])(
    "requests comparison for missing quantity, inconsistent prices or unresolved currency",
    (...rows) => {
      const source = reading(["MARKET", ...rows, "Prices include tax"]);
      expect(decide(source).reasons).toContain("validation");
    },
  );
  it("requests a check for multiple receipt sections even when the first calculation is complete", () => {
    const source = reading();
    source.recognition.panels.push({
      ...source.recognition.panels[0],
      part: 2,
    });
    expect(decide(source).reasons).toContain("multiple-sections");
  });
  it("does not let a high average line score hide one uncertain price word", () => {
    const source = reading();
    const panel = source.recognition.panels[0];
    panel.words = panel.words.map((word) => ({ ...word }));
    panel.words[1].confidence = 0.2;
    expect(source.sourceLines[1]?.confidence).toBe(0.99);
    expect(decide(source).reasons).toContain("uncertain-source");
  });
  it("ignores an unrelated weak header when the purchase and financial sources are clear", () => {
    const source = reading();
    const panel = source.recognition.panels[0];
    panel.words = panel.words.map((word) => ({ ...word }));
    panel.words[0].confidence = 0.2;
    expect(decide(source).needed).toBe(false);
  });
  it("requests a check if a purchase has no source mapping", () => {
    const source = reading();
    delete source.sources[source.receipt.items[0].id];
    expect(decide(source).reasons).toContain("uncertain-source");
  });
  it("conflicting totals remain uncertain even when the last total balances", () => {
    const source = reading([
      ...clear.slice(0, 3),
      "TOTAL GBP 6.50",
      "TOTAL GBP 5.50",
    ]);
    expect(calculateReceipt(source.receipt).discrepancy).toBe(0n);
    expect(decide(source).reasons).toContain("parser-warning");
  });
  it("an explicit user currency is context rather than a reason by itself to run another model", () => {
    const source = reading(
      ["MARKET", "Tea 1x 24.000 24.000", "Prices include tax", "TOTAL 24.000"],
      { currency: "IDR" },
    );
    expect(source.receipt.currencyUnresolved).toBe(false);
    expect(source.receipt.items[0].lineTotal).toBe("24000");
    expect(decide(source).needed).toBe(false);
  });
});
