import { describe, expect, it } from "vitest";
import { readFinancialSummary } from "../src/lib/financial-basis";
import {
  recoverDeviceFinancialSummary,
  reviewDeviceReading,
} from "../src/lib/device-review";
import { parseReceiptWithSources } from "../src/lib/parser";
import { calculateReceipt } from "../src/lib/engine";
import { checkIsPending } from "../src/lib/review-checks";
import type {
  EvidenceLine,
  SourceRecognition,
} from "../src/lib/receipt-layout";

function source(texts: string[]) {
  const lines: EvidenceLine[] = texts.map((text, i) => ({
    text,
    confidence: 0.99,
    photo: 1,
    part: 1,
    box: [
      0.01,
      (i + 0.1) / (texts.length + 1),
      0.99,
      (i + 0.8) / (texts.length + 1),
    ],
  }));
  const recognition: SourceRecognition = {
    engine: "paddle-ppocrv6-tiny-browser-wasm",
    panels: [
      {
        photo: 1,
        part: 1,
        width: 1000,
        height: 1600,
        lines,
        words: lines.flatMap((line) => {
          const words = line.text.split(" ");
          return words.map((text, i) => ({
            text,
            confidence: 0.99,
            box: [
              (i + 0.1) / words.length,
              line.box[1],
              (i + 0.8) / words.length,
              line.box[3],
            ] as EvidenceLine["box"],
          }));
        }),
      },
    ],
  };
  return {
    lines,
    recognition,
    read: () => readFinancialSummary(lines, recognition, "USD"),
  };
}
const summary = ["SUBTOTAL 499.99-", "TAX 43.12-", "**** TOTAL 543.11-"];

describe("literal signed financial summaries", () => {
  it.each([false, true])(
    "reads the same signed amounts with decoration %s",
    (decoration) => {
      const f = source(
        summary.map((line) => (decoration ? line : line.replace("**** ", ""))),
      );
      if (decoration) {
        f.lines[2].confidence = 0.2;
        f.recognition.panels[0].words.find(
          (word) => word.text === "****",
        )!.confidence = 0.2;
      }
      const before = structuredClone({
        lines: f.lines,
        recognition: f.recognition,
      });
      expect(
        f.read()?.map(({ role, amount, sourceIndices }) => ({
          role,
          amount,
          sourceIndices,
        })),
      ).toEqual([
        { role: "subtotal", amount: "-499.99", sourceIndices: [0] },
        { role: "tax", amount: "-43.12", sourceIndices: [1] },
        { role: "total", amount: "-543.11", sourceIndices: [2] },
      ]);
      expect({ lines: f.lines, recognition: f.recognition }).toEqual(before);
    },
  );
  it("distinguishes informational footer labels from another transaction total", () => {
    const f = source([
      ...summary,
      "TOTAL TAX 43.12-",
      "TOTAL NUMBER OF ITEMS SOLD = -1",
    ]);
    expect(f.read()?.at(-1)?.amount).toBe("-543.11");
  });
  it.each([
    "TOTAL ???",
    "**** TOTAL unreadable",
    "TOTAL 543.11-",
    "SUBTOTAL ???",
  ])("does not choose a balancing section over %s", (extra) => {
    expect(source([...summary, extra]).read()).toBeNull();
  });
  it.each(["TOTAL", "543.11-"])(
    "still requires 0.98 confidence on the financial word %s",
    (text) => {
      const f = source(summary);
      f.lines[2].confidence = 0.2;
      f.recognition.panels[0].words.find(
        (word) => word.text === text,
      )!.confidence = 0.979;
      expect(f.read()).toBeNull();
    },
  );
  it("does not exempt a weak word that joins decoration to an amount or heading", () => {
    const f = source(summary);
    f.recognition.panels[0].words = f.lines.map((line) => ({
      ...line,
      confidence: line.text.startsWith("****") ? 0.2 : 0.99,
    }));
    expect(f.read()).toBeNull();
  });
  it("does not ignore a low aggregate score without a separately recognized decoration", () => {
    const f = source(summary.map((text) => text.replace("**** ", "")));
    f.lines[2].confidence = 0.97;
    expect(f.read()).toBeNull();
  });
  it.each([
    ["SUBTOTAL 499.99-", "TAX 43.12", "TOTAL 456.87-"],
    ["SUBTOTAL 499.99", "TAX 43.12-", "TOTAL 456.87"],
    ["SUBTOTAL 499.99-", "TAX 43.12-", "Discount 2.00", "TOTAL 545.11-"],
    ["SUBTOTAL 499.99-", "TAX 43.12-", "Discount 2.00-", "TOTAL 545.11-"],
    ["SUBTOTAL 499.99-", "TAX 43.12-", "Service charge 2.00", "TOTAL 541.11-"],
  ])(
    "abstains on conflicting directions or an ambiguous refund discount: %j",
    (...texts) => {
      expect(source(texts).read()).toBeNull();
    },
  );
  it("preserves signed fee and rounding literals without inventing a reversal", () => {
    const f = source([
      "Subtotal -20.00",
      "Service charge -1.00",
      "Tax -2.00",
      "Rounding 0.01",
      "Total -22.99",
    ]);
    expect(f.read()?.map((row) => row.amount)).toEqual([
      "-20.00",
      "-1.00",
      "-2.00",
      "0.01",
      "-22.99",
    ]);
  });
});

function refund() {
  const f = source([
    "COSTCO",
    "2009952 DELL S322QC 499.99- Y",
    ...summary,
    "APPROVED - REFUND",
    "TOTAL TAX 43.12-",
    "TOTAL NUMBER OF ITEMS SOLD = -1",
  ]);
  f.lines[4].confidence = 0.2;
  f.recognition.panels[0].words.find(
    (word) => word.text === "****",
  )!.confidence = 0.2;
  const parsed = parseReceiptWithSources(
    f.lines.map((line) => line.text).join("\n"),
    { currency: "USD" },
  );
  return {
    ...f,
    parsed,
    propose: (conflicts: number[] = []) =>
      recoverDeviceFinancialSummary(parsed, f.lines, f.recognition, conflicts),
  };
}

describe("source-backed device tax proposals", () => {
  it("copies one literal negative tax and source regions, preserving unknowns and pending review", () => {
    const f = refund(),
      before = structuredClone(f.parsed),
      next = f.propose();
    expect(f.parsed).toEqual(before);
    expect(next.receipt.items).toEqual(before.receipt.items);
    expect(next.receipt.items[0]).toMatchObject({
      quantity: "",
      unitPrice: "",
      lineTotal: "-499.99",
      taxCode: "Y",
    });
    expect(next.receipt).toMatchObject({
      pricesIncludeTax: false,
      taxMode: "printed",
      printedTax: "-43.12",
      subtotal: "-499.99",
      printedTotal: "-543.11",
      taxCodes: [],
    });
    expect(next.receipt.adjustments).toHaveLength(1);
    expect(next.receipt.adjustments[0]).toMatchObject({
      kind: "tax",
      amount: "-43.12",
    });
    expect(next.sources[next.receipt.adjustments[0].id]).toEqual([3]);
    for (const field of [
      "pricesIncludeTax",
      "taxCodes",
      "adjustments",
    ] as const) {
      expect(next.fieldSources[field]).toEqual([2, 3, 4]);
      const check = next.receipt.reviewChecks.find(
        (check) => check.scope === "receipt" && check.field === field,
      )!;
      expect(check).toMatchObject({ reason: "recovered", confirmedValue: "" });
      expect(checkIsPending(next.receipt, check)).toBe(true);
    }
    const reviewed = reviewDeviceReading(
      next.receipt,
      next.sources,
      f.lines,
      f.recognition,
      next.fieldSources,
    );
    expect(calculateReceipt(reviewed)).toMatchObject({
      total: -54311n,
      discrepancy: 0n,
    });
    expect(calculateReceipt(reviewed).issues.length).toBeGreaterThan(0);
    expect(
      reviewed.reviewChecks.filter((check) => checkIsPending(reviewed, check))
        .length,
    ).toBeGreaterThanOrEqual(4);
    const repeated = recoverDeviceFinancialSummary(
      next,
      f.lines,
      f.recognition,
    );
    expect(repeated).toEqual(next);
  });
  it.each([
    "missing-geometry",
    "currency-unresolved",
    "source-conflict",
    "printed-tax-conflict",
    "subtotal-conflict",
    "total-conflict",
    "missing-scalar-source",
    "known-code-rate",
    "explicit-inclusive",
    "ambiguous-word",
    "conflicting-adjustment",
    "no-signed-product",
  ])("withholds interpretation when %s", (problem) => {
    const f = refund();
    if (problem === "currency-unresolved")
      f.parsed.receipt.currencyUnresolved = true;
    if (problem === "printed-tax-conflict")
      f.parsed.receipt.printedTax = "-4312";
    if (problem === "subtotal-conflict") f.parsed.receipt.subtotal = "-99.99";
    if (problem === "total-conflict") f.parsed.receipt.printedTotal = "";
    if (problem === "missing-scalar-source")
      f.parsed.fieldSources.printedTax = [];
    if (problem === "known-code-rate")
      f.parsed.receipt.taxCodes = [{ code: "Y", rate: "8.625" }];
    if (problem === "explicit-inclusive")
      f.lines.push({ ...f.lines[0], text: "Prices include tax" });
    if (problem === "ambiguous-word")
      f.recognition.panels[0].words.find(
        (word) => word.text === "43.12-",
      )!.confidence = 0.97;
    if (problem === "conflicting-adjustment")
      f.parsed.receipt.adjustments.push({
        id: "old-tax",
        label: "TAX",
        kind: "tax",
        amount: "-4.31",
        allocation: "proportional",
      });
    if (problem === "no-signed-product") f.parsed.receipt.items = [];
    const before = structuredClone(f.parsed);
    const next = recoverDeviceFinancialSummary(
      f.parsed,
      f.lines,
      problem === "missing-geometry" ? undefined : f.recognition,
      problem === "source-conflict" ? [3] : [],
    );
    expect(next).toEqual(before);
    expect(f.parsed).toEqual(before);
  });
  it("preserves unrelated adjustments and never fills a tax-code rate", () => {
    const f = refund();
    f.parsed.receipt.taxCodes = [{ code: "Y", rate: "" }];
    f.parsed.receipt.adjustments.push({
      id: "unknown",
      label: "Unresolved fee",
      kind: "fee",
      amount: "1.00",
      allocation: "equal-people",
    });
    f.parsed.sources.unknown = [0];
    const next = f.propose();
    expect(next.receipt.taxCodes).toEqual([{ code: "Y", rate: "" }]);
    expect(next.receipt.adjustments).toContainEqual(
      f.parsed.receipt.adjustments[0],
    );
    expect(next.sources.unknown).toEqual([0]);
    expect(calculateReceipt(next.receipt).discrepancy).not.toBe(0n);
  });
  it("keeps a full review-check budget valid by withholding an over-budget proposal", () => {
    const f = refund();
    f.parsed.receipt.reviewChecks = Array.from({ length: 2100 }, () => ({
      scope: "receipt" as const,
      field: "items" as const,
      reason: "source" as const,
      other: "",
      confirmedValue: "",
    }));
    expect(f.propose()).toEqual(f.parsed);
  });
  it("also supports separately added purchase tax without changing product amounts", () => {
    const f = source([
      "Shop",
      "Currency USD",
      "Meal 1x 18.00 18.00",
      "Subtotal 18.00",
      "Tax 2.00",
      "Total 20.00",
    ]);
    const parsed = parseReceiptWithSources(
      f.lines.map((line) => line.text).join("\n"),
    );
    const next = recoverDeviceFinancialSummary(parsed, f.lines, f.recognition);
    expect(next.receipt.items).toEqual(parsed.receipt.items);
    expect(next.receipt).toMatchObject({
      pricesIncludeTax: false,
      taxMode: "printed",
    });
    expect(calculateReceipt(next.receipt)).toMatchObject({
      total: 2000n,
      discrepancy: 0n,
    });
  });
});
