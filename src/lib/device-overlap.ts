import type { DeviceSourceRow } from "./device-evidence";
import type { ReadingWindow } from "./images";
import type { SourceRecognition } from "./receipt-layout";
import { joinOcrRows, overlappingOcrRows, ocrRowKey } from "./ocr-lines";
type Frame = {
  panel?: SourceRecognition["panels"][number];
  window?: ReadingWindow;
};

/** A differing name may share a literal quantity/unit/total suffix; money is never normalized or chosen. */
function sameFinancialReading(a: string, b: string) {
  if (ocrRowKey(a) === ocrRowKey(b)) return true;
  const suffix =
    /(?:^|\s)([+-−]?\d+(?:[.,]\d+)?)\s*[x×]\s+([+-−]?\d[\d,.]*)\s+([+-−]?\d[\d,.]*)(?:\s+(-?[A-Z0-9]{1,6}))?\s*$/i;
  const x = a.match(suffix),
    y = b.match(suffix);
  if (x && y) return x.slice(1).join("|") === y.slice(1).join("|");
  return !/\d/.test(a) && !/\d/.test(b);
}

/** One photograph's deterministic preparation windows, not cross-photo image matching. */
export function joinDeviceRows(parts: DeviceSourceRow[][], frames: Frame[]) {
  const valid = (frame: Frame) => {
    const w = frame.window,
      p = frame.panel;
    return (
      !!w &&
      !!p &&
      Number.isFinite(w.sourceWidth) &&
      Number.isFinite(w.sourceHeight) &&
      w.sourceWidth > 0 &&
      w.sourceHeight > 0 &&
      [...w.bounds, ...w.content].every(Number.isFinite) &&
      w.bounds[0] >= 0 &&
      w.bounds[1] >= 0 &&
      w.bounds[2] <= 1.001 &&
      w.bounds[3] <= 1.001 &&
      w.bounds[0] < w.bounds[2] &&
      w.bounds[1] < w.bounds[3] &&
      w.content[0] >= 0 &&
      w.content[1] >= 0 &&
      w.content[2] <= 1 &&
      w.content[3] <= 1 &&
      w.content[0] < w.content[2] &&
      w.content[1] < w.content[3]
    );
  };
  if (
    frames.length !== parts.length ||
    !frames.every(valid) ||
    frames.some(
      (frame) =>
        frame.window!.sourceWidth !== frames[0].window!.sourceWidth ||
        frame.window!.sourceHeight !== frames[0].window!.sourceHeight,
    ) ||
    new Set(frames.map((frame) => `${frame.panel!.photo}:${frame.panel!.part}`))
      .size !== frames.length
  )
    return {
      rows: joinOcrRows(parts),
      dropped: 0,
      conflicts: [] as number[],
      spatial: false,
    };
  const gridWidth = Math.min(
    ...frames.map(
      (frame) =>
        frame.panel!.width *
        (frame.window!.content[2] - frame.window!.content[0]),
    ),
  );
  const byPart = new Map(
    frames.map((frame) => [
      `${frame.panel!.photo}:${frame.panel!.part}`,
      frame,
    ]),
  );
  function mapped(row: DeviceSourceRow) {
    const source = row.source;
    if (!source) return null;
    const frame = byPart.get(`${source.photo}:${source.part}`);
    if (!frame) return null;
    const w = frame.window!,
      c = w.content,
      b = w.bounds;
    if (
      source.box[0] < c[0] ||
      source.box[1] < c[1] ||
      source.box[2] > c[2] ||
      source.box[3] > c[3]
    )
      return null;
    const x = (value: number) =>
      (b[0] + ((value - c[0]) / (c[2] - c[0])) * (b[2] - b[0])) * gridWidth;
    const y = (value: number) =>
      ((b[1] + ((value - c[1]) / (c[3] - c[1])) * (b[3] - b[1])) *
        gridWidth *
        w.sourceHeight) /
      w.sourceWidth;
    return {
      box: [
        x(source.box[0]),
        y(source.box[1]),
        x(source.box[2]),
        y(source.box[3]),
      ],
      window: [
        b[0] * gridWidth,
        (b[1] * gridWidth * w.sourceHeight) / w.sourceWidth,
        b[2] * gridWidth,
        (b[3] * gridWidth * w.sourceHeight) / w.sourceWidth,
      ],
      photo: source.photo,
      part: source.part,
    };
  }
  function sameArea(a: DeviceSourceRow, b: DeviceSourceRow) {
    const x = mapped(a),
      y = mapped(b);
    if (!x || !y || x.photo !== y.photo || x.part === y.part) return false;
    const shared = [
      Math.max(x.window[0], y.window[0]),
      Math.max(x.window[1], y.window[1]),
      Math.min(x.window[2], y.window[2]),
      Math.min(x.window[3], y.window[3]),
    ];
    if (shared[0] >= shared[2] || shared[1] >= shared[3]) return false;
    const inside = (box: number[]) =>
      box[0] >= shared[0] + 2 &&
      box[1] >= shared[1] + 2 &&
      box[2] <= shared[2] - 2 &&
      box[3] <= shared[3] - 2;
    return (
      inside(x.box) &&
      inside(y.box) &&
      x.box.every((value, i) => Math.abs(value - y.box[i]) <= 2)
    );
  }
  const clone = (row: DeviceSourceRow): DeviceSourceRow => ({
    ...row,
    alternatives: [...(row.alternatives || [])],
  });
  let rows = (parts[0] || []).map(clone),
    dropped = 0;
  const conflicted = new Set<DeviceSourceRow>();
  const pairs: [DeviceSourceRow, DeviceSourceRow][] = [];
  let financialConflict = false;
  for (const next of parts.slice(1)) {
    const overlap = overlappingOcrRows(rows, next),
      candidates = new Map<number, number[]>();
    for (const [index, row] of next.entries()) {
      const matches = rows.flatMap((previous, i) =>
        sameArea(previous, row) ? [i] : [],
      );
      // Retain the old exact-prefix behavior only where source rectangles are unavailable.
      if (!matches.length && index < overlap) {
        const prior = rows.length - overlap + index;
        if (!mapped(row) || !mapped(rows[prior])) matches.push(prior);
      }
      candidates.set(index, matches);
    }
    const uses = new Map<number, number>();
    for (const list of candidates.values())
      for (const i of list) uses.set(i, (uses.get(i) || 0) + 1);
    const additions: DeviceSourceRow[] = [];
    for (const [index, row] of next.entries()) {
      const matches = candidates.get(index)!;
      if (matches.length !== 1 || uses.get(matches[0]) !== 1) {
        additions.push(clone(row));
        continue;
      }
      const previous = rows[matches[0]];
      pairs.push([previous, row]);
      financialConflict ||= !sameFinancialReading(previous.text, row.text);
      if (row.source) previous.alternatives!.push(row.source);
      if (ocrRowKey(previous.text) !== ocrRowKey(row.text))
        conflicted.add(previous);
      dropped++;
    }
    rows = [...rows, ...additions];
  }
  if (financialConflict) {
    // A partial spatial splice can detach a later correct amount from its name.
    // Preserve the whole photo's legacy text and both literal readings instead.
    const legacy = joinOcrRows(parts).map(clone);
    const identity = (row: DeviceSourceRow) =>
      row.source &&
      JSON.stringify([row.source.photo, row.source.part, row.source.box]);
    const conflicts = new Set<number>();
    for (const [a, b] of pairs)
      for (const [i, row] of legacy.entries()) {
        const alternate =
          identity(row) === identity(a)
            ? b
            : identity(row) === identity(b)
              ? a
              : null;
        if (!alternate?.source) continue;
        row.alternatives!.push(alternate.source);
        if (ocrRowKey(row.text) !== ocrRowKey(alternate.text)) conflicts.add(i);
      }
    return {
      rows: legacy,
      dropped: 0,
      conflicts: [...conflicts],
      spatial: false,
    };
  }
  return {
    rows,
    dropped,
    conflicts: rows.flatMap((row, index) =>
      conflicted.has(row) ? [index] : [],
    ),
    spatial: true,
  };
}
