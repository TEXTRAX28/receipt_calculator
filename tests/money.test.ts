import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  allocate,
  decimal,
  formatMoney,
  money,
  roundDiv,
} from "../src/lib/money";

describe("exact money and deterministic apportionment", () => {
  it("splits £10 three ways without losing a penny", () =>
    expect(allocate(1000n, [1n, 1n, 1n])).toEqual([334n, 333n, 333n]));
  it("supports zero and three decimal currencies", () => {
    expect(money("123", "JPY")).toBe(123n);
    expect(money("1.234", "KWD")).toBe(1234n);
    expect(formatMoney(1234n, "KWD")).toBe("KWD 1.234");
  });
  it.each([
    "NaN",
    "Infinity",
    "1e5",
    "-1",
    "0xFF",
    "1.001",
    "1,00",
    "",
    "9".repeat(400),
    "<script>1</script>",
  ])("rejects invalid GBP amount %s", (input) =>
    expect(() => money(input, "GBP")).toThrow(),
  );
  it("rejects decimal yen and excessive amounts", () => {
    expect(() => money("1.0", "JPY")).toThrow();
    expect(() => money("999999999999", "GBP")).toThrow();
  });
  it("uses half-away-from-zero rounding", () => {
    expect(roundDiv(5n, 2n)).toBe(3n);
    expect(roundDiv(-5n, 2n)).toBe(-3n);
  });
  it("does not let zero-weight participants receive pennies", () =>
    expect(allocate(1n, [0n, 1n, 1n])).toEqual([0n, 1n, 0n]));
  it("rejects invalid shares", () => {
    expect(() => allocate(1n, [0n])).toThrow();
    expect(() => allocate(1n, [-1n])).toThrow();
  });
  it("conserves signed minor units across 2,000 generated inputs", () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: -100_000_000_000n, max: 100_000_000_000n }),
        fc.array(fc.bigInt({ min: 1n, max: 1_000_000_000n }), {
          minLength: 1,
          maxLength: 30,
        }),
        (total, weights) => {
          const parts = allocate(total, weights);
          expect(parts.reduce((a, b) => a + b, 0n)).toBe(total);
          expect(allocate(total, weights)).toEqual(parts);
          parts.forEach((p) =>
            expect(total >= 0n ? p >= 0n : p <= 0n).toBe(true),
          );
        },
      ),
      { numRuns: 2000, seed: 28102026 },
    );
  });
  it("parses decimal weights exactly", () =>
    expect(decimal("0.125", 6)).toBe(125000n));
});
