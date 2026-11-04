import {
  aiReceiptSchema,
  geminiReceiptDraftSchema,
} from "./extraction-schema.mjs";
import { newItem, newReceipt, receiptSchema, type Receipt } from "./model";
import { MAX_AI_BODY_BYTES } from "./scan-limits.mjs";
import type { ReceiptImage } from "./images";
import { panelsForImages } from "./panel-transport";
import { z } from "zod";
import { normalizeReceiptDate } from "./receipt-date";
import {
  readingContextSchema,
  type ReadingContext,
} from "./reading-context.mjs";

export function receiptFromAi(
  output: unknown,
  provider: "Gemini" | "Local vision" = "Gemini",
  context?: ReadingContext,
): Receipt {
  const data = (
    provider === "Gemini" ? geminiReceiptDraftSchema : aiReceiptSchema
  ).parse(output);
  const selected = readingContextSchema.optional().parse(context);
  const receipt = newReceipt();
  receipt.source = "ai";
  receipt.merchant = data.merchant;
  receipt.date = normalizeReceiptDate(data.date);
  receipt.currency =
    data.currency || (selected?.currency as Receipt["currency"]) || "GBP";
  receipt.currencyUnresolved = !data.currency && !selected;
  receipt.subtotal = data.subtotal;
  receipt.printedTotal = data.printedTotal;
  receipt.printedTax = data.printedTax;
  receipt.pricesIncludeTax = data.pricesIncludeTax ?? true;
  receipt.taxCodes = data.taxCodes;
  receipt.taxMode = data.taxCodes.length ? "codes" : "printed";
  receipt.items = data.items.map(({ sourcePhotos, note, ...item }) => ({
    ...newItem(),
    ...item,
    note: `Photo ${[...new Set(sourcePhotos)].join(", ")}. ${note}`.slice(
      0,
      300,
    ),
  }));
  receipt.adjustments = data.adjustments.map((adjustment) => ({
    id: crypto.randomUUID(),
    ...adjustment,
    allocation: "proportional" as const,
  }));
  if (receipt.taxMode === "printed" && data.printedTax)
    receipt.adjustments.push({
      id: crypto.randomUUID(),
      label: "Printed tax",
      kind: "tax",
      amount: data.printedTax,
      allocation: "proportional",
    });
  for (const taxCode of new Set(
    receipt.items.map((item) => item.taxCode).filter(Boolean),
  ))
    if (!receipt.taxCodes.some((entry) => entry.code === taxCode))
      receipt.taxCodes.push({ code: taxCode, rate: "" });
  receipt.warnings = [
    `${provider} prepared this draft from your photos. Check every purchase, discount, tax code and the printed total against the originals.`,
    ...data.warnings,
  ];
  for (const item of receipt.items)
    for (const field of ["unitPrice", "lineTotal", "discount"] as const)
      if (item[field].includes(","))
        receipt.reviewChecks.push({
          scope: "item",
          itemId: item.id,
          field,
          reason: "unclear",
          other:
            "Check the number separators and enter the amount in decimal form.",
          details: [{ label: "Unchanged reader amount", value: item[field] }],
          confirmedValue: "",
        });
  for (const field of ["subtotal", "printedTotal", "printedTax"] as const)
    if (receipt[field].includes(","))
      receipt.reviewChecks.push({
        scope: "receipt",
        field,
        reason: "unclear",
        other:
          "Check the number separators and enter the amount in decimal form.",
        details: [{ label: "Unchanged reader amount", value: receipt[field] }],
        confirmedValue: "",
      });
  if (receipt.adjustments.some((entry) => entry.amount.includes(",")))
    receipt.reviewChecks.push({
      scope: "receipt",
      field: "adjustments",
      reason: "unclear",
      other:
        "Check the number separators in each receipt adjustment against the original.",
      confirmedValue: "",
    });
  if (receipt.reviewChecks.length)
    receipt.warnings.push(
      "Some reader amounts contain grouping separators. They are kept exactly as returned. Check their meaning and currency, then enter decimal amounts before sharing.",
    );
  const percentRates = receipt.taxCodes.filter((entry) =>
    entry.rate.endsWith("%"),
  );
  if (percentRates.length) {
    receipt.reviewChecks.push({
      scope: "receipt",
      field: "taxCodes",
      reason: "source",
      other:
        "Check the printed tax rates. Enter a decimal percentage, such as 20 for 20%, before applying tax.",
      details: percentRates.map((entry) => ({
        label: `Tax code ${entry.code}`,
        value: entry.rate,
      })),
      confirmedValue: "",
    });
    receipt.warnings.push(
      "Some reader tax rates include a percent sign. They are kept exactly as returned. Check the printed rates and enter decimal percentages before applying tax.",
    );
  }
  if (selected) {
    receipt.warnings.push(
      `Receipt currency supplied by you: ${selected.currency}. Returned model amounts have not been reinterpreted or converted.`,
    );
    if (data.currency && data.currency !== selected.currency) {
      receipt.currencyUnresolved = true;
      receipt.reviewChecks.push({
        scope: "receipt",
        field: "currency",
        reason: "different",
        other: `Selected reading currency: ${selected.currency}`,
        confirmedValue: "",
      });
      receipt.warnings.push(
        `The reader returned ${data.currency}, which conflicts with your selected ${selected.currency}. Check the printed currency and every amount.`,
      );
    }
  }
  if (!data.currency && !selected)
    receipt.warnings.push(
      "Currency was unclear. Confirm the selected currency.",
    );
  if (data.pricesIncludeTax === null) {
    receipt.warnings.push(
      `${provider} could not determine whether item prices include tax. Confirm the tax setting before continuing.`,
    );
    receipt.reviewChecks.push({
      scope: "receipt",
      field: "pricesIncludeTax",
      reason: "unclear",
      other: "The reader could not determine whether item prices include tax",
      confirmedValue: "",
    });
  }
  if (
    data.printedItemCount !== null &&
    data.printedItemCount !== receipt.items.length
  )
    receipt.warnings.push(
      `${provider} read an item count of ${data.printedItemCount}, but found ${receipt.items.length} purchase lines. Check the count against the original and look for missing rows or overlapping captures; printed counts can also include quantities.`,
    );
  return receiptSchema.parse(receipt);
}

const configSchema = z.object({
  configured: z.boolean(),
  provider: z.literal("Gemini"),
  model: z.string().max(100),
  remaining: z.number().int().min(0).max(100).optional(),
  availability: z
    .enum([
      "missing-key",
      "missing-allowance",
      "ready",
      "exhausted",
      "storage-unavailable",
    ])
    .optional(),
});
export async function geminiConfiguration(signal: AbortSignal) {
  const response = await fetch("./api/receipts/config", {
    signal,
    cache: "no-store",
  });
  if (!response.ok) throw new Error("AI connection unavailable");
  return configSchema.parse(await response.json());
}

export async function extractWithGemini(
  images: ReceiptImage[],
  signal: AbortSignal,
  progress: (status: string) => void,
  context?: ReadingContext,
): Promise<Receipt> {
  progress("Preparing receipt sections for Gemini…");
  const panels = await panelsForImages(images, signal);
  const body = JSON.stringify({ consent: true, panels });
  if (body.length > MAX_AI_BODY_BYTES)
    throw new Error(
      "These photos are too large together for Gemini. Crop them or choose fewer sections.",
    );
  progress(
    `Gemini is reading ${images.length} ${images.length === 1 ? "photo" : "photos"} as one receipt…`,
  );
  const deadline = AbortSignal.timeout(125000);
  try {
    const response = await fetch("./api/receipts/extract", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-gather-request": "receipt-scan",
      },
      body,
      signal: AbortSignal.any([signal, deadline]),
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(
        typeof result.error === "string"
          ? result.error.slice(0, 500)
          : "Gemini could not read the receipt. Try the on-device reader.",
      );
    return receiptFromAi(result.receipt, "Gemini", context);
  } catch (error) {
    if (signal.aborted)
      throw new Error("Scan cancelled. Your photos are still available.");
    if (deadline.aborted)
      throw new Error(
        "Gemini took too long. Your photos are still available; try fewer sections or use the on-device reader.",
      );
    if (error instanceof z.ZodError)
      throw new Error(
        "Gemini returned an incomplete or invalid draft. Try clearer photos or use the on-device reader. Your original photos are still available.",
      );
    if (error instanceof TypeError || error instanceof SyntaxError)
      throw new Error(
        "The Gemini connection is unavailable. Keep Gather running, reload and try again, or use the on-device reader.",
      );
    throw error;
  }
}
