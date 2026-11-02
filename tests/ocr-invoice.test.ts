import { describe, expect, it } from "vitest";
import { devicePanel, deviceRecognition } from "../src/lib/device-evidence";
import { readOcrInvoice } from "../src/lib/ocr-invoice";
import { parseReceiptWithSources } from "../src/lib/parser";
import { calculateReceipt } from "../src/lib/engine";
import { confirmReviewCheck, reviewKey } from "../src/lib/review-checks";
import { receiptSchema } from "../src/lib/model";

type Cell = [string, number, number?, number?];
type Row = Cell[];
const label = (text: string, amount: string): Row => [
  ["Customer Road", 40, 200],
  [text, 600, 220],
  ["£", 850, 12],
  [amount, 900, 60],
];
const source = (): Row[] => [
  [["T/a: Workshop & Industrial", 50, 250]],
  [
    ["Cloud Tools Ltd", 50, 180],
    ["~", 900, 10, 0],
  ],
  [
    ["Invoice No", 600, 150],
    ["INV-123", 900, 60],
  ],
  [
    ["Invoice Date", 600, 150],
    ["11/04/2024", 850, 100],
  ],
  [
    ["Description", 50, 100],
    ["Quantity", 500, 60],
    ["Unit", 650, 30],
    ["Price", 695, 35],
    ["Net", 840, 30],
    ["Amt", 885, 35],
  ],
  [
    ["Utility grabber - 80CM", 50, 300],
    ["4", 520, 20],
    ["2.50", 700, 40],
    ["10.00", 900, 50],
  ],
  label("Total Net Amount", "10.00"),
  label("Carriage Net", "1.00"),
  label("Total VAT Amount", "2.20"),
  label("Invoice Total", "13.20"),
];
function packet(rows = source()) {
  const lines = rows.map((row, index) => {
    const words = row.map(
      ([text, x, width = text.length * 5, confidence = 96]) => ({
        text,
        confidence,
        bbox: {
          x0: x,
          x1: x + width,
          y0: 40 + index * 40,
          y1: 55 + index * 40,
        },
      }),
    );
    return {
      text: words.map((word) => word.text).join(" "),
      confidence: Math.min(...words.map((word) => word.confidence)),
      bbox: {
        x0: Math.min(...words.map((word) => word.bbox.x0)),
        x1: Math.max(...words.map((word) => word.bbox.x1)),
        y0: words[0].bbox.y0,
        y1: words[0].bbox.y1,
      },
      words,
    };
  });
  const data = { blocks: [{ paragraphs: [{ lines }] }] },
    text = lines.map((line) => line.text).join("\n");
  const observed = devicePanel(data, text, 1000, 1200, 1, 1);
  expect(observed.complete).toBe(true);
  return {
    text,
    recognition: deviceRecognition([observed.panel!])!,
    sourceLines: observed.rows.map((row) => row.source),
  };
}
const read = (output: ReturnType<typeof packet>) =>
  readOcrInvoice(output, output.text);
function checked(receipt: NonNullable<ReturnType<typeof read>>["receipt"]) {
  return receipt.reviewChecks.reduce(
    (next, check) => confirmReviewCheck(next, reviewKey(check)),
    receipt,
  );
}

describe("source-owned OCR invoice columns", () => {
  it("separates purchased quantity, unit, net line, delivery and printed VAT without monetary edits", () => {
    const output = packet(),
      parsed = read(output)!;
    expect(
      parsed.receipt.items.map((item) => [
        item.description,
        item.quantity,
        item.unitPrice,
        item.lineTotal,
      ]),
    ).toEqual([["Utility grabber - 80CM", "4", "2.50", "10.00"]]);
    expect(parsed.receipt.merchant).toBe(
      "Workshop & Industrial Cloud Tools Ltd",
    );
    expect(parsed.receipt.date).toBe("");
    expect(parsed.receipt.subtotal).toBe("10.00");
    expect(parsed.receipt.printedTax).toBe("2.20");
    expect(parsed.receipt.pricesIncludeTax).toBe(false);
    expect(
      parsed.receipt.adjustments.map((entry) => [entry.kind, entry.amount]),
    ).toEqual([
      ["fee", "1.00"],
      ["tax", "2.20"],
    ]);
    expect(parsed.receipt.printedTotal).toBe("13.20");
    expect(parsed.receipt.source).toBe("ocr");
    expect(receiptSchema.safeParse(parsed.receipt).success).toBe(true);
    expect(calculateReceipt(parsed.receipt).issues.length).toBeGreaterThan(0);
    expect(calculateReceipt(checked(parsed.receipt)).issues).toEqual([]);
    expect(calculateReceipt(checked(parsed.receipt)).total).toBe(1320n);
    expect(parsed.fieldSources.adjustments).toContain(7);
    expect(parsed.sources[parsed.receipt.items[0].id]).toContain(5);
    expect(parseReceiptWithSources(output).receipt.items).toHaveLength(1);
  });
  it("keeps the SDK's word owners when unrelated reported row boxes overlap", () => {
    const output = packet();
    const header = output.recognition.panels[0].lines[4],
      original = [...header.box] as typeof header.box;
    header.box = [0, 0, 1, header.box[3]];
    output.sourceLines[4]!.box = [...header.box];
    expect(read(output)!.receipt.items[0].quantity).toBe("4");
    expect(original).not.toEqual(header.box);
  });
  it("never repairs a low-confidence merchant spelling from a familiar name", () => {
    const rows = source();
    rows[1][0] = ["[loud Tools Ltd", 50, 180, 57];
    const parsed = read(packet(rows))!;
    expect(parsed.receipt.merchant).toBe(
      "Workshop & Industrial [loud Tools Ltd",
    );
    expect(
      parsed.receipt.reviewChecks.some(
        (check) => check.field === "merchant" && !check.confirmedValue,
      ),
    ).toBe(true);
  });
  it("does not let an uncertain standalone currency glyph displace high-confidence numeric/source evidence", () => {
    const rows = source();
    rows[7][2][3] = 40;
    expect(read(packet(rows))!.receipt.adjustments[0].amount).toBe("1.00");
  });
  it.each(["i", "O", "1,000", "1.000", "-4"])(
    "does not invent a purchased quantity from %s",
    (literal) => {
      const rows = source();
      rows[5][1][0] = literal;
      expect(read(packet(rows))).toBeNull();
    },
  );
  it("leaves currency unresolved when every supporting symbol is weak", () => {
    const rows = source();
    for (const row of rows)
      for (const cell of row) if (cell[0] === "£") cell[3] = 40;
    const parsed = read(packet(rows))!;
    expect(parsed.receipt.currencyUnresolved).toBe(true);
    expect(
      calculateReceipt(checked(parsed.receipt)).issues.some(
        (issue) => issue.path === "currency",
      ),
    ).toBe(true);
  });
  it.each([1, 2, 3])(
    "abstains when numeric purchase cell %s has weak OCR support",
    (index) => {
      const rows = source();
      rows[5][index][3] = 89;
      expect(read(packet(rows))).toBeNull();
    },
  );
  it("preserves inconsistent printed arithmetic and keeps the validator blocking", () => {
    const rows = source();
    rows[5][3][0] = "10.01";
    const parsed = read(packet(rows))!;
    expect(parsed.receipt.items[0].lineTotal).toBe("10.01");
    expect(
      calculateReceipt(checked(parsed.receipt)).issues.some(
        (issue) => issue.path === "items.0.unitPrice",
      ),
    ).toBe(true);
  });
  it.each(["Carriage Gross", "Carriage"])(
    "abstains on an unsupported or mixed-basis %s fee",
    (name) => {
      const rows = source();
      rows[7] = label(name, "1.00");
      expect(read(packet(rows))).toBeNull();
    },
  );
  it("does not silently deduplicate two scalar delivery rows", () => {
    const rows = source();
    rows.splice(8, 0, label("Carriage Net", "1.00"));
    expect(read(packet(rows))).toBeNull();
  });
  it("does not drop an unclassified monetary row after the total", () => {
    const rows = source();
    rows.push(label("Other charge", "1.00"));
    expect(read(packet(rows))).toBeNull();
  });
  it("keeps source-conflicted, unowned or malformed metadata on the ordinary parsing path", () => {
    const output = packet();
    expect(
      readOcrInvoice({ ...output, sourceConflicts: [5] }, output.text),
    ).toBeNull();
    expect(
      readOcrInvoice({ ...output, recognition: {} }, output.text),
    ).toBeNull();
    output.recognition.panels[0].wordRows![0] = 1999;
    expect(read(output)).toBeNull();
    expect(() =>
      parseReceiptWithSources({
        text: "Shop\nMilk 2.00\nTOTAL GBP 2.00",
        recognition: {},
      }),
    ).not.toThrow();
  });
  it("cannot authorize a reused word box on two different source rows", () => {
    const output = packet(),
      panel = output.recognition.panels[0];
    panel.words.push({ ...panel.words[0], box: [...panel.words[0].box] });
    panel.wordRows!.push(1);
    expect(read(output)).toBeNull();
  });
  it("does not invent purchases from a payment-only document without a purchase header", () => {
    const output = packet([
      [
        ["Payment Visa", 50, 200],
        ["£52.00", 900, 60],
      ],
      [
        ["Total", 600, 200],
        ["£52.00", 900, 60],
      ],
    ]);
    expect(read(output)).toBeNull();
  });
});
