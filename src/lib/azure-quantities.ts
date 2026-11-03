import { azureQuantityHintsSchema } from "./azure-schema.mjs";
import type { Receipt } from "./model";
import type { EvidenceLine, Recognition } from "./receipt-layout";
import { alignedSourceWords } from "./source-words";

/** One printed quantity role, one source-owned purchase; never overwrite an existing quantity. */
export function recoverAzureQuantities(
  receipt: Receipt,
  sources: Record<string, number[]>,
  lines: (EvidenceLine | null)[],
  recognition: Recognition,
  input: unknown,
) {
  const hints = azureQuantityHintsSchema.parse(input);
  if (
    !hints.length ||
    recognition.engine !==
      "azure-document-intelligence-2024-11-30-receipt-words"
  )
    return [];
  const key = (photo: number, part: number, word: number) =>
    `${photo}:${part}:${word}`;
  const owners = new Map<string, Set<string>>();
  for (const panel of recognition.panels) {
    const indices = new Map(panel.words.map((word, i) => [word, i]));
    for (const item of receipt.items) {
      for (const index of sources[item.id] || []) {
        const line = lines[index];
        if (!line || line.photo !== panel.photo || line.part !== panel.part)
          continue;
        for (const word of alignedSourceWords(line, recognition) || []) {
          const index = indices.get(word);
          if (index === undefined) continue;
          const id = key(panel.photo, panel.part, index);
          const set = owners.get(id) || new Set<string>();
          set.add(item.id);
          owners.set(id, set);
        }
      }
    }
  }
  const proposals = new Map<string, typeof hints>();
  for (const hint of hints) {
    const panel = recognition.panels.find(
      (p) => p.photo === hint.photo && p.part === hint.part,
    );
    const word = panel?.words[hint.quantityWord];
    const all = [
      ...hint.descriptionWords,
      hint.quantityWord,
      ...hint.priceWords,
    ];
    if (
      !panel ||
      !word ||
      new Set(all).size !== all.length ||
      word.confidence < 0.98 ||
      word.text.replace(/\s/gu, "").replace(/[xX×]$/, "") !== hint.quantity ||
      all.some((i) => !panel.words[i] || panel.words[i].confidence < 0.75)
    )
      continue;
    const owned = all.map((i) => owners.get(key(hint.photo, hint.part, i)));
    const first = owned[0];
    if (!first || first.size !== 1) continue;
    const itemId = [...first][0];
    if (owned.some((set) => set?.size !== 1 || !set.has(itemId))) continue;
    const list = proposals.get(itemId) || [];
    list.push(hint);
    proposals.set(itemId, list);
  }
  const recovered: string[] = [];
  for (const item of receipt.items) {
    const proposed = proposals.get(item.id);
    if (item.quantity !== "" || proposed?.length !== 1) continue;
    const hint = proposed[0];
    const detail = {
      label: "Printed quantity identified by Azure",
      value: hint.quantity,
    };
    const existing = receipt.reviewChecks.find(
      (check) =>
        check.scope === "item" &&
        check.itemId === item.id &&
        check.field === "quantity",
    );
    if ((existing?.details?.length || 0) >= 30) continue;
    item.quantity = hint.quantity;
    if (existing) {
      existing.details = [...(existing.details || []), detail];
      existing.confirmedValue = "";
    } else
      receipt.reviewChecks.push({
        scope: "item",
        itemId: item.id,
        field: "quantity",
        reason: "recovered",
        other:
          "Azure identified a quantity in this purchase's source words. Check its role against the original.",
        details: [detail],
        confirmedValue: "",
      });
    recovered.push(item.id);
  }
  return recovered;
}
