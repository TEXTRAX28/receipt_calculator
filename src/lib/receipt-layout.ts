import type { z } from "zod";
import type { recognitionSchema } from "./recognition-schema.mjs";
import { matchCostcoRow } from "./costco-row";
import { PHOTO_SEPARATOR, isFinalTotal } from "./parser";

export type Recognition = z.infer<typeof recognitionSchema>;
export type EvidenceLine = Recognition["panels"][number]["lines"][number] & {
  photo: number;
  part: number;
};
type Photo = { photo: number; lines: EvidenceLine[] };
type PurchaseBlock = {
  sku: string;
  signature: string;
  lines: EvidenceLine[];
};
const key = (text: string) => text.toUpperCase().replace(/\s+/g, "");

/** Keep source regions while joining only exact adjacent windows of one image. */
function photoEvidence(recognition: Recognition): Photo[] {
  const photos = new Map<number, EvidenceLine[]>();
  for (const panel of [...recognition.panels].sort(
    (a, b) => a.photo - b.photo || a.part - b.part,
  )) {
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
  return [...photos].map(([photo, lines]) => ({ photo, lines }));
}

function endSection(photo: Photo) {
  const end = photo.lines.findIndex((line) => isFinalTotal(line.text));
  if (end < 0) return null;
  const anchors = new Set<string>();
  for (const { text } of photo.lines) {
    const anchor = text
      .trim()
      .match(/^(?:Tran|Transaction)\s*ID\s*[:#]\s*(\d{10,24})[\s.]*$/i);
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
 */
export function assembleRecognition(recognition: Recognition) {
  const photos = photoEvidence(recognition);
  const removed = new Set<EvidenceLine>();
  const overlaps: {
    keptPhoto: number;
    removedPhoto: number;
    purchases: number;
    regions: EvidenceLine[];
  }[] = [];
  if (
    photos.some((photo) => photo.lines.some((l) => /\bcostco\b/i.test(l.text)))
  ) {
    const sections = photos.map((photo) => ({
      photo,
      section: endSection(photo),
    }));
    for (const candidate of sections) {
      const { section, photo } = candidate;
      if (!section || section.purchases.length < 2) continue;
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
          (p, i) => p.signature === section.purchases[i].signature,
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
  }
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
    sourceLines: photos.flatMap((photo, index) => [
      ...(index ? [null] : []),
      ...photo.lines
        .filter((line) => !removed.has(line))
        .flatMap((line) =>
          line.text
            .replace(/\r/g, "")
            .split("\n")
            .map((text) => text.trim())
            .filter(Boolean)
            .map((text) => ({ ...line, text })),
        ),
    ]),
    overlaps,
    warnings: overlaps.map(
      (overlap) =>
        `Matched ${overlap.purchases} overlapping purchases in photos ${overlap.keptPhoto} and ${overlap.removedPhoto} using their transaction reference and ordered product codes, prices and coupons. Check the originals; separate repeated purchases were kept.`,
    ),
  };
}
