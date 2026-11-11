import type { Receipt } from "./lib/model";
import type { ReceiptResult } from "./lib/engine";
import { formatReceiptMoney, money } from "./lib/money";
import { Pencil, Image } from "lucide-react";

/** The printed receipt first; corrections remain available without a checklist. */
export default function ReceiptSnapshot({
  receipt,
  result,
  onEdit,
  onViewOriginal,
}: {
  receipt: Receipt;
  result: ReceiptResult;
  onEdit: (path: string) => void;
  onViewOriginal?: () => void;
}) {
  const amount = (value: string, subtract = false) => {
    if (!value) return "—";
    if (receipt.currencyUnresolved) return value;
    try {
      return formatReceiptMoney(
        money(value, receipt.currency, true) * (subtract ? -1n : 1n),
        receipt,
      );
    } catch {
      return value;
    }
  };
  return (
    <section className="panel digital-receipt" aria-label="Digital receipt">
      <header className="digital-receipt-header">
        <div>
          <h2>{receipt.merchant || "Your receipt"}</h2>
          {receipt.date && <p className="muted">{receipt.date}</p>}
        </div>
        {onViewOriginal && (
          <button
            className="text-button"
            aria-label="View original receipt image 1"
            onClick={onViewOriginal}
          >
            <Image size={17} />
            Original
          </button>
        )}
      </header>
      <p className="hint">
        Check the receipt below. Tap an item to make a correction, then
        continue.
      </p>
      {receipt.currencyUnresolved && (
        <button
          className="button button-outline"
          onClick={() => onEdit("currency")}
        >
          Choose receipt currency
        </button>
      )}
      <div className="receipt-column-labels" aria-hidden="true">
        <span>Qty</span>
        <span>Item</span>
        <span>Amount</span>
      </div>
      <ol className="receipt-purchases">
        {receipt.items.map((item, index) => (
          <li key={item.id} data-testid={`digital-item-${index}`}>
            <span className="receipt-quantity">{item.quantity || "?"}</span>
            <button
              className="receipt-item-edit"
              onClick={() => onEdit(`items.${index}.description`)}
              aria-label={`Edit item ${index + 1}: ${item.description || "unnamed item"}`}
            >
              <span>{item.description || "Item name needed"}</span>
              {item.unitPrice && (
                <small>
                  {amount(item.unitPrice)} each
                  {item.unitPriceDerived ? " · calculated" : ""}
                </small>
              )}
              {!item.quantity && (
                <small className="receipt-needs-value">Quantity needed</small>
              )}
            </button>
            <button
              className="receipt-amount-edit"
              onClick={() => onEdit(`items.${index}.lineTotal`)}
              aria-label={`Edit item ${index + 1} amount`}
            >
              {amount(item.lineTotal)}
              <Pencil size={13} aria-hidden="true" />
            </button>
            {item.discount && !/^0(?:\.0+)?$/.test(item.discount) && (
              <small className="receipt-item-discount">
                Item discount {amount(item.discount, true)}
              </small>
            )}
          </li>
        ))}
      </ol>
      <dl className="receipt-totals">
        {receipt.subtotal && (
          <div>
            <dt>Subtotal</dt>
            <dd>{amount(receipt.subtotal)}</dd>
          </div>
        )}
        {receipt.adjustments.map((row) => (
          <div key={row.id}>
            <dt>
              {row.label || row.kind}
              {row.kind === "tax" && receipt.pricesIncludeTax
                ? " (included)"
                : ""}
            </dt>
            <dd>{amount(row.amount, row.kind === "discount")}</dd>
          </div>
        ))}
        {!receipt.pricesIncludeTax &&
          receipt.taxMode === "codes" &&
          result.tax !== 0n && (
            <div>
              <dt>Tax</dt>
              <dd>{formatReceiptMoney(result.tax, receipt)}</dd>
            </div>
          )}
        {receipt.printedTax &&
          !receipt.adjustments.some((row) => row.kind === "tax") &&
          (receipt.pricesIncludeTax || receipt.taxMode !== "codes") && (
            <div>
              <dt>Tax shown on receipt</dt>
              <dd>{amount(receipt.printedTax)}</dd>
            </div>
          )}
        <div className="receipt-grand-total">
          <dt>Total</dt>
          <dd>
            <button
              onClick={() => onEdit("printedTotal")}
              aria-label="Edit receipt total"
            >
              {amount(receipt.printedTotal)}
            </button>
          </dd>
        </div>
      </dl>
      {result.includedFeeTax !== undefined && result.includedFeeTax !== 0n && (
        <p className="hint">
          The printed tax includes{" "}
          {formatReceiptMoney(result.includedFeeTax, receipt)} already in the
          fees above. It is counted once.
        </p>
      )}
      <p
        className={`balance-label ${result.issues.length ? "needs-check" : ""}`}
      >
        {result.issues.length
          ? "Details need a correction"
          : "Amounts match the printed total"}
      </p>
      {receipt.taxRegistrationNumber && (
        <p className="receipt-registration">
          VAT / tax registration: {receipt.taxRegistrationNumber}
        </p>
      )}
    </section>
  );
}
