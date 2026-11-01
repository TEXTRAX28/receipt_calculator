import type { Currency } from "./model";
import type { EvidenceLine, Recognition } from "./receipt-layout";
import { money } from "./money";
import { printedAmount } from "./printed-amount";
import { matchCostcoRow } from "./costco-row";

const tokens = (text: string) =>
  [...text.matchAll(/[-−]?[£$€]?\s*\d[\d,.]*[.,]\d{2,3}-?/g)].map((match) =>
    match[0].trim(),
  );

/** Propose a literal OCR row price only when the vision price is invalid.
 * Identity, currency and row-role checks belong to the independent verifier.
 * No subtotal, final total or arithmetic-derived amount enters this helper.
 */
export function recoverInvalidPrice(
  current: string,
  sourceValue: string,
  currency: Currency,
  regions: EvidenceLine[],
  recognition: Recognition,
) {
  if (!current || !sourceValue) return null;
  try {
    money(current, currency, true);
    return null;
  } catch {
    // A valid conflicting amount is never replaced by this rule.
  }
  try {
    const expected = money(sourceValue, currency, true);
    const negative = current.startsWith("-") && /[1-9]/.test(current);
    if (negative !== expected < 0n) return null;
    const purchases = regions.filter(
      (region) => matchCostcoRow(region.text)?.deduction === false,
    );
    const priced = regions.filter((region) => tokens(region.text).length);
    const candidates = purchases.length === 1 ? purchases : priced;
    if (candidates.length !== 1) return null;
    const region = candidates[0];
    const literal = tokens(region.text).at(-1)!;
    const value = printedAmount(literal, { currency });
    if (money(value, currency, true) !== expected) return null;
    const panel = recognition.panels.find(
      (panel) => panel.photo === region.photo && panel.part === region.part,
    );
    const words = (panel?.words || []).filter((word) => {
      const x = (word.box[0] + word.box[2]) / 2;
      const y = (word.box[1] + word.box[3]) / 2;
      return (
        word.confidence >= 0.98 &&
        x >= region.box[0] &&
        x <= region.box[2] &&
        y >= region.box[1] &&
        y <= region.box[3] &&
        tokens(word.text).at(-1) === literal
      );
    });
    words.sort((a, b) => b.box[2] - a.box[2]);
    if (
      !words.length ||
      (words.length > 1 && words[0].box[2] === words[1].box[2])
    )
      return null;
    return { value, previous: current, literal, region, word: words[0] };
  } catch {
    return null;
  }
}
