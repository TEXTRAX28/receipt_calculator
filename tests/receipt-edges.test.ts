import { describe, expect, it } from "vitest";
import { findReceiptEdges } from "../src/lib/receipt-edges";
import type { PixelPatch } from "../src/lib/image-quality";

function photo(
  paper: (x: number, y: number) => boolean,
  ink = false,
): PixelPatch {
  const width = 320,
    height = 480;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const onPaper = paper(x, y);
      const text =
        ink &&
        onPaper &&
        y > 50 &&
        y < 420 &&
        y % 28 < 7 &&
        x > 105 &&
        x < 215 &&
        x % 12 < 6;
      const gray = text ? 25 : onPaper ? 225 : 75;
      const index = (y * width + x) * 4;
      data[index] = data[index + 1] = data[index + 2] = gray;
      data[index + 3] = 255;
    }
  return { data, width, height };
}

describe("bounded local receipt edge suggestions", () => {
  it("encloses a complete paper rectangle including text rather than tightening around ink", () => {
    const input = photo(
      (x, y) => x >= 72 && x < 260 && y >= 18 && y < 460,
      true,
    );
    const before = input.data.slice();
    const result = findReceiptEdges(input)!;
    expect(result).not.toBeNull();
    expect(result.bounds.left).toBeGreaterThan(10);
    expect(result.bounds.right).toBeGreaterThan(8);
    expect(result.bounds.left).toBeLessThanOrEqual((72 / 320) * 100);
    expect(result.bounds.right).toBeLessThanOrEqual((60 / 320) * 100);
    expect(result.bounds.top).toBeLessThanOrEqual((18 / 480) * 100);
    expect(result.bounds.bottom).toBeLessThanOrEqual((20 / 480) * 100);
    expect(input.data).toEqual(before);
  });

  it("keeps both photo boundaries for a long receipt that continues beyond the frame", () => {
    const result = findReceiptEdges(photo((x) => x >= 70 && x < 250, true))!;
    expect(result).not.toBeNull();
    expect(result.bounds.top).toBe(0);
    expect(result.bounds.bottom).toBe(0);
    expect(result.bounds.left).toBeLessThanOrEqual((70 / 320) * 100);
    expect(result.bounds.right).toBeLessThanOrEqual((70 / 320) * 100);
    expect(result.bounds.left + result.bounds.right).toBeGreaterThan(20);
  });

  it("encloses sloping sides without claiming perspective correction", () => {
    const result = findReceiptEdges(
      photo((x, y) => x >= 60 + y * 0.08 && x < 230 + y * 0.04, true),
    )!;
    expect(result).not.toBeNull();
    expect(result.bounds.left).toBeLessThanOrEqual((60 / 320) * 100);
    expect(result.bounds.right).toBeLessThanOrEqual(((320 - 250) / 320) * 100);
    expect(result.bounds.top).toBe(0);
    expect(result.bounds.bottom).toBe(0);
  });

  it("does not mistake a narrow pen stroke for the receipt's right edge", () => {
    const input = photo((x) => x >= 55 && x < 275, true);
    for (let y = 20; y < 460; y++)
      for (let x = 210; x < 213; x++) {
        const i = (y * input.width + x) * 4;
        input.data[i] = input.data[i + 1] = input.data[i + 2] = 0;
      }
    const result = findReceiptEdges(input)!;
    expect(result).not.toBeNull();
    expect(result.bounds.right).toBeLessThanOrEqual((45 / 320) * 100);
  });

  it("abstains on two similarly strong separate documents", () => {
    expect(
      findReceiptEdges(
        photo((x) => (x >= 30 && x < 120) || (x >= 190 && x < 280)),
      ),
    ).toBeNull();
  });

  it.each([true, false])("abstains on a full flat field (%s)", (white) => {
    expect(findReceiptEdges(photo(() => white))).toBeNull();
  });

  it("rejects oversized, malformed and transparent samples before scanning", () => {
    const input = photo(() => true);
    expect(() => findReceiptEdges({ ...input, width: 10000 })).toThrow(
      /bounded/,
    );
    expect(() => findReceiptEdges({ ...input, height: 10.5 })).toThrow(
      /bounded/,
    );
    expect(() =>
      findReceiptEdges({ ...input, data: input.data.slice(4) }),
    ).toThrow(/bounded/);
    input.data[3] = 0;
    expect(() => findReceiptEdges(input)).toThrow(/opaque/);
  });
});
