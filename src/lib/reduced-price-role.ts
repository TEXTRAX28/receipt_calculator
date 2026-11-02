import type { Currency, Item } from "./model";
import { money } from "./money";
import type { EvidenceLine, Recognition } from "./receipt-layout";
import { alignedSourceWords } from "./source-words";
import { recoverInvalidPrice } from "./recover-invalid-price";

/** A printed reduced selling price is not a second deduction from that price. */
export function recoverReducedPriceRole(
  item: Item,
  source: { item: Item; indices: number[]; regions: EvidenceLine[] },
  recognition: Recognition,
  currency: Currency,
) {
  if (
    item.lineTotal !== "" ||
    item.unitPrice !== "" ||
    !source.item.lineTotal ||
    source.indices.length !== 2 ||
    source.indices[1] !== source.indices[0] + 1 ||
    source.regions.length !== 2
  )
    return null;
  const [title, price] = source.regions;
  if (
    title.text.trim() !== source.item.description ||
    title.photo !== price.photo ||
    title.part !== price.part ||
    title.box[3] >= price.box[1] ||
    item.taxCode !== source.item.taxCode ||
    source.regions.some((region) => {
      const words = alignedSourceWords(region, recognition);
      return (
        region.confidence < 0.98 ||
        !words?.length ||
        words.some((word) => word.confidence < 0.98)
      );
    })
  )
    return null;
  const reduced = price.text.match(
    /^reduced\s+price\s*:?\s+([£$€]?\s*\d[\d,.]*[.,]\d{2,3})\s*[A-Z]?\s*$/di,
  );
  if (!reduced?.indices?.[1]) return null;
  try {
    const value = money(source.item.lineTotal, currency, true);
    if (
      value <= 0n ||
      money(item.discount, currency, true) !== value ||
      money(source.item.discount, currency, true) !== 0n
    )
      return null;
  } catch {
    return null;
  }
  return recoverInvalidPrice(
    item.lineTotal,
    source.item.lineTotal,
    currency,
    source.regions,
    recognition,
    "lineTotal",
    { text: price.text, literal: reduced[1], span: reduced.indices[1] },
  );
}
