import { describe, expect, it } from "vitest";
import { pdfTextRows, readPdfText } from "../src/lib/pdf-text";
import { readPdfInvoice } from "../src/lib/pdf-invoice";
import type { ReceiptImage } from "../src/lib/images";
import { calculateReceipt } from "../src/lib/engine";
import { receiptSchema } from "../src/lib/model";
import { confirmReviewCheck, reviewKey } from "../src/lib/review-checks";
import { collectReceiptEvidence } from "../src/lib/receipt-evidence";

type Cell = [string, number, number?];
type Row = Cell[];
const viewport = {
  width: 1000,
  height: 1200,
  transform: [1, 0, 0, -1, 0, 1200],
};
function page(rows: Row[], pageNumber = 1): ReceiptImage {
  const text = pdfTextRows(
    rows.flatMap((row, index) =>
      row.map(([str, x, width]) => ({
        str,
        dir: "ltr",
        width: width ?? Math.min(300, str.length * 5),
        height: 10,
        transform: [10, 0, 0, 10, x, 1140 - index * 30],
        fontName: "test",
      })),
    ),
    {},
    viewport,
  )!;
  expect(text).toBeDefined();
  return {
    id: `page-${pageNumber}`,
    name: "invoice.pdf",
    url: "blob:test",
    blob: new Blob(["page"]),
    document: {
      kind: "pdf",
      id: "same-document",
      page: pageNumber,
      pages: 2,
      original: new File(["%PDF-1.7"], "invoice.pdf"),
      text,
    },
  };
}
const label = (text: string, value?: string): Row => [
  [text, 50, 400],
  ...(value ? [[value, 850, 100] as Cell] : []),
];
const header = (basis: "gross" | "net" | "none" = "gross"): Row => [
  ["Description", 50, 100],
  ["Qty", 500, 20],
  [
    basis === "none"
      ? "Unit price"
      : `Unit price (${basis === "gross" ? "incl." : "excl."} VAT)`,
    620,
    140,
  ],
  [
    basis === "none"
      ? "Line total"
      : `Line total (${basis === "gross" ? "incl." : "excl."} VAT)`,
    820,
    140,
  ],
];
const purchase = (
  description = "Wooden spoons, pack of 100",
  quantity = "2",
  unit = "£3.43",
  total = "£6.86",
): Row => [
  [description, 50, 340],
  [quantity, 510, 25],
  [unit, 700, 50],
  [total, 900, 50],
];
const adjustment = (name = "Promotions", value = "-£0.66"): Row => [
  [name, 50, 100],
  [value, 900, 50],
];
const grossRows = (): Row[] => [
  label("Sold by Example Supplies Ltd"),
  label("Invoice # INV-42"),
  header(),
  purchase(),
  adjustment(),
  label("Invoice total", "£6.20"),
];
const native = (pages: ReceiptImage[]) =>
  readPdfInvoice(
    pages,
    pages
      .flatMap((image) => image.document!.text!.lines.map((line) => line.text))
      .join("\n"),
  );
function checked(receipt: NonNullable<ReturnType<typeof native>>["receipt"]) {
  return receipt.reviewChecks.reduce(
    (next, check) => confirmReviewCheck(next, reviewKey(check)),
    receipt,
  );
}

describe("native PDF invoice columns", () => {
  it("uses actual columns, preserves package text, discounts once and requires source review", () => {
    const output = readPdfText([page(grossRows())]);
    expect(
      output.receipt.items.map(
        ({ description, quantity, unitPrice, lineTotal }) => ({
          description,
          quantity,
          unitPrice,
          lineTotal,
        }),
      ),
    ).toEqual([
      {
        description: "Wooden spoons, pack of 100",
        quantity: "2",
        unitPrice: "3.43",
        lineTotal: "6.86",
      },
    ]);
    expect(
      output.receipt.adjustments.map(({ kind, amount }) => [kind, amount]),
    ).toEqual([["discount", "0.66"]]);
    expect(output.receipt.printedTotal).toBe("6.20");
    expect(output.receipt.currency).toBe("GBP");
    expect(calculateReceipt(output.receipt).issues.length).toBeGreaterThan(0);
    expect(calculateReceipt(checked(output.receipt)).issues).toEqual([]);
    expect(receiptSchema.safeParse(output.receipt).success).toBe(true);
    const evidence = collectReceiptEvidence(
      output.receipt,
      output.text,
      output.sources,
      output.sourceLines,
      output.recognition,
      [page(grossRows())],
    )!;
    expect(
      evidence.items[output.receipt.items[0].id].panels.length,
    ).toBeGreaterThan(0);
  });

  it("reads matching gross columns and a second-page net/tax summary without changing printed tax rounding", () => {
    const first = [
      label("Sold by Example Supplies Ltd"),
      label("Invoice # INV-42"),
      header(),
      ...Array.from({ length: 4 }, () =>
        purchase("Wooden spoons, pack of 100", "1", "£3.43", "£3.43"),
      ),
      adjustment(),
    ];
    const second: Row[] = [
      label("Invoice # INV-42"),
      label("Invoice total", "£13.06"),
      [
        ["VAT rate", 500, 50],
        ["Item subtotal (excl. VAT)", 620, 140],
        ["VAT subtotal", 820, 100],
      ],
      [
        ["20%", 500, 20],
        ["£10.90", 700, 50],
        ["£2.16", 900, 50],
      ],
      [
        ["Total", 500, 30],
        ["£10.90", 700, 50],
        ["£2.16", 900, 50],
      ],
      label("Corporate share capital EUR 37,500"),
    ];
    const output = readPdfText([page(first), page(second, 2)]);
    expect(output.receipt.items).toHaveLength(4);
    expect(output.receipt.currency).toBe("GBP");
    expect(output.receipt.printedTotal).toBe("13.06");
    expect(output.receipt.printedTax).toBe("2.16");
    expect(output.receipt.subtotal).toBe("");
    expect(output.receipt.pricesIncludeTax).toBe(true);
    expect(
      output.receipt.adjustments.filter((entry) => entry.kind === "tax"),
    ).toEqual([]);
    expect(calculateReceipt(checked(output.receipt)).issues).toEqual([]);
  });

  it("keeps printed unit/line discrepancies blocking even after every source check", () => {
    const rows: Row[] = [
      label("Example Supplies LTD"),
      header("none"),
      purchase("Table", "6", "7.11", "42.68"),
      label("Discount: 10.0000% Already Deducted"),
      purchase("Bench", "12", "2.22", "26.65"),
      label("Discount: 10.0000% Already Deducted"),
      label("Invoice subtotal", "GBP 69.33"),
      label("Total tax amount", "13.87"),
      label("Total amount", "83.20"),
    ];
    const output = readPdfText([page(rows)]);
    expect(output.receipt.pricesIncludeTax).toBe(false);
    expect(
      output.receipt.items.map((item) => [
        item.quantity,
        item.unitPrice,
        item.lineTotal,
      ]),
    ).toEqual([
      ["6", "7.11", "42.68"],
      ["12", "2.22", "26.65"],
    ]);
    expect(
      output.receipt.adjustments.map((entry) => [entry.kind, entry.amount]),
    ).toEqual([["tax", "13.87"]]);
    expect(
      calculateReceipt(checked(output.receipt)).issues.filter((issue) =>
        issue.path.startsWith("items."),
      ),
    ).toHaveLength(2);
  });

  it("preserves wrapped descriptions in the note instead of dropping overflow", () => {
    const long = "A".repeat(170),
      wrapped = "B".repeat(40);
    const rows = grossRows();
    rows[3] = purchase(long);
    rows.splice(4, 0, [[wrapped, 50, 200]]);
    const parsed = native([page(rows)])!;
    expect(parsed.receipt.items[0].description).toBe(long);
    expect(parsed.receipt.items[0].note).toContain(wrapped);
    expect(parsed.sources[parsed.receipt.items[0].id]).toHaveLength(3);
  });

  it.each(["1,000", "1.000", "-2", "two"])(
    "abstains on ambiguous or unsupported quantity %s",
    (quantity) => {
      const rows = grossRows();
      rows[3] = purchase("Spoons", quantity);
      expect(native([page(rows)])).toBeNull();
    },
  );

  it("does not interpret a dollar price as GBP", () => {
    const rows = grossRows();
    rows[3] = purchase("Spoons", "2", "$3.43", "$6.86");
    expect(native([page(rows)])).toBeNull();
  });
  it("accepts dollar signs only with explicit transaction currency", () => {
    const rows = grossRows();
    rows[3] = purchase("Spoons", "2", "$3.43", "$6.86");
    rows[4] = adjustment("Promotions", "-$0.66");
    rows[5] = label("Invoice total", "USD 6.20");
    expect(native([page(rows)])!.receipt.currency).toBe("USD");
  });
  it("keeps a selected/printed currency conflict pending", () => {
    const output = readPdfText([page(grossRows())], { currency: "USD" });
    expect(output.receipt.currencyUnresolved).toBe(true);
    expect(
      output.receipt.reviewChecks.some(
        (check) => check.field === "currency" && check.reason === "different",
      ),
    ).toBe(true);
  });

  it.each([
    [
      "conflicting qualified totals",
      (rows: Row[]) => rows.push(label("Grand total", "£99.00")),
    ],
    [
      "conflicting invoice IDs",
      (rows: Row[]) => rows.push(label("Invoice # INV-OTHER")),
    ],
    [
      "mixed transaction currencies",
      (rows: Row[]) => {
        rows[3] = purchase("Spoons", "2", "EUR 3.43", "EUR 6.86");
      },
    ],
    [
      "unknown monetary row",
      (rows: Row[]) => rows.splice(4, 0, adjustment("Other credits", "£1.00")),
    ],
    [
      "unqualified discounts",
      (rows: Row[]) => rows.splice(4, 0, label("Discount: 10%")),
    ],
    [
      "excess description",
      (rows: Row[]) => {
        rows[3] = purchase("A".repeat(451));
      },
    ],
  ] as const)("abstains on %s", (_name, mutate) => {
    const rows = grossRows();
    mutate(rows);
    expect(native([page(rows)])).toBeNull();
  });
  it("does not combine different PDF documents", () => {
    const first = page(grossRows()),
      second = page(grossRows(), 2);
    second.document!.id = "other";
    expect(native([first, second])).toBeNull();
  });
  it("requires the same printed invoice ID to join multiple pages", () => {
    const rows = grossRows().filter(
      (row) => !row[0][0].startsWith("Invoice #"),
    );
    expect(native([page(rows), page(rows, 2)])).toBeNull();
  });
  it("rejects contradictory inline and adjacent price-basis qualifiers", () => {
    const rows = grossRows();
    rows.splice(3, 0, [
      ["(excl. VAT)", 620, 140],
      ["(excl. VAT)", 820, 140],
    ]);
    expect(native([page(rows)])).toBeNull();
  });
  it("does not guess an unqualified price basis from a total alone", () => {
    const rows = grossRows();
    rows[2] = header("none");
    expect(native([page(rows)])).toBeNull();
  });
  it("does not mask conflicting net and tax summaries", () => {
    const rows = grossRows();
    rows.push(
      label("Invoice subtotal", "£5.00"),
      label("Net subtotal", "£5.01"),
      label("Total tax", "£1.20"),
    );
    expect(native([page(rows)])).toBeNull();
  });
  it("does not strip a conflicting currency from a separate VAT table", () => {
    const rows: Row[] = [
      ...grossRows(),
      [
        ["VAT rate", 500, 50],
        ["Net", 620, 100],
        ["VAT", 820, 100],
      ],
      [
        ["20%", 500, 20],
        ["EUR 5.20", 700, 50],
        ["EUR 1.00", 900, 50],
      ],
    ];
    expect(native([page(rows)])).toBeNull();
  });
  it("does not select a seller when multiple explicit sellers disagree", () => {
    const rows = grossRows();
    rows.push(label("Sold by Another Supplier Ltd"));
    expect(native([page(rows)])!.receipt.merchant).toBe("");
  });
  it.each([
    ["30 August 2024", "2024-08-30"],
    ["2024-08-30", "2024-08-30"],
    ["30/08/2024", "2024-08-30"],
    ["06.08.24", ""],
    ["06/08/2024", ""],
    ["31 February 2024", ""],
    ["2024-02-31", ""],
  ])(
    "only canonicalizes an unambiguous printed invoice date %s",
    (literal, expected) => {
      const rows = grossRows();
      rows.splice(
        1,
        0,
        label(`Invoice date: ${literal}`),
        label("Order date: 2024-08-29"),
      );
      expect(native([page(rows)])!.receipt.date).toBe(expected);
    },
  );
  it("requires native cells to reconstruct the original text rows exactly", () => {
    const image = page(grossRows());
    image.document!.text!.words![0].text = "another seller";
    expect(native([image])).toBeNull();
  });
  it("reads a shared invoice/delivery date without substituting an order date", () => {
    const rows = grossRows();
    rows.splice(
      1,
      0,
      label("Invoice date / Delivery date 30 August 2024"),
      label("Order date 29 August 2024"),
    );
    expect(native([page(rows)])!.receipt.date).toBe("2024-08-30");
  });
});
