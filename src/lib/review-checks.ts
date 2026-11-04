import type { Item, Receipt, ReceiptReviewField, ReviewCheck } from "./model";

export const reviewFieldLabels: Record<ReviewCheck["field"], string> = {
  description: "description",
  quantity: "purchased quantity",
  unitPrice: "unit price",
  lineTotal: "line price",
  discount: "item discount",
  taxCode: "tax code",
  merchant: "merchant",
  date: "receipt date",
  currency: "currency",
  subtotal: "optional subtotal",
  printedTotal: "printed total",
  printedTax: "printed tax",
  pricesIncludeTax: "whether item prices include tax",
  taxCodes: "tax code rates",
  adjustments: "receipt adjustments",
  items: "purchase list",
};
export const reviewKey = (check: ReviewCheck) =>
  `${check.scope}:${check.scope === "item" ? check.itemId : ""}:${check.field}`;

/** The stamp contains field values only: changing ownership is not a new OCR reading. */
export function reviewValue(
  receipt: Receipt,
  check: ReviewCheck,
): string | null {
  if (check.scope === "item") {
    const item = receipt.items.find((item) => item.id === check.itemId);
    return item ? JSON.stringify(item[check.field]) : null;
  }
  return receiptFieldStamp(receipt, check.field);
}

export function receiptFieldStamp(
  receipt: Receipt,
  field: ReceiptReviewField,
): string {
  if (field === "items")
    return JSON.stringify(
      receipt.items.map(
        ({
          id,
          description,
          quantity,
          unitPrice,
          lineTotal,
          discount,
          taxCode,
        }) => [
          id,
          description,
          quantity,
          unitPrice,
          lineTotal,
          discount,
          taxCode,
        ],
      ),
    );
  if (field === "taxCodes")
    return JSON.stringify({
      rates: receipt.taxCodes,
      mode: receipt.taxMode,
      pricesIncludeTax: receipt.pricesIncludeTax,
    });
  return JSON.stringify(receipt[field]);
}

export function checkIsApplicable(
  receipt: Receipt,
  check: ReviewCheck,
): boolean {
  const value = reviewValue(receipt, check);
  if (value === null) return false; // A purchase explicitly removed by the user no longer supplies a price.
  // An absent optional value makes no unsupported monetary assertion. Required empty values
  // are still rejected by the independent arithmetic/receipt validator.
  if (value === '""' && !["currency", "pricesIncludeTax"].includes(check.field))
    return false;
  if (
    check.scope === "receipt" &&
    !["coverage", "recovered", "source"].includes(check.reason) &&
    (check.field === "taxCodes" || check.field === "adjustments") &&
    receipt[check.field].length === 0
  )
    return false;
  return true;
}

export function checkIsPending(receipt: Receipt, check: ReviewCheck): boolean {
  return (
    checkIsApplicable(receipt, check) &&
    check.confirmedValue !== reviewValue(receipt, check)
  );
}

export function reviewMessage(check: ReviewCheck): string {
  if (
    check.scope === "receipt" &&
    check.field === "pricesIncludeTax" &&
    check.reason === "recovered"
  )
    return "The printed subtotal and tax section suggest that item prices exclude tax. Check this interpretation against the original receipt.";
  if (check.reason === "source")
    return `Compare ${reviewFieldLabels[check.field]} with the original receipt.${
      check.scope === "receipt" && check.field === "items"
        ? " Check for missing or repeated rows and discounts."
        : ""
    }${check.other ? ` ${check.other}` : ""}`;
  if (
    check.reason === "classification" &&
    check.scope === "receipt" &&
    check.field === "items"
  )
    return (
      check.other ||
      "Check which rows are purchases against the original receipt."
    );
  if (check.reason === "classification")
    return check.scope === "item"
      ? "The document marks a refund or credit. Check the signed product row and refund heading, then confirm who receives the credit."
      : "The negative row could be a discount or a refund. Check its type and ownership against the original before confirming the receipt adjustments.";
  if (check.reason === "document")
    return "PDF text may omit purchases stored as images or differ from the visible page. Compare every purchase and amount with the page previews.";
  const label = reviewFieldLabels[check.field];
  const reason =
    check.reason === "different"
      ? "The independent readers disagree"
      : check.reason === "unclear"
        ? "The source text was difficult to read"
        : check.reason === "recovered"
          ? "This value was corrected using the printed OCR rows"
          : check.reason === "coverage"
            ? `The readers did not agree on the complete ${label}`
            : "The second reading did not support this value";
  return `${reason}. Check ${label} against the original${check.other ? ` (other reading: ${check.other})` : ""}.`;
}

export function pendingReviewIssues(receipt: Receipt) {
  return receipt.reviewChecks
    .filter((check) => checkIsPending(receipt, check))
    .map((check) => ({
      path:
        check.scope === "item"
          ? `items.${receipt.items.findIndex((item) => item.id === check.itemId)}.${check.field}`
          : check.field,
      message:
        check.scope === "item"
          ? `Purchase ${receipt.items.findIndex((item) => item.id === check.itemId) + 1}: ${reviewMessage(check)}`
          : reviewMessage(check),
    }));
}

export function confirmReviewCheck(
  receipt: Receipt,
  key: string,
  confirmed = true,
): Receipt {
  return {
    ...receipt,
    reviewChecks: receipt.reviewChecks.map((check) =>
      reviewKey(check) === key
        ? {
            ...check,
            confirmedValue: confirmed
              ? (reviewValue(receipt, check) ?? "")
              : "",
          }
        : check,
    ),
  };
}

/** Explicit user edits provide a new human reading; untouched disagreements stay pending. */
export function applyReceiptEdit(
  receipt: Receipt,
  change: Partial<Receipt>,
): Receipt {
  const next = { ...receipt, ...change };
  next.reviewChecks = next.reviewChecks
    .filter(
      (check) =>
        check.scope !== "item" ||
        next.items.some((item) => item.id === check.itemId),
    )
    .map((check) => {
      if (
        check.scope === "receipt" &&
        Object.hasOwn(change, check.field) &&
        !["taxCodes", "adjustments", "items"].includes(check.field)
      )
        return { ...check, confirmedValue: reviewValue(next, check) ?? "" };
      return check;
    });
  return next;
}

export function applyItemEdit(
  receipt: Receipt,
  itemId: string,
  change: Partial<Item>,
): Receipt {
  const next = applyReceiptEdit(receipt, {
    items: receipt.items.map((item) =>
      item.id === itemId ? { ...item, ...change } : item,
    ),
  });
  next.reviewChecks = next.reviewChecks.map((check) =>
    check.scope === "item" &&
    check.itemId === itemId &&
    Object.hasOwn(change, check.field)
      ? { ...check, confirmedValue: reviewValue(next, check) ?? "" }
      : check,
  );
  return next;
}
