import { describe, expect, it } from "vitest";
import { joinWindowRows } from "../src/lib/window-overlap";
import type { ReadingWindow } from "../src/lib/images";
import type { SourceRecognition } from "../src/lib/receipt-layout";
import { assembleRecognition } from "../src/lib/receipt-layout";
import { parseReceiptWithSources } from "../src/lib/parser";
import { reviewDeviceReading } from "../src/lib/device-review";
import { calculateReceipt } from "../src/lib/engine";

const windows: ReadingWindow[] = [0, 800].map((top) => ({
  sourceWidth: 1000,
  sourceHeight: 1800,
  bounds: [0, top / 1800, 1, (top + 1000) / 1800],
  content: [0, 0, 1, 1],
}));
function panel(
  part: number,
  rows: [string, number][],
): SourceRecognition["panels"][number] {
  return {
    photo: 1,
    part,
    width: 1000,
    height: 1000,
    words: [],
    lines: rows.map(([text, y]) => ({
      text,
      confidence: 0.99,
      box: [
        0.1,
        (y - (part - 1) * 800) / 1000,
        0.8,
        (y + 20 - (part - 1) * 800) / 1000,
      ],
    })),
  };
}
const common: [string, number][] = [
  ["Rice 1x 2.00 2.00", 820],
  ["Milk 1x 3.00 3.00", 860],
  ["Milk 1x 3.00 3.00", 900],
  ["Bread 1x 4.00 4.00", 940],
  ["Tea 1x 1.00 1.00", 980],
];
const baseline = () => [
  panel(1, [["Soup 1x 5.00 5.00", 600], ...common]),
  panel(2, [...common, ["TOTAL 18.00", 1100]]),
];

describe("complete joins in known preparation windows", () => {
  it.each([1, 2])(
    "does not hide a disputed purchase in photo %s through cross-photo footer matching",
    (disputedPhoto) => {
      const tail: [string, number][] = [
        ["BREAD", 120],
        ["200 1x 2.00 2.00 A", 140],
        ["TEA", 160],
        ["300 1x 3.00 3.00 A", 180],
        ["**** TOTAL(INCL VAT) £6.00", 220],
        ["Tran ID: 123456789012....", 240],
      ];
      const rows: [string, number][][] = [
        [["APPLES", 40], ["100 1x 1.00 1.00 A", 60], ...tail],
        tail,
      ];
      const panels = rows.flatMap((entries, i) => {
        const first = { ...panel(1, entries), photo: i + 1 };
        if (i + 1 !== disputedPhoto) return [first];
        const second = {
          ...panel(
            1,
            entries.filter(([, y]) => y >= 100),
          ),
          photo: i + 1,
          part: 2,
        };
        second.lines.forEach((line) => {
          line.box[1] -= 0.1;
          line.box[3] -= 0.1;
        });
        return [first, second];
      });
      const prepared: ReadingWindow[] = [0, 100].map((top) => ({
        sourceWidth: 1000,
        sourceHeight: 1100,
        bounds: [0, top / 1100, 1, (top + 1000) / 1100],
        content: [0, 0, 1, 1],
      }));
      const metadata = [1, 2].map((photo) =>
        photo === disputedPhoto ? prepared : undefined,
      );
      const recognition: SourceRecognition = {
        engine: "paddle-ppocrv6-tiny-browser-wasm",
        panels,
      };
      const clean = assembleRecognition(recognition, metadata);
      expect(clean.overlaps).toHaveLength(1);
      expect(
        parseReceiptWithSources(clean, { currency: "GBP" }).receipt.items,
      ).toHaveLength(3);
      panels
        .find((p) => p.photo === disputedPhoto && p.part === 2)!
        .lines.find((line) => line.text.startsWith("200 "))!.text =
        "200 1x 9.00 9.00 A";
      const disputed = assembleRecognition(recognition, metadata);
      expect(disputed.overlaps).toEqual([]);
      expect(
        parseReceiptWithSources(disputed, { currency: "GBP" }).receipt.items,
      ).toHaveLength(5);
      expect(disputed.sourceConflicts).toHaveLength(1);
      expect(Object.values(disputed.sourceAlternatives!).flat()).toContainEqual(
        expect.objectContaining({
          text: "200 1x 9.00 9.00 A",
          photo: disputedPhoto,
          part: 2,
        }),
      );
    },
  );
  it("maps a conflicting price to its real source check even when the selected total balances", () => {
    const panels = baseline();
    panels[0].lines.unshift(
      ...panel(1, [
        ["LITTLE MARKET", 100],
        ["Currency GBP", 200],
      ]).lines,
    );
    panels[1].lines[2].text = "Milk 1x 9.00 9.00";
    panels[1].lines[5].text = "TOTAL 24.00";
    panels[1].lines.push(...panel(2, [["PRICES INCLUDE TAX", 1200]]).lines);
    for (const p of panels) p.words = p.lines.map((r) => ({ ...r }));
    const recognition: SourceRecognition = {
      engine: "paddle-ppocrv6-tiny-browser-wasm",
      panels,
    };
    const output = assembleRecognition(recognition, [windows]);
    const parsed = parseReceiptWithSources(
      { ...output, recognition },
      { currency: "GBP" },
    );
    const receipt = reviewDeviceReading(
      parsed.receipt,
      parsed.sources,
      output.sourceLines,
      recognition,
      parsed.fieldSources,
      output.sourceConflicts,
      output.joinedSectionRows,
    );
    const changed = receipt.items.find((i) => i.lineTotal === "9.00")!;
    expect(changed).toBeDefined();
    expect(calculateReceipt(receipt).discrepancy).toBe(0n);
    expect(receipt.reviewChecks).toContainEqual(
      expect.objectContaining({
        scope: "item",
        itemId: changed.id,
        field: "lineTotal",
        confirmedValue: "",
      }),
    );
    const source = parsed.sources[changed.id].find((i) =>
      output.sourceConflicts?.includes(i),
    )!;
    expect(output.sourceLines[source]?.text).toBe("Milk 1x 9.00 9.00");
    expect(output.sourceAlternatives?.[source]).toContainEqual(
      expect.objectContaining({
        text: "Milk 1x 3.00 3.00",
        photo: 1,
        part: 1,
      }),
    );
    expect(calculateReceipt(receipt).issues.length).toBeGreaterThan(0);
  });
  it("keeps both genuinely repeated purchases and every actual alternate region", () => {
    const panels = baseline(),
      before = JSON.stringify(panels);
    const result = joinWindowRows(panels, windows)!;
    expect(result.dropped).toBe(5);
    expect(result.rows).toHaveLength(7);
    expect(
      result.rows.filter((r) => r.source.text.startsWith("Milk")),
    ).toHaveLength(2);
    expect(result.rows.filter((r) => r.alternatives.length)).toHaveLength(5);
    expect(result.rows.every((r) => !r.conflict)).toBe(true);
    expect(JSON.stringify(panels)).toBe(before);
  });
  it.each(["Milk 1x 9.00 9.00", "Milk 1x -3.00 -3.00", "Milk 1x 3.00 3.00 Z"])(
    "keeps both literal readings and flags a disagreement: %s",
    (different) => {
      const panels = baseline();
      panels[1].lines[2].text = different;
      const result = joinWindowRows(panels, windows)!;
      expect(result.rows).toHaveLength(7);
      const row = result.rows.find((r) => r.conflict)!;
      expect(row).toBeDefined();
      expect(
        [row.source.text, ...row.alternatives.map((r) => r.text)].sort(),
      ).toEqual([common[2][0], different].sort());
    },
  );
  it("preserves rows when no seam covers all discarded evidence", () => {
    const panels = [
      panel(1, [...common, ["Only in first 7.00", 1010]]),
      panel(2, [["Only in second 8.00", 790], ...common]),
    ];
    const result = joinWindowRows(panels, windows)!;
    expect(result.dropped).toBe(0);
    expect(result.rows).toHaveLength(12);
  });
  it("refuses ambiguous split/duplicate detections instead of dropping a line", () => {
    const panels = baseline();
    panels[1].lines.splice(0, 0, { ...panels[1].lines[0] });
    expect(joinWindowRows(panels, windows)!.dropped).toBe(0);
  });
  it("does not equate repeated text at different printed positions", () => {
    const panels = [
      panel(1, common),
      panel(
        2,
        common.map(([s, y]) => [s, y + 250]),
      ),
    ];
    expect(joinWindowRows(panels, windows)!.dropped).toBe(0);
  });
  it("requires one photo and trustworthy ordered window metadata", () => {
    expect(joinWindowRows(baseline(), [])).toBeNull();
    const differentPhoto = baseline();
    differentPhoto[1].photo = 2;
    expect(joinWindowRows(differentPhoto, windows)).toBeNull();
    expect(joinWindowRows(baseline(), [...windows].reverse())).toBeNull();
    expect(
      joinWindowRows(baseline(), [
        windows[0],
        { ...windows[1], sourceWidth: 500 },
      ]),
    ).toBeNull();
  });
});
