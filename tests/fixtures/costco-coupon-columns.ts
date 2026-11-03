import type { Recognition } from "../../src/lib/receipt-layout";

// Literal synthetic OCR fragments and independent responses, not OCR-accuracy evidence.
export function couponColumnFixture() {
  type Word = Recognition["panels"][number]["words"][number];
  const word = (text: string, x0: number, x1: number, y: number): Word => ({
    text,
    confidence: 0.99,
    box: [x0, y - 0.01, x1, y + 0.01],
  });
  const numeric = (sku: string, amount: string, code: string, y: number) => {
    const at = (x: number) => y - 0.02 * (x - 0.25);
    return [
      word(sku, 0.15, 0.3, at(0.225)),
      word("1x", 0.42, 0.47, at(0.445)),
      word(amount, 0.56, 0.65, at(0.605)),
      word(amount + code, 0.78, 0.9, at(0.84)),
    ];
  };
  const label = (text: string, y: number) => word(text, 0.25, 0.62, y);
  const paid = numeric("11111", "14.99", " A", 0.16),
    coupon = numeric("22222", "5.00", "-A", 0.202);
  const eggs = numeric("33333", "3.99", " Z", 0.275),
    eggCoupon = numeric("44444", "1.00", "-Z", 0.325);
  const inlineName = label("IRC CANVAS BACKPACK", 0.19),
    eggName = label("Duck eggs", 0.25),
    eggCouponName = label("IRC DUCK EGGS", 0.305);
  const groups: Word[][] = [
    [label("COSTCO GBP", 0.06)],
    [label("Canvas backpack", 0.12)],
    paid,
    [coupon[0], inlineName, ...coupon.slice(1)],
    [eggName, eggs[3]],
    eggs.slice(0, 3),
    [eggCouponName, eggCoupon[3]],
    eggCoupon.slice(0, 3),
    [label("TOTAL(INCL VAT) GBP 14.98", 0.4)],
    [label("VAT Code Excl Vat VAT", 0.45)],
    [label("A 20.00% 9.99 2.00", 0.5)],
    [label("Z 0.00% 2.99 0.00", 0.55)],
    [label("TOTAL(EXCL VAT) 12.98", 0.6)],
    [label("VAT Amount 2.00", 0.65)],
  ];
  const panel = {
    photo: 1,
    part: 1,
    width: 1000,
    height: 1600,
    words: groups.flat(),
    lines: groups.map((words) => ({
      text: words.map((word) => word.text).join(" "),
      confidence: Math.min(...words.map((word) => word.confidence)),
      box: [
        Math.min(...words.map((word) => word.box[0])),
        Math.min(...words.map((word) => word.box[1])),
        Math.max(...words.map((word) => word.box[2])),
        Math.max(...words.map((word) => word.box[3])),
      ] as [number, number, number, number],
    })),
  };
  const recognition: Recognition = {
    engine: "paddle-ppocrv6-medium-onnx",
    panels: [panel],
  };
  const packet = () => ({
    text: panel.lines.map((line) => line.text).join("\n"),
    recognition,
    sourceLines: panel.lines.map((line) => ({ ...line, photo: 1, part: 1 })),
  });
  const item = (description: string, amount: string, taxCode: string) => ({
    description,
    quantity: "1",
    unitPrice: amount,
    lineTotal: amount,
    taxCode,
    discount: "0",
    note: "",
    sourcePhotos: [1],
  });
  const draft = {
    merchant: "Costco",
    date: "",
    currency: "GBP" as const,
    subtotal: "12.98",
    printedTax: "2.00",
    printedTotal: "14.98",
    pricesIncludeTax: false,
    printedItemCount: 4,
    taxCodes: [
      { code: "A", rate: "20" },
      { code: "Z", rate: "0" },
    ],
    adjustments: [],
    warnings: [],
    items: [
      item("Canvas backpack", "14.99", "A"),
      item("IRC CANVAS BACKPACK", "5.00", "A"),
      item("Duck eggs", "3.99", "Z"),
      item("IRC DUCK EGGS", "1.00", "Z"),
    ],
  };
  return {
    recognition,
    panel,
    packet,
    draft,
    paid,
    coupon,
    eggs,
    eggCoupon,
    inlineName,
    eggName,
    eggCouponName,
  };
}
