import type { EvidenceLine, Recognition } from "./receipt-layout";

const compact = (text: string) => text.replace(/\s/gu, "");

/** An exact unique left-to-right word subsequence. Never select a price by confidence or arithmetic. */
export function alignedSourceWords(
  region: EvidenceLine,
  recognition: Recognition,
) {
  const panel = recognition.panels.find(
    (panel) => panel.photo === region.photo && panel.part === region.part,
  );
  if (!panel || region.text.length > 2000) return null;
  const target = compact(region.text);
  if (!target) return null;
  const inside = panel.words
    .filter((word) => {
      const x = (word.box[0] + word.box[2]) / 2,
        y = (word.box[1] + word.box[3]) / 2;
      return (
        compact(word.text) &&
        x >= region.box[0] &&
        x <= region.box[2] &&
        y >= region.box[1] &&
        y <= region.box[3]
      );
    })
    .sort((a, b) => a.box[0] - b.box[0]);
  if (!inside.length || inside.length > 256) return null;
  const pieces = inside.map((word) => compact(word.text));
  if (pieces.join("") === target) return inside;
  // Count paths rather than selecting the strongest occurrence of a repeated token.
  const states = new Map<number, { count: number; path: number[] }>([
    [0, { count: 1, path: [] }],
  ]);
  let work = 0;
  for (const [index, piece] of pieces.entries()) {
    const updates = [...states].flatMap(([offset, state]) => {
      if (++work > 50000) return [];
      return target.startsWith(piece, offset)
        ? [
            [
              offset + piece.length,
              {
                count: state.count,
                path: state.count === 1 ? [...state.path, index] : [],
              },
            ] as const,
          ]
        : [];
    });
    if (work > 50000) return null;
    for (const [offset, state] of updates) {
      const previous = states.get(offset);
      const count = Math.min(2, (previous?.count || 0) + state.count);
      states.set(offset, { count, path: count === 1 ? state.path : [] });
    }
  }
  const result = states.get(target.length);
  if (result?.count !== 1) return null;
  const aligned = result.path.map((index) => inside[index]);
  // A slow-path match must not concatenate horizontally overprinted boxes.
  if (
    aligned.some(
      (word, index) =>
        index > 0 && aligned[index - 1].box[2] > word.box[0] + 2 / panel.width,
    )
  )
    return null;
  const normalize = (text: string) => text.trim().replace(/\s+/gu, " ");
  const otherRows = panel.lines.filter(
    (line) =>
      !(
        compact(line.text) === target &&
        line.box.every((value, i) => value === region.box[i])
      ) &&
      line.confidence >= 0.75 &&
      line.box[0] <= region.box[2] &&
      line.box[2] >= region.box[0] &&
      line.box[1] <= region.box[3] &&
      line.box[3] >= region.box[1],
  );
  if (otherRows.length > 256) return null;
  const neighbors = otherRows.map((line) => ({
    box: line.box,
    text: ` ${normalize(line.text)} `,
  }));
  const selected = new Set(result.path);
  for (const [index, word] of inside.entries()) {
    const x = (word.box[0] + word.box[2]) / 2,
      y = (word.box[1] + word.box[3]) / 2;
    const literal = ` ${normalize(word.text)} `;
    let otherOwner = false;
    for (const line of neighbors) {
      if (++work > 50000) return null;
      if (
        x >= line.box[0] &&
        x <= line.box[2] &&
        y >= line.box[1] &&
        y <= line.box[3] &&
        line.text.includes(literal)
      ) {
        otherOwner = true;
        break;
      }
    }
    // Every ignored word needs an actual neighboring-row witness. A selected
    // word with another reported owner cannot establish this row's price.
    if (selected.has(index) === otherOwner) return null;
  }
  return aligned;
}
