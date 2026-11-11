import type { Receipt, ReviewCheck } from "./lib/model";
import {
  checkIsPending,
  reviewMessage,
  reviewKey,
  reviewFieldLabels,
} from "./lib/review-checks";

const adjustmentKinds = {
  discount: "Receipt discount",
  tax: "Tax",
  fee: "Fee",
  tip: "Tip",
  deposit: "Deposit",
  rounding: "Rounding",
};

/** Reading uncertainty is advisory; Continue accepts the receipt as a whole. */
export default function ReviewChecks({
  receipt,
  checks,
  onViewSource,
  canViewSource,
  open = false,
}: {
  receipt: Receipt;
  checks: ReviewCheck[];
  onViewSource?: (check: ReviewCheck) => void;
  canViewSource?: (check: ReviewCheck) => boolean;
  open?: boolean;
}) {
  const grouped = new Map<string, ReviewCheck>();
  for (const check of checks.filter((check) =>
    checkIsPending(receipt, check),
  )) {
    const key =
      check.scope === "item"
        ? `item:${check.itemId}:${check.reason}`
        : reviewKey(check);
    const previous = grouped.get(key);
    if (!previous) grouped.set(key, check);
    else if (check.details?.length)
      grouped.set(key, {
        ...previous,
        details: [
          ...new Map(
            [...(previous.details || []), ...check.details].map((detail) => [
              JSON.stringify(detail),
              detail,
            ]),
          ).values(),
        ],
      });
  }
  const notes = [...grouped.values()];
  if (!notes.length) return null;
  return (
    <details className="reader-notes" open={open}>
      <summary>Reading notes</summary>
      <p className="hint">
        These notes explain the automatic reading. Use the receipt fields to
        correct anything that looks wrong.
      </p>
      <ul>
        {notes.map((check) => (
          <li key={reviewKey(check)}>
            <p>
              {check.scope === "item" && check.reason === "source"
                ? "Some text in this row was unclear. You can compare it with the original photo."
                : check.scope === "receipt" &&
                    check.field === "pricesIncludeTax" &&
                    check.reason === "source"
                  ? "Tax uses only the amounts or code rates in the receipt details. A registration number does not add tax."
                  : reviewMessage(check)}
            </p>
            {check.details && (
              <ul>
                {check.details.map((detail, index) => (
                  <li key={index}>
                    {detail.label}: {detail.value}
                  </li>
                ))}
              </ul>
            )}
            {check.scope === "receipt" && check.field === "adjustments" && (
              <ul>
                {receipt.adjustments.map((row) => (
                  <li key={row.id}>
                    {row.label}: {row.amount} ({adjustmentKinds[row.kind]};{" "}
                    {row.kind === "discount" ||
                    row.allocation === "proportional"
                      ? "by item cost"
                      : "equally per person"}
                    {row.includedTaxRate !== undefined
                      ? `; includes tax at ${row.includedTaxRate || "unknown"}%`
                      : ""}
                    )
                  </li>
                ))}
              </ul>
            )}
            {onViewSource && canViewSource?.(check) && (
              <button
                className="text-button"
                aria-label={`View source for ${reviewFieldLabels[check.field]}`}
                onClick={() => onViewSource(check)}
              >
                View on receipt
              </button>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}
