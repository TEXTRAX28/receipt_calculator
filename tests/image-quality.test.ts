import { describe, expect, it } from "vitest";
import {
  captureQuality,
  measurePatch,
  type PixelPatch,
} from "../src/lib/image-quality";

function patch(level = 255, ink = false): PixelPatch {
  const width = 160,
    height = 240;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4;
      const value =
        ink && x > 15 && x < 145 && x % 14 < 8 && y % 24 < 12 ? 0 : level;
      data[index] = data[index + 1] = data[index + 2] = value;
      data[index + 3] = 255;
    }
  return { data, width, height };
}

function blurred(input: PixelPatch): PixelPatch {
  let data = new Uint8ClampedArray(input.data);
  for (let pass = 0; pass < 16; pass++) {
    for (const step of [1, input.width]) {
      const next = new Uint8ClampedArray(data);
      for (let y = 1; y < input.height - 1; y++)
        for (let x = 1; x < input.width - 1; x++) {
          const i = y * input.width + x;
          for (let color = 0; color < 3; color++)
            next[4 * i + color] =
              (data[4 * (i - step) + color] +
                2 * data[4 * i + color] +
                data[4 * (i + step) + color]) /
              4;
        }
      data = next;
    }
  }
  return { ...input, data };
}

describe("advisory capture checks on original pixels", () => {
  it("does not warn about clean high-resolution text-like edges", () => {
    const text = patch(255, true);
    const quality = captureQuality(900, 1600, text, [text, text, text]);
    expect(quality.flags).toEqual([]);
    expect(quality.detailPatches).toBe(3);
    expect(quality.blurScore).toBeGreaterThan(0.3);
  });

  it("finds distributed defocus but does not treat one unclear region as a whole-photo verdict", () => {
    const text = patch(255, true),
      soft = blurred(text);
    expect(measurePatch(soft).blurScore).toBeLessThan(0.3);
    expect(captureQuality(900, 1600, text, [soft, soft, text]).flags).toContain(
      "blur",
    );
    expect(
      captureQuality(900, 1600, text, [soft, text, text]).flags,
    ).not.toContain("blur");
  });

  it("distinguishes blank regions from a blur measurement and flags absent detail", () => {
    const blank = patch();
    const quality = captureQuality(900, 1600, blank, [blank, blank, blank]);
    expect(quality.flags).toEqual(["low-detail"]);
    expect(quality.blurScore).toBeNull();
    expect(quality.detailPatches).toBe(0);
  });

  it("warns about dark and low-resolution input without modifying pixels", () => {
    const dark = patch(40, true),
      before = dark.data.slice();
    expect(captureQuality(200, 800, dark, [dark, dark, dark]).flags).toEqual([
      "low-resolution",
      "dark",
    ]);
    expect(dark.data).toEqual(before);
  });

  it("rejects mismatched data, unsafe dimensions and unbounded sampling", () => {
    const good = patch();
    for (const invalid of [
      { ...good, width: 513 },
      { ...good, height: 0 },
      { ...good, data: good.data.slice(4) },
    ]) {
      expect(() => measurePatch(invalid)).toThrow();
    }
    expect(() =>
      captureQuality(20000, 20000, good, [good, good, good]),
    ).toThrow();
    expect(() => captureQuality(900, 1600, good, [good])).toThrow();
  });
});
