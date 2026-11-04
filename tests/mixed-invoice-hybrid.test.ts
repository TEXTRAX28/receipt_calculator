import { describe, expect, it } from "vitest";
import {
  mixedInvoiceRecognition,
  mixedInvoiceProtocolDraft,
} from "./fixtures/mixed-invoice";
import { verifyIndependentReadings } from "../src/lib/verify-readings";
import { calculateReceipt } from "../src/lib/engine";
import { proposeIncludedInvoiceFeeTax } from "../src/lib/financial-roles";
import { receiptFromAi } from "../src/lib/gemini";
import { parseReceiptWithSources } from "../src/lib/parser";
import { assembleRecognition } from "../src/lib/receipt-layout";

describe("included-fee merger protocol controls, not model accuracy", () => {
  it("carries an unconfirmed primary-source rate without changing printed money or inputs", () => {
    const raw = mixedInvoiceProtocolDraft(),
      recognition = mixedInvoiceRecognition();
    const before = structuredClone({ raw, recognition });
    const withoutSourceRecovery = verifyIndependentReadings(
      raw,
      recognition,
      undefined,
      { allowPriceRecovery: false },
    );
    const merged = verifyIndependentReadings(raw, recognition);
    expect({ raw, recognition }).toEqual(before);
    const fee = merged.receipt.adjustments.find((row) => row.kind === "fee")!;
    expect([
      fee.amount,
      fee.includedTaxRate,
      merged.receipt.printedTax,
      merged.receipt.printedTotal,
    ]).toEqual(["4.98", "20", "4.84", "29.06"]);
    expect(calculateReceipt(merged.receipt).total).toBe(2906n);
    expect(
      merged.receipt.reviewChecks.some(
        (check) =>
          check.scope === "receipt" &&
          check.field === "adjustments" &&
          !check.confirmedValue,
      ),
    ).toBe(true);
    expect(
      merged.receipt.reviewChecks.some(
        (check) =>
          check.scope === "receipt" &&
          check.field === "pricesIncludeTax" &&
          !check.confirmedValue,
      ),
    ).toBe(true);
    for (const check of withoutSourceRecovery.receipt.reviewChecks.filter(
      (check) => check.scope === "receipt",
    ))
      expect(
        merged.receipt.reviewChecks.some(
          (next) =>
            next.scope === "receipt" &&
            next.field === check.field &&
            !next.confirmedValue,
        ),
      ).toBe(true);
    expect(merged.agreements).toBe(withoutSourceRecovery.agreements);
    expect(
      merged.fieldSources.adjustments!.some((index) =>
        merged.sourceLines[index]?.text.includes("Carriage"),
      ),
    ).toBe(true);
    expect(
      merged.fieldSources.adjustments!.some((index) =>
        merged.sourceLines[index]?.text.includes("20%"),
      ),
    ).toBe(true);
    expect(
      merged.fieldSources.printedTax!.some((index) =>
        merged.sourceLines[index]?.text.includes("20%"),
      ),
    ).toBe(true);
    expect(merged.fieldSources.pricesIncludeTax!.length).toBeGreaterThan(0);
  });

  it("honors disabled source recovery", () => {
    const merged = verifyIndependentReadings(
      mixedInvoiceProtocolDraft(),
      mixedInvoiceRecognition(),
      undefined,
      { allowPriceRecovery: false },
    );
    expect(
      merged.receipt.adjustments.find((row) => row.kind === "fee")!
        .includedTaxRate,
    ).toBeUndefined();
    expect(calculateReceipt(merged.receipt).total).toBe(2989n);
  });

  it("honors blocked scalar recovery after a conflict", () => {
    const merged = verifyIndependentReadings(
      mixedInvoiceProtocolDraft(),
      mixedInvoiceRecognition(),
      undefined,
      { blockedScalarFields: ["printedTax"] },
    );
    expect(
      merged.receipt.adjustments.find((row) => row.kind === "fee")!
        .includedTaxRate,
    ).toBeUndefined();
  });

  it("does not infer an unknown item-price basis", () => {
    const raw = mixedInvoiceProtocolDraft();
    raw.pricesIncludeTax = null;
    const merged = verifyIndependentReadings(raw, mixedInvoiceRecognition());
    expect(
      merged.receipt.adjustments.find((row) => row.kind === "fee")!
        .includedTaxRate,
    ).toBeUndefined();
    expect(merged.receipt.pricesIncludeTax).toBe(true);
  });

  it("does not rewrite a conflicting fee amount to make the total balance", () => {
    const raw = mixedInvoiceProtocolDraft();
    raw.adjustments[0].amount = "5.98";
    const merged = verifyIndependentReadings(raw, mixedInvoiceRecognition());
    const fee = merged.receipt.adjustments.find((row) => row.kind === "fee")!;
    expect([fee.amount, fee.includedTaxRate]).toEqual(["5.98", undefined]);
  });

  it("requires the original printed tax agreement", () => {
    const raw = mixedInvoiceProtocolDraft();
    raw.printedTax = "5.84";
    const merged = verifyIndependentReadings(raw, mixedInvoiceRecognition());
    expect(
      merged.receipt.adjustments.find((row) => row.kind === "fee")!
        .includedTaxRate,
    ).toBeUndefined();
  });

  it("does not assign the rate to a different fee with the same amount", () => {
    const raw = mixedInvoiceProtocolDraft();
    raw.adjustments[0].label = "Insurance";
    const merged = verifyIndependentReadings(raw, mixedInvoiceRecognition());
    expect(
      merged.receipt.adjustments.find((row) => row.kind === "fee")!
        .includedTaxRate,
    ).toBeUndefined();
  });

  it("keeps unknown extra charges instead of forcing a matched financial set", () => {
    const raw = mixedInvoiceProtocolDraft();
    raw.adjustments.push({ label: "Other fee", kind: "fee", amount: "1.00" });
    const merged = verifyIndependentReadings(raw, mixedInvoiceRecognition());
    expect(
      merged.receipt.adjustments.filter((row) => row.kind === "fee"),
    ).toHaveLength(2);
    expect(
      merged.receipt.adjustments.every(
        (row) => row.includedTaxRate === undefined,
      ),
    ).toBe(true);
  });

  it("does not bypass the primary invoice money-confidence floor", () => {
    const recognition = mixedInvoiceRecognition();
    for (const panel of recognition.panels)
      for (const word of panel.words)
        if (word.text.includes("£4.98")) word.confidence = 0.89;
    const merged = verifyIndependentReadings(
      mixedInvoiceProtocolDraft(),
      recognition,
    );
    expect(
      merged.receipt.adjustments.find((row) => row.kind === "fee")!
        .includedTaxRate,
    ).toBeUndefined();
  });

  it("does not use the proposal across conflicting currencies", () => {
    const raw = mixedInvoiceProtocolDraft();
    raw.currency = "USD";
    const merged = verifyIndependentReadings(raw, mixedInvoiceRecognition());
    expect(
      merged.receipt.adjustments.find((row) => row.kind === "fee")!
        .includedTaxRate,
    ).toBeUndefined();
  });

  it("does not switch genuine item-tax-code calculation to a printed tax proposal", () => {
    const raw = mixedInvoiceProtocolDraft();
    raw.items[0].taxCode = "A";
    raw.taxCodes.push({ code: "A", rate: "20" });
    const merged = verifyIndependentReadings(raw, mixedInvoiceRecognition());
    expect(merged.receipt.taxMode).toBe("codes");
    expect(
      merged.receipt.adjustments.find((row) => row.kind === "fee")!
        .includedTaxRate,
    ).toBeUndefined();
  });

  it("does not overwrite an existing conflicting included rate", () => {
    const recognition = mixedInvoiceRecognition(),
      assembled = assembleRecognition(recognition);
    const primary = parseReceiptWithSources({ ...assembled, recognition });
    const receipt = receiptFromAi(mixedInvoiceProtocolDraft(), "Local vision");
    receipt.adjustments[0].includedTaxRate = "10";
    const before = structuredClone({ receipt, primary });
    expect(proposeIncludedInvoiceFeeTax(receipt, primary)).toBeNull();
    expect({ receipt, primary }).toEqual(before);
  });

  it("preserves charge identity, kind, amount and allocation when adding a pending rate", () => {
    const recognition = mixedInvoiceRecognition(),
      assembled = assembleRecognition(recognition);
    const primary = parseReceiptWithSources({ ...assembled, recognition });
    const receipt = receiptFromAi(mixedInvoiceProtocolDraft(), "Local vision");
    receipt.adjustments[0].allocation = "equal-people";
    const before = structuredClone({ receipt, primary });
    const proposal = proposeIncludedInvoiceFeeTax(receipt, primary)!;
    expect(proposal).not.toBeNull();
    expect(
      proposal.adjustments.map(({ includedTaxRate, ...row }) => row),
    ).toEqual(receipt.adjustments);
    expect(proposal.adjustments[0].includedTaxRate).toBe("20");
    expect({ receipt, primary }).toEqual(before);
  });
});
