import { describe, expect, it } from "vitest";
import { verifyIndependentReadings } from "../src/lib/verify-readings";
import { calculateReceipt } from "../src/lib/engine";
import { checkIsPending } from "../src/lib/review-checks";
import type { Recognition } from "../src/lib/receipt-layout";
import type { VisionBatch } from "../src/lib/local-vision-batches";
import { joinVisionBatches } from "../src/lib/join-vision-batches";

function fixture(zero = "Plastic bag 0", rows?: string[]) {
  const texts = rows || [
    "SHOP",
    "Meal 1x 8.00 8.00",
    "Tea 1x 2.00 2.00",
    zero,
    "TOTAL GBP 10.00",
    "Prices include tax",
  ];
  const recognition: Recognition = {
    engine: "paddle-ppocrv6-medium-onnx",
    panels: [
      {
        photo: 1,
        part: 1,
        width: 1000,
        height: 1200,
        lines: [],
        words: [],
      },
    ],
  };
  const panel = recognition.panels[0];
  texts.forEach((text, index) => {
    const y0 = (index + 0.1) / (texts.length + 2),
      y1 = (index + 0.7) / (texts.length + 2);
    panel.lines.push({ text, confidence: 0.99, box: [0.1, y0, 0.9, y1] });
    const split = text.match(/^(.*) (\d[\d.,]*)$/);
    if (split)
      panel.words.push(
        { text: split[1], confidence: 0.99, box: [0.1, y0, 0.6, y1] },
        { text: split[2], confidence: 0.99, box: [0.8, y0, 0.9, y1] },
      );
    else panel.words.push({ text, confidence: 0.99, box: [0.1, y0, 0.9, y1] });
  });
  const item = (description: string, amount: string) => ({
    description,
    quantity: "1",
    unitPrice: amount,
    lineTotal: amount,
    discount: "0",
    taxCode: "",
    note: "",
    sourcePhotos: [1],
  });
  const draft: VisionBatch["receipt"] = {
    merchant: "SHOP",
    date: "",
    currency: "GBP",
    pricesIncludeTax: true,
    subtotal: "",
    printedTax: "",
    printedTotal: "10.00",
    printedItemCount: 2,
    taxCodes: [],
    adjustments: [],
    warnings: [],
    items: [item("Meal", "8.00"), item("Tea", "2.00")],
  };
  return {
    recognition,
    panel,
    draft,
    read: (options = {}) =>
      verifyIndependentReadings(
        draft,
        recognition,
        { currency: "GBP" },
        options,
      ),
  };
}

describe("zero-price purchases supported by a printed price column", () => {
  it.each(["0", "0.00", "0,00"])(
    "recovers an omitted standalone row with literal %s and leaves quantity/unit price unknown",
    (literal) => {
      const f = fixture(`Plastic bag ${literal}`),
        before = structuredClone({
          draft: f.draft,
          recognition: f.recognition,
        });
      const result = f.read();
      expect(result.receipt.items).toHaveLength(3);
      const item = result.receipt.items[2];
      expect(item).toMatchObject({
        description: "Plastic bag",
        quantity: "",
        unitPrice: "",
        taxCode: "",
      });
      expect(Number(item.lineTotal)).toBe(0);
      expect(result.sources[item.id]).toEqual([3]);
      for (const field of ["description", "lineTotal"] as const) {
        const check = result.receipt.reviewChecks.find(
          (check) =>
            check.scope === "item" &&
            check.itemId === item.id &&
            check.field === field,
        )!;
        expect(check).toMatchObject({
          reason: "recovered",
          confirmedValue: "",
        });
        expect(checkIsPending(result.receipt, check)).toBe(true);
      }
      expect(calculateReceipt(result.receipt)).toMatchObject({
        total: 1000n,
        discrepancy: 0n,
      });
      expect(calculateReceipt(result.receipt).issues.length).toBeGreaterThan(0);
      expect({ draft: f.draft, recognition: f.recognition }).toEqual(before);
    },
  );
  it("anchors an existing zero-valued vision purchase without duplicating it", () => {
    const f = fixture();
    f.draft.items.push({
      ...f.draft.items[0],
      description: "Plastic bag",
      quantity: "",
      unitPrice: "",
      lineTotal: "0",
    });
    const result = f.read(),
      item = result.receipt.items.find(
        (item) => item.description === "Plastic bag",
      )!;
    expect(result.receipt.items).toHaveLength(3);
    expect(result.sources[item.id]).toEqual([3]);
    expect(result.receipt.items[0].lineTotal).toBe("8.00");
  });
  it("keeps native source order when a recognized free row precedes later paid purchases", () => {
    const f = fixture("", [
      "SHOP",
      "Meal 1x 8.00 8.00",
      "Napkin 0",
      "Tea 1x 2.00 2.00",
      "Plastic bag 0",
      "TOTAL GBP 10.00",
      "Prices include tax",
    ]);
    f.draft.items.splice(1, 0, {
      ...f.draft.items[0],
      description: "Napkin",
      quantity: "",
      unitPrice: "",
      lineTotal: "0",
    });
    const result = f.read();
    expect(result.receipt.items.map((item) => item.description)).toEqual([
      "Meal",
      "Napkin",
      "Tea",
      "Plastic bag",
    ]);
    const napkin = result.receipt.items[1];
    expect(result.sources[napkin.id]).toEqual([2]);
    expect(result.sources[result.receipt.items[3].id]).toEqual([4]);
    expect(
      result.itemAnchors.every(
        (anchor) => anchor.nativeIndex < f.draft.items.length,
      ),
    ).toBe(true);
  });
  it("retains two separately printed free rows even when their descriptions match", () => {
    const f = fixture("", [
      "SHOP",
      "Meal 1x 8.00 8.00",
      "Tea 1x 2.00 2.00",
      "Plastic bag 0",
      "Plastic bag 0",
      "TOTAL GBP 10.00",
      "Prices include tax",
    ]);
    const result = f.read();
    expect(result.receipt.items).toHaveLength(4);
    expect(
      result.receipt.items.slice(2).map((item) => result.sources[item.id]),
    ).toEqual([[3], [4]]);
    expect(calculateReceipt(result.receipt).total).toBe(1000n);
  });
  it("proposes one exact zero-valued fee as a purchase and requires review of both role changes", () => {
    const f = fixture();
    f.draft.adjustments = [{ label: "Plastic bag", kind: "fee", amount: "0" }];
    const result = f.read();
    expect(result.receipt.items).toHaveLength(3);
    expect(result.receipt.adjustments).toEqual([]);
    expect(result.removedAdjustments).toContainEqual(
      expect.objectContaining({
        label: "Plastic bag",
        amount: "0",
        reason: "zero-price-purchase",
        sourceIndices: [3],
      }),
    );
    const check = result.receipt.reviewChecks.find(
      (check) => check.scope === "receipt" && check.field === "adjustments",
    )!;
    expect(checkIsPending(result.receipt, check)).toBe(true);
    expect(check.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          value: expect.stringContaining("Plastic bag"),
        }),
      ]),
    );
    expect(result.fieldSources.adjustments).toContain(3);
    expect(calculateReceipt(result.receipt).total).toBe(1000n);
    expect(f.draft.adjustments).toHaveLength(1);
  });
  it.each(["nonzero", "discount", "multiple"])(
    "withholds purchase reclassification for a %s adjustment",
    (kind) => {
      const f = fixture();
      f.draft.adjustments = [
        {
          label: "Plastic bag",
          kind: kind === "discount" ? "discount" : "fee",
          amount: kind === "nonzero" ? "1.00" : "0",
        },
      ];
      if (kind === "multiple")
        f.draft.adjustments.push({ ...f.draft.adjustments[0] });
      const result = f.read();
      expect(result.receipt.items).toHaveLength(2);
      expect(result.receipt.adjustments).toHaveLength(
        f.draft.adjustments.length,
      );
    },
  );
  it("recovers a source-only free purchase once across overlapping vision batches", () => {
    const f = fixture();
    const panels = [1, 2, 3, 4].map((photo) => ({
      photo,
      part: 1,
      data: "/9j/4AAAMTIzNA==",
    }));
    const recognition: Recognition = {
      ...f.recognition,
      panels: panels.map(({ photo, part }) =>
        photo === 3
          ? { ...structuredClone(f.panel), photo, part }
          : { photo, part, width: 1000, height: 1200, lines: [], words: [] },
      ),
    };
    f.draft.items.forEach((item) => (item.sourcePhotos = [3]));
    const batches = [
      [0, 1, 2],
      [2, 3],
    ].map((indices) => ({ indices, receipt: structuredClone(f.draft) }));
    const result = joinVisionBatches(batches, panels, recognition, {
      currency: "GBP",
    });
    expect(result.batchJoin.joined).toBe(2);
    expect(result.receipt.items.map((item) => item.description)).toEqual([
      "Meal",
      "Tea",
      "Plastic bag",
    ]);
    expect(calculateReceipt(result.receipt).total).toBe(1000n);
    expect(
      result.receipt.reviewChecks.some(
        (check) =>
          check.field === "description" &&
          check.reason === "recovered" &&
          checkIsPending(result.receipt, check),
      ),
    ).toBe(true);
  });
  it("keeps the missing row visible for review when the 300-purchase limit is reached", () => {
    const names = Array.from(
      { length: 300 },
      (_, i) =>
        `Product ${String.fromCharCode(65 + Math.floor(i / 26))}${String.fromCharCode(65 + (i % 26))}`,
    );
    const f = fixture("", [
      "SHOP",
      ...names.map((name) => `${name} 1x 1.00 1.00`),
      "Plastic bag 0",
      "TOTAL GBP 300.00",
      "Prices include tax",
    ]);
    f.draft.items = names.map((description) => ({
      ...f.draft.items[0],
      description,
      unitPrice: "1.00",
      lineTotal: "1.00",
    }));
    f.draft.printedTotal = "300.00";
    const result = f.read();
    expect(result.receipt.items).toHaveLength(300);
    expect(result.fieldSources.items).toContain(301);
    expect(
      result.receipt.reviewChecks.some(
        (check) =>
          check.scope === "receipt" &&
          check.field === "items" &&
          checkIsPending(result.receipt, check),
      ),
    ).toBe(true);
    expect(calculateReceipt(result.receipt).total).toBe(30000n);
  });
  it.each([
    "weak-label",
    "weak-zero",
    "weak-line",
    "missing-words",
    "wrong-word-text",
    "off-column",
    "one-anchor",
    "unpaired-vision",
    "disagreeing-anchor",
    "disabled",
    "conflicting-summary",
    "currency-conflict",
    "zero-after-total",
    "zero-before-purchases",
  ])("withholds new purchases for %s", (condition) => {
    const f = fixture();
    if (condition === "weak-label")
      f.panel.words.find((word) => word.text === "Plastic bag")!.confidence =
        0.97;
    if (condition === "weak-zero")
      f.panel.words.find((word) => word.text === "0")!.confidence = 0.97;
    if (condition === "weak-line") f.panel.lines[3].confidence = 0.97;
    if (condition === "missing-words") f.panel.words = [];
    if (condition === "wrong-word-text")
      f.panel.words.find((word) => word.text === "0")!.text = "9";
    if (condition === "off-column")
      f.panel.words.find((word) => word.text === "0")!.box = [
        0.65,
        f.panel.lines[3].box[1],
        0.7,
        f.panel.lines[3].box[3],
      ];
    if (condition === "one-anchor")
      f.panel.words.find((word) => word.text === "2.00")!.confidence = 0.97;
    if (condition === "unpaired-vision")
      f.draft.items.push({
        ...f.draft.items[0],
        description: "Unknown free item",
        lineTotal: "0",
      });
    if (condition === "disagreeing-anchor") f.draft.items[1].lineTotal = "3.00";
    if (condition === "currency-conflict") f.draft.currency = "EUR";
    if (condition === "zero-after-total") {
      const zero = [...f.panel.lines[3].box],
        total = [...f.panel.lines[4].box];
      for (const word of f.panel.words) {
        if (word.box[1] === zero[1]) {
          word.box[1] = total[1];
          word.box[3] = total[3];
        } else if (word.box[1] === total[1]) {
          word.box[1] = zero[1];
          word.box[3] = zero[3];
        }
      }
      f.panel.lines[3].box[1] = total[1];
      f.panel.lines[3].box[3] = total[3];
      f.panel.lines[4].box[1] = zero[1];
      f.panel.lines[4].box[3] = zero[3];
    }
    if (condition === "zero-before-purchases") {
      const y0 = f.panel.lines[0].box[1],
        y1 = f.panel.lines[0].box[3];
      f.panel.lines[3].box[1] = y0;
      f.panel.lines[3].box[3] = y1;
      for (const word of f.panel.words.filter((word) =>
        ["Plastic bag", "0"].includes(word.text),
      )) {
        word.box[1] = y0;
        word.box[3] = y1;
      }
      // Move the unrelated heading away, keeping the free row's exact word coverage.
      f.panel.lines[0].box[1] = 0.95;
      f.panel.lines[0].box[3] = 0.99;
      f.panel.words.find((word) => word.text === "SHOP")!.box = [
        0.1, 0.95, 0.9, 0.99,
      ];
    }
    const result = f.read(
      condition === "disabled"
        ? { allowPriceRecovery: false }
        : condition === "conflicting-summary"
          ? { blockedScalarFields: ["printedTotal"] }
          : {},
    );
    expect(
      result.receipt.items.some((item) => item.description === "Plastic bag"),
    ).toBe(false);
  });
  it.each([
    "-Medium 0",
    "• Medium 0",
    "Tax 0",
    "Cash 0",
    "Change 0",
    "Items 0",
    "Quantity 0",
    "Discount 0",
    "Account 0",
  ])("does not make %s a new purchase", (row) => {
    const result = fixture(row).read();
    expect(result.receipt.items.map((item) => item.description)).toEqual([
      "Meal",
      "Tea",
    ]);
  });
  it("does not count a zero-price option already included in a parent's description", () => {
    const f = fixture("-Medium 0");
    f.draft.items[0].description = "Meal - Medium";
    const result = f.read();
    expect(result.receipt.items).toHaveLength(2);
    expect(result.receipt.items[0].description).toBe("Meal - Medium");
  });
});
