import {
  newItem,
  newReceipt,
  receiptSchema,
  type Receipt,
  type Currency,
} from "./model";
import { printedAmount } from "./printed-amount";
import { z } from "zod";

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
const isFinalTotal = (line: string) =>
  /\b(?:total\s*\(?\s*(?:incl(?:uding)?\.?\s*(?:vat|tax))|grand total|amount due|balance due|total\s*[:£$€]?\s*(?:(?:GBP|USD|EUR|CAD|AUD|NZD|JPY|KWD|BHD|CHF|SEK|KRW|IDR|TWD|Rp\.?)\s*)?[£$€]?\s*\d)/i.test(
    line,
  ) && !/excl|subtotal|sub total|number|items|count|savings/i.test(line);

/** Heuristics produce an editable draft, never a declaration of financial correctness. */
export function parseReceiptText(output: unknown): Receipt {
  const { text } = extractionOutputSchema.parse(
    typeof output === "string" ? { text: output } : output,
  );
  const receipt = newReceipt();
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
    if (!/\bUSD\b/.test(text))
      receipt.warnings.push(
        "Dollar symbols can mean several currencies. Confirm the selected currency.",
      );
  } else {
    currencyIdentified = false;
    receipt.warnings.push(
      "Currency was not identified. Confirm the selected currency.",
    );
  }
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
    const values =
      currencyIdentified &&
      ["IDR", "TWD", "JPY", "KRW"].includes(receipt.currency)
        ? [...line.matchAll(/[-−]?\d[\d,.]*-?/g)].map((m) => m[0])
        : valuesIn(line);
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
    if (isFinalTotal(line))
      receipt.printedTotal = lastAmount(line) || receipt.printedTotal;
    if (/\b(?:subtotal|sub total|total\s*\(?\s*excl)/i.test(line))
      receipt.subtotal = lastAmount(line) || receipt.subtotal;
    if (
      /^(?:vat amount|tax amount|sales tax|vat|tax)\s*[:£$€]?\s*\d/i.test(
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
  let itemSectionEnded = false;
  for (const line of lines) {
    if (line === PHOTO_SEPARATOR) {
      itemSectionEnded = false;
      pendingDescription = "";
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
      continue;
    }
    const costco = line.match(
      /(?:^|\s)\d{1,12}[\s©|]+(\d+(?:[.,]\d+)?|[Il])\s*[x×]\s+([\d,.]+)\s+([\d,.]+)\s*(-)?\s*([A-Z0-9]{1,6})?\s*[^A-Z\d.,-]{0,5}$/i,
    );
    if (costco) {
      const description = pendingDescription || "";
      const negative = !!costco[4];
      const value = normalize(costco[3]);
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
            previous.note =
              "Separate discount matched to this preceding purchase. Confirm the match.";
            if (costco[5] && previous.taxCode !== costco[5].toUpperCase())
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
        item.quantity = /^[Il]$/i.test(costco[1])
          ? ""
          : costco[1].replace(",", ".");
        item.unitPrice = normalize(costco[2]);
        item.lineTotal = value;
        item.taxCode = (costco[5] || "").toUpperCase();
        if (!description)
          item.note = "Description missing. Copy it from the original receipt.";
        if (!item.quantity)
          item.note =
            "Purchased quantity looked like I or l rather than a number. Confirm it against the original.";
        receipt.items.push(item);
      }
      pendingDescription = "";
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
      const amount = normalize(generic[2]).replace(/^-/, "");
      const negative =
        /[-−]/.test(generic[2]) ||
        /\b(discount|coupon|saving|rebate)\b/i.test(description);
      if (negative) {
        receipt.adjustments.push({
          id: crypto.randomUUID(),
          label: description.slice(0, 100),
          kind: "discount",
          amount,
          allocation: "proportional",
        });
        receipt.warnings.push(
          `Confirm whether “${description.slice(0, 80)}” applies to the whole receipt or a particular item.`,
        );
      } else {
        const item = newItem();
        // Only a trailing purchase expression counts. "6x340g" inside a product name is a multipack, not six purchased packs.
        const quantity = description.match(
          /(?:^|\s)(\d+(?:[.,]\d+)?)\s*[x×@]\s*(\d[\d,.]*[.,]\d{2,3})?\s*$/i,
        );
        item.description = description.slice(0, 180);
        item.quantity = quantity ? quantity[1].replace(",", ".") : "";
        item.unitPrice = quantity?.[2] ? normalize(quantity[2]) : "";
        item.lineTotal = amount;
        item.taxCode = generic[3] || "";
        item.note = quantity
          ? "Check the extracted quantity and line total."
          : "Purchased quantity not printed or not recognized. Confirm it; pack size is separate.";
        receipt.items.push(item);
      }
      pendingDescription = "";
    } else if (
      /[a-z]{2}/i.test(line) &&
      !valuesIn(line).length &&
      !/^\d{4,}/.test(line)
    )
      pendingDescription = line.replace(/\*+/g, "").trim();
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
  return receiptSchema.parse(receipt);
}
