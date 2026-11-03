import type { Recognition } from "../../src/lib/receipt-layout";

// Synthetic slanted words: a final-total amount shares an OCR line with a SKU.
export function finalTotalFixture() {
  type Word = Recognition["panels"][number]["words"][number];
  const word = (
    text: string,
    x0: number,
    x1: number,
    y: number,
    h = 0.02,
  ): Word => ({ text, confidence: 0.99, box: [x0, y - h / 2, x1, y + h / 2] });
  const paid = (y: number) => [
    word("12345", 0.18, 0.34, y),
    word("1x", 0.42, 0.48, y - 0.006),
    word("4.50", 0.55, 0.65, y - 0.015),
    word("4.50 A", 0.75, 0.9, y - 0.022),
  ];
  const first = paid(0.344),
    second = paid(0.4);
  const amount = word("10.80", 0.75, 0.88, 0.397, 0.019);
  const heading = word("**** TOTAL( INCL VAT)", 0.17, 0.6, 0.412, 0.03);
  const groups = [
    [word("COSTCO GBP", 0.2, 0.5, 0.1)],
    [word("Roasted cashews", 0.22, 0.6, 0.3), first[3]],
    first.slice(0, 3),
    [word("Roasted cashews", 0.22, 0.6, 0.37), second[2], second[3]],
    [second[0], second[1], amount],
    [heading],
    [word("PLEASE KEEP THIS FOR YOUR RECORDS", 0.1, 0.85, 0.46)],
    [word("A 20.00% 9.00 1.80", 0.1, 0.85, 0.53)],
  ];
  const panel = {
    photo: 1,
    part: 1,
    width: 1000,
    height: 1600,
    words: groups.flat(),
    lines: groups.map((words) => ({
      text: words.map((w) => w.text).join(" "),
      confidence: Math.min(...words.map((w) => w.confidence)),
      box: [
        Math.min(...words.map((w) => w.box[0])),
        Math.min(...words.map((w) => w.box[1])),
        Math.max(...words.map((w) => w.box[2])),
        Math.max(...words.map((w) => w.box[3])),
      ] as [number, number, number, number],
    })),
  };
  const recognition: Recognition = {
    engine: "paddle-ppocrv6-medium-onnx",
    panels: [panel],
  };
  const packet = () => ({
    text: panel.lines.map((l) => l.text).join("\n"),
    recognition,
    sourceLines: panel.lines.map((l) => ({
      ...l,
      photo: panel.photo,
      part: panel.part,
    })),
  });
  const item = () => ({
    description: "Roasted cashews",
    quantity: "1",
    unitPrice: "4.50",
    lineTotal: "4.50",
    taxCode: "A",
    discount: "0",
    note: "",
    sourcePhotos: [1],
  });
  const draft = {
    merchant: "Costco",
    date: "",
    currency: "GBP" as const,
    subtotal: "9.00",
    printedTax: "1.80",
    printedTotal: "10.80",
    pricesIncludeTax: false,
    printedItemCount: 2,
    taxCodes: [{ code: "A", rate: "20" }],
    adjustments: [],
    warnings: [],
    items: [
      item(),
      item(),
      {
        ...item(),
        description: "TOTAL (INCL VAT)",
        quantity: "",
        unitPrice: "",
        lineTotal: "10.80",
        taxCode: "",
      },
    ],
  };
  const sync = () => {
    panel.lines[4].text = [second[0], second[1], amount]
      .map((w) => w.text)
      .join(" ");
    panel.lines[5].text = heading.text;
  };
  return {
    recognition,
    panel,
    packet,
    draft,
    first,
    second,
    amount,
    heading,
    sync,
  };
}
