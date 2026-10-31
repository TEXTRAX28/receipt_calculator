import { describe, it, expect } from "vitest";
import {
  assembleRecognition,
  type Recognition,
} from "../src/lib/receipt-layout";
import { parseReceiptWithSources } from "../src/lib/parser";
import {
  collectReceiptEvidence,
  sourceViewport,
} from "../src/lib/receipt-evidence";
import type { ReceiptImage } from "../src/lib/images";

// Synthetic layout/provenance fixtures. These tests do not perform OCR.
const reference = "123456789012";
const chicken = ["KS ROTISS CHICKEN", "10533 1x 3.99 3.99 A"];
const cloths = [
  "SPONTEX CLOTHS 24P",
  "261109 1x 6.99 6.99 A",
  "SPONTEX CLOTHS 24P",
  "688580 1x 1.50 1.50-A",
];
const footer = [
  "**** TOTAL(INCL VAT) £16.16",
  `Tran ID: ${reference}....`,
  "A 20.00% 13.47 2.69",
];
const panel = (
  photo: number,
  texts: string[],
  start: number,
): Recognition["panels"][number] => ({
  photo,
  part: 1,
  width: 900,
  height: 1600,
  words: [],
  lines: texts.map((text, index) => ({
    text,
    confidence: 0.98,
    box: [0.2, start + index * 0.025, 0.8, start + index * 0.025 + 0.015],
  })),
});
const input = (): Recognition => ({
  engine: "paddle-ppocrv6-medium-onnx",
  panels: [
    panel(1, ["COSTCO UK", ...chicken, ...chicken, ...cloths, ...footer], 0.25),
    panel(2, [...chicken, ...cloths, ...footer], 0.02),
  ],
});
const images = (): ReceiptImage[] =>
  [1, 2].map((id) => ({
    id: `photo-${id}`,
    name: "Synthetic fixture",
    url: "",
    blob: new Blob(["synthetic geometry fixture"]),
  }));
function read(recognition = input(), photos = images()) {
  const assembly = assembleRecognition(recognition);
  const parsed = parseReceiptWithSources(assembly.text);
  const evidence = collectReceiptEvidence(
    parsed.receipt,
    assembly.text,
    parsed.sources,
    assembly.sourceLines,
    recognition,
    photos,
  )!;
  return { ...parsed, assembly, evidence, photos };
}

describe("source areas for parsed purchases", () => {
  it("keeps separate source positions for identical purchased chickens", () => {
    const { receipt, evidence } = read();
    expect(receipt.items).toHaveLength(3);
    const [first, second] = receipt.items.map(
      (item) => evidence.items[item.id],
    );
    expect(first.panels[0].regions.map((r) => r.text)).toEqual(chicken);
    expect(second.panels[0].regions.map((r) => r.text)).toEqual(chicken);
    expect(first.panels[0].regions[0].box).not.toEqual(
      second.panels[0].regions[0].box,
    );
  });

  it("includes attached coupon rows, without using the removed footer copy", () => {
    const { receipt, evidence, photos } = read();
    const cloth = receipt.items[2];
    expect(cloth.discount).toBe("1.50");
    expect(evidence.items[cloth.id].panels).toHaveLength(1);
    const source = evidence.items[cloth.id].panels[0];
    expect(source.photo).toBe(1);
    expect(source.blob).toBe(photos[0].blob);
    expect(source.regions.map((r) => r.text)).toEqual(cloths);
    expect(JSON.stringify(evidence)).not.toContain(reference);
  });

  it("flags a low-scoring price word even when the row score is high", () => {
    const recognition = input();
    recognition.panels[0].words = [
      { text: "3.99", confidence: 0.4, box: [0.6, 0.303, 0.7, 0.311] },
      { text: "unrelated", confidence: 0.1, box: [0.6, 0.01, 0.7, 0.02] },
    ];
    const { receipt, evidence } = read(recognition);
    expect(evidence.items[receipt.items[0].id].panels[0].unclear).toBe(true);
    expect(evidence.items[receipt.items[1].id].panels[0].unclear).toBe(false);
  });

  it("refuses misaligned text rather than highlighting a guessed row", () => {
    const { receipt, sources, assembly, photos } = read();
    expect(
      collectReceiptEvidence(
        receipt,
        "unrelated text",
        sources,
        assembly.sourceLines,
        input(),
        photos,
      ),
    ).toBeNull();
  });

  it("does not retain a source button when its photo is unavailable", () => {
    const { receipt, evidence } = read(input(), []);
    expect(receipt.items).toHaveLength(3);
    expect(evidence.items).toEqual({});
  });

  it("keeps the context viewport inside actual panel pixels and rejects empty regions", () => {
    const { receipt, evidence } = read();
    const source = evidence.items[receipt.items[2].id].panels[0];
    const box = sourceViewport(source);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(source.width);
    expect(box.y + box.height).toBeLessThanOrEqual(source.height);
    expect(box.height).toBeGreaterThan(0);
    expect(() => sourceViewport({ ...source, regions: [] })).toThrow();
  });
});
