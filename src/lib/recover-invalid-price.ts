import type { Currency } from "./model";
import type { EvidenceLine, Recognition } from "./receipt-layout";
import { money } from "./money";
import { printedAmount } from "./printed-amount";
import { matchCostcoRow } from "./costco-row";
import { matchPurchaseExpression } from "./purchase-expression";
import { alignedSourceWords } from "./source-words";

const tokens = (text: string) =>
  [...text.matchAll(/[-−]?[£$€]?\s*\d[\d,.]*[.,]\d{2,3}-?/g)].map((match) =>
    match[0].trim(),
  );

/** Propose a literal OCR row price only when the vision price is invalid.
 * Identity, currency and row-role checks belong to the independent verifier.
 * No receipt-wide arithmetic or derived amount selects a value here.
 */
export function recoverInvalidPrice(
  current: string,
  sourceValue: string,
  currency: Currency,
  regions: EvidenceLine[],
  recognition: Recognition,
  role: "lineTotal" | "unitPrice" = "lineTotal",
  sourceToken?: { text: string; literal: string; span: [number, number] },
) {
  if ((!current && !sourceToken) || !sourceValue) return null;
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
    const priced = regions.filter((region) =>
      role === "unitPrice"
        ? matchPurchaseExpression(region.text) ||
          sourceToken?.text === region.text
        : tokens(region.text).length,
    );
    const candidates = purchases.length === 1 ? purchases : priced;
    if (candidates.length !== 1) return null;
    const region = candidates[0];
    const anchored =
      sourceToken?.text === region.text &&
      region.text.slice(...sourceToken.span) === sourceToken.literal
        ? sourceToken
        : null;
    if (sourceToken && !anchored) return null;
    const expression =
      role === "unitPrice" ? matchPurchaseExpression(region.text) : null;
    const costcoUnit =
      role === "unitPrice" && matchCostcoRow(region.text)
        ? region.text.match(/(?:\d+(?:[.,]\d+)?|[Il])\s*[x×]\s+([\d,.]+)/di)
        : null;
    const span =
      anchored?.span || expression?.unitSpan || costcoUnit?.indices?.[1];
    const literal =
      anchored?.literal ||
      (role === "unitPrice"
        ? expression?.unitPrice || costcoUnit?.[1]
        : tokens(region.text).at(-1));
    if (!literal) return null;
    const value = printedAmount(literal, { currency });
    if (money(value, currency, true) !== expected) return null;
    const panel = recognition.panels.find(
      (panel) => panel.photo === region.photo && panel.part === region.part,
    );
    if (role === "unitPrice" || anchored) {
      if (!span) return null;
      const compact = (text: string) => text.replace(/\s/g, "");
      const inside = alignedSourceWords(region, recognition);
      if (!inside) return null;
      const start = compact(region.text.slice(0, span[0])).length;
      const end = compact(region.text.slice(0, span[1])).length;
      let offset = 0;
      const monetary = inside.filter((word) => {
        const left = offset;
        offset += compact(word.text).length;
        return left <= start && offset >= end;
      });
      if (monetary.length !== 1 || monetary[0].confidence < 0.98) return null;
      return { value, previous: current, literal, region, word: monetary[0] };
    }
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
