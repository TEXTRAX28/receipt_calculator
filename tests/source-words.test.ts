import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { alignedSourceWords } from "../src/lib/source-words";
import type { EvidenceLine, Recognition } from "../src/lib/receipt-layout";

const region: EvidenceLine = {
  photo: 1,
  part: 1,
  text: "Tea 1 43,181 43,181",
  confidence: 0.99,
  box: [0.1, 0.4, 0.9, 0.6],
};
const word = (
  text: string,
  left: number,
  right: number,
  confidence = 0.99,
) => ({
  text,
  confidence,
  box: [left, 0.45, right, 0.55] as [number, number, number, number],
});
const reading = (
  words: Recognition["panels"][number]["words"],
): Recognition => ({
  engine: "paddle-ppocrv6-medium-onnx",
  panels: [
    { photo: 1, part: 1, width: 1000, height: 1000, words, lines: [region] },
  ],
});
const words = () => [
  word("Tea", 0.1, 0.2),
  word("1 43,181", 0.3, 0.5),
  word("43,181", 0.7, 0.9),
];
function withNeighbor(
  actual: ReturnType<typeof words>,
  extra: ReturnType<typeof word>,
) {
  extra.box[1] = 0.52;
  extra.box[3] = 0.58;
  const source = reading([...actual, extra]);
  source.panels[0].lines.push({
    text: extra.text,
    confidence: 0.99,
    box: [...extra.box],
  });
  return source;
}

describe("bounded literal source-word alignment", () => {
  it("keeps a complete ordered word sequence unchanged and does not mutate inputs", () => {
    const source = reading(words()),
      before = structuredClone(source);
    expect(alignedSourceWords(region, source)).toEqual(source.panels[0].words);
    expect(source).toEqual(before);
  });
  it("uniquely excludes an interleaved neighboring-row amount while preserving actual word objects", () => {
    const actual = words(),
      source = withNeighbor(actual, word("13,000", 0.71, 0.89));
    const result = alignedSourceWords(region, source)!;
    expect(result).toEqual(actual);
    expect(result[2]).toBe(actual[2]);
  });
  it("rejects ambiguous matching occurrences rather than choosing the strongest price", () => {
    const actual = words();
    const source = withNeighbor(actual, word("43,181", 0.71, 0.89, 0.5));
    expect(alignedSourceWords(region, source)).toBeNull();
    source.panels[0].words.at(-1)!.confidence = 1;
    expect(alignedSourceWords(region, source)).toBeNull();
  });
  it("retains a weak selected word; confidence cannot remove it to create a different path", () => {
    const actual = words();
    actual[1].confidence = 0;
    expect(
      alignedSourceWords(
        region,
        withNeighbor(actual, word("99,999", 0.71, 0.89)),
      )![1].confidence,
    ).toBe(0);
  });
  it("does not join overprinted source words on the slow path", () => {
    const actual = words();
    actual[0].box[2] = 0.6;
    expect(
      alignedSourceWords(
        region,
        withNeighbor(actual, word("13,000", 0.71, 0.89)),
      ),
    ).toBeNull();
  });
  it("does not borrow words outside the literal panel, row or x ordering", () => {
    const actual = words(),
      source = reading(actual);
    actual[1].box[1] = 0.7;
    actual[1].box[3] = 0.8;
    expect(alignedSourceWords(region, source)).toBeNull();
    expect(
      alignedSourceWords({ ...region, part: 2 }, reading(words())),
    ).toBeNull();
    const reversed = words();
    reversed[1].box[0] = 0.8;
    reversed[1].box[2] = 0.9;
    expect(alignedSourceWords(region, reading(reversed))).toBeNull();
  });
  it("cannot discard unexplained words or borrow a selected word assigned to another row", () => {
    expect(
      alignedSourceWords(
        region,
        reading([...words(), word("13,000", 0.71, 0.89)]),
      ),
    ).toBeNull();
    const source = withNeighbor(words(), word("13,000", 0.71, 0.89));
    source.panels[0].lines.push({
      text: "43,181",
      confidence: 0.99,
      box: [0.7, 0.45, 0.9, 0.55],
    });
    expect(alignedSourceWords(region, source)).toBeNull();
  });
  it("preserves literal case and digits and refuses unmatched row text", () => {
    for (const text of [
      "TEA 1 43,181 43,181",
      "Tea 1 43,181 43,182",
      "Bread 1 43,181 43,181",
      "",
    ])
      expect(
        alignedSourceWords({ ...region, text }, reading(words())),
      ).toBeNull();
  });
  it("bounds row length, candidate count and ambiguous dynamic-program work", () => {
    expect(
      alignedSourceWords(
        { ...region, text: "A".repeat(2001) },
        reading(words()),
      ),
    ).toBeNull();
    expect(
      alignedSourceWords(
        region,
        reading(Array.from({ length: 257 }, () => word("A", 0.2, 0.3))),
      ),
    ).toBeNull();
    expect(
      alignedSourceWords(
        { ...region, text: "A".repeat(1999) + "Z" },
        reading(
          Array.from({ length: 256 }, (_, i) =>
            word("A".repeat(i + 1), 0.2, 0.3),
          ),
        ),
      ),
    ).toBeNull();
  });
  it("agrees with independent exhaustive enumeration on small ambiguous sequences", () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom("A", "B", "AA", "AB"), { maxLength: 8 }),
        fc.array(fc.constantFrom("A", "B"), { minLength: 1, maxLength: 12 }),
        (pieces, letters) => {
          const target = letters.join("");
          const candidates = pieces.map((text, i) =>
            word(
              text,
              0.1 + (0.8 * i) / (pieces.length + 1),
              0.1 + (0.8 * (i + 0.7)) / (pieces.length + 1),
            ),
          );
          const paths: number[][] = [];
          for (let mask = 1; mask < 2 ** pieces.length; mask++) {
            const path = pieces.flatMap((_, i) => (mask & (1 << i) ? [i] : []));
            if (path.map((i) => pieces[i]).join("") === target)
              paths.push(path);
          }
          const source = reading(candidates);
          source.panels[0].lines = [{ ...region, text: target }];
          if (paths.length === 1)
            candidates.forEach((word, i) => {
              if (!paths[0].includes(i))
                source.panels[0].lines.push({
                  text: word.text,
                  confidence: 0.99,
                  box: [...word.box],
                });
            });
          const result = alignedSourceWords(
            { ...region, text: target },
            source,
          );
          expect(result).toEqual(
            paths.length === 1 ? paths[0].map((i) => candidates[i]) : null,
          );
        },
      ),
      { numRuns: 250, seed: 20261102 },
    );
  });
});
