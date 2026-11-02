import { describe, expect, it } from "vitest";
import {
  devicePanel,
  deviceRecognition,
  DEVICE_OCR_ENGINE,
} from "../src/lib/device-evidence";
import { recognitionSchema } from "../src/lib/recognition-schema.mjs";
import { joinOcrRows } from "../src/lib/ocr-lines";

function line(text: string, y = 20, confidence = 95) {
  let x = 10;
  const words = text
    .trim()
    .split(/\s+/)
    .map((text) => {
      const x0 = x;
      x += text.length * 8 + 8;
      return { text, confidence, bbox: { x0, y0: y, x1: x - 8, y1: y + 20 } };
    });
  return {
    text: text + "\n",
    confidence,
    bbox: { x0: 10, y0: y, x1: x, y1: y + 20 },
    words,
  };
}
const page = (...lines: ReturnType<typeof line>[]) => ({
  blocks: [{ paragraphs: [{ lines }] }],
});
const read = (data: unknown, text: string, photo = 1, part = 1) =>
  devicePanel(data, text, 1000, 1200, photo, part);

describe("actual on-device SDK geometry", () => {
  it("normalizes real percentage scores and pixel boxes while preserving page text spacing", () => {
    const data = page(line("Milk 1x 2.50 2.50"), line("TOTAL GBP 2.50", 80));
    data.blocks[0].paragraphs[0].lines[0].words[0].confidence = 0;
    const before = JSON.stringify(data),
      result = read(data, "Milk  1x 2.50 2.50\nTOTAL GBP 2.50", 2, 3);
    expect(result.complete).toBe(true);
    expect(result.panel!.words[0].confidence).toBe(0);
    expect(result.panel!.lines[0].confidence).toBe(0.95);
    expect(result.rows[0].source).toMatchObject({
      photo: 2,
      part: 3,
      text: "Milk  1x 2.50 2.50",
      box: [0.01, 20 / 1200, 0.154, 40 / 1200],
    });
    expect(JSON.stringify(data)).toBe(before);
    expect(deviceRecognition([result.panel!])!.engine).toBe(DEVICE_OCR_ENGINE);
  });
  it("does not widen the server-side reader engine schema", () => {
    const result = read(page(line("Milk")), "Milk");
    expect(
      recognitionSchema.safeParse({
        engine: DEVICE_OCR_ENGINE,
        panels: [result.panel],
      }).success,
    ).toBe(false);
  });
  it("preserves separate identical printed rows with their actual ordered boxes", () => {
    const result = read(
      page(line("Milk 1x 2.50 2.50", 20), line("Milk 1x 2.50 2.50", 80)),
      "Milk 1x 2.50 2.50\nMilk 1x 2.50 2.50",
    );
    expect(result.complete).toBe(true);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].source!.box[1]).toBe(20 / 1200);
    expect(result.rows[1].source!.box[1]).toBe(80 / 1200);
  });
  it("withholds ambiguous repeated lines while keeping unique exact evidence", () => {
    const result = read(page(line("Tea"), line("Milk", 80)), "Tea\nMilk\nTea");
    expect(result.complete).toBe(false);
    expect(result.rows.map((row) => !!row.source)).toEqual([
      false,
      true,
      false,
    ]);
  });
  it("does not substitute numeric or case differences from layout into the recognized text", () => {
    const result = read(page(line("MILK 1x 2.50 2.60")), "Milk 1x 2.50 2.50");
    expect(result.rows[0]).toEqual({ text: "Milk 1x 2.50 2.50", source: null });
  });
  it("ignores circular SDK parent links without mutating or serializing them", () => {
    const data = page(line("Milk"));
    Object.assign(data.blocks[0], { page: data });
    expect(read(data, "Milk").complete).toBe(true);
  });
  it.each([
    null,
    undefined,
    {},
    { blocks: null },
    { blocks: [{ paragraphs: null }] },
  ])(
    "keeps text and omits invented regions for missing layouts (%j)",
    (data) => {
      const result = read(data, "Milk");
      expect(result.complete).toBe(false);
      expect(result.rows).toEqual([{ text: "Milk", source: null }]);
      expect(result.panel!.lines).toEqual([]);
      expect(result.panel!.words).toEqual([]);
    },
  );
  it.each([
    { confidence: -1 },
    { confidence: 101 },
    { confidence: NaN },
    { confidence: undefined },
    { bbox: { x0: -1, y0: 0, x1: 40, y1: 20 } },
    { bbox: { x0: 10, y0: 0, x1: 10, y1: 20 } },
    { bbox: { x0: 0, y0: 0, x1: 1001, y1: 20 } },
    { bbox: { x0: 0, y0: 0, x1: Infinity, y1: 20 } },
  ])(
    "rejects malformed scores/coordinates without losing plain text (%j)",
    (change) => {
      const source = line("Milk");
      Object.assign(source.words[0], change);
      const result = read(page(source), "Milk");
      expect(result.rows[0].source).toBeNull();
      expect(result.panel!.words).toEqual([]);
    },
  );
  it("withholds inconsistent word text and words outside the reported source line", () => {
    const source = line("Milk");
    source.words[0].text = "Bread";
    expect(read(page(source), "Milk").complete).toBe(false);
    source.words[0].text = "Milk";
    source.words[0].bbox.y0 = 100;
    source.words[0].bbox.y1 = 120;
    expect(read(page(source), "Milk").complete).toBe(false);
  });
  it("withholds a malformed row while retaining independent valid source rows", () => {
    const malformed = line("Bread", 80);
    malformed.words[0].confidence = NaN;
    const result = read(page(line("Milk"), malformed), "Milk\nBread");
    expect(result.complete).toBe(false);
    expect(result.rows.map((r) => !!r.source)).toEqual([true, false]);
    expect(result.panel!.lines.map((r) => r.text)).toEqual(["Milk"]);
    expect(result.panel!.words.map((r) => r.text)).toEqual(["Milk"]);
  });
  it("bounds structural containers, output regions and image dimensions", () => {
    expect(
      read({ blocks: Array(2001).fill({ paragraphs: [] }) }, "Milk").panel!
        .lines,
    ).toEqual([]);
    expect(
      devicePanel(page(line("Milk")), "Milk", 4001, 1000, 1, 1).panel,
    ).toBeUndefined();
    expect(
      devicePanel(page(line("Milk")), "Milk", 3000, 3000, 1, 1).panel,
    ).toBeUndefined();
    expect(
      read(
        page({
          ...line("Milk"),
          words: Array(10001).fill(line("Milk").words[0]),
        }),
        "Milk",
      ).panel!.words,
    ).toEqual([]);
  });
  it("joins text and provenance at the same existing overlap, preserving photograph identity", () => {
    const first = read(
      page(line("A"), line("B", 50), line("C", 80)),
      "A\nB\nC",
      1,
      1,
    );
    const second = read(
      page(line("A"), line("B", 50), line("C", 80), line("D", 110)),
      "A\nB\nC\nD",
      1,
      2,
    );
    const joined = joinOcrRows([first.rows, second.rows]);
    expect(joined.map((row) => row.text)).toEqual(["A", "B", "C", "D"]);
    expect(joined.map((row) => row.source!.part)).toEqual([1, 1, 1, 2]);
  });
});
