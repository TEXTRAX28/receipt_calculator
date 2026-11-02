import { describe, expect, it } from "vitest";
import { verifyIndependentReadings } from "../src/lib/verify-readings";
import { calculateReceipt } from "../src/lib/engine";
import type { Recognition } from "../src/lib/receipt-layout";

function source(
  currency = "IDR",
  quantity = "2",
  unit = "20,000",
  total = "40,000",
): Recognition {
  const texts = [
    `Currency ${currency}`,
    "Tea",
    `${quantity} @${unit} ${total}`,
    `TOTAL ${currency} ${total}`,
  ];
  const lines = texts.map((text, index) => ({
    text,
    confidence: 0.99,
    box: [0.1, 0.05 + index * 0.2, 0.9, 0.15 + index * 0.2] as [
      number,
      number,
      number,
      number,
    ],
  }));
  return {
    engine: "paddle-ppocrv6-medium-onnx",
    panels: [
      {
        photo: 1,
        part: 1,
        width: 1000,
        height: 1200,
        lines,
        words: [
          lines[0],
          lines[1],
          {
            text: quantity + " @",
            confidence: 0.999,
            box: [0.1, 0.45, 0.2, 0.55],
          },
          { text: unit, confidence: 0.995, box: [0.3, 0.45, 0.5, 0.55] },
          { text: total, confidence: 0.999, box: [0.6, 0.45, 0.9, 0.55] },
          lines[3],
        ],
      },
    ],
  };
}
function draft(unitPrice = "20.000") {
  return {
    merchant: "",
    date: "",
    currency: "IDR",
    subtotal: "",
    printedTotal: "40000",
    printedTax: "",
    pricesIncludeTax: true,
    printedItemCount: null,
    taxCodes: [],
    adjustments: [],
    warnings: [],
    items: [
      {
        description: "Tea",
        quantity: "2",
        unitPrice,
        lineTotal: "40000",
        discount: "0",
        taxCode: "",
        note: "",
        sourcePhotos: [1],
      },
    ],
  };
}
describe("literal unit-price recovery", () => {
  it("recovers a uniquely aligned unit despite a neighboring row's word, with mandatory review", () => {
    const reading = source();
    reading.panels[0].words.push({
      text: "13,000",
      confidence: 0.999,
      box: [0.61, 0.5, 0.89, 0.6],
    });
    reading.panels[0].lines.splice(3, 0, {
      text: "13,000",
      confidence: 0.99,
      box: [0.61, 0.54, 0.89, 0.65],
    });
    const result = verifyIndependentReadings(draft(), reading);
    expect(result.receipt.items[0].unitPrice).toBe("20000");
    expect(result.unitRecoveries).toHaveLength(1);
    expect(result.unitRecoveries[0].evidence.word).toBe(
      reading.panels[0].words[3],
    );
    expect(result.receipt.reviewChecks).toContainEqual(
      expect.objectContaining({
        field: "unitPrice",
        reason: "recovered",
        confirmedValue: "",
      }),
    );
  });
  it("withholds an ambiguous adjacent-row unit without using its higher confidence", () => {
    const reading = source();
    reading.panels[0].words.push({
      text: "20,000",
      confidence: 1,
      box: [0.31, 0.5, 0.49, 0.6],
    });
    const result = verifyIndependentReadings(draft(), reading);
    expect(result.receipt.items[0].unitPrice).toBe("20.000");
    expect(result.unitRecoveries).toHaveLength(0);
  });
  it("copies the actual unit token without changing quantity or line total and keeps its original value pending", () => {
    const raw = draft(),
      original = structuredClone(raw);
    const result = verifyIndependentReadings(raw, source());
    expect(result.receipt.items[0]).toMatchObject({
      quantity: "2",
      unitPrice: "20000",
      lineTotal: "40000",
    });
    expect(result.unitRecoveries).toHaveLength(1);
    expect(result.unitRecoveries[0].evidence.word.text).toBe("20,000");
    expect(result.receipt.reviewChecks).toContainEqual(
      expect.objectContaining({
        field: "unitPrice",
        reason: "recovered",
        other: "20.000",
        confirmedValue: "",
      }),
    );
    expect(result.receipt.reviewChecks).toContainEqual(
      expect.objectContaining({
        field: "quantity",
        reason: "source",
        confirmedValue: "",
      }),
    );
    expect(result.receipt.reviewChecks).toContainEqual(
      expect.objectContaining({
        field: "description",
        reason: "source",
        confirmedValue: "",
      }),
    );
    expect(raw).toEqual(original);
    expect(calculateReceipt(result.receipt).issues.length).toBeGreaterThan(0);
  });
  it("does not count a copied unit price as independent agreement", () => {
    expect(verifyIndependentReadings(draft(), source()).agreements).toBe(
      verifyIndependentReadings(draft("20000"), source()).agreements - 1,
    );
  });
  it.each(["", "19999", "20000", "-20.000"])(
    "preserves a missing, valid or sign-conflicting unit %s",
    (value) => {
      const result = verifyIndependentReadings(draft(value), source());
      expect(result.receipt.items[0].unitPrice).toBe(value);
      expect(result.unitRecoveries).toEqual([]);
    },
  );
  it("requires the unit word's own confidence, including when quantity or row total has the same text", () => {
    const reading = source("GBP", "2.50", "2.50", "6.25");
    reading.panels[0].words[3].confidence = 0.97;
    const raw = { ...draft("2.500"), currency: "GBP", printedTotal: "6.25" };
    raw.items[0].quantity = "2.50";
    raw.items[0].lineTotal = "6.25";
    expect(verifyIndependentReadings(raw, reading).unitRecoveries).toEqual([]);
    reading.panels[0].words[3].confidence = 0.99;
    const result = verifyIndependentReadings(raw, reading);
    expect(result.unitRecoveries).toHaveLength(1);
    expect(result.unitRecoveries[0].evidence.word).toEqual(
      reading.panels[0].words[3],
    );
  });
  it("requires exact word/line alignment and matching purchased quantity", () => {
    const broken = source();
    broken.panels[0].words[3].text = "Uncertain 20,000";
    expect(verifyIndependentReadings(draft(), broken).unitRecoveries).toEqual(
      [],
    );
    const mismatch = draft();
    mismatch.items[0].quantity = "3";
    expect(
      verifyIndependentReadings(mismatch, source()).unitRecoveries,
    ).toEqual([]);
  });
  it("can use the printed unit column in a complete Costco SKU row", () => {
    const reading = source("GBP", "2", "20.00", "40.00");
    reading.panels[0].lines[2].text = "123456 2x 20.00 40.00 A";
    reading.panels[0].words.splice(2, 3, {
      text: "123456 2x 20.00 40.00 A",
      confidence: 0.99,
      box: [0.1, 0.45, 0.9, 0.55],
    });
    const raw = { ...draft("20.000"), currency: "GBP", printedTotal: "40.00" };
    raw.items[0].lineTotal = "40.00";
    raw.items[0].taxCode = "A";
    const result = verifyIndependentReadings(raw, reading);
    expect(result.receipt.items[0].unitPrice).toBe("20.00");
    expect(result.unitRecoveries).toHaveLength(1);
  });
  it("keeps an unmatched source expression blocking even when all proposed purchases and their total agree", () => {
    const reading = source("GBP", "2", "20.00", "40.00");
    const unknown = {
      text: "3x2 6",
      confidence: 0.99,
      box: [0.1, 0.57, 0.9, 0.62] as [number, number, number, number],
    };
    reading.panels[0].lines.splice(3, 0, unknown);
    reading.panels[0].words.push(unknown);
    const raw = { ...draft("20.00"), currency: "GBP", printedTotal: "40.00" };
    raw.items[0].lineTotal = "40.00";
    const result = verifyIndependentReadings(raw, reading);
    expect(result.receipt.reviewChecks).toContainEqual(
      expect.objectContaining({
        scope: "receipt",
        field: "items",
        reason: "coverage",
        confirmedValue: "",
      }),
    );
    expect(result.fieldSources.items).toContain(3);
    expect(calculateReceipt(result.receipt).issues.length).toBeGreaterThan(0);
  });
});
