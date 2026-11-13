import { aiReceiptSchema } from "./extraction-schema.mjs";
import { newItem, newReceipt, receiptSchema, type Receipt } from "./model";
import { normalizeReceiptDate } from "./receipt-date";
import {
  readingContextSchema,
  type ReadingContext,
} from "./reading-context.mjs";

export function receiptFromOpenAi(
  output: unknown,
  context?: ReadingContext,
  photoCount = 12,
): Receipt {
  const data = aiReceiptSchema
    .refine((draft) =>
      draft.items.every((item) =>
        item.sourcePhotos.every((photo) => photo <= photoCount),
      ),
    )
    .parse(output);
  const selected = readingContextSchema.optional().parse(context);
  const receipt = newReceipt();
  receipt.source = "ai";
  receipt.merchant = data.merchant;
  receipt.date = normalizeReceiptDate(data.date);
  receipt.currency = data.currency || selected?.currency || receipt.currency;
  receipt.currencyUnresolved = !data.currency && !selected;
  receipt.subtotal = data.subtotal;
  receipt.printedTotal = data.printedTotal;
  receipt.taxRegistrationNumber = data.taxRegistrationNumber.trim();
  const registrationDigits = receipt.taxRegistrationNumber.replace(
    /[^0-9]/g,
    "",
  );
  const registrationAsTax =
    registrationDigits.length >= 9 &&
    data.printedTax.replace(/\.0+$/, "") === registrationDigits;
  receipt.printedTax = registrationAsTax ? "" : data.printedTax;
  receipt.pricesIncludeTax = data.pricesIncludeTax ?? true;
  receipt.taxCodes = data.taxCodes;
  receipt.taxMode = data.taxCodes.length ? "codes" : "printed";
  receipt.items = data.items.map(({ sourcePhotos, note, ...item }) => ({
    ...newItem(),
    ...item,
    note: (
      "Photo " +
      [...new Set(sourcePhotos)].join(", ") +
      ". " +
      note
    ).slice(0, 300),
  }));
  receipt.adjustments = data.adjustments.map((adjustment) => ({
    id: crypto.randomUUID(),
    ...adjustment,
    allocation: "proportional",
  }));
  if (receipt.taxMode === "printed" && receipt.printedTax)
    receipt.adjustments.push({
      id: crypto.randomUUID(),
      label: "Printed tax",
      kind: "tax",
      amount: receipt.printedTax,
      allocation: "proportional",
    });
  if (receipt.taxMode === "codes")
    for (const code of new Set(receipt.items.map((item) => item.taxCode))) {
      if (code && !receipt.taxCodes.some((entry) => entry.code === code))
        receipt.taxCodes.push({ code, rate: "" });
    }
  receipt.warnings = [
    "OpenAI prepared this draft from your photos. Check every purchase, discount, tax code and the printed total against the originals.",
    ...data.warnings,
  ];
  if (registrationAsTax)
    receipt.warnings.push(
      "The read tax amount matched the tax registration number. Check the receipt for a separately printed tax amount.",
    );
  if (selected && data.currency && data.currency !== selected.currency) {
    receipt.currencyUnresolved = true;
    receipt.reviewChecks.push({
      scope: "receipt",
      field: "currency",
      reason: "different",
      other: "Selected reading currency: " + selected.currency,
      confirmedValue: "",
    });
    receipt.warnings.push(
      "The scan returned " +
        data.currency +
        ". You selected " +
        selected.currency +
        ". Check the printed currency and amounts.",
    );
  }
  if (!data.currency && !selected)
    receipt.warnings.push(
      "Currency was unclear. Confirm the receipt currency.",
    );
  if (data.pricesIncludeTax === null) {
    receipt.warnings.push(
      "OpenAI could not determine whether item prices include tax. Check the tax setting.",
    );
    receipt.reviewChecks.push({
      scope: "receipt",
      field: "pricesIncludeTax",
      reason: "unclear",
      other: "OpenAI could not determine whether item prices include tax",
      confirmedValue: "",
    });
  }
  if (
    data.printedItemCount !== null &&
    data.printedItemCount !== receipt.items.length
  )
    receipt.warnings.push(
      "OpenAI read an item count of " +
        data.printedItemCount +
        " and found " +
        receipt.items.length +
        " purchase lines. Check the list against the original. The printed count may include quantities.",
    );
  return receiptSchema.parse(receipt);
}
