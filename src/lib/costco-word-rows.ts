import { matchCostcoRow } from "./costco-row";
import { recognitionSchema } from "./recognition-schema.mjs";
import type { EvidenceLine } from "./receipt-layout";
import type { FinalTotalFragment } from "./final-total-fragments";

type Row = NonNullable<ReturnType<typeof matchCostcoRow>>;
export type ObservedCostcoRow = Row & {
  description: string;
  titleIndex: number;
  sourceIndices: number[];
};
const compact = (value: string) => value.replace(/\s/gu, "");
const center = (box: number[]) => [
  (box[0] + box[2]) / 2,
  (box[1] + box[3]) / 2,
];
const height = (box: number[]) => box[3] - box[1];
const contains = (box: number[], point: number[]) =>
  point[0] >= box[0] &&
  point[0] <= box[2] &&
  point[1] >= box[1] &&
  point[1] <= box[3];
const totalPattern = /^\d[\d,.]*[.,]\d{2,3}\s*-?\s*[A-Z]$/i;
const metadata =
  /^(?:total|subtotal|vat|tax|cash|card|visa|mastercard|member|individual|trade|approval|merchant|quantity|qty)\b/i;
const nameKey = (text: string) =>
  text
    .toUpperCase()
    .replace(/^IRC\s+/i, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
function sameProduct(coupon: string, product: string) {
  const a = nameKey(coupon),
    b = nameKey(product);
  let count = 0;
  while (count < Math.min(a.length, b.length) && a[count] === b[count]) count++;
  return count >= 5 && count / Math.min(a.length, b.length) >= 0.35;
}

/** Interpret only unique actual word tuples; source text and rectangles stay intact. */
export function readCostcoWordRows(
  output: unknown,
  texts: string[],
  enabled: boolean,
  finalTotals: FinalTotalFragment[] = [],
) {
  const empty = () => ({
    rows: {} as Partial<Record<number, ObservedCostcoRow>>,
    titles: new Set<number>(),
  });
  try {
    if (!enabled || !output || typeof output !== "object") return empty();
    const packet = output as {
      recognition?: { panels?: unknown };
      sourceLines?: (EvidenceLine | null)[];
      sourceConflicts?: unknown[];
    };
    if (
      packet.sourceConflicts?.length ||
      !packet.sourceLines ||
      texts.length !== packet.sourceLines.length ||
      texts.length > 2000
    )
      return empty();
    const parsed = recognitionSchema.shape.panels.safeParse(
      packet.recognition?.panels,
    );
    if (
      !parsed.success ||
      parsed.data.reduce((n, panel) => n + panel.words.length, 0) > 4000
    )
      return empty();
    const panels = parsed.data;
    if (
      new Set(panels.map((p) => `${p.photo}:${p.part}`)).size !== panels.length
    )
      return empty();
    const lines = packet.sourceLines;
    for (const [index, line] of lines.entries()) {
      if (!line) {
        if (texts[index] !== "--- GATHER PHOTO BOUNDARY ---") return empty();
        continue;
      }
      const panel = panels.find(
        (p) => p.photo === line.photo && p.part === line.part,
      );
      if (
        line.text.trim() !== texts[index] ||
        !panel?.lines.some(
          (r) =>
            r.text === line.text &&
            r.confidence === line.confidence &&
            r.box.every((n, i) => n === line.box[i]),
        )
      )
        return empty();
    }
    const candidates = new Map<
      number,
      (ObservedCostcoRow & { complete: boolean; photo: number; part: number })[]
    >();
    for (const panel of panels) {
      const words = panel.words;
      const reserved = new Set(
        finalTotals
          .filter((row) => row.photo === panel.photo && row.part === panel.part)
          .map((row) => row.wordIndex),
      );
      const skus = words.flatMap((w, i) =>
        /^\d{4,12}$/.test(w.text.trim()) && w.confidence >= 0.75 ? [i] : [],
      );
      const quantities = words.flatMap((w, i) =>
        /^\d+(?:[.,]\d+)?\s*[x×]$/i.test(w.text.trim()) && w.confidence >= 0.75
          ? [i]
          : [],
      );
      const totals = words.flatMap((w, i) =>
        totalPattern.test(w.text.trim()) && w.confidence >= 0.75 ? [i] : [],
      );
      for (const skuIndex of skus) {
        const sku = words[skuIndex],
          s = center(sku.box);
        const possibleQuantity = quantities.filter((i) => {
          const q = words[i],
            p = center(q.box);
          return (
            q.box[0] > sku.box[2] &&
            Math.abs(p[1] - s[1]) <=
              0.45 * Math.min(height(q.box), height(sku.box)) &&
            Math.abs(
              ((p[1] - s[1]) * panel.height) / ((p[0] - s[0]) * panel.width),
            ) <= 0.3
          );
        });
        if (possibleQuantity.length !== 1) continue;
        const quantityIndex = possibleQuantity[0],
          quantity = words[quantityIndex],
          q = center(quantity.box);
        const slope = (q[1] - s[1]) / (q[0] - s[0]);
        const aligned = (i: number) => {
          const w = words[i],
            p = center(w.box);
          return (
            Math.abs(p[1] - (s[1] + slope * (p[0] - s[0]))) <=
            0.45 *
              Math.min(height(sku.box), height(quantity.box), height(w.box))
          );
        };
        const possibleTotals = totals.filter(
          (i) => words[i].box[0] > quantity.box[2] && aligned(i),
        );
        if (possibleTotals.length !== 1) continue;
        const totalIndex = possibleTotals[0],
          total = words[totalIndex];
        const units = words.flatMap((w, i) =>
          /^\d[\d,.]*$/.test(w.text.trim()) &&
          w.confidence >= 0.75 &&
          w.box[0] > quantity.box[2] &&
          w.box[2] < total.box[0] &&
          aligned(i)
            ? [i]
            : [],
        );
        if (units.length !== 1) continue;
        const unitIndex = units[0],
          unit = words[unitIndex];
        const row = matchCostcoRow(
          [sku.text, quantity.text, unit.text, total.text].join(" "),
        );
        if (!row) continue;
        const main = lines.flatMap((line, index) =>
          line &&
          line.photo === panel.photo &&
          line.part === panel.part &&
          contains(line.box, s) &&
          new RegExp(`(?<!\\d)${sku.text.trim()}(?!\\d)`).test(line.text)
            ? [index]
            : [],
        );
        if (main.length !== 1) continue;
        const index = main[0],
          mainLine = lines[index]!,
          complete = !!matchCostcoRow(mainLine.text);
        const roleIndices = new Set([
          skuIndex,
          quantityIndex,
          unitIndex,
          totalIndex,
        ]);
        const associated = (indices: number[]) =>
          words.flatMap((w, i) =>
            indices.some(
              (n) => lines[n] && contains(lines[n]!.box, center(w.box)),
            )
              ? [i]
              : [],
          );
        const closedCoverage = (indices: number[], selected: number[]) => {
          if (selected.length > 32) return false;
          let work = 0,
            solutions = 0;
          const all = (1n << BigInt(selected.length)) - 1n;
          const visit = (
            lineNumber: number,
            offset: number,
            used: bigint,
            lastX: number,
          ): void => {
            if (solutions > 1 || ++work > 10000) return;
            if (lineNumber === indices.length) {
              if (used === all) solutions++;
              return;
            }
            const line = lines[indices[lineNumber]]!,
              target = compact(line.text);
            if (offset === target.length) {
              visit(lineNumber + 1, 0, used, -1);
              return;
            }
            for (const [position, i] of selected.entries()) {
              const bit = 1n << BigInt(position),
                word = words[i],
                piece = compact(word.text);
              if (
                !(used & bit) &&
                piece &&
                word.box[0] >= lastX &&
                contains(line.box, center(word.box)) &&
                target.startsWith(piece, offset)
              )
                visit(
                  lineNumber,
                  offset + piece.length,
                  used | bit,
                  word.box[0],
                );
              if (work > 10000 || solutions > 1) return;
            }
          };
          visit(0, 0, 0n, -1);
          return work <= 10000 && solutions === 1;
        };
        let sourceIndices: number[], titleIndex: number, description: string;
        const inlineWords = associated([index]);
        const inlineNames = inlineWords
          .filter((i) => !roleIndices.has(i))
          .sort((a, b) => words[a].box[0] - words[b].box[0]);
        const inlineDescription = inlineNames
          .map((i) => words[i].text)
          .join(" ")
          .trim();
        if (
          !complete &&
          row.deduction &&
          /^IRC\b/i.test(inlineDescription) &&
          compact(mainLine.text) ===
            compact(
              [...inlineWords]
                .sort((a, b) => words[a].box[0] - words[b].box[0])
                .map((i) => words[i].text)
                .join(" "),
            )
        ) {
          sourceIndices = [index];
          titleIndex = index;
          description = inlineDescription;
        } else {
          const title = lines[index - 1];
          if (
            !title ||
            title.photo !== panel.photo ||
            title.part !== panel.part
          )
            continue;
          if (complete) description = title.text.trim();
          else {
            const combined = associated([index - 1, index]);
            const names = combined
              .filter((i) => !roleIndices.has(i) && !reserved.has(i))
              .sort((a, b) => words[a].box[0] - words[b].box[0]);
            const sharedFooter =
              combined.some((i) => reserved.has(i)) &&
              finalTotals.some(
                (row) =>
                  row.photo === panel.photo &&
                  row.part === panel.part &&
                  row.sourceIndices.includes(index),
              );
            if (
              sharedFooter &&
              closedCoverage([index - 1, index], combined) &&
              [...roleIndices].every((i) => combined.includes(i)) &&
              names.length &&
              names.every(
                (i) =>
                  contains(title.box, center(words[i].box)) &&
                  center(words[i].box)[1] <
                    s[1] +
                      slope * (center(words[i].box)[0] - s[0]) -
                      0.25 * Math.min(height(sku.box), height(words[i].box)),
              )
            ) {
              description = names
                .map((i) => words[i].text)
                .join(" ")
                .trim();
            } else {
              const match = title.text.match(
                /^(.*?)\s+(\d[\d,.]*[.,]\d{2,3}\s*-?\s*[A-Z])\s*$/i,
              );
              if (
                !match ||
                compact(match[2]) !== compact(total.text) ||
                compact(mainLine.text) !==
                  compact([sku.text, quantity.text, unit.text].join(" "))
              )
                continue;
              description = match[1].trim();
            }
          }
          sourceIndices = [index - 1, index];
          titleIndex = index - 1;
        }
        if (
          metadata.test(description) ||
          (description.match(/\p{L}/gu) || []).length < 2 ||
          description.length > 180
        )
          continue;
        if (row.deduction !== /^IRC\b/i.test(description) && !complete)
          continue;
        const sourceWords = associated(sourceIndices);
        const names = sourceWords
          .filter((i) => !roleIndices.has(i) && !reserved.has(i))
          .sort((a, b) => words[a].box[0] - words[b].box[0]);
        if (
          !names.length ||
          sourceIndices.some((i) => lines[i]!.confidence < 0.75) ||
          sourceWords.some((i) => words[i].confidence < 0.75) ||
          compact(names.map((i) => words[i].text).join(" ")) !==
            compact(description) ||
          sourceWords.length !==
            roleIndices.size +
              names.length +
              sourceWords.filter((i) => reserved.has(i)).length ||
          [...roleIndices].some((i) => !sourceWords.includes(i))
        )
          continue;
        const candidate = {
          ...row,
          description,
          titleIndex,
          sourceIndices,
          complete,
          photo: panel.photo,
          part: panel.part,
        };
        candidates.set(index, [...(candidates.get(index) || []), candidate]);
      }
    }
    const unique = new Map(
      [...candidates].flatMap(([i, choices]) =>
        choices.length === 1 ? [[i, choices[0]] as const] : [],
      ),
    );
    const result = empty();
    for (const [index, candidate] of unique) {
      if (candidate.complete) continue;
      if (candidate.deduction) {
        const owner = unique.get(candidate.titleIndex - 1);
        if (
          !owner ||
          owner.deduction ||
          owner.photo !== candidate.photo ||
          owner.part !== candidate.part ||
          owner.taxCode !== candidate.taxCode ||
          !sameProduct(candidate.description, owner.description)
        )
          continue;
      }
      const { complete: _, photo: __, part: ___, ...row } = candidate;
      result.rows[index] = row;
      if (row.titleIndex !== index) result.titles.add(row.titleIndex);
    }
    return result;
  } catch {
    return empty();
  }
}
