import { describe, it, expect } from "vitest";
import {
  assembleRecognition,
  type Recognition,
} from "../src/lib/receipt-layout";
import { parseReceiptText } from "../src/lib/parser";

// Synthetic transaction references; no original member/payment identifiers.
const reference = "123456789012";
const chicken = ["KS ROTISS CHICKEN", "10533 1x 3.99 3.99 A"];
const cloths = [
  "SPONTEX CLOTHS 24P",
  "261109 1x 6.99 6.99 A",
  "SPONTEX CLOTHS 24P",
  "688580 1x 1.50 1.50-A",
];
const footer = (anchor = reference) => [
  "**** TOTAL(INCL VAT) £16.16",
  `Tran ID: ${anchor}....`,
  "VAT Code Excl Vat VAT",
  "A 20.00% 13.47 2.69",
  "**** TOTAL(EXCL VAT) 13.47",
  "VAT Amount 2.69",
];
const panel = (
  photo: number,
  texts: string[],
  start = 0.02,
  part = 1,
): Recognition["panels"][number] => ({
  photo,
  part,
  width: 900,
  height: 1600,
  words: [],
  lines: texts.map((text, i) => ({
    text,
    box: [0.2, start + i * 0.02, 0.8, start + i * 0.02 + 0.012],
    confidence: 0.98,
  })),
});
const full = () =>
  panel(1, ["COSTCO UK", ...chicken, ...chicken, ...cloths, ...footer()], 0.25);
const partial = () => panel(2, [...chicken, ...cloths, ...footer()]);
const run = (panels: Recognition["panels"]) =>
  assembleRecognition({ engine: "paddle-ppocrv6-medium-onnx", panels });
const items = (result: ReturnType<typeof run>) =>
  parseReceiptText(result.text).items;

describe("source-backed receipt overlap", () => {
  it("merges a matching footer and coupon while preserving both real chickens", () => {
    const source = {
      engine: "paddle-ppocrv6-medium-onnx" as const,
      panels: [full(), partial()],
    };
    const before = JSON.stringify(source);
    const result = assembleRecognition(source);
    expect(items(result)).toHaveLength(3);
    expect(
      items(result).filter((i) => i.description === chicken[0]),
    ).toHaveLength(2);
    expect(items(result).at(-1)?.discount).toBe("1.50");
    expect(result.overlaps).toMatchObject([
      { keptPhoto: 1, removedPhoto: 2, purchases: 2 },
    ]);
    expect(result.overlaps[0].regions).toHaveLength(6);
    expect(result.warnings.join(" ")).not.toContain(reference);
    expect(JSON.stringify(source)).toBe(before);
    expect(result.text).toContain("VAT Amount 2.69");
  });

  it("finds the larger source regardless of photo order", () => {
    const a = full(),
      b = partial();
    a.photo = 2;
    b.photo = 1;
    const result = run([b, a]);
    expect(items(result)).toHaveLength(3);
    expect(result.overlaps[0]).toMatchObject({ keptPhoto: 2, removedPhoto: 1 });
  });

  it("preserves every within-photo repetition", () => {
    const result = run([full()]);
    expect(items(result)).toHaveLength(3);
    expect(result.overlaps).toEqual([]);
  });

  it.each([
    [
      "missing reference",
      (p: ReturnType<typeof panel>) => {
        p.lines = p.lines.filter((l) => !l.text.startsWith("Tran ID"));
      },
    ],
    [
      "different transaction",
      (p: ReturnType<typeof panel>) => {
        p.lines.find((l) => l.text.startsWith("Tran ID"))!.text =
          "Tran ID: 987654321098....";
      },
    ],
    [
      "conflicting references",
      (p: ReturnType<typeof panel>) => {
        p.lines.push({
          text: "Tran ID: 987654321098....",
          box: [0.2, 0.8, 0.8, 0.82],
          confidence: 0.99,
        });
      },
    ],
    [
      "different purchased quantity",
      (p: ReturnType<typeof panel>) => {
        p.lines[1].text = "10533 2x 3.99 3.99 A";
      },
    ],
    [
      "different price",
      (p: ReturnType<typeof panel>) => {
        p.lines[1].text = "10533 1x 4.99 4.99 A";
      },
    ],
    [
      "different code",
      (p: ReturnType<typeof panel>) => {
        p.lines[1].text = "10533 1x 3.99 3.99 Z";
      },
    ],
    [
      "different coupon",
      (p: ReturnType<typeof panel>) => {
        p.lines[5].text = "688580 1x 1.00 1.00-A";
      },
    ],
    [
      "missing final total",
      (p: ReturnType<typeof panel>) => {
        p.lines = p.lines.filter((l) => !l.text.includes("TOTAL(INCL"));
      },
    ],
    [
      "unclear quantity",
      (p: ReturnType<typeof panel>) => {
        p.lines[1].text = "10533 Ix 3.99 3.99 A";
      },
    ],
    [
      "not near the upper edge",
      (p: ReturnType<typeof panel>) => {
        for (const l of p.lines) {
          l.box[1] += 0.3;
          l.box[3] += 0.3;
        }
      },
    ],
  ] as const)("keeps uncertain overlap: %s", (_name, change) => {
    const b = partial();
    change(b);
    const result = run([full(), b]);
    expect(result.overlaps).toEqual([]);
    expect(result.photos[1].lines).toHaveLength(b.lines.length);
  });

  it("does not use a single repeated SKU as overlap proof", () => {
    const a = panel(
      1,
      ["Costco UK", ...chicken, ...chicken, ...chicken, ...footer()],
      0.25,
    );
    const b = panel(2, [...chicken, ...chicken, ...footer()]);
    const result = run([a, b]);
    expect(result.overlaps).toEqual([]);
    expect(items(result)).toHaveLength(5);
  });

  it("does not modify other retailers based on coincidental row formats", () => {
    const a = full();
    a.lines[0].text = "Another Market UK";
    expect(run([a, partial()]).overlaps).toEqual([]);
  });

  it("keeps ambiguous alternative larger photos", () => {
    const a = full(),
      c = full();
    c.photo = 3;
    expect(run([a, partial(), c]).overlaps).toEqual([]);
  });

  it("joins exact detail windows with retained source parts", () => {
    const a = panel(1, ["A", "B", "C", "D"]);
    const b = panel(1, ["B", "C", "D", "E"], 0.02, 2);
    const result = run([a, b]);
    expect(result.text).toBe("A\nB\nC\nD\nE");
    expect(result.photos[0].lines.at(-1)?.part).toBe(2);
  });

  it("flags conflicting observed totals rather than concealing the disagreement", () => {
    const b = partial();
    b.lines.find((line) => line.text.includes("TOTAL(INCL"))!.text =
      "**** TOTAL(INCL VAT) £116.16";
    const result = run([full(), b]);
    expect(result.overlaps).toHaveLength(1);
    expect(result.text).toContain("£16.16");
    expect(result.text).toContain("£116.16");
    expect(parseReceiptText(result.text).warnings).toContainEqual(
      expect.stringMatching(/Different final totals/),
    );
  });
});
