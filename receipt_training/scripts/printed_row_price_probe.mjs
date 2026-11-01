// Research-only preference for a single literal OCR amount over a multiplied model amount.
// Uses no labels, totals-based repair, currency inference or new model/provider calls.
export function addPrintedRowPriceProbe(source) {
  const marker =
    "  if (costcoSource) {\n    for (const [nativeIndex, sourceIndex] of pairs) {";
  if (source.split(marker).length !== 2)
    throw new Error("Verifier probe location changed");
  const code = `  const printedPriceRecoveries = [];
  if (!receipt.currencyUnresolved && !ocr.currencyUnresolved && receipt.currency === ocr.currency) {
    for (const [nativeIndex, sourceIndex] of pairs) {
      const owner = receipt.items[nativeIndex], source = sourceRows[sourceIndex];
      if (source.regions.length !== 1 || source.item.unitPrice !== "" ||
          source.item.discount !== "0" || owner.discount !== "0" ||
          source.item.taxCode !== owner.taxCode ||
          nameKey(owner.description) !== nameKey(source.item.description) ||
          !/^[1-9]\\d{0,8}$/.test(owner.quantity) || owner.quantity !== source.item.quantity ||
          BigInt(owner.quantity) <= 1n ||
          !ocr.reviewChecks.some((check) => check.scope === "item" && check.itemId === source.item.id &&
            check.field === "quantity" && check.reason === "source")) continue;
      const region = source.regions[0];
      // A unit-only column can make the multiplied model total correct.
      // Never substitute its literal unit amount for the row total.
      if (lines.some((line) => line && line.photo === region.photo && line.part === region.part &&
          line.box[3] < region.box[1] && !/\\d/.test(line.text) &&
          /\\b(?:unit\\s*price|price\\s*each|price\\s*per\\s*unit|per\\s*item|price\\s*\\/\\s*(?:item|unit|ea))\\b/i.test(line.text))) continue;
      const tokens = [...region.text.matchAll(/[-−]?\\d[\\d,.]*[.,]\\d{2,3}-?/g)].map((match) => match[0]);
      if (tokens.length !== 1) continue;
      const panel = recognition.panels.find((panel) => panel.photo === region.photo && panel.part === region.part);
      const words = panel?.words.filter((word) => {
        const x = (word.box[0] + word.box[2]) / 2, y = (word.box[1] + word.box[3]) / 2;
        return word.text.trim() === tokens[0] && word.confidence >= 0.98 &&
          x >= (region.box[0] + region.box[2]) / 2 && x <= region.box[2] &&
          y >= region.box[1] && y <= region.box[3];
      }) || [];
      if (words.length !== 1) continue;
      try {
        const literal = normalizeAmount(tokens[0], receipt.currency);
        const printed = money(literal, receipt.currency);
        const modelUnit = money(owner.unitPrice, receipt.currency);
        const modelLine = money(owner.lineTotal, receipt.currency);
        if (printed <= 0n || modelUnit !== printed ||
            modelLine !== printed * BigInt(owner.quantity) ||
            !sameAmount(literal, source.item.lineTotal, receipt.currency)) continue;
        const before = { unitPrice: owner.unitPrice, lineTotal: owner.lineTotal };
        owner.lineTotal = literal;
        owner.unitPrice = "";
        itemCheck(owner, "lineTotal", "recovered", before.lineTotal);
        const check = checks.find((check) => check.scope === "item" && check.itemId === owner.id && check.field === "lineTotal");
        check.details = [{ label: "Printed OCR amount — confirm row versus unit", value: literal },
          { label: "Previous vision row amount", value: before.lineTotal },
          { label: "Previous unsupported unit amount", value: before.unitPrice }];
        printedPriceRecoveries.push({ itemId: owner.id, nativeIndex, sourceIndex, before, after: { unitPrice: "", lineTotal: literal },
          literalToken: tokens[0], confidence: words[0].confidence, region, sourceIndices: source.indices });
      } catch { /* Ambiguous or invalid money never supplies a recovery. */ }
    }
  }
`;
  const result = source.replace(marker, code + marker);
  const returned = "    corrections,\n    removedAdjustments,";
  if (result.split(returned).length !== 2)
    throw new Error("Verifier return location changed");
  return result.replace(
    returned,
    "    corrections,\n    printedPriceRecoveries,\n    removedAdjustments,",
  );
}
