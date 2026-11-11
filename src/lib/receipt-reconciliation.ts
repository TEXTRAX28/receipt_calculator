import type { Receipt, AppState } from "./model";
import { calculateReceipt } from "./engine";
import { exactUnitPrice } from "./receipt-roles";
import { money } from "./money";

/** Prefer exact purchased-count/line arithmetic when all printed amounts balance.
 * This changes only an optional unit value, preserves the observation, and never
 * changes a monetary line or pretends an OCR score is a calibrated probability.
 * Call at scan intake/currency resolution, not after a person's unit-price edit.
 */
export function reconcileObservedUnits(receipt: Receipt): Receipt {
  if (
    receipt.source === "manual" ||
    receipt.currencyUnresolved ||
    !receipt.items.length ||
    receipt.items.some((item) => !item.lineTotal)
  )
    return receipt;
  const result = calculateReceipt(receipt, { readingNotes: "advisory" });
  if (
    result.printed === null ||
    result.discrepancy !== 0n ||
    result.issues.some(
      (issue) => !/^items\.\d+\.(?:unitPrice|quantity)$/.test(issue.path),
    )
  )
    return receipt;
  let changed = false;
  const items = receipt.items.map((item) => {
    if (!item.unitPrice || item.unitPriceDerived || item.unitPriceEdited)
      return item;
    if (
      receipt.reviewChecks.some(
        (check) =>
          check.scope === "item" &&
          check.itemId === item.id &&
          check.field === "quantity" &&
          !["source"].includes(check.reason) &&
          check.confirmedValue !== JSON.stringify(item.quantity),
      )
    )
      return item;
    const unitPrice = exactUnitPrice(
      item.quantity,
      item.lineTotal,
      receipt.currency,
    );
    if (!unitPrice || unitPrice === item.unitPrice) return item;
    try {
      if (
        money(unitPrice, receipt.currency, true) ===
          money(item.unitPrice, receipt.currency, true) ||
        (money(unitPrice, receipt.currency, true) < 0n &&
          -money(unitPrice, receipt.currency, true) ===
            money(item.unitPrice, receipt.currency, true))
      )
        return item;
    } catch {
      /* An unreadable optional unit can still be calculated exactly. */
    }
    changed = true;
    return {
      ...item,
      observedUnitPrice: item.observedUnitPrice || item.unitPrice,
      unitPrice,
      unitPriceDerived: true,
    };
  });
  if (!changed) return receipt;
  return {
    ...receipt,
    items,
    reviewChecks: receipt.reviewChecks.map((check) => {
      const item =
        check.scope === "item" && check.field === "unitPrice"
          ? items.find(
              (item) => item.id === check.itemId && item.observedUnitPrice,
            )
          : undefined;
      return item
        ? {
            ...check,
            other:
              "The read unit figure differs. The displayed unit was calculated from quantity and line amount; the read value is retained.",
            details: [
              { label: "Read unit price", value: item.observedUnitPrice! },
              { label: "Calculated unit price", value: item.unitPrice },
            ],
          }
        : check;
    }),
  };
}

/** Saved scanned drafts use the same unit calculation; a changed representation
 * returns to review rather than preserving an obsolete acceptance/final stamp. */
export function prepareSavedReceiptReview(state: AppState): AppState {
  const receipt = reconcileObservedUnits(state.receipt);
  return receipt === state.receipt
    ? state
    : {
        ...state,
        receipt,
        reviewedStamp: "",
        finalizedStamp: "",
        step: "review",
      };
}
