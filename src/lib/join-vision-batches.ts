import { aiReceiptSchema } from "./extraction-schema.mjs";
import type { ReceiptReviewField } from "./model";
import type { ReadingPanel } from "./panel-transport";
import type { EvidenceLine, Recognition } from "./receipt-layout";
import type { VisionBatch } from "./local-vision-batches";
import { verifyIndependentReadings } from "./verify-readings";
import { planVisionBatches } from "./vision-plan.mjs";
import type { ReadingContext } from "./reading-context.mjs";

const regionKey = (region: EvidenceLine) =>
  JSON.stringify([region.photo, region.part, region.box, region.text]);
const decimalKey = (value: string) =>
  value.includes(".") ? value.replace(/0+$/, "").replace(/[.]$/, "") : value;
const itemKey = (item: VisionBatch["receipt"]["items"][number]) =>
  JSON.stringify([
    item.description
      .normalize("NFKC")
      .toUpperCase()
      .replace(/[^\p{L}\p{N}]/gu, ""),
    ...[item.quantity, item.unitPrice, item.lineTotal, item.discount].map(
      decimalKey,
    ),
  ]);

/** Only one physical source row can authorize joining copies from adjacent batches. */
export function joinVisionBatches(
  batches: VisionBatch[],
  panels: ReadingPanel[],
  recognition: Recognition,
  context?: ReadingContext,
) {
  const plan = planVisionBatches(panels.length);
  if (
    batches.length !== plan.length ||
    batches.some(
      (batch, index) =>
        JSON.stringify(batch.indices) !== JSON.stringify(plan[index]),
    )
  )
    throw new Error(
      "The long receipt does not cover every original section in order.",
    );
  const items: VisionBatch["receipt"]["items"] = [];
  const origins: {
    batch: number;
    anchors: Set<string>;
    signature: string;
    index: number;
  }[] = [];
  let joined = 0;
  const itemTaxConflicts = new Map<number, Set<string>>();
  for (const [batchIndex, batch] of batches.entries()) {
    const supplied = new Set(
      batch.indices.map(
        (index) => `${panels[index].photo}:${panels[index].part}`,
      ),
    );
    const subset: Recognition = {
      ...recognition,
      panels: recognition.panels.filter((panel) =>
        supplied.has(`${panel.photo}:${panel.part}`),
      ),
    };
    if (subset.panels.length !== supplied.size)
      throw new Error(
        "A section has no corresponding independent OCR evidence.",
      );
    const compared = verifyIndependentReadings(batch.receipt, subset, context);
    const counts = new Map<string, number>();
    for (const anchor of compared.itemAnchors.filter(
      (anchor) => anchor.reliable,
    ))
      for (const key of new Set(anchor.regions.map(regionKey)))
        counts.set(key, (counts.get(key) || 0) + 1);
    for (const [nativeIndex, item] of batch.receipt.items.entries()) {
      const anchor = compared.itemAnchors.find(
        (anchor) => anchor.nativeIndex === nativeIndex && anchor.reliable,
      );
      const keys = new Set(
        anchor?.regions.map(regionKey).filter((key) => counts.get(key) === 1) ||
          [],
      );
      const signature = itemKey(item);
      const duplicates = origins.filter(
        (origin) =>
          origin.batch === batchIndex - 1 &&
          origin.signature === signature &&
          [...keys].some((key) => origin.anchors.has(key)),
      );
      if (duplicates.length === 1) {
        const duplicate = duplicates[0];
        if (
          items[duplicate.index].taxCode.toUpperCase() !==
          item.taxCode.toUpperCase()
        )
          itemTaxConflicts.set(
            duplicate.index,
            new Set([
              ...(itemTaxConflicts.get(duplicate.index) || []),
              items[duplicate.index].taxCode,
              item.taxCode,
            ]),
          );
        items[duplicate.index].sourcePhotos = [
          ...new Set([
            ...items[duplicate.index].sourcePhotos,
            ...item.sourcePhotos,
          ]),
        ];
        // Carry this batch's provenance forward for the next adjacent overlap.
        origins.push({
          batch: batchIndex,
          anchors: keys,
          signature,
          index: duplicate.index,
        });
        joined++;
      } else {
        const index = items.length;
        items.push({ ...item, sourcePhotos: [...item.sourcePhotos] });
        origins.push({ batch: batchIndex, anchors: keys, signature, index });
      }
    }
  }
  const draft = structuredClone(batches[0].receipt);
  draft.items = items;
  draft.adjustments = [];
  draft.taxCodes = [];
  const conflicts = new Set<ReceiptReviewField>();
  for (const field of [
    "merchant",
    "date",
    "currency",
    "subtotal",
    "printedTotal",
    "printedTax",
    "pricesIncludeTax",
    "printedItemCount",
  ] as const) {
    const values = batches
      .map((batch) => batch.receipt[field])
      .filter((value) => value !== "" && value !== null);
    const distinct = new Set(values.map((value) => JSON.stringify(value)));
    if (distinct.size > 1 && field !== "printedItemCount") conflicts.add(field);
    // Last observed metadata is provisional, never chosen by arithmetic or receipt balance.
    if (values.length) Object.assign(draft, { [field]: values.at(-1) });
  }
  for (const { receipt } of batches) {
    for (const entry of receipt.taxCodes) {
      if (
        draft.taxCodes.some(
          (other) =>
            other.code === entry.code &&
            decimalKey(other.rate) !== decimalKey(entry.rate),
        )
      )
        conflicts.add("taxCodes");
      if (
        !draft.taxCodes.some(
          (other) =>
            other.code === entry.code &&
            decimalKey(other.rate) === decimalKey(entry.rate),
        )
      )
        draft.taxCodes.push(entry);
    }
    // Identical labels/amounts are not proof that separately read charges are one charge.
    draft.adjustments.push(...receipt.adjustments);
  }
  if (batches.filter((batch) => batch.receipt.adjustments.length).length > 1)
    conflicts.add("adjustments");
  if (itemTaxConflicts.size) conflicts.add("taxCodes");
  draft.warnings = [
    ...new Set(batches.flatMap((batch) => batch.receipt.warnings)),
  ].slice(0, 30);
  const result = verifyIndependentReadings(
    aiReceiptSchema.parse(draft),
    recognition,
    context,
    // A batch's original currency must not be reinterpreted using another's.
    {
      allowPriceRecovery: !conflicts.has("currency"),
      blockedScalarFields: (
        ["subtotal", "printedTotal", "printedTax"] as const
      ).filter((field) => conflicts.has(field)),
    },
  );
  for (const field of new Set<ReceiptReviewField>(["items", ...conflicts])) {
    const existing = result.receipt.reviewChecks.find(
      (check) => check.scope === "receipt" && check.field === field,
    );
    const change = {
      reason:
        field === "items" ? ("coverage" as const) : ("different" as const),
      other:
        field === "items"
          ? "Check all purchases across the complete long receipt"
          : "Different values were read in separate receipt sections",
      confirmedValue: "",
    };
    if (existing) Object.assign(existing, change);
    else
      result.receipt.reviewChecks.push({ scope: "receipt", field, ...change });
  }
  const removed = new Set(
    result.corrections.map((correction) => correction.removedNativeIndex),
  );
  for (const [rawIndex, values] of itemTaxConflicts) {
    if (removed.has(rawIndex)) continue; // The source-confirmed coupon check remains mandatory.
    const item =
      result.receipt.items[
        rawIndex - [...removed].filter((index) => index < rawIndex).length
      ];
    if (!item) throw new Error("A joined purchase lost its review identity.");
    const existing = result.receipt.reviewChecks.find(
      (check) =>
        check.scope === "item" &&
        check.itemId === item.id &&
        check.field === "taxCode",
    );
    const detail = [...values]
      .map((value) => value || "No code")
      .join(" / ")
      .slice(0, 180);
    if (existing)
      Object.assign(existing, {
        reason: "different",
        other: [...new Set([existing.other, detail].filter(Boolean))]
          .join("; ")
          .slice(0, 180),
        confirmedValue: "",
      });
    else
      result.receipt.reviewChecks.push({
        scope: "item",
        itemId: item.id,
        field: "taxCode",
        reason: "different",
        other: detail,
        confirmedValue: "",
      });
  }
  result.receipt.warnings.unshift(
    "This long receipt was read in sections. Check the full purchase list against every original photo, including overlaps.",
  );
  result.receipt.warnings = result.receipt.warnings.slice(0, 60);
  return {
    ...result,
    batchJoin: {
      batches: batches.length,
      sections: panels.length,
      joined,
      metadataConflicts: [...conflicts],
    },
  };
}
