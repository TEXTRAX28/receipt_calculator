import { recognitionSchema } from "./recognition-schema.mjs";
import { alignedSourceWords } from "./source-words";
import type { EvidenceLine } from "./receipt-layout";

// Bare TOTAL can be a pre-tax amount followed by tax and GRAND TOTAL.
export const finalTotalHeading = (text: string) =>
  /^(?:total(?:\s*\(\s*incl(?:uding)?\.?\s+(?:vat|tax)\s*\)|\s+refund)|grand\s+total|amount\s+(?:due|refunded)|balance\s+due|refund\s+total)\s*:?[\s]*$/i.test(
    text.replace(/^[*\s]+/u, ""),
  );

export type FinalTotalFragment = {
  literal: string;
  photo: number;
  part: number;
  wordIndex: number;
  headingIndex: number;
  sourceIndices: number[];
};

/** A uniquely aligned printed footer token, retaining its original mixed source row. */
export function readFinalTotalFragments(
  output: unknown,
  texts: string[],
): FinalTotalFragment[] {
  try {
    if (!output || typeof output !== "object" || texts.length > 2000) return [];
    const packet = output as {
      recognition?: { panels?: unknown };
      sourceLines?: (EvidenceLine | null)[];
      sourceConflicts?: unknown[];
    };
    if (
      !packet.sourceLines ||
      packet.sourceLines.length !== texts.length ||
      packet.sourceConflicts?.length
    )
      return [];
    const parsed = recognitionSchema.shape.panels.safeParse(
      packet.recognition?.panels,
    );
    if (
      !parsed.success ||
      parsed.data.reduce((n, p) => n + p.words.length, 0) > 4000
    )
      return [];
    const panels = parsed.data,
      lines = packet.sourceLines;
    if (
      new Set(panels.map((p) => `${p.photo}:${p.part}`)).size !== panels.length
    )
      return [];
    for (const [i, line] of lines.entries()) {
      if (!line) {
        if (texts[i] !== "--- GATHER PHOTO BOUNDARY ---") return [];
        continue;
      }
      const panel = panels.find(
        (p) => p.photo === line.photo && p.part === line.part,
      );
      if (
        line.text.trim() !== texts[i] ||
        !panel?.lines.some(
          (r) =>
            r.text === line.text &&
            r.confidence === line.confidence &&
            r.box.every((n, j) => n === line.box[j]),
        )
      )
        return [];
    }
    const headings = lines.flatMap((line, index) =>
      line && finalTotalHeading(line.text) ? [index] : [],
    );
    if (headings.length > 50) return [];
    const cache = new Map<number, ReturnType<typeof alignedSourceWords>>();
    const owned = (index: number) => {
      if (!cache.has(index))
        cache.set(
          index,
          lines[index] ? alignedSourceWords(lines[index]!, { panels }) : null,
        );
      return cache.get(index) || null;
    };
    const result: FinalTotalFragment[] = [];
    for (const index of headings) {
      const heading = lines[index]!;
      if (heading.confidence < 0.98) continue;
      const panel = panels.find(
        (p) => p.photo === heading.photo && p.part === heading.part,
      )!;
      const words = owned(index);
      if (!words?.length || words.some((w) => w.confidence < 0.98)) continue;
      const candidates: FinalTotalFragment[] = [];
      for (const [wordIndex, word] of panel.words.entries()) {
        if (
          word.confidence < 0.98 ||
          !/^[-−]?\d[\d.,]*[.,]\d{2,3}-?$/.test(word.text.trim()) ||
          word.box[0] <= heading.box[2]
        )
          continue;
        const x =
          (word.box[0] + word.box[2] - heading.box[0] - heading.box[2]) / 2;
        const y =
          (word.box[1] + word.box[3] - heading.box[1] - heading.box[3]) / 2;
        if (
          Math.abs(y) >
            Math.min(
              word.box[3] - word.box[1],
              heading.box[3] - heading.box[1],
            ) ||
          Math.abs((y * panel.height) / (x * panel.width)) > 0.15
        )
          continue;
        const owners = [index - 1, index + 1].filter((i) => {
          const line = lines[i];
          if (
            !line ||
            line.photo !== heading.photo ||
            line.part !== heading.part ||
            line.confidence < 0.98
          )
            return false;
          return owned(i)?.includes(word);
        });
        if (owners.length === 1)
          candidates.push({
            literal: word.text.trim(),
            photo: heading.photo,
            part: heading.part,
            wordIndex,
            headingIndex: index,
            sourceIndices: [index, owners[0]].sort((a, b) => a - b),
          });
      }
      if (candidates.length === 1) result.push(candidates[0]);
    }
    // One token cannot establish two differently located footer labels.
    return result.filter(
      (r) =>
        result.filter(
          (other) =>
            other.photo === r.photo &&
            other.part === r.part &&
            other.wordIndex === r.wordIndex,
        ).length === 1,
    );
  } catch {
    return [];
  }
}
