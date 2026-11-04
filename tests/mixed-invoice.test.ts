import { describe, expect, it } from "vitest";
import { mixedInvoiceRecognition } from "./fixtures/mixed-invoice";
import { assembleRecognition } from "../src/lib/receipt-layout";
import { readOcrInvoice } from "../src/lib/ocr-invoice";
import { calculateReceipt } from "../src/lib/engine";

function read(recognition = mixedInvoiceRecognition()) {
  const assembled = assembleRecognition(recognition);
  return readOcrInvoice({ ...assembled, recognition }, assembled.text);
}
function replace(before: string, after: string) {
  const recognition = mixedInvoiceRecognition();
  for (const panel of recognition.panels)
    for (const group of [panel.words, panel.lines])
      for (const cell of group) cell.text = cell.text.replace(before, after);
  return recognition;
}

describe("mixed invoice source proposals", () => {
  it("reads wrapped goods, printed VAT and gross carriage without changing amounts", () => {
    const recognition = mixedInvoiceRecognition(),
      before = JSON.stringify(recognition);
    const parsed = read(recognition)!;
    expect(parsed).not.toBeNull();
    expect(
      parsed.receipt.items.map(
        ({ description, quantity, unitPrice, lineTotal }) => [
          description,
          quantity,
          unitPrice,
          lineTotal,
        ],
      ),
    ).toEqual([
      ["Kartt 200mm x 56mm Spare wheel", "1", "16.32", "16.32"],
      ["Kartt Jockey Wheel Axle & Pin KA008", "1", "3.75", "3.75"],
    ]);
    expect(parsed.receipt.merchant).toBe("Western Towing");
    expect(parsed.receipt.currency).toBe("GBP");
    expect(parsed.receipt.pricesIncludeTax).toBe(false);
    expect([
      parsed.receipt.subtotal,
      parsed.receipt.printedTax,
      parsed.receipt.printedTotal,
    ]).toEqual(["20.07", "4.84", "29.06"]);
    expect(
      parsed.receipt.adjustments.map(({ kind, amount, includedTaxRate }) => [
        kind,
        amount,
        includedTaxRate,
      ]),
    ).toEqual([
      ["fee", "4.98", "20"],
      ["tax", "4.84", undefined],
    ]);
    const calculated = calculateReceipt(parsed.receipt);
    expect(calculated.total).toBe(2906n);
    expect(calculated.discrepancy).toBe(0n);
    expect(
      parsed.receipt.reviewChecks.some(
        (check) =>
          check.scope === "receipt" &&
          check.field === "items" &&
          !check.confirmedValue,
      ),
    ).toBe(true);
    expect(
      parsed.receipt.reviewChecks.some(
        (check) =>
          check.scope === "receipt" &&
          check.field === "adjustments" &&
          !check.confirmedValue,
      ),
    ).toBe(true);
    expect(
      parsed.receipt.reviewChecks.every((check) => !check.confirmedValue),
    ).toBe(true);
    for (const item of parsed.receipt.items)
      expect(parsed.sources[item.id].length).toBeGreaterThan(2);
    const fee = parsed.receipt.adjustments.find((row) => row.kind === "fee")!;
    expect(parsed.sources[fee.id].length).toBeGreaterThan(1);
    expect(JSON.stringify(recognition)).toBe(before);
  });

  it("does not choose a different rate to force the printed total", () => {
    expect(read(replace("20%", "5%"))).toBeNull();
  });

  it("requires a printed rate for the inclusive fee proposal", () => {
    expect(read(replace(" @ 20%", ""))).toBeNull();
  });

  it("requires the explicit fee tax-inclusion statement", () => {
    expect(read(replace(" (incl. VAT)", ""))).toBeNull();
  });

  it("keeps a monetary mismatch unresolved instead of changing the fee", () => {
    expect(read(replace("4.98", "5.98"))).toBeNull();
  });

  it("does not turn a quantity glyph into a digit", () => {
    const recognition = mixedInvoiceRecognition();
    for (const panel of recognition.panels) {
      const amountRow = panel.lines.find((line) =>
        line.text.startsWith("KA008 "),
      )!;
      amountRow.text = amountRow.text.replace(" 1 ", " i ");
      for (const word of panel.words)
        if (word.text === "1" && word.box[1] > 0.38) word.text = "i";
    }
    expect(read(recognition)).toBeNull();
  });

  it("preserves the existing OCR confidence floor for money", () => {
    const recognition = mixedInvoiceRecognition();
    for (const panel of recognition.panels)
      for (const cell of panel.words)
        if (cell.text.includes("£4.98")) cell.confidence = 0.89;
    expect(read(recognition)).toBeNull();
  });

  it("does not accept an unsupported tax rate", () => {
    expect(read(replace("20%", "101%"))).toBeNull();
  });

  it("does not attach a distant leading name to an otherwise blank product", () => {
    const recognition = mixedInvoiceRecognition();
    for (const panel of recognition.panels)
      for (const group of [panel.words, panel.lines])
        for (const cell of group)
          if (cell.text === "Kartt 200mm x 56mm") {
            cell.box[1] -= 0.08;
            cell.box[3] -= 0.08;
          }
    expect(read(recognition)).toBeNull();
  });

  it("does not select one rate from a multi-rate footer", () => {
    const recognition = mixedInvoiceRecognition();
    for (const panel of recognition.panels) {
      for (const key of ["words", "lines"] as const) {
        const extra = panel[key]
          .filter(
            (cell) => cell.text.startsWith("Vat @") || cell.text === "£4.84",
          )
          .map((cell) => ({
            ...structuredClone(cell),
            text: cell.text.replace("20%", "5%"),
            box: [
              cell.box[0],
              cell.box[1] + 0.016,
              cell.box[2],
              cell.box[3] + 0.016,
            ] as [number, number, number, number],
          }));
        panel[key].push(...extra);
      }
    }
    expect(read(recognition)).toBeNull();
  });

  it("does not interpret a mixed-currency fee as the local currency", () => {
    expect(read(replace("£4.98", "$4.98"))).toBeNull();
  });

  it("does not treat tax-exclusive carriage as an inclusive fee", () => {
    expect(read(replace("incl.", "excl."))).toBeNull();
  });
});
