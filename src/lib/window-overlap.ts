import type { ReadingWindow } from "./images";
import type { EvidenceLine, SourceRecognition } from "./receipt-layout";

export type WindowRow = {
  source: EvidenceLine;
  alternatives: EvidenceLine[];
  conflict: boolean;
};
type MappedRow = WindowRow & { area: number[] | null };
const key = (text: string) => text.trim().toUpperCase().replace(/\s+/g, " ");
const validBox = (box: readonly number[]) =>
  box.length === 4 &&
  box.every(Number.isFinite) &&
  box[0] >= 0 &&
  box[1] >= 0 &&
  box[2] <= 1 &&
  box[3] <= 1 &&
  box[0] < box[2] &&
  box[1] < box[3];

/** One source photo, known vertical windows and a complete seam; never align photos.
 * A discarded row must have one physical counterpart on the retained side.
 * Literal disagreements remain attached to that row and require source review.
 */
export function joinWindowRows(
  panels: SourceRecognition["panels"],
  windows: readonly (ReadingWindow | undefined)[],
): { rows: WindowRow[]; dropped: number } | null {
  if (panels.length < 2 || panels.length !== windows.length) return null;
  if (
    new Set(panels.map((p) => p.photo)).size !== 1 ||
    new Set(panels.map((p) => p.part)).size !== panels.length ||
    windows.some(
      (w) =>
        !w ||
        !validBox(w.bounds) ||
        !validBox(w.content) ||
        !Number.isFinite(w.sourceWidth) ||
        !Number.isFinite(w.sourceHeight) ||
        w.sourceWidth <= 0 ||
        w.sourceHeight <= 0 ||
        w.sourceWidth !== windows[0]?.sourceWidth ||
        w.sourceHeight !== windows[0]?.sourceHeight,
    )
  )
    return null;
  for (let i = 1; i < panels.length; i++) {
    const a = windows[i - 1]!,
      b = windows[i]!;
    if (
      panels[i].part <= panels[i - 1].part ||
      a.bounds[0] !== b.bounds[0] ||
      a.bounds[2] !== b.bounds[2] ||
      a.bounds[1] >= b.bounds[1] ||
      a.bounds[3] >= b.bounds[3]
    )
      return null;
  }
  const parts: MappedRow[][] = panels.map((panel, i) => {
    const w = windows[i]!,
      c = w.content,
      b = w.bounds;
    return panel.lines
      .filter((line) => line.text.trim())
      .map((line) => {
        const box = line.box;
        // Clip only for coordinate comparison at a known white preparation margin.
        // Displayed source rectangles below remain the actual detected rectangles.
        const inside = [
          Math.max(c[0], box[0]),
          Math.max(c[1], box[1]),
          Math.min(c[2], box[2]),
          Math.min(c[3], box[3]),
        ];
        const x = (v: number) =>
          (b[0] + ((v - c[0]) / (c[2] - c[0])) * (b[2] - b[0])) * w.sourceWidth;
        const y = (v: number) =>
          (b[1] + ((v - c[1]) / (c[3] - c[1])) * (b[3] - b[1])) *
          w.sourceHeight;
        return {
          source: { ...line, photo: panel.photo, part: panel.part },
          alternatives: [],
          conflict: false,
          area:
            validBox(box) && validBox(inside) && !/[\r\n]/.test(line.text)
              ? [x(inside[0]), y(inside[1]), x(inside[2]), y(inside[3])]
              : null,
        };
      });
  });
  const sameRegion = (a: MappedRow, b: MappedRow) => {
    const x = a.area,
      y = b.area;
    if (!x || !y || a.source.part === b.source.part) return false;
    const height = Math.min(x[3] - x[1], y[3] - y[1]);
    return (
      Math.abs((x[1] + x[3] - y[1] - y[3]) / 2) <= height / 2 &&
      Math.min(x[3], y[3]) - Math.max(x[1], y[1]) >= height / 2 &&
      Math.min(x[2], y[2]) - Math.max(x[0], y[0]) >=
        Math.min(x[2] - x[0], y[2] - y[0]) / 2
    );
  };
  const centre = (r: MappedRow) => r.area && (r.area[1] + r.area[3]) / 2;
  if (
    parts.some((rows) =>
      rows.some(
        (r, i) =>
          i > 0 &&
          centre(r) !== null &&
          centre(rows[i - 1]) !== null &&
          centre(r)! < centre(rows[i - 1])!,
      ),
    )
  )
    return null;
  let rows = parts[0],
    dropped = 0;
  for (let part = 1; part < parts.length; part++) {
    const next = parts[part];
    const candidates = next.map((r) =>
      rows.flatMap((p, i) => (sameRegion(p, r) ? [i] : [])),
    );
    const uses = new Map<number, number>();
    for (const match of candidates)
      for (const i of match) uses.set(i, (uses.get(i) || 0) + 1);
    const pairs = candidates.flatMap<[number, number]>((match, j) =>
      match.length === 1 && uses.get(match[0]) === 1 ? [[match[0], j]] : [],
    );
    const ordered = pairs.every(([i], n) => n === 0 || i > pairs[n - 1][0]);
    const anchors = pairs.filter(
      ([i, j]) => key(rows[i].source.text) === key(next[j].source.text),
    );
    const leftToRight = new Map(pairs),
      rightToLeft = new Map(pairs.map(([i, j]) => [j, i]));
    const a = windows[part - 1]!,
      b = windows[part]!;
    const mid =
      ((Math.max(a.bounds[1], b.bounds[1]) +
        Math.min(a.bounds[3], b.bounds[3])) /
        2) *
      b.sourceHeight;
    const seams =
      ordered &&
      new Set(anchors.map(([i]) => key(rows[i].source.text))).size >= 3
        ? anchors.filter(
            ([i, j]) =>
              rows
                .slice(i + 1)
                .every(
                  (_, offset) => (leftToRight.get(i + 1 + offset) ?? -1) > j,
                ) &&
              next
                .slice(0, j + 1)
                .every((_, n) => (rightToLeft.get(n) ?? Infinity) <= i),
          )
        : [];
    seams.sort(
      (x, y) =>
        Math.abs(centre(rows[x[0]])! - mid) -
          Math.abs(centre(rows[y[0]])! - mid) || x[0] - y[0],
    );
    const seam = seams[0];
    if (!seam) {
      rows = [...rows, ...next];
      continue;
    }
    for (const [i, j] of pairs) {
      const kept = i <= seam[0] ? rows[i] : next[j];
      const other = i <= seam[0] ? next[j] : rows[i];
      const seen = new Set(kept.alternatives.map((s) => JSON.stringify(s)));
      for (const alternative of [other.source, ...other.alternatives]) {
        const identity = JSON.stringify(alternative);
        if (!seen.has(identity)) {
          seen.add(identity);
          kept.alternatives.push(alternative);
        }
      }
      kept.conflict ||=
        other.conflict || key(kept.source.text) !== key(other.source.text);
    }
    dropped += rows.length - seam[0] - 1 + seam[1] + 1;
    rows = [...rows.slice(0, seam[0] + 1), ...next.slice(seam[1] + 1)];
  }
  return {
    rows: rows.map(({ source, alternatives, conflict }) => ({
      source,
      alternatives,
      conflict,
    })),
    dropped,
  };
}
