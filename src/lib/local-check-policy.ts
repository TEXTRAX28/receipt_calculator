import type { Receipt } from "./model";
import { calculateReceipt } from "./engine";
import { isFinalTotal } from "./parser";
import type { EvidenceLine, Recognition } from "./receipt-layout";

export type LocalCheckMode = "auto" | "always" | "off";
export type LocalCheckDecision = {
  needed: boolean;
  reasons: (
    "validation" | "parser-warning" | "multiple-sections" | "uncertain-source"
  )[];
};

/** Decides only whether to request a second local reading. It never verifies a
 * financial field, edits an amount, trusts LLM confidence or selects a cloud API.
 */
export function localCheckDecision(
  receipt: Receipt,
  sources: Record<string, number[]>,
  sourceLines: (EvidenceLine | null)[],
  recognition: Recognition,
): LocalCheckDecision {
  const reasons: LocalCheckDecision["reasons"] = [];
  if (calculateReceipt(receipt).issues.length) reasons.push("validation");
  if (recognition.panels.length > 1) reasons.push("multiple-sections");
  const relevant = new Set(Object.values(sources).flat());
  for (const [index, line] of sourceLines.entries())
    if (
      line &&
      (isFinalTotal(line.text) ||
        /^(?:sub\s*total|total\s*\(?\s*excl|vat|tax|prices?\b)/i.test(
          line.text,
        ))
    )
      relevant.add(index);
  const regions = [...relevant].flatMap((index) =>
    sourceLines[index] ? [sourceLines[index]!] : [],
  );
  const weak = (line: EvidenceLine) =>
    line.confidence < 0.75 ||
    recognition.panels.some(
      (panel) =>
        panel.photo === line.photo &&
        panel.part === line.part &&
        panel.words.some((word) => {
          if (word.confidence >= 0.75) return false;
          const x = (word.box[0] + word.box[2]) / 2,
            y = (word.box[1] + word.box[3]) / 2;
          return (
            x >= line.box[0] &&
            x <= line.box[2] &&
            y >= line.box[1] &&
            y <= line.box[3]
          );
        }),
    );
  if (
    receipt.items.some((item) => !sources[item.id]?.length) ||
    [...relevant].some((index) => !sourceLines[index]) ||
    regions.some(weak)
  )
    reasons.push("uncertain-source");
  const inclusive = sourceLines.some(
    (line) =>
      line &&
      /prices?\s+(?:already\s+)?include(?:s|d)?\s+(?:vat|tax)|(?:vat|tax)\s+included/i.test(
        line.text,
      ) &&
      !weak(line),
  );
  const exclusive = sourceLines.some(
    (line) =>
      line &&
      /prices?\s+(?:exclude|excl)|total\s*\(?\s*excl/i.test(line.text) &&
      !weak(line),
  );
  const supportedTaxBasis =
    inclusive !== exclusive && receipt.pricesIncludeTax === inclusive;
  if (
    receipt.warnings.some((warning) => {
      if (warning.startsWith("Receipt currency supplied by you:")) return false;
      if (
        warning ===
          "Confirm whether the item prices already include tax. Merchant formats vary." &&
        supportedTaxBasis
      )
        return false;
      return true;
    })
  )
    reasons.push("parser-warning");
  return { needed: reasons.length > 0, reasons };
}
