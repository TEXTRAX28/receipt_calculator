import { describe, expect, it } from "vitest";
import {
  readFinancialSummary,
  recoverExclusivePriceBasis,
} from "../src/lib/financial-basis";
import { verifyIndependentReadings } from "../src/lib/verify-readings";
import { calculateReceipt } from "../src/lib/engine";
import { slantedSummary } from "./fixtures/financial-columns";

describe("slanted financial word columns", () => {
  it("pairs printed words in column order, preserving the original conflicting lines", () => {
    const fixture = slantedSummary();
    const before = structuredClone(fixture);
    const rows = readFinancialSummary(
      fixture.lines,
      fixture.recognition,
      "GBP",
    );
    expect(
      rows?.map(({ role, amount, sourceIndices }) => ({
        role,
        amount,
        sourceIndices,
      })),
    ).toEqual([
      { role: "subtotal", amount: "18.00", sourceIndices: [3] },
      { role: "tax", amount: "2.00", sourceIndices: [4, 5] },
      { role: "fee", amount: "1.00", sourceIndices: [5, 6] },
      { role: "total", amount: "21.00", sourceIndices: [7] },
    ]);
    expect(
      recoverExclusivePriceBasis(fixture.lines, fixture.recognition, "GBP")
        ?.sourceIndices,
    ).toEqual([3, 4, 5, 6, 7]);
    expect(fixture).toEqual(before);
  });

  it.each([
    "weak-word",
    "weak-line",
    "missing-value",
    "extra-value",
    "weak-extra-value",
    "extra-text",
    "duplicate-heading",
    "wrong-column",
    "inconsistent-slant",
    "overlapping-rows",
    "source-gap",
    "source-mismatch",
    "ambiguous-source",
    "different-panel",
    "different-photo",
    "wrong-total",
    "unrecognized-total",
    "too-many-lines",
    "too-many-words",
  ])("abstains when evidence is incomplete or ambiguous: %s", (change) => {
    const fixture = slantedSummary();
    const { words, lines, recognition } = fixture;
    const tax = words[5],
      service = words[7];
    if (change === "weak-word") tax.confidence = 0.97;
    if (change === "weak-line") lines[4]!.confidence = 0.97;
    if (change === "missing-value") words.splice(5, 1);
    if (change === "extra-value" || change === "weak-extra-value")
      words.push({
        ...tax,
        confidence: change.startsWith("weak") ? 0.1 : 0.99,
      });
    if (change === "extra-text") words.push({ ...tax, text: "unclear fee" });
    if (change === "duplicate-heading") words.push({ ...words[4] });
    if (change === "wrong-column") tax.box[0] = 0.2;
    if (change === "inconsistent-slant") {
      tax.box[1] -= 0.02;
      tax.box[3] -= 0.02;
    }
    if (change === "overlapping-rows") service.box = [...tax.box];
    if (change === "source-gap") lines.splice(5, 0, null);
    if (change === "source-mismatch") lines[4]!.text = "20.00";
    if (change === "ambiguous-source") lines.splice(5, 0, { ...lines[4]! });
    if (change === "different-panel") lines[4]!.part = 2;
    if (change === "different-photo") lines[4]!.photo = 2;
    if (change === "wrong-total") {
      words[9].text = "22.00";
      lines[7]!.text = "DUE 22.00";
    }
    if (change === "unrecognized-total") {
      words[10].text = "DU";
      lines[7]!.text = "DU 21.00";
    }
    if (change === "too-many-lines")
      while (lines.length < 513) lines.push(null);
    if (change === "too-many-words")
      while (words.length < 4001) words.push({ ...words[0] });
    expect(readFinancialSummary(lines, recognition, "GBP")).toBeNull();
  });

  it("does not select a balancing alternate value", () => {
    const { lines, words, recognition } = slantedSummary();
    words[5].text = "8.00";
    lines[4]!.text = "8.00";
    words.push({ ...words[5], text: "2.00" });
    expect(readFinancialSummary(lines, recognition, "GBP")).toBeNull();
  });

  it("keeps the corrected tax, fee and basis blocked with all original source regions", () => {
    const { recognition } = slantedSummary();
    const raw = {
      merchant: "Little Market",
      date: "",
      currency: "GBP",
      subtotal: "18.00",
      printedTotal: "21.00",
      printedTax: "2.00",
      pricesIncludeTax: null,
      printedItemCount: null,
      taxCodes: [],
      warnings: [],
      items: [
        {
          description: "Meal",
          quantity: "1",
          unitPrice: "18.00",
          lineTotal: "18.00",
          discount: "0",
          taxCode: "",
          note: "",
          sourcePhotos: [1],
        },
      ],
      adjustments: [
        { label: "PB1", kind: "discount", amount: "2.00" },
        { label: "SVC CHRG", kind: "fee", amount: "1.00" },
      ],
    };
    const before = structuredClone(raw);
    const result = verifyIndependentReadings(raw, recognition, {
      currency: "GBP",
    });
    expect(raw).toEqual(before);
    expect(result.receipt.pricesIncludeTax).toBe(false);
    expect(
      result.receipt.adjustments.map(({ kind, amount }) => ({ kind, amount })),
    ).toEqual([
      { kind: "tax", amount: "2.00" },
      { kind: "fee", amount: "1.00" },
    ]);
    expect(result.fieldSources.pricesIncludeTax).toEqual([3, 4, 5, 6, 7]);
    expect(result.fieldSources.adjustments).toEqual([3, 4, 5, 6, 7]);
    // Earlier scalar lookup context survives alongside both recovered regions.
    expect(result.fieldSources.printedTax).toEqual([3, 4, 5]);
    for (const field of ["pricesIncludeTax", "adjustments", "printedTax"]) {
      expect(result.receipt.reviewChecks).toContainEqual(
        expect.objectContaining({ field, confirmedValue: "" }),
      );
    }
    const calculated = calculateReceipt(result.receipt);
    expect(calculated.discrepancy).toBe(0n);
    expect(calculated.issues.length).toBeGreaterThan(0);
  });
});
