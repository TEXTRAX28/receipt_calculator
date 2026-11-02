import { describe, expect, it } from "vitest";
import {
  rectangleQuad,
  rotateGeometry,
  validateGeometry,
  sourceQuad,
  projectiveMapping,
  mappedPoint,
  rectifiedSize,
  warpPixels,
  type ReceiptGeometry,
} from "../src/lib/image-geometry";
import {
  planReadingPanels,
  previewDimensions,
  paddedCorrectionFrame,
} from "../src/lib/images";

const full = (): ReceiptGeometry => ({ turns: 0, corners: rectangleQuad() });
describe("source-preserving projective receipt correction", () => {
  it.each([
    [8, 20000],
    [20000, 8],
    [1500, 2666],
  ])(
    "keeps selected corner pixels inside the padded %i by %i preview",
    (width, height) => {
      const frame = paddedCorrectionFrame(width, height);
      expect(frame.width * frame.height).toBeLessThanOrEqual(4_000_000);
      expect(frame.contentWidth).toBeGreaterThan(0);
      expect(frame.contentHeight).toBeGreaterThan(0);
      expect(frame.left + frame.contentWidth).toBeLessThanOrEqual(frame.width);
      expect(frame.top + frame.contentHeight).toBeLessThanOrEqual(frame.height);
      const pixels = {
        width: 2,
        height: 2,
        data: Uint8ClampedArray.from(
          [1, 2, 3, 4].flatMap((n) => [n, n, n, 255]),
        ),
      };
      const sampled = warpPixels(
        pixels,
        projectiveMapping(sourceQuad(full())),
        frame.contentWidth,
        frame.contentHeight,
      );
      const corners = [
        sampled.data[0],
        sampled.data[(frame.contentWidth - 1) * 4],
        sampled.data[(frame.contentHeight - 1) * frame.contentWidth * 4],
        sampled.data.at(-4),
      ];
      expect(corners).toEqual([1, 2, 3, 4]);
    },
  );
  it("maps all four corners and the analytic interior of a trapezoid", () => {
    const matrix = projectiveMapping([
      { x: 0, y: 0 },
      { x: 0.5, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ]);
    for (const [u, v, x, y] of [
      [0, 0, 0, 0],
      [1, 0, 0.5, 0],
      [1, 1, 1, 1],
      [0, 1, 0, 1],
      [0.5, 0.5, 1 / 3, 1 / 3],
      [0.8, 0.4, 0.5, 0.25],
    ]) {
      const point = mappedPoint(matrix, u, v);
      expect(point.x).toBeCloseTo(x, 12);
      expect(point.y).toBeCloseTo(y, 12);
    }
  });
  it("samples independent analytic raster values with bilinear interpolation and preserves its input", () => {
    const data = new Uint8ClampedArray(201 * 201 * 4);
    for (let y = 0; y < 201; y++)
      for (let x = 0; x < 201; x++)
        data.set([x, y, 10, 255], (y * 201 + x) * 4);
    const before = data.slice();
    const matrix = projectiveMapping([
      { x: 0, y: 0 },
      { x: 0.5, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ]);
    const out = warpPixels({ data, width: 201, height: 201 }, matrix, 3, 3);
    expect([...out.data.slice(16, 20)]).toEqual([67, 67, 10, 255]);
    expect([...out.data.slice(8, 12)]).toEqual([100, 0, 10, 255]);
    expect([...out.data.slice(32, 36)]).toEqual([200, 200, 10, 255]);
    expect(data).toEqual(before);
  });
  it("turns a labelled 3 by 2 raster clockwise without mirroring or losing rows", () => {
    const data = Uint8ClampedArray.from(
      [1, 2, 3, 4, 5, 6].flatMap((n) => [n, n, n, 255]),
    );
    const rotated = rotateGeometry(full());
    const out = warpPixels(
      { data, width: 3, height: 2 },
      projectiveMapping(sourceQuad(rotated)),
      2,
      3,
    );
    expect([...out.data].filter((_, i) => i % 4 === 0)).toEqual([
      4, 1, 5, 2, 6, 3,
    ]);
    expect(rectifiedSize(300, 800, sourceQuad(rotated))).toEqual({
      width: 800,
      height: 300,
    });
  });
  it("four quarter turns restore an asymmetric selection without modifying the original metadata", () => {
    const original: ReceiptGeometry = {
      turns: 0,
      corners: [
        { x: 10, y: 5 },
        { x: 83, y: 10 },
        { x: 91, y: 90 },
        { x: 20, y: 98 },
      ],
    };
    const bytes = JSON.stringify(original);
    let result = original;
    for (let i = 0; i < 4; i++) result = rotateGeometry(result);
    expect(result).toEqual(original);
    expect(JSON.stringify(original)).toBe(bytes);
  });
  it("uses native long-receipt dimensions and overlapping sections including both ends", () => {
    const size = rectifiedSize(900, 12000, sourceQuad(full()));
    expect(size).toEqual({ width: 900, height: 12000 });
    const preview = previewDimensions(size.width, size.height);
    expect(preview.width * preview.height).toBeLessThanOrEqual(4_000_000);
    const plan = planReadingPanels(size.width, size.height);
    expect(plan.length).toBeGreaterThan(1);
    expect(plan[0].top).toBe(0);
    expect(plan.at(-1)!.top + plan.at(-1)!.height).toBeCloseTo(12000, 0);
    for (let i = 1; i < plan.length; i++)
      expect(plan[i].top).toBeLessThan(plan[i - 1].top + plan[i - 1].height);
    const matrix = projectiveMapping(sourceQuad(full()));
    const pixels = {
      data: Uint8ClampedArray.from(
        Array.from({ length: 100 }, (_, y) => [y, y, y, 255]).flat(),
      ),
      width: 1,
      height: 100,
    };
    expect(
      warpPixels(pixels, matrix, 1, 2, {
        left: 0,
        right: 1,
        top: 0.8,
        bottom: 1,
      }).data[4],
    ).toBe(99);
  });
  it.each([
    { turns: 4, corners: rectangleQuad() },
    { turns: 0, corners: [{ x: -1, y: 0 }, ...rectangleQuad().slice(1)] },
    { turns: 0, corners: [{ x: NaN, y: 0 }, ...rectangleQuad().slice(1)] },
    {
      turns: 0,
      corners: [
        { x: 0, y: 0 },
        { x: 100, y: 100 },
        { x: 100, y: 0 },
        { x: 0, y: 100 },
      ],
    },
    {
      turns: 0,
      corners: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 30, y: 20 },
        { x: 0, y: 100 },
      ],
    },
    {
      turns: 0,
      corners: rectangleQuad({ left: 49, right: 49, top: 49, bottom: 49 }),
    },
  ])(
    "rejects invalid, crossed, concave or tiny frames before allocating",
    (geometry) => {
      expect(() => validateGeometry(geometry as ReceiptGeometry)).toThrow();
    },
  );
  it("rejects near-horizon transforms and unsupported source/panel budgets", () => {
    expect(() =>
      projectiveMapping([
        { x: 0, y: 0 },
        { x: 0.001, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
      ]),
    ).toThrow(/steeply/);
    expect(() => rectifiedSize(20001, 20, sourceQuad(full()))).toThrow(
      /budget/,
    );
    expect(() => rectifiedSize(6000, 6000, sourceQuad(full()))).toThrow(
      /budget/,
    );
    const source = { data: new Uint8ClampedArray(16), width: 2, height: 2 },
      matrix = projectiveMapping(sourceQuad(full()));
    expect(() => warpPixels(source, matrix, 2001, 2001)).toThrow(/bounded/);
    expect(() =>
      warpPixels({ ...source, width: -2, height: -2 }, matrix, 2, 2),
    ).toThrow(/bounded/);
    expect(() =>
      warpPixels(source, matrix, 2, 2, {
        left: 0,
        right: 1,
        top: 0.5,
        bottom: 0.5,
      }),
    ).toThrow(/bounded/);
  });
});
