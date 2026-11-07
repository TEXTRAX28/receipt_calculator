import { useId } from "react";
import type { Receipt, ReviewCheck } from "./lib/model";
import {
  checkIsApplicable,
  checkIsPending,
  reviewFieldLabels,
  reviewKey,
  reviewMessage,
} from "./lib/review-checks";

const adjustmentKinds = {
  discount: "Receipt discount",
  tax: "Tax",
  fee: "Fee",
  tip: "Tip",
  deposit: "Deposit",
  rounding: "Rounding",
};

function currentValue(receipt: Receipt, check: ReviewCheck) {
  if (check.scope === "item")
    return (
      receipt.items.find((item) => item.id === check.itemId)?.[check.field] ||
      "Left blank"
    );
  if (check.field === "items") return `${receipt.items.length} purchase rows`;
  if (check.field === "taxCodes")
    return (
      receipt.taxCodes
        .map((entry) => `${entry.code}: ${entry.rate || "unknown"}%`)
        .join("; ") || "No code rates"
    );
  if (check.field === "adjustments")
    return (
      receipt.adjustments
        .map(
          (entry) =>
            `${entry.label}: ${entry.amount} (${adjustmentKinds[entry.kind]}; ${entry.kind === "discount" || entry.allocation === "proportional" ? "by item cost" : "equally per person"}${entry.includedTaxRate !== undefined ? `; includes tax at ${entry.includedTaxRate || "unknown"}%` : ""})`,
        )
        .join("; ") || "No receipt adjustments"
    );
  if (check.field === "pricesIncludeTax")
    return receipt.pricesIncludeTax
      ? "Item prices include tax"
      : "Tax is added to item prices";
  return receipt[check.field] || "Left blank";
}

export default function ReviewChecks({
  receipt,
  checks,
  onConfirm,
  onViewSource,
  canViewSource,
}: {
  receipt: Receipt;
  checks: ReviewCheck[];
  onConfirm: (key: string, confirmed: boolean) => void;
  onViewSource?: (check: ReviewCheck) => void;
  canViewSource?: (check: ReviewCheck) => boolean;
}) {
  const sectionId = useId();
  if (!checks.length) return null;
  const remaining = checks.filter((check) =>
    checkIsPending(receipt, check),
  ).length;
  return (
    <section className="verification-checks" aria-labelledby={sectionId}>
      <h3 id={sectionId}>
        {remaining
          ? `${remaining} ${remaining === 1 ? "value needs" : "values need"} a check`
          : "No pending value checks"}
      </h3>
      <p className="hint">
        Compare these values with the original. Editing a value also records
        your correction. Source photos are not saved after a refresh.
      </p>
      {checks.map((check) => (
        <div
          className={`verification-check ${checkIsPending(receipt, check) ? "pending" : "checked"}`}
          key={reviewKey(check)}
        >
          <strong>{reviewFieldLabels[check.field]}</strong>
          <p>{reviewMessage(check)}</p>
          <p className="verification-current">
            Current draft: <b>{currentValue(receipt, check)}</b>
          </p>
          {check.details && (
            <>
              <p className="hint">Source comparison:</p>
              <ul>
                {check.details.map((detail, index) => (
                  <li key={index}>
                    {detail.label}: {detail.value}
                  </li>
                ))}
              </ul>
            </>
          )}
          {onViewSource && canViewSource?.(check) && (
            <button
              className="button button-outline"
              onClick={(event) => {
                event.currentTarget.focus();
                onViewSource(check);
              }}
              aria-label={`View source for ${reviewFieldLabels[check.field]}`}
            >
              View on receipt
            </button>
          )}
          <label className="check-row verification-confirm">
            <input
              type="checkbox"
              data-review-path={
                check.scope === "item"
                  ? `items.${receipt.items.findIndex((item) => item.id === check.itemId)}.${check.field}`
                  : check.field
              }
              checked={!checkIsPending(receipt, check)}
              disabled={!checkIsApplicable(receipt, check)}
              onChange={(event) =>
                onConfirm(reviewKey(check), event.target.checked)
              }
            />
            {checkIsApplicable(receipt, check)
              ? `I checked ${reviewFieldLabels[check.field]} against the original`
              : "This optional value is not used"}
          </label>
        </div>
      ))}
    </section>
  );
}
