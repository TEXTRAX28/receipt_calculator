import {
  newItem,
  newReceipt,
  receiptSchema,
  type Receipt,
  type Currency,
} from "./model";
import { printedAmount } from "./printed-amount";
import { matchCostcoRow } from "./costco-row";
import { z } from "zod";
import {
  readingContextSchema,
  type ReadingContext,
} from "./reading-context.mjs";

export const extractionOutputSchema = z.object({
  text: z.string().min(1).max(60000),
});
export const PHOTO_SEPARATOR = "--- GATHER PHOTO BOUNDARY ---";
const amountPattern = /[-−]?\d[\d,.]*[.,]\d{2,3}-?/g;
export function normalizeAmount(token: string, currency?: Currency): string {
  return printedAmount(token, { currency });
}
const valuesIn = (line: string) =>
  [...line.matchAll(amountPattern)].map((m) => m[0]);
export const isFinalTotal = (line: string) =>
  /\b(?:total\s*\(?\s*(?:incl(?:uding)?\.?\s*(?:vat|tax))|grand total|amount due|balance due|(?:total(?:\s+refund)?|refund total|amount refunded)\s*[:£$€]?\s*(?:(?:GBP|USD|EUR|CAD|AUD|NZD|JPY|KWD|BHD|CHF|SEK|KRW|IDR|TWD|Rp\.?)\s*)?[-−]?\s*[£$€]?\s*[-−]?\s*\d)/i.test(
    line,
  ) && !/excl|subtotal|sub total|number|items|count|savings/i.test(line);

/** Heuristics produce an editable draft, never a declaration of financial correctness. */
export function parseReceiptText(
  output: unknown,
  context?: ReadingContext,
): Receipt {
  return parseReceiptWithSources(output, context).receipt;
}

/** Indices refer to trimmed, nonempty text lines, including photo boundaries. */
export function parseReceiptWithSources(
  output: unknown,
  context?: ReadingContext,
): {
  receipt: Receipt;
  sources: Record<string, number[]>;
} {
  const selected = readingContextSchema.optional().parse(context);
  const { text } = extractionOutputSchema.parse(
    typeof output === "string" ? { text: output } : output,
  );
  const receipt = newReceipt();
  const sources: Record<string, number[]> = {};
  receipt.source = "text";
  receipt.rawText = text;
  const lines = text
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length > 2000 || lines.some((line) => line.length > 1000)) {
    throw new Error(
      "Receipt text has too many lines or an excessively long line. Crop the receipt or use manual entry.",
    );
  }
  const isCostco =
    /costco|\bKS ROTISS|\bIRC BELVEDERE|\bCHICKEN SKEWER 15/i.test(text);
  receipt.merchant = isCostco
    ? "Costco"
    : (
        lines.find(
          (l) =>
            /[a-z]{3}/i.test(l) &&
            !/^(receipt|tax invoice|welcome|tel|vat|date)\b/i.test(l),
        ) || ""
      ).slice(0, 100);
  let currencyIdentified = true;
  let printedCurrencyIdentified = true;
  const explicitCurrency = text.match(
    /\b(GBP|USD|EUR|CAD|AUD|NZD|CHF|SEK|JPY|KRW|KWD|BHD|IDR|TWD)\b/,
  );
  if (explicitCurrency) receipt.currency = explicitCurrency[1] as Currency;
  else if (/\bRp\.?(?=\s|\d|$)/i.test(text)) receipt.currency = "IDR";
  else if (/NT\$|新[臺台]幣|[臺台]幣/.test(text)) receipt.currency = "TWD";
  else if (text.includes("£") || /\bGBP\b/.test(text)) receipt.currency = "GBP";
  else if (text.includes("€") || /\bEUR\b/.test(text)) receipt.currency = "EUR";
  else if (/\bJPY\b/.test(text)) receipt.currency = "JPY";
  else if (/\bKWD\b/.test(text)) receipt.currency = "KWD";
  else if (text.includes("$") || /\bUSD\b/.test(text)) {
    receipt.currency = "USD";
    currencyIdentified = false;
    printedCurrencyIdentified = false;
    if (!/\bUSD\b/.test(text) && !selected)
      receipt.warnings.push(
        "Dollar symbols can mean several currencies. Confirm the selected currency.",
      );
  } else {
    currencyIdentified = false;
    printedCurrencyIdentified = false;
    if (!selected)
      receipt.warnings.push(
        "Currency was not identified. Confirm the selected currency.",
      );
  }
  if (selected) {
    const incompatibleDollar =
      !printedCurrencyIdentified &&
      text.includes("$") &&
      !["USD", "CAD", "AUD", "NZD", "TWD"].includes(selected.currency);
    if (!printedCurrencyIdentified && !incompatibleDollar) {
      receipt.currency = selected.currency as Currency;
      currencyIdentified = true;
      receipt.warnings.push(
        `Receipt currency supplied by you: ${selected.currency}. Check every printed amount; this is not a currency conversion.`,
      );
    } else if (receipt.currency !== selected.currency || incompatibleDollar) {
      currencyIdentified = false;
      receipt.warnings.push(
        `The printed currency ${receipt.currency} conflicts with your selected ${selected.currency}. Confirm the currency and every amount against the receipt.`,
      );
      receipt.reviewChecks.push({
        scope: "receipt",
        field: "currency",
        reason: "different",
        other: `Selected reading currency: ${selected.currency}`,
        confirmedValue: "",
      });
    }
  }
  receipt.currencyUnresolved = !currencyIdentified;
  const normalize = (token: string) => {
    try {
      return normalizeAmount(
        token,
        currencyIdentified ? receipt.currency : undefined,
      );
    } catch (error) {
      receipt.warnings.push(
        `Unclear printed amount “${token.slice(0, 60)}”: ${(error as Error).message} Enter it from the original.`,
      );
      return "";
    }
  };
  const lastAmount = (line: string) => {
    const amountLine = line.replace(/([-−])\s*([£$€])\s*(?=\d)/g, "$2$1");
    const values =
      currencyIdentified &&
      ["IDR", "TWD", "JPY", "KRW"].includes(receipt.currency)
        ? [...amountLine.matchAll(/[-−]?\d[\d,.]*-?/g)].map((m) => m[0])
        : valuesIn(amountLine);
    return values.length ? normalize(values.at(-1)!) : "";
  };
  const isoDate = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  const localDate = text.match(/\b(\d{1,2})[/.](\d{1,2})[/.](20\d{2})\b/);
  if (isoDate) receipt.date = isoDate[0];
  else if (localDate) {
    receipt.date = `${localDate[3]}-${localDate[2].padStart(2, "0")}-${localDate[1].padStart(2, "0")}`;
    receipt.warnings.push(
      "Date interpreted as day/month/year. Confirm it against the receipt.",
    );
  }
  let taxAmount = "";
  const extraCharges: {
    label: string;
    kind: "fee" | "tip" | "deposit";
    amount: string;
  }[] = [];
  for (const line of lines) {
    const code = line.match(
      /^([A-Z][A-Z0-9]{0,5})\s+(\d+(?:[.,]\d+)?)\s*%\s+[\d,.]+\s+[\d,.]+\s*$/,
    );
    if (code)
      receipt.taxCodes.push({ code: code[1], rate: code[2].replace(",", ".") });
    if (isFinalTotal(line)) {
      const candidate = lastAmount(line);
      if (
        candidate &&
        receipt.printedTotal &&
        candidate !== receipt.printedTotal
      )
        receipt.warnings.push(
          "Different final totals were read. Check the printed total against the original before confirming this receipt.",
        );
      receipt.printedTotal = candidate || receipt.printedTotal;
    }
    if (/\b(?:subtotal|sub total|total\s*\(?\s*excl)/i.test(line))
      receipt.subtotal = lastAmount(line) || receipt.subtotal;
    if (
      /^(?:vat amount|tax amount|sales tax|vat|tax)\s*[:£$€]?\s*[-−]?\s*\d/i.test(
        line,
      ) &&
      !/%/.test(line)
    )
      taxAmount = lastAmount(line) || taxAmount;
    if (
      /^(?:service (?:charge|fee)|delivery fee|shipping|tip|gratuity|deposit)\b/i.test(
        line,
      )
    ) {
      const amount = lastAmount(line);
      if (amount)
        extraCharges.push({
          label: line.replace(amountPattern, "").trim().slice(0, 100),
          kind: /tip|gratuity/i.test(line)
            ? "tip"
            : /deposit/i.test(line)
              ? "deposit"
              : "fee",
          amount,
        });
    }
  }
  // Repeated photographs can repeat a VAT legend; keep one definition, never remove purchased items.
  receipt.taxCodes = receipt.taxCodes.filter(
    (entry, index, all) =>
      all.findIndex((e) => e.code === entry.code && e.rate === entry.rate) ===
      index,
  );
  const ukCostco =
    isCostco &&
    ((currencyIdentified && receipt.currency === "GBP") || /\bUK\b/.test(text));
  receipt.pricesIncludeTax =
    !ukCostco && !/prices?\s+(?:exclude|excl)|total\s*\(?\s*excl/i.test(text);
  if (isCostco && !receipt.taxCodes.length) {
    receipt.warnings.push(
      "The Costco tax legend was not read. Add its printed code rates; codes vary between countries and receipts.",
    );
  }
  receipt.taxMode = receipt.taxCodes.length || isCostco ? "codes" : "printed";
  receipt.printedTax = taxAmount;
  if (taxAmount && receipt.taxMode === "printed")
    receipt.adjustments.push({
      id: crypto.randomUUID(),
      label: "Printed tax",
      kind: "tax",
      amount: taxAmount,
      allocation: "proportional",
    });
  for (const charge of extraCharges)
    receipt.adjustments.push({
      id: crypto.randomUUID(),
      ...charge,
      allocation: "proportional",
    });
  if (!isCostco)
    receipt.warnings.push(
      "Confirm whether the item prices already include tax. Merchant formats vary.",
    );
  let pendingDescription = "";
  let pendingSource: number | undefined;
  let itemSectionEnded = false;
  for (const [lineIndex, line] of lines.entries()) {
    if (line === PHOTO_SEPARATOR) {
      itemSectionEnded = false;
      pendingDescription = "";
      pendingSource = undefined;
      continue;
    }
    if (isFinalTotal(line)) itemSectionEnded = true;
    if (
      itemSectionEnded ||
      /bottom of basket|BOB count|vat code|^\s*[A-Z]\s+\d+[.,]\d+%|subtotal|sub total|total.*excl|vat amount|^tax\b|^vat\b|service (?:charge|fee)|^delivery fee|^shipping|^tip\b|^gratuity\b|^deposit\b|^savings\b/i.test(
        line,
      )
    )
      continue;
    if (
      /please keep|merchant id|tran id|approval|card:|visa|mastercard|change|membership|vat no|awrs|reg\.|home office|individual\s+\d|^trade\s+\d|cashier/i.test(
        line,
      )
    ) {
      pendingDescription = "";
      pendingSource = undefined;
      continue;
    }
    // A reduced-price label states the preceding product's selling price,
    // rather than a second purchase or another deduction from that price.
    const reducedPrice = line.match(
      /^reduced\s+price\s*:?(?:\s+([£$€]?\s*\d[\d,.]*[.,]\d{2,3})\s*([A-Z])?)?\s*$/i,
    );
    if (reducedPrice) {
      if (
        pendingDescription &&
        pendingSource === lineIndex - 1 &&
        !/^(?:reduced price|receipt|total|cash|tax|vat|tel|date)\b/i.test(
          pendingDescription,
        )
      ) {
        const item = newItem();
        item.description = pendingDescription.slice(0, 180);
        item.quantity = item.unitPrice = "";
        item.lineTotal = reducedPrice[1] ? normalize(reducedPrice[1]) : "";
        item.taxCode = reducedPrice[2]?.toUpperCase() || "";
        item.note =
          "Price read from the following reduced-price row. Confirm the product match and purchased quantity; pack size is separate.";
        receipt.items.push(item);
        sources[item.id] = [pendingSource, lineIndex];
        receipt.reviewChecks.push({
          scope: "item",
          itemId: item.id,
          field: "lineTotal",
          reason: item.lineTotal ? "recovered" : "unclear",
          other: item.lineTotal
            ? "Selling price read from the following reduced-price row. Confirm its product match."
            : "The reduced price was not readable. Copy it from the original receipt.",
          confirmedValue: "",
        });
      } else {
        receipt.reviewChecks.push({
          scope: "receipt",
          field: "items",
          reason: "coverage",
          other:
            "A reduced-price row could not be tied to an adjacent product. Check for missing items.",
          confirmedValue: "",
        });
      }
      pendingDescription = "";
      pendingSource = undefined;
      continue;
    }
    const costco = matchCostcoRow(line);
    if (costco) {
      const description = pendingDescription || "";
      const negative = costco.deduction;
      const value = normalize(costco.lineTotal);
      if (negative) {
        if (!value) {
          receipt.adjustments.push({
            id: crypto.randomUUID(),
            label: description || "Unreadable coupon",
            kind: "discount",
            amount: "",
            allocation: "proportional",
          });
          pendingDescription = "";
          pendingSource = undefined;
          continue;
        }
        const previous = receipt.items.at(-1);
        if (previous && (isCostco || /^IRC\b/i.test(description))) {
          if (previous.discount !== "0") {
            receipt.warnings.push(
              `Multiple discount lines follow ${previous.description}. Combine their amounts manually; the extra deduction was kept as a receipt discount.`,
            );
            receipt.adjustments.push({
              id: crypto.randomUUID(),
              label: description || "Unmatched discount",
              kind: "discount",
              amount: value,
              allocation: "proportional",
            });
          } else {
            previous.discount = value;
            sources[previous.id] = [
              ...(sources[previous.id] || []),
              ...(pendingSource === undefined ? [] : [pendingSource]),
              lineIndex,
            ];
            previous.note =
              "Separate discount matched to this preceding purchase. Confirm the match.";
            if (costco.taxCode && previous.taxCode !== costco.taxCode)
              receipt.warnings.push(
                `Discount tax code differs for ${previous.description}. Check the discount match.`,
              );
          }
        } else {
          receipt.adjustments.push({
            id: crypto.randomUUID(),
            label: description || "Unmatched discount",
            kind: "discount",
            amount: value,
            allocation: "proportional",
          });
          receipt.warnings.push(
            "A separate discount could not be matched to an item. Confirm its allocation.",
          );
        }
      } else {
        const item = newItem();
        item.description = description.slice(0, 180);
        item.quantity = /^[Il]$/i.test(costco.quantity)
          ? ""
          : costco.quantity.replace(",", ".");
        item.unitPrice = normalize(costco.unitPrice);
        item.lineTotal = value;
        item.taxCode = costco.taxCode;
        if (!description)
          item.note = "Description missing. Copy it from the original receipt.";
        if (!item.quantity)
          item.note =
            "Purchased quantity looked like I or l rather than a number. Confirm it against the original.";
        receipt.items.push(item);
        sources[item.id] = [
          ...(pendingSource === undefined ? [] : [pendingSource]),
          lineIndex,
        ];
      }
      pendingDescription = "";
      pendingSource = undefined;
      continue;
    }
    // A complete following SKU/quantity/price row identifies this as its title.
    // In particular, 0.75L is a pack measurement, not a 0.75 price with tax code L.
    if (/[a-z]{2}/i.test(line) && matchCostcoRow(lines[lineIndex + 1] || "")) {
      pendingDescription = line.replace(/\*+/g, "").trim();
      pendingSource = lineIndex;
      continue;
    }
    const generic = line.match(
      /^(.+?)\s+([-−]?[£$€]?\s*\d[\d,.]*[.,]\d{2,3}-?)\s*([A-Z])?\s*$/,
    );
    if (
      generic &&
      /[a-z]/i.test(generic[1]) &&
      !/phone|tel|post|receipt|cash|tender|paid|balance|total|date|time|points|rewards/i.test(
        generic[1],
      )
    ) {
      const description = generic[1].trim();
      const amount = normalize(generic[2]);
      // A trailing purchase expression is context; pack notation inside a name is not.
      const quantity = description.match(
        /(?:^|\s)(\d+(?:[.,]\d+)?)\s*[x×@]\s*(\d[\d,.]*[.,]\d{2,3})?\s*$/i,
      );
      // A leading count can be purchased quantity or part of a pack name.
      // Numeric measurements and existing trailing purchase expressions win.
      const leadingQuantity =
        !quantity && !/[-−]/.test(generic[2])
          ? description.match(/^(\d+(?:[.,]\d+)?)\s*[x×]\s+(\p{L}.*)$/u)
          : null;
      const percentDeduction =
        /^(?:amount|amt)\b/i.test(description) &&
        /^DISC(?:OUNT)?\b.*%/i.test(lines[lineIndex - 1] || "");
      const deduction =
        /\b(discount|coupon|saving|rebate)\b/i.test(description) ||
        (isCostco && /^(?:\d{1,12}\s+)?IRC\b/i.test(description)) ||
        percentDeduction;
      const printedNegative = /[-−]/.test(generic[2]);
      const ambiguous =
        printedNegative &&
        !deduction &&
        !quantity &&
        !/\b(?:return(?:ed)?|refund(?:ed)?)\b/i.test(description);
      if (deduction || ambiguous) {
        const adjustment = {
          id: crypto.randomUUID(),
          label: description.slice(0, 100),
          kind: "discount" as const,
          amount: amount.replace(/^-/, ""),
          allocation: "proportional" as const,
        };
        receipt.adjustments.push(adjustment);
        sources[adjustment.id] = percentDeduction
          ? [lineIndex - 1, lineIndex]
          : [lineIndex];
        receipt.warnings.push(
          `Confirm whether “${description.slice(0, 80)}” applies to the whole receipt or a particular item.`,
        );
        if (
          ambiguous &&
          !receipt.reviewChecks.some(
            (check) =>
              check.scope === "receipt" && check.field === "adjustments",
          )
        )
          receipt.reviewChecks.push({
            scope: "receipt",
            field: "adjustments",
            reason: "classification",
            other:
              "A negative row may be a discount or a returned item. Confirm its type and ownership.",
            confirmedValue: "",
          });
      } else {
        const item = newItem();
        item.description = (
          quantity && quantity.index
            ? description.slice(0, quantity.index).trim()
            : leadingQuantity
              ? leadingQuantity[2]
              : description
        ).slice(0, 180);
        item.quantity = quantity
          ? quantity[1].replace(",", ".")
          : leadingQuantity
            ? leadingQuantity[1].replace(",", ".")
            : "";
        item.unitPrice = quantity?.[2] ? normalize(quantity[2]) : "";
        item.lineTotal = amount;
        item.taxCode = generic[3] || "";
        if (leadingQuantity)
          receipt.reviewChecks.push({
            scope: "item",
            itemId: item.id,
            field: "quantity",
            reason: "source",
            other:
              "Confirm that the leading count is purchased quantity, not part of the pack description.",
            confirmedValue: "",
          });
        item.note = leadingQuantity
          ? "Leading count read as purchased quantity. Confirm purchased packs against the original; pack contents are separate."
          : quantity
            ? "Check the extracted quantity and line total."
            : "Purchased quantity not printed or not recognized. Confirm it; pack size is separate.";
        if (printedNegative) {
          item.note =
            "Signed credit line. Confirm this is a returned item, its positive quantity and any coupon or tax reversal.";
          receipt.warnings.push(
            "A negative product amount was kept as a refund credit. Check its direction and who receives that credit.",
          );
          if (!amount)
            receipt.reviewChecks.push({
              scope: "item",
              itemId: item.id,
              field: "lineTotal",
              reason: "unclear",
              other:
                "The printed credit amount was not readable. Check its sign and the unit-price calculation.",
              confirmedValue: "",
            });
        }
        receipt.items.push(item);
        sources[item.id] = [lineIndex];
      }
      pendingDescription = "";
      pendingSource = undefined;
    } else if (
      /[a-z]{2}/i.test(line) &&
      !valuesIn(line).length &&
      !/^\d{4,}/.test(line)
    ) {
      pendingDescription = line.replace(/\*+/g, "").trim();
      pendingSource = lineIndex;
    }
    if (receipt.items.length > 300 || receipt.adjustments.length > 30)
      throw new Error(
        "Too many receipt lines. Use a smaller receipt or enter it manually.",
      );
  }
  if (!receipt.items.length)
    receipt.warnings.push(
      "No reliable item rows found. Add the missing items manually, or correct the recognized text and parse again.",
    );
  if (!receipt.printedTotal)
    receipt.warnings.push(
      "The final receipt total was not recognized. Enter it from the original receipt.",
    );
  const repeats = receipt.items.some((item, i, all) =>
    all
      .slice(0, i)
      .some(
        (other) =>
          other.description === item.description &&
          other.lineTotal === item.lineTotal,
      ),
  );
  if (repeats)
    receipt.warnings.push(
      "Repeated purchases were preserved. For overlapping photos, check whether any rows were captured twice.",
    );
  const referencedCodes = receipt.items.map((i) => i.taxCode).filter(Boolean);
  if (!receipt.pricesIncludeTax && receipt.taxMode === "codes")
    for (const code of new Set(referencedCodes)) {
      if (!receipt.taxCodes.some((c) => c.code === code))
        receipt.taxCodes.push({ code, rate: "" });
    }
  receipt.warnings = [...new Set(receipt.warnings)].slice(0, 60);
  return { receipt: receiptSchema.parse(receipt), sources };
}
