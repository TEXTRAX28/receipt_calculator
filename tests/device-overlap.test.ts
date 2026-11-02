import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { joinDeviceRows } from "../src/lib/device-overlap";
import { joinDetailText } from "../src/lib/ocr";
import type { DeviceSourceRow } from "../src/lib/device-evidence";
import {
  planReadingWindows,
  planReadingPanels,
  paddedCorrectionFrame,
  type ReadingWindow,
} from "../src/lib/images";

const frame = (part: number, padded = false) => ({
  panel: { photo: 1, part, width: 1000, height: 1000, lines: [], words: [] },
  window: {
    sourceWidth: 1000,
    sourceHeight: 1800,
    bounds: [0, part === 1 ? 0 : 800 / 1800, 1, part === 1 ? 1000 / 1800 : 1],
    content: padded ? [0.01, 0.01, 0.99, 0.99] : [0, 0, 1, 1],
  } as ReadingWindow,
});
function row(
  text: string,
  part: number,
  y: number,
  padded = false,
): DeviceSourceRow {
  const encode = (n: number) => (padded ? 0.01 + (n / 1000) * 0.98 : n / 1000);
  return {
    text,
    source: {
      text,
      photo: 1,
      part,
      confidence: 0.99,
      box: [encode(100), encode(y), encode(800), encode(y + 30)],
    },
  };
}

describe("joining actual source areas in deterministic reading windows", () => {
  it("records actual tall-image section coordinates and corrected outside margins", () => {
    const sections = planReadingPanels(700, 4400),
      windows = planReadingWindows(700, 4400);
    expect(windows).toHaveLength(sections.length);
    windows.forEach((window, i) => {
      expect(window.bounds).toEqual([
        0,
        sections[i].top / 4400,
        1,
        (sections[i].top + sections[i].height) / 4400,
      ]);
      expect(window.content).toEqual([0, 0, 1, 1]);
    });
    const corrected = planReadingWindows(700, 4400, true),
      padding = paddedCorrectionFrame(
        sections[0].outputWidth,
        sections[0].outputHeight,
      );
    expect(corrected[0].content).toEqual([
      padding.left / padding.width,
      padding.top / padding.height,
      (padding.left + padding.contentWidth) / padding.width,
      (padding.top + padding.contentHeight) / padding.height,
    ]);
    expect(planReadingWindows(700, 1000)[0].bounds).toEqual([0, 0, 1, 1]);
  });
  it("retains the first differing reading and both real source areas without changing inputs", () => {
    const parts = [
      [row("Milk 1x 1.00 1.00", 1, 900)],
      [row("MiIk 1x 1.00 1.00", 2, 100)],
    ];
    const before = JSON.stringify(parts),
      joined = joinDeviceRows(parts, [frame(1), frame(2)]);
    expect(joined.rows).toHaveLength(1);
    expect(joined.rows[0].text).toBe("Milk 1x 1.00 1.00");
    expect(joined.rows[0].alternatives).toEqual([parts[1][0].source]);
    expect(joined.conflicts).toEqual([0]);
    expect(joined.dropped).toBe(1);
    expect(JSON.stringify(parts)).toBe(before);
  });
  it("preserves the entire original text assembly when any matched financial reading conflicts", () => {
    const parts = [
      [row("Milk 1x 1.00 1.00", 1, 900)],
      [row("Milk 1x 7.00 7.00", 2, 100), row("Bread", 2, 200)],
    ];
    const joined = joinDeviceRows(parts, [frame(1), frame(2)]);
    expect(joined.rows.map((r) => r.text)).toEqual(
      parts.flat().map((r) => r.text),
    );
    expect(joined.dropped).toBe(0);
    expect(joined.conflicts).toEqual([0, 1]);
    expect(joined.rows[0].alternatives).toEqual([parts[1][0].source]);
    expect(joined.rows[1].alternatives).toEqual([parts[0][0].source]);
  });
  it.each([
    ["Milk -2x 1.00 2.00", "Milk 2x 1.00 2.00"],
    ["Milk 2x −1.00 −2.00", "MiIk 2x 1.00 2.00"],
    ["Milk 2x 1.00 2.00 A", "MiIk 2x 1.00 2.00 Z"],
  ])("never drops a sign or tax-code conflict (%s / %s)", (a, b) => {
    const joined = joinDeviceRows(
      [[row(a, 1, 900)], [row(b, 2, 100)]],
      [frame(1), frame(2)],
    );
    expect(joined.rows.map((r) => r.text)).toEqual([a, b]);
    expect(joined.conflicts).toEqual([0, 1]);
    expect(joined.dropped).toBe(0);
  });
  it("keeps genuinely separate identical purchases and never matches within one section", () => {
    const first = row("Milk", 1, 900),
      second = row("Milk", 1, 950);
    const joined = joinDeviceRows(
      [
        [first, second],
        [row("Milk", 2, 100), row("Milk", 2, 150)],
      ],
      [frame(1), frame(2)],
    );
    expect(joined.rows).toHaveLength(2);
    expect(joined.rows.map((r) => r.source!.box[1])).toEqual([0.9, 0.95]);
    expect(joinDeviceRows([[first, second]], [frame(1)]).rows).toHaveLength(2);
  });
  it("does not join identical text at different printed positions or across photos", () => {
    expect(
      joinDeviceRows(
        [[row("Milk", 1, 900)], [row("Milk", 2, 150)]],
        [frame(1), frame(2)],
      ).rows,
    ).toHaveLength(2);
    const other = row("Milk", 2, 100);
    other.source!.photo = 2;
    const otherFrame = frame(2);
    otherFrame.panel.photo = 2;
    expect(
      joinDeviceRows([[row("Milk", 1, 900)], [other]], [frame(1), otherFrame])
        .rows,
    ).toHaveLength(2);
  });
  it("withholds clipped/boundary and ambiguous one-to-many matches", () => {
    expect(
      joinDeviceRows(
        [[row("Milk", 1, 800)], [row("Milk", 2, 0)]],
        [frame(1), frame(2)],
      ).rows,
    ).toHaveLength(2);
    const joined = joinDeviceRows(
      [[row("Milk", 1, 900)], [row("Milk", 2, 100), row("Mi1k", 2, 101)]],
      [frame(1), frame(2)],
    );
    expect(joined.rows).toHaveLength(3);
    expect(joined.dropped).toBe(0);
  });
  it("maps corrected-image white margins before comparing positions", () => {
    const joined = joinDeviceRows(
      [[row("Milk", 1, 900, true)], [row("MiIk", 2, 100, true)]],
      [frame(1, true), frame(2, true)],
    );
    expect(joined.rows).toHaveLength(1);
    expect(joined.conflicts).toEqual([0]);
  });
  it("retains legacy exact overlap when preparation metadata is unavailable", () => {
    const parts = [
      ["A", "B", "C"],
      ["A", "B", "C", "D"],
    ].map((p) => p.map((text) => ({ text, source: null })));
    const result = joinDeviceRows(parts, []);
    expect(result.rows.map((r) => r.text)).toEqual(["A", "B", "C", "D"]);
    expect(result.spatial).toBe(false);
  });
});

// Frozen pre-change join, so fallback text compatibility is checked independently.
function oldJoin(parts: string[]) {
  let joined: string[] = [];
  const key = (line: string) => line.toUpperCase().replace(/\s+/g, "");
  for (const text of parts) {
    const next = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    let overlap = 0;
    for (
      let count = Math.min(200, joined.length, next.length);
      count >= 3;
      count--
    ) {
      const tail = joined.slice(-count).map(key);
      if (
        new Set(tail).size >= 3 &&
        tail.every((line, i) => line === key(next[i]))
      ) {
        overlap = count;
        break;
      }
    }
    joined = [...joined, ...next.slice(overlap)];
  }
  return joined.join("\n");
}
it("preserves the frozen text-only join over varied repeated and whitespace rows", () => {
  fc.assert(
    fc.property(
      fc.array(
        fc.array(
          fc.constantFrom(
            "Milk",
            "milk",
            " A ",
            "B",
            "C",
            "1.00",
            "",
            " ",
            "two words",
            "twowords",
          ),
          { maxLength: 30 },
        ),
        { maxLength: 8 },
      ),
      (parts) => {
        const text = parts.map((lines) => lines.join("\r\n"));
        expect(joinDetailText(text)).toBe(oldJoin(text));
      },
    ),
    { numRuns: 300, seed: 20261102 },
  );
});
