import { describe, expect, it } from "vitest";
import fixture from "./fixtures/paddle-synthetic.json";
import { paddlePanel } from "../src/lib/paddle-layout";

const make = (text: string, x: number, y: number) => ({
  text,
  score: 0.9,
  poly: [
    [x, y],
    [x + 50, y],
    [x + 50, y + 15],
    [x, y + 15],
  ],
});
describe("actual browser Paddle geometry", () => {
  it("retains actual synthetic SDK fragments, scores and rectangles without fake words", () => {
    const panel = paddlePanel(fixture.reading, 700, 600, 1, 1);
    expect(panel.words).toHaveLength(6);
    expect(panel.lines.map((r) => r.text)).toEqual(
      fixture.reading[0].items.map((r) => r.text),
    );
    expect(panel.words[0].confidence).toBe(fixture.reading[0].items[0].score);
    expect(panel.words[0].box[0]).toBe(
      Math.min(...fixture.reading[0].items[0].poly.map((p) => p[0])) / 700,
    );
    expect(panel).not.toHaveProperty("wordRows");
  });
  it("joins actual fragments geometrically in reading order and preserves genuine repeated rows", () => {
    const input = [
      {
        image: { width: 700, height: 600 },
        items: [
          make("2.50", 300, 30),
          make("Milk", 30, 30),
          make("Milk", 30, 70),
          make("2.50", 300, 70),
        ],
      },
    ];
    const panel = paddlePanel(input, 700, 600, 1, 1);
    expect(panel.lines.map((r) => r.text)).toEqual(["Milk 2.50", "Milk 2.50"]);
    expect(panel.words).toHaveLength(4);
  });
  it("does not repair price-like OCR substitutions", () => {
    const panel = paddlePanel(
      [
        {
          image: { width: 700, height: 600 },
          items: [make("TOTAL GBP 6.OO", 30, 30)],
        },
      ],
      700,
      600,
      1,
      1,
    );
    expect(panel.lines[0].text).toBe("TOTAL GBP 6.OO");
  });
  it.each([NaN, Infinity, -1, 1.01])("rejects invalid score %s", (score) => {
    const reading = structuredClone(fixture.reading);
    reading[0].items[0].score = score;
    expect(() => paddlePanel(reading, 700, 600, 1, 1)).toThrow();
  });
  it("rejects mismatched dimensions, outside boxes and malformed output", () => {
    expect(() => paddlePanel(fixture.reading, 701, 600, 1, 1)).toThrow();
    expect(() => paddlePanel([], 700, 600, 1, 1)).toThrow();
    expect(() =>
      paddlePanel(
        [{ image: { width: 700, height: 600 }, items: [make("bad", 900, 30)] }],
        700,
        600,
        1,
        1,
      ),
    ).toThrow();
    expect(() =>
      paddlePanel(
        [{ image: { width: 2001, height: 2000 }, items: [] }],
        2001,
        2000,
        1,
        1,
      ),
    ).toThrow();
    const reading = structuredClone(fixture.reading);
    reading[0].items[0].poly[0][0] = Infinity;
    expect(() => paddlePanel(reading, 700, 600, 1, 1)).toThrow();
  });
  it("bounds detections before quadratic geometry grouping", () => {
    expect(() =>
      paddlePanel(
        [
          {
            image: { width: 700, height: 600 },
            items: Array.from({ length: 2001 }, () => make("Milk", 30, 30)),
          },
        ],
        700,
        600,
        1,
        1,
      ),
    ).toThrow();
  });
});
