import { describe, expect, it } from "vitest";
import { verifyIndependentReadings } from "../src/lib/verify-readings";
import { calculateReceipt } from "../src/lib/engine";
import type { Recognition } from "../src/lib/receipt-layout";
import { joinVisionBatches } from "../src/lib/join-vision-batches";
import { aiReceiptSchema } from "../src/lib/extraction-schema.mjs";
import { longPanels } from "./fixtures/long-local-receipt";

function evidence(texts: string[]): Recognition {
  const lines = texts.map((text, index) => ({
    text,
    confidence: 0.99,
    box: [
      0.1,
      (index + 0.1) / (texts.length + 1),
      0.9,
      (index + 0.8) / (texts.length + 1),
    ] as [number, number, number, number],
  }));
  return {
    engine: "paddle-ppocrv6-medium-onnx",
    panels: [
      {
        photo: 1,
        part: 1,
        width: 1000,
        height: 1200,
        words: structuredClone(lines),
        lines,
      },
    ],
  };
}
function draft(price = "4.000") {
  return {
    merchant: "Market",
    date: "",
    currency: "IDR",
    subtotal: "",
    printedTotal: "4000",
    printedTax: "",
    pricesIncludeTax: true,
    printedItemCount: null,
    taxCodes: [],
    adjustments: [],
    warnings: [],
    items: [
      {
        description: "Tea",
        quantity: "1",
        unitPrice: "",
        lineTotal: price,
        discount: "0",
        taxCode: "",
        note: "",
        sourcePhotos: [1],
      },
    ],
  };
}
const reading = () => evidence(["Market", "Tea 4,000", "TOTAL IDR 4,000"]);

describe("copied invalid prices with a uniquely matched name difference", () => {
  function fixture() {
    const raw = draft("17.500");
    raw.items[0].description = "1 Roast Chieken";
    raw.items[0].unitPrice = "17.500";
    const source = evidence([
      "Market",
      "1 Roast Chicken 17,500",
      "TOTAL IDR 17,500",
    ]);
    return { raw, source };
  }

  it("retains an original-source proposal despite a small name disagreement", () => {
    const { raw, source } = fixture();
    const before = structuredClone({ raw, source });
    const result = verifyIndependentReadings(raw, source);
    expect(result.receipt.items[0]).toMatchObject({
      description: "1 Roast Chieken",
      quantity: "1",
      unitPrice: "17.500",
      lineTotal: "17500",
    });
    expect(result.unitRecoveries).toEqual([]);
    expect(result.priceRecoveries).toHaveLength(1);
    expect(result.priceRecoveries[0].sourceIndices).toEqual([1]);
    expect(result.receipt.reviewChecks).toContainEqual(
      expect.objectContaining({
        field: "lineTotal",
        reason: "recovered",
        other: "17.500",
        confirmedValue: "",
      }),
    );
    expect(
      result.receipt.reviewChecks.every((check) => !check.confirmedValue),
    ).toBe(true);
    expect(calculateReceipt(result.receipt).issues.length).toBeGreaterThan(0);
    expect({ raw, source }).toEqual(before);
  });

  it("does not use a matching or conflicting receipt total to choose the proposal", () => {
    for (const total of ["17500", "1", "999999"]) {
      const { raw, source } = fixture();
      raw.printedTotal = total;
      const result = verifyIndependentReadings(raw, source);
      expect(result.receipt.items[0].lineTotal).toBe("17500");
    }
  });

  it.each([
    "different-digits",
    "valid-price",
    "absent-price",
    "quantity-conflict",
    "quantity-unprinted",
    "weak-money",
    "duplicate",
    "wrong-photo",
    "three-decimal-currency",
    "unit-only-column",
    "opposite-sign",
  ])("abstains with %s", (variant) => {
    const { raw, source } = fixture();
    if (variant === "different-digits") raw.items[0].lineTotal = "18.500";
    if (variant === "valid-price") raw.items[0].lineTotal = "17.50";
    if (variant === "absent-price") raw.items[0].lineTotal = "";
    if (variant === "quantity-conflict") raw.items[0].quantity = "2";
    if (variant === "quantity-unprinted") {
      source.panels[0].lines[1].text = "Roast Chicken 17,500";
      source.panels[0].words[1].text = "Roast Chicken 17,500";
    }
    if (variant === "weak-money") source.panels[0].words[1].confidence = 0.97;
    if (variant === "duplicate") {
      const repeated = evidence([
        "Market",
        "1 Roast Chicken 17,500",
        "1 Roast Chicken 17,500",
        "TOTAL IDR 35,000",
      ]);
      source.panels = repeated.panels;
    }
    if (variant === "wrong-photo") raw.items[0].sourcePhotos = [2];
    if (variant === "three-decimal-currency") {
      raw.currency = "KWD";
      source.panels[0].lines[2].text = "TOTAL KWD 17.500";
      source.panels[0].words[2].text = "TOTAL KWD 17.500";
    }
    if (variant === "unit-only-column") {
      source.panels[0].lines[0].text = "Qty UNIT PRICE";
      source.panels[0].words[0].text = "Qty UNIT PRICE";
    }
    if (variant === "opposite-sign") raw.items[0].lineTotal = "-17.500";
    const result = verifyIndependentReadings(raw, source);
    expect(result.receipt.items[0].lineTotal).toBe(raw.items[0].lineTotal);
    expect(result.priceRecoveries).toEqual([]);
  });
});

describe("literal source proposals for invalid vision prices", () => {
  function batchFixture(conflict = false) {
    const source = evidence(["Currency IDR", "Tea 4,000"]);
    source.panels = [
      source.panels[0],
      evidence(["Market"]).panels[0],
      evidence(["Market"]).panels[0],
      evidence(["Coffee 6,000", "TOTAL IDR 10,000"]).panels[0],
    ].map((panel, index) => ({ ...panel, photo: index + 1 }));
    const first = draft();
    if (conflict) first.currency = "KWD";
    const second = draft("6.000");
    second.items[0].description = "Coffee";
    second.items[0].sourcePhotos = [4];
    return {
      source,
      batches: [
        { indices: [0, 1, 2], receipt: aiReceiptSchema.parse(first) },
        { indices: [2, 3], receipt: aiReceiptSchema.parse(second) },
      ],
    };
  }
  it("retains pending recovery proposals across long-receipt batches without mutating native inputs", () => {
    const { source, batches } = batchFixture();
    const original = structuredClone(batches);
    const result = joinVisionBatches(batches, longPanels, source, {
      currency: "IDR",
    });
    expect(result.receipt.items.map((item) => item.lineTotal)).toEqual([
      "4000",
      "6000",
    ]);
    expect(result.priceRecoveries).toHaveLength(2);
    expect(
      result.receipt.reviewChecks.filter(
        (check) =>
          check.scope === "item" &&
          check.field === "lineTotal" &&
          check.reason === "recovered" &&
          check.confirmedValue === "",
      ),
    ).toHaveLength(2);
    expect(batches).toEqual(original);
  });
  it("does not reinterpret a valid batch currency amount using another batch's currency", () => {
    const { source, batches } = batchFixture(true);
    const result = joinVisionBatches(batches, longPanels, source, {
      currency: "IDR",
    });
    expect(result.priceRecoveries).toEqual([]);
    expect(result.receipt.items.map((item) => item.lineTotal)).toEqual([
      "4.000",
      "6.000",
    ]);
    expect(result.receipt.reviewChecks).toContainEqual(
      expect.objectContaining({
        scope: "receipt",
        field: "currency",
        reason: "different",
        confirmedValue: "",
      }),
    );
  });
  it("copies the printed price but keeps a blocking recovery check and the original value", () => {
    const result = verifyIndependentReadings(draft(), reading());
    const item = result.receipt.items[0];
    expect(item.lineTotal).toBe("4000");
    expect(result.priceRecoveries).toHaveLength(1);
    expect(result.priceRecoveries[0].evidence).toMatchObject({
      previous: "4.000",
      literal: "4,000",
      value: "4000",
    });
    expect(result.receipt.reviewChecks).toContainEqual(
      expect.objectContaining({
        scope: "item",
        itemId: item.id,
        field: "lineTotal",
        reason: "recovered",
        confirmedValue: "",
        other: "4.000",
      }),
    );
    expect(calculateReceipt(result.receipt).issues).toContainEqual(
      expect.objectContaining({ path: "items.0.lineTotal" }),
    );
  });
  it("does not count a copied proposal as independent price agreement", () => {
    const recovered = verifyIndependentReadings(draft(), reading());
    const agreed = verifyIndependentReadings(draft("4000"), reading());
    expect(agreed.agreements).toBe(recovered.agreements + 1);
  });
  it("does not replace a valid conflicting price or an absent price", () => {
    for (const price of ["4", ""]) {
      const result = verifyIndependentReadings(draft(price), reading());
      expect(result.receipt.items[0].lineTotal).toBe(price);
      expect(result.priceRecoveries).toEqual([]);
    }
  });
  it("never chooses a value by the printed total", () => {
    for (const printedTotal of ["4000", "4", "999999"]) {
      const raw = draft();
      raw.printedTotal = printedTotal;
      expect(
        verifyIndependentReadings(raw, reading()).receipt.items[0].lineTotal,
      ).toBe("4000");
    }
  });
  it("requires resolved matching currency rather than a provisional default", () => {
    const unknown = evidence(["Market", "Tea 4,000", "TOTAL 4,000"]);
    expect(verifyIndependentReadings(draft(), unknown).priceRecoveries).toEqual(
      [],
    );
    expect(
      verifyIndependentReadings(draft(), unknown, { currency: "IDR" })
        .priceRecoveries,
    ).toHaveLength(1);
    const conflicting = { ...draft(), currency: "GBP" };
    expect(
      verifyIndependentReadings(conflicting, reading(), { currency: "IDR" })
        .priceRecoveries,
    ).toEqual([]);
  });
  it("rejects low monetary-word confidence even when the row score is high", () => {
    const source = reading();
    source.panels[0].words[1].confidence = 0.97;
    expect(verifyIndependentReadings(draft(), source).priceRecoveries).toEqual(
      [],
    );
  });
  it("does not replace a calculated row total with a unit-price-only column", () => {
    const source = evidence([
      "Market",
      "Qty UNIT PRICE",
      "Tea 4,000",
      "TOTAL IDR 8,000",
    ]);
    const raw = draft("8.000");
    raw.items[0].quantity = "2";
    expect(verifyIndependentReadings(raw, source).priceRecoveries).toEqual([]);
  });
  it("preserves the sign rather than turning an invalid refund into a charge", () => {
    expect(
      verifyIndependentReadings(draft("-4.000"), reading()).priceRecoveries,
    ).toEqual([]);
  });
  it("does not force an ambiguous duplicate or use the wrong source photo", () => {
    const repeated = evidence([
      "Market",
      "Tea 4,000",
      "Tea 4,000",
      "TOTAL IDR 8,000",
    ]);
    expect(
      verifyIndependentReadings(draft(), repeated).priceRecoveries,
    ).toEqual([]);
    const raw = draft();
    raw.items[0].sourcePhotos = [2];
    expect(verifyIndependentReadings(raw, reading()).priceRecoveries).toEqual(
      [],
    );
  });
  it("keeps two real repeated purchases as two separate recovery proposals", () => {
    const raw = draft();
    raw.items.push(structuredClone(raw.items[0]));
    const result = verifyIndependentReadings(
      raw,
      evidence(["Market", "Tea 4,000", "Tea 4,000", "TOTAL IDR 8,000"]),
    );
    expect(result.receipt.items).toHaveLength(2);
    expect(result.priceRecoveries).toHaveLength(2);
  });
  it("does not reinterpret a valid three-decimal currency amount as thousands", () => {
    const raw = { ...draft(), currency: "KWD" };
    const result = verifyIndependentReadings(
      raw,
      evidence(["Market", "Tea 4.000", "TOTAL KWD 4.000"]),
    );
    expect(result.receipt.items[0].lineTotal).toBe("4.000");
    expect(result.priceRecoveries).toEqual([]);
  });
  it("preserves purchased quantity, missing unit price and mandatory source checks", () => {
    const raw = draft();
    raw.items[0].quantity = "2";
    const result = verifyIndependentReadings(
      raw,
      evidence(["Market", "2 x Tea 4,000", "TOTAL IDR 4,000"]),
    );
    expect(result.receipt.items[0]).toMatchObject({
      quantity: "2",
      unitPrice: "",
      lineTotal: "4000",
    });
    expect(result.receipt.reviewChecks).toContainEqual(
      expect.objectContaining({
        field: "quantity",
        reason: "source",
        confirmedValue: "",
      }),
    );
  });
});
