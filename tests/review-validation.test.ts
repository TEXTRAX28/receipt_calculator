import { describe, expect, it } from "vitest";
import { firstReceiptIssue } from "../src/lib/review-validation";
import { calculateReceipt } from "../src/lib/engine";
import { newReceipt, newItem } from "../src/lib/model";
import { applyItemEdit, applyReceiptEdit } from "../src/lib/review-checks";

describe("Continue chooses the first field in form order", () => {
  it("points an invalid tax rate at its own rate input", () => {
    const receipt = newReceipt();
    receipt.pricesIncludeTax = false;
    receipt.taxMode = "codes";
    receipt.taxCodes = [{ code: "A", rate: "" }];
    receipt.printedTotal = "12.00";
    receipt.items = [
      { ...newItem(), description: "Soup", lineTotal: "10.00", taxCode: "A" },
    ];
    expect(
      firstReceiptIssue(receipt, calculateReceipt(receipt).issues)?.path,
    ).toBe("taxCodes.0.rate");
  });
  it("finds a missing item price before the subtotal and total mismatches it causes", () => {
    const receipt = newReceipt();
    receipt.printedTotal = "10.00";
    receipt.subtotal = "10.00";
    receipt.items = [{ ...newItem(), description: "Soup", lineTotal: "" }];
    expect(
      firstReceiptIssue(receipt, calculateReceipt(receipt).issues)?.path,
    ).toBe("items.0.lineTotal");
  });
  it("finds a missing quantity even when the receipt total balances", () => {
    const receipt = newReceipt();
    receipt.printedTotal = "10.00";
    receipt.items = [
      { ...newItem(), description: "Soup", quantity: "", lineTotal: "10.00" },
    ];
    const issues = calculateReceipt(receipt).issues;
    expect(firstReceiptIssue(receipt, issues)).toMatchObject({
      path: "items.0.quantity",
      review: false,
    });
    expect(firstReceiptIssue(receipt, [])).toBeUndefined();
  });
  it("corrects an invalid field before its source-confirmation checkbox", () => {
    const receipt = newReceipt();
    receipt.items = [{ ...newItem(), quantity: "" }];
    receipt.reviewChecks = [
      {
        scope: "item",
        itemId: receipt.items[0].id,
        field: "quantity",
        reason: "source",
        other: "Unreadable",
        confirmedValue: "",
      },
    ];
    const issues = calculateReceipt(receipt).issues.filter(
      (issue) => issue.path === "items.0.quantity",
    );
    expect(firstReceiptIssue(receipt, issues)?.review).toBe(false);
    receipt.items[0].quantity = "1";
    expect(
      firstReceiptIssue(
        receipt,
        calculateReceipt(receipt).issues.filter(
          (issue) => issue.path === "items.0.quantity",
        ),
      )?.review,
    ).toBe(true);
  });
  it("maps total reconciliation and item identifiers to the editable fields", () => {
    const receipt = newReceipt();
    receipt.items = [newItem()];
    expect(
      firstReceiptIssue(receipt, [
        { path: "total", message: "Does not balance" },
      ])?.path,
    ).toBe("printedTotal");
    expect(
      firstReceiptIssue(receipt, [
        { path: `items.${receipt.items[0].id}`, message: "Check the price" },
      ])?.path,
    ).toBe("items.0.lineTotal");
  });
});

describe("explicit quantity corrections calculate optional unit prices exactly", () => {
  it("calculates a missing unit when currency is selected after scanning", () => {
    const value = receipt();
    value.currencyUnresolved = true;
    value.items[0].quantity = "2";
    const edited = applyReceiptEdit(value, {
      currency: "GBP",
      currencyUnresolved: false,
    });
    expect(edited.items[0]).toMatchObject({
      quantity: "2",
      lineTotal: "37.20",
      unitPrice: "18.60",
      unitPriceDerived: true,
    });
  });
  it("does not treat currency selection as confirmation of a disputed count or calculated unit", () => {
    const value = receipt();
    value.currencyUnresolved = true;
    value.items[0].quantity = "2";
    value.reviewChecks = ["quantity", "unitPrice"].map((field) => ({
      scope: "item",
      itemId: value.items[0].id,
      field: field as "quantity" | "unitPrice",
      reason: "source",
      other: "Check the source",
      confirmedValue: "",
    }));
    const edited = applyReceiptEdit(value, {
      currency: "GBP",
      currencyUnresolved: false,
    });
    expect(edited.items[0].unitPrice).toBe("18.60");
    expect(edited.reviewChecks.map((check) => check.confirmedValue)).toEqual([
      "",
      "",
    ]);
  });
  it("uses the newly selected precision without converting a line or replacing a printed unit", () => {
    const value = receipt();
    value.items[0].quantity = "2";
    value.items[0].lineTotal = "1.25";
    expect(
      applyReceiptEdit(value, { currency: "KWD" }).items[0].unitPrice,
    ).toBe("0.625");
    value.items[0].unitPrice = "0.60";
    expect(applyReceiptEdit(value, { currency: "KWD" }).items[0]).toMatchObject(
      { lineTotal: "1.25", unitPrice: "0.60" },
    );
  });
  function receipt() {
    const receipt = newReceipt();
    receipt.currency = "GBP";
    receipt.items = [{ ...newItem(), lineTotal: "37.20" }];
    return receipt;
  }
  it("fills 18.60 when a user supplies the missing count of two", () => {
    const value = receipt();
    expect(
      applyItemEdit(value, value.items[0].id, { quantity: "2" }).items[0],
    ).toMatchObject({
      quantity: "2",
      unitPrice: "18.60",
      lineTotal: "37.20",
      unitPriceDerived: true,
    });
  });
  it("recalculates an already derived unit after a line-price edit", () => {
    let value = receipt();
    const id = value.items[0].id;
    value = applyItemEdit(value, id, { quantity: "2" });
    expect(
      applyItemEdit(value, id, { lineTotal: "40.00" }).items[0].unitPrice,
    ).toBe("20.00");
  });
  it("preserves a printed or explicitly edited unit, exposing a mismatch for review", () => {
    const value = receipt();
    value.items[0].unitPrice = "18.50";
    const edited = applyItemEdit(value, value.items[0].id, { quantity: "2" });
    expect(edited.items[0].unitPrice).toBe("18.50");
    expect(
      calculateReceipt(edited).issues.some(
        (issue) => issue.path === "items.0.unitPrice",
      ),
    ).toBe(true);
  });
  it("leaves non-exact division blank instead of rounding", () => {
    const value = receipt();
    value.items[0].lineTotal = "10.00";
    expect(
      applyItemEdit(value, value.items[0].id, { quantity: "3" }).items[0]
        .unitPrice,
    ).toBe("");
  });
  it("does not derive money with an unresolved currency or invalid quantity", () => {
    const value = receipt();
    value.currencyUnresolved = true;
    expect(
      applyItemEdit(value, value.items[0].id, { quantity: "2" }).items[0]
        .unitPrice,
    ).toBe("");
    value.currencyUnresolved = false;
    expect(
      applyItemEdit(value, value.items[0].id, { quantity: "I" }).items[0]
        .unitPrice,
    ).toBe("");
  });
  it("does not mark a derived value as a human source confirmation", () => {
    const value = receipt();
    value.reviewChecks = [
      {
        scope: "item",
        itemId: value.items[0].id,
        field: "unitPrice",
        reason: "different",
        other: "18.50",
        confirmedValue: "",
      },
    ];
    expect(
      applyItemEdit(value, value.items[0].id, { quantity: "2" }).reviewChecks[0]
        .confirmedValue,
    ).toBe("");
  });
});
