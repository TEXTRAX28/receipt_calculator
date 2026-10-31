import { it, expect } from "vitest";
import fc from "fast-check";
import { previewDimensions } from "../src/lib/images";

it("does not round a prepared 9:16 image above four megapixels", () => {
  const result = previewDimensions(1800, 3200);
  expect(result.width * result.height).toBeLessThanOrEqual(4_000_000);
  expect(result).toEqual({ width: 1500, height: 2666 });
});

it("keeps original previews and crop previews inside the same server decode budget", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 1, max: 20000 }),
      fc.integer({ min: 1, max: 20000 }),
      fc.boolean(),
      (width, height, upscale) => {
        const output = previewDimensions(width, height, upscale);
        expect(output.width * output.height).toBeLessThanOrEqual(4_000_000);
        expect(output.width).toBeGreaterThan(0);
        expect(output.height).toBeGreaterThan(0);
        expect(Math.max(output.width, output.height)).toBeLessThanOrEqual(3200);
        if (!upscale) {
          expect(output.width).toBeLessThanOrEqual(width);
          expect(output.height).toBeLessThanOrEqual(height);
        }
      },
    ),
    { seed: 20261031, numRuns: 1000 },
  );
});
