import type { z } from "zod";
import type { recognitionSchema } from "./recognition-schema.mjs";
import { matchCostcoRow } from "./costco-row";
import { PHOTO_SEPARATOR, isFinalTotal } from "./parser";
import type { ReadingWindow } from "./images";
import { joinWindowRows, type WindowRow } from "./window-overlap";

export type Recognition = z.infer<typeof recognitionSchema>;
export type SourceRecognition = Omit<Recognition, "engine" | "panels"> & {
  engine:
    | Recognition["engine"]
    | "tesseract-js-6-eng"
    | "paddle-ppocrv6-tiny-browser-wasm";
  panels: (Recognition["panels"][number] & { wordRows?: number[] })[];
};
export type EvidenceLine = Recognition["panels"][number]["lines"][number] & {
  photo: number;
  part: number;
};
type Photo = {
  photo: number;
  lines: EvidenceLine[];
  windowRows?: WindowRow[];
  joinedSectionRows?: number;
};
type PhotoWindows = readonly (
  readonly (ReadingWindow | undefined)[] | undefined
)[];
type PurchaseBlock = {
  sku: string;
  signature: string;
  lines: EvidenceLine[];
};
const key = (text: string) => text.toUpperCase().replace(/\s+/g, "");

/** Keep source regions while joining only exact adjacent windows of one image. */
function photoEvidence(
  recognition: SourceRecognition,
  windows?: PhotoWindows,
): Photo[] {
  const photos = new Map<number, EvidenceLine[]>();
  const panels = [...recognition.panels].sort(
    (a, b) => a.photo - b.photo || a.part - b.part,
  );
  for (const panel of panels) {
    const next = panel.lines
      .filter((line) => line.text.trim())
      .map((line) => ({ ...line, photo: panel.photo, part: panel.part }));
    const joined = photos.get(panel.photo) || [];
    let overlap = 0;
    for (
      let count = Math.min(200, joined.length, next.length);
      count >= 3;
      count--
    ) {
      const tail = joined.slice(-count).map((line) => key(line.text));
      if (
        new Set(tail).size >= 3 &&
        tail.every((text, i) => text === key(next[i].text))
      ) {
        overlap = count;
        break;
      }
    }
    photos.set(panel.photo, [...joined, ...next.slice(overlap)]);
  }
  return [...photos].map(([photo, lines]) => {
    const joined =
      windows?.[photo - 1] &&
      joinWindowRows(
        panels.filter((panel) => panel.photo === photo),
        windows[photo - 1]!,
      );
    return joined
      ? {
          photo,
          lines: joined.rows.map((row) => row.source),
          windowRows: joined.rows,
          joinedSectionRows: joined.dropped,
        }
      : { photo, lines };
  });
}

function endSection(photo: Photo) {
  const end = photo.lines.findIndex((line) => isFinalTotal(line.text));
  if (end < 0) return null;
  const anchors = new Set<string>();
  for (const { text } of photo.lines) {
    const anchor = text
      .trim()
      .match(/^(?:Tran|Transaction)\s*ID\s*[:：#]\s*(\d{10,24})[\s.…:：]*$/i);
    if (anchor) anchors.add(anchor[1]);
  }
  // References are used transiently for identity, never exposed in notes or results.
  if (anchors.size !== 1) return null;
  const purchases: PurchaseBlock[] = [];
  let previous: EvidenceLine | undefined;
  let unmatchedDeduction = false;
  for (const line of photo.lines.slice(0, end)) {
    const row = matchCostcoRow(line.text.trim());
    if (row) {
      // Require a complete description + numeric row, with no guessed quantity/code.
      if (
        !previous ||
        !/[a-z]{2}/i.test(previous.text) ||
        /\b(total|count|basket|receipt|vat|tax|tran|merchant)\b/i.test(
          previous.text,
        ) ||
        !/^\d/.test(row.quantity) ||
        !row.taxCode
      )
        return null;
      const signature = key(
        JSON.stringify({ description: previous.text.trim(), ...row }),
      );
      if (row.deduction) {
        const purchase = purchases.at(-1);
        if (!purchase) unmatchedDeduction = true;
        else {
          purchase.signature += `|${signature}`;
          purchase.lines.push(previous, line);
        }
      } else
        purchases.push({
          sku: row.sku,
          signature,
          lines: [previous, line],
        });
      previous = undefined;
    } else previous = line;
  }
  return unmatchedDeduction ? null : { anchor: [...anchors][0], purchases };
}

/** Conservative footer overlap: same transaction and complete end-aligned SKU sequence.
 * Missing identity, a single repeated SKU, conflicting coupons or unclear layout
 * leave every row in place. Genuine repetitions within a photo are never removed.
 * A cropped merchant heading is not required: identity comes from the exact
 * transaction reference and ordered purchase evidence, not a guessed retailer.
 */
export function assembleRecognition(
  recognition: SourceRecognition,
  windows?: PhotoWindows,
) {
  const photos = photoEvidence(recognition, windows);
  const removed = new Set<EvidenceLine>();
  const overlaps: {
    keptPhoto: number;
    removedPhoto: number;
    purchases: number;
    regions: EvidenceLine[];
  }[] = [];
  const sections = photos.map((photo) => ({
    photo,
    section: endSection(photo),
    conflicts: new Set(
      photo.windowRows?.filter((row) => row.conflict).map((row) => row.source),
    ),
  }));
  for (const candidate of sections) {
    const { section, photo } = candidate;
    if (!section || section.purchases.length < 2) continue;
    // A matching chosen row must not hide another disputed reading of it.
    if (
      section.purchases.some((purchase) =>
        purchase.lines.some((line) => candidate.conflicts.has(line)),
      )
    )
      continue;
    if (new Set(section.purchases.map((p) => p.sku)).size < 2) continue;
    const first = section.purchases[0].lines[0];
    if (first.part !== 1 || first.box[1] > 0.18) continue;
    const matches = sections.filter((other) => {
      if (
        !other.section ||
        other.photo === photo ||
        other.section.anchor !== section.anchor ||
        other.section.purchases.length <= section.purchases.length
      )
        return false;
      const tail = other.section.purchases.slice(-section.purchases.length);
      return tail.every(
        (p, i) =>
          p.signature === section.purchases[i].signature &&
          !p.lines.some((line) => other.conflicts.has(line)),
      );
    });
    // Ambiguous alternative source photos do not authorize removing evidence.
    if (matches.length !== 1) continue;
    const regions = section.purchases.flatMap((purchase) => purchase.lines);
    regions.forEach((line) => removed.add(line));
    overlaps.push({
      keptPhoto: matches[0].photo.photo,
      removedPhoto: photo.photo,
      purchases: section.purchases.length,
      regions,
    });
  }
  const sourceLines: (EvidenceLine | null)[] = [],
    sourceAlternatives: Record<number, EvidenceLine[]> = {},
    sourceConflicts: number[] = [];
  for (const [index, photo] of photos.entries()) {
    if (index) sourceLines.push(null);
    const rows = new Map(photo.windowRows?.map((row) => [row.source, row]));
    for (const line of photo.lines.filter((line) => !removed.has(line))) {
      const row = rows.get(line);
      for (const text of line.text
        .replace(/\r/g, "")
        .split("\n")
        .map((text) => text.trim())
        .filter(Boolean)) {
        const offset = sourceLines.length;
        sourceLines.push({ ...line, text });
        if (row?.alternatives.length)
          sourceAlternatives[offset] = row.alternatives;
        if (row?.conflict) sourceConflicts.push(offset);
      }
    }
  }
  const joinedSectionRows = photos.reduce(
    (count, photo) => count + (photo.joinedSectionRows || 0),
    0,
  );
  return {
    text: photos
      .map((photo) =>
        photo.lines
          .filter((line) => !removed.has(line))
          .map((line) => line.text)
          .join("\n"),
      )
      .join(`\n${PHOTO_SEPARATOR}\n`),
    photos,
    sourceLines,
    ...(windows
      ? { sourceAlternatives, sourceConflicts, joinedSectionRows }
      : {}),
    overlaps,
    warnings: [
      ...overlaps.map(
        (overlap) =>
          `Matched ${overlap.purchases} overlapping purchases in photos ${overlap.keptPhoto} and ${overlap.removedPhoto} using their transaction reference and ordered product codes, prices and coupons. Check the originals; separate repeated purchases were kept.`,
      ),
      ...(joinedSectionRows
        ? [
            "Matched overlapping sections in a long photo. Check the joined purchases against both source sections.",
          ]
        : []),
      ...(sourceConflicts.length
        ? [
            "Some overlapping sections disagree. Check both readings before confirming those values.",
          ]
        : []),
    ],
  };
}
