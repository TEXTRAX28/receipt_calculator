import { describe, expect, it } from "vitest";
import { parseReceiptWithSources } from "../src/lib/parser";
import { verifyIndependentReadings } from "../src/lib/verify-readings";
import { calculateReceipt } from "../src/lib/engine";
import { checkIsPending } from "../src/lib/review-checks";
import { finalTotalFixture } from "./fixtures/final-total-fragments";

describe("Final totals sharing OCR rows with a genuine repeated purchase", () => {
  it("retains both purchases and assigns the footer amount only to its printed role", () => {
    const f = finalTotalFixture(),
      original = structuredClone(f.packet());
    const parsed = parseReceiptWithSources(f.packet(), { currency: "GBP" });
    expect(
      parsed.receipt.items.map((i) => [
        i.description,
        i.quantity,
        i.unitPrice,
        i.lineTotal,
      ]),
    ).toEqual([
      ["Roasted cashews", "1", "4.50", "4.50"],
      ["Roasted cashews", "1", "4.50", "4.50"],
    ]);
    expect(parsed.receipt.printedTotal).toBe("10.80");
    expect(parsed.sources[parsed.receipt.items[1].id]).toEqual([3, 4]);
    expect(parsed.fieldSources.printedTotal).toEqual([4, 5]);
    expect(calculateReceipt(parsed.receipt).discrepancy).toBe(0n);
    expect(
      parsed.receipt.reviewChecks.some(
        (c) =>
          c.scope === "receipt" &&
          c.field === "printedTotal" &&
          checkIsPending(parsed.receipt, c),
      ),
    ).toBe(true);
    expect(f.packet()).toEqual(original);
  });
  it("removes an independently read summary product while retaining two actual identical purchases and pending classification", () => {
    const f = finalTotalFixture(),
      original = structuredClone(f.draft);
    const result = verifyIndependentReadings(f.draft, f.recognition, {
      currency: "GBP",
    });
    expect(result.receipt.items.map((i) => i.description)).toEqual([
      "Roasted cashews",
      "Roasted cashews",
    ]);
    expect(result.receipt.items.every((i) => i.lineTotal === "4.50")).toBe(
      true,
    );
    expect(
      result.receipt.reviewChecks.some(
        (c) =>
          c.scope === "receipt" &&
          c.field === "items" &&
          checkIsPending(result.receipt, c),
      ),
    ).toBe(true);
    expect(result.fieldSources.items).toEqual(expect.arrayContaining([4, 5]));
    expect(result.receipt.printedTotal).toBe("10.80");
    expect(f.draft).toEqual(original);
  });
  it("does not require a tax legend or invent one to interpret the footer", () => {
    const f = finalTotalFixture();
    f.panel.lines.pop();
    f.panel.words.pop();
    const r = parseReceiptWithSources(f.packet(), { currency: "GBP" }).receipt;
    expect(r.items).toHaveLength(2);
    expect(r.printedTotal).toBe("10.80");
    expect(r.taxCodes).toEqual([{ code: "A", rate: "" }]);
    expect(calculateReceipt(r).issues.length).toBeGreaterThan(0);
  });
  it.each([
    "weak-amount",
    "weak-heading",
    "duplicate-amount",
    "wrong-owner",
    "steep",
    "source-conflict",
  ])("withholds the new footer proposal for %s", (condition) => {
    const f = finalTotalFixture();
    if (condition === "weak-amount") f.amount.confidence = 0.979;
    if (condition === "weak-heading") f.heading.confidence = 0.979;
    if (condition === "duplicate-amount")
      f.panel.words.push(structuredClone(f.amount));
    if (condition === "wrong-owner") f.panel.lines[4].text = "12345 1x 11.80";
    if (condition === "steep") f.amount.box = [0.75, 0.36, 0.88, 0.379];
    const packet = {
      ...f.packet(),
      sourceConflicts: condition === "source-conflict" ? [4] : [],
    };
    const r = parseReceiptWithSources(packet, { currency: "GBP" });
    expect(r.receipt.printedTotal).toBe("");
  });
  it.each([
    "different-price",
    "purchased-quantity",
    "unit-price",
    "different-photo",
    "duplicate-model-summary",
    "recovery-disabled",
  ])("retains a model item for %s", (condition) => {
    const f = finalTotalFixture();
    const item = f.draft.items[2];
    if (condition === "different-price") item.lineTotal = "10.81";
    if (condition === "purchased-quantity") item.quantity = "1";
    if (condition === "unit-price") item.unitPrice = "10.80";
    if (condition === "different-photo") item.sourcePhotos = [2];
    if (condition === "duplicate-model-summary")
      f.draft.items.push(structuredClone(item));
    const r = verifyIndependentReadings(
      f.draft,
      f.recognition,
      { currency: "GBP" },
      { allowPriceRecovery: condition !== "recovery-disabled" },
    );
    expect(
      r.receipt.items.some((i) => i.description === "TOTAL (INCL VAT)"),
    ).toBe(true);
  });
  it("retains unresolved currency while classifying the identical printed footer token", () => {
    const f = finalTotalFixture();
    f.panel.words[0].text = f.panel.lines[0].text = "COSTCO";
    const r = verifyIndependentReadings(
      { ...f.draft, currency: "" },
      f.recognition,
    );
    expect(r.receipt.currencyUnresolved).toBe(true);
    expect(r.receipt.items.map((i) => i.description)).toEqual([
      "Roasted cashews",
      "Roasted cashews",
    ]);
    expect(calculateReceipt(r.receipt).issues.length).toBeGreaterThan(0);
  });
  it("does not require a Costco merchant to recognize a printed total summary", () => {
    const f = finalTotalFixture();
    f.panel.words[0].text = f.panel.lines[0].text = "LOCAL MARKET GBP";
    const r = verifyIndependentReadings(
      { ...f.draft, merchant: "Local Market" },
      f.recognition,
      { currency: "GBP" },
    );
    expect(r.receipt.items.map((i) => i.description)).toEqual([
      "Roasted cashews",
      "Roasted cashews",
    ]);
  });
  it.each([
    "TOTAL",
    "TOTAL SAVINGS",
    "TOTAL TAX",
    "TOTAL (EXCL VAT)",
    "TOTAL NUMBER OF ITEMS",
  ])("does not promote the informational heading %s", (label) => {
    const f = finalTotalFixture();
    f.heading.text = label;
    f.sync();
    const r = parseReceiptWithSources(f.packet(), { currency: "GBP" });
    expect(r.finalTotalFragments).toBeUndefined();
  });
  it("keeps an explicitly blocked model summary proposal for review", () => {
    const f = finalTotalFixture();
    const r = verifyIndependentReadings(
      f.draft,
      f.recognition,
      { currency: "GBP" },
      { blockedScalarFields: ["printedTotal"] },
    );
    expect(r.receipt.items).toHaveLength(3);
  });
  it("classifies an explicit grand total from another retailer without dropping purchases", () => {
    const f = finalTotalFixture();
    f.panel.words[0].text = f.panel.lines[0].text = "LOCAL MARKET GBP";
    f.heading.text = f.draft.items[2].description = "GRAND TOTAL";
    f.sync();
    const r = verifyIndependentReadings(
      { ...f.draft, merchant: "Local Market" },
      f.recognition,
      { currency: "GBP" },
    );
    expect(r.receipt.items.map((i) => i.description)).toEqual([
      "Roasted cashews",
      "Roasted cashews",
    ]);
    expect(r.receipt.printedTotal).toBe("10.80");
  });
  it("keeps conflicting total values pending and highlights both original candidates", () => {
    const f = finalTotalFixture();
    const word = {
      text: "GRAND TOTAL GBP 20.00",
      confidence: 0.99,
      box: [0.1, 0.6, 0.9, 0.63] as [number, number, number, number],
    };
    f.panel.words.push(word);
    f.panel.lines.push({ ...word });
    const r = parseReceiptWithSources(f.packet(), { currency: "GBP" });
    expect(r.receipt.printedTotal).toBe("20.00");
    expect(r.fieldSources.printedTotal).toEqual([4, 5, 8]);
    expect(r.receipt.reviewChecks).toContainEqual(
      expect.objectContaining({
        scope: "receipt",
        field: "printedTotal",
        reason: "different",
        confirmedValue: "",
      }),
    );
    expect(
      r.receipt.reviewChecks
        .find((c) => c.field === "printedTotal")
        ?.details?.map((d) => d.value),
    ).toEqual(["20.00", "10.80"]);
  });
});
