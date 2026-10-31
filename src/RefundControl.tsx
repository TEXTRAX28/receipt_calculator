import { useId } from "react";
import type { Item, Receipt } from "./lib/model";
import { minorString, money } from "./lib/money";

export default function RefundControl({
  item,
  index,
  receipt,
  onChange,
}: {
  item: Item;
  index: number;
  receipt: Receipt;
  onChange: (patch: Partial<Item>) => void;
}) {
  const hintId = useId();
  const field = item.lineTotal !== "" ? "lineTotal" : "unitPrice";
  let amount: bigint | null = null;
  try {
    if (!receipt.currencyUnresolved)
      amount = money(item[field], receipt.currency, true);
  } catch {
    /* Leave invalid source values editable and unchanged. */
  }
  const refund = amount !== null && amount < 0n;
  const action = refund ? "Mark as purchase" : "Mark as refund";
  function toggle() {
    if (amount === null || amount === 0n) return;
    const patch: Partial<Item> = {
      [field]: minorString(-amount, receipt.currency),
    };
    // An unsigned unit price remains meaningful beside a signed line credit.
    if (field === "lineTotal" && item.unitPrice) {
      try {
        const unit = money(item.unitPrice, receipt.currency, true);
        if (unit < 0n) patch.unitPrice = minorString(-unit, receipt.currency);
      } catch {
        /* A separate invalid unit price must still be corrected. */
      }
    }
    onChange(patch);
  }
  const hint = receipt.currencyUnresolved
    ? "Choose the receipt currency before changing the price direction."
    : amount === null || amount === 0n
      ? "Enter a valid nonzero line or unit price to mark a refund."
      : refund
        ? "Refund credit: keep quantity positive. An item discount reduces the amount returned. Check its tax and any coupon reversal."
        : "";
  return (
    <div className="refund-control">
      <button
        className="text-button"
        aria-label={`${action} for item ${index + 1}`}
        aria-describedby={hint ? hintId : undefined}
        disabled={amount === null || amount === 0n}
        onClick={toggle}
      >
        {action}
      </button>
      {hint && (
        <p id={hintId} className="hint">
          {hint}
        </p>
      )}
    </div>
  );
}
