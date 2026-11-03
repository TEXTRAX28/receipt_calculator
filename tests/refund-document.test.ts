import { describe, expect, it } from "vitest";
import { parseReceiptWithSources } from "../src/lib/parser";
import { reviewMessage } from "../src/lib/review-checks";

function parse(heading: string, row = "2009952 DELL S322QC 499.99-Y") {
  return parseReceiptWithSources(
    [
      "Costco",
      row,
      "SUBTOTAL 499.99-",
      "TAX 43.12-",
      "TOTAL 543.11-",
      heading,
    ].join("\n"),
    { currency: "USD" },
  );
}

describe("explicit refund-document evidence for an otherwise ambiguous negative product", () => {
  it("asks for the product and refund heading when the pending check belongs to an item", () => {
    const result = parse("APPROVED - REFUND");
    const check = result.receipt.reviewChecks.find(
      (entry) => entry.scope === "item" && entry.reason === "classification",
    )!;
    expect(reviewMessage(check)).toContain(
      "signed product row and refund heading",
    );
    expect(reviewMessage(check)).not.toContain("receipt adjustments");
    const ambiguous = parse("").receipt.reviewChecks.find(
      (entry) => entry.scope === "receipt" && entry.reason === "classification",
    )!;
    expect(reviewMessage(ambiguous)).toContain("receipt adjustments");
  });
  it.each([
    "APPROVED - REFUND",
    "approved: refund",
    "REFUND RECEIPT",
    "RETURN RECEIPT",
    "CREDIT NOTE",
  ])(
    "keeps a signed product under %s, with its header source and pending classification",
    (heading) => {
      const result = parse(heading);
      const [item] = result.receipt.items;
      expect(result.receipt.items).toHaveLength(1);
      expect(item.lineTotal).toBe("-499.99");
      expect(item.quantity).toBe("");
      expect(item.unitPrice).toBe("");
      expect(item.taxCode).toBe("Y");
      expect(result.receipt.printedTax).toBe("-43.12");
      expect(result.receipt.printedTotal).toBe("-543.11");
      expect(result.receipt.adjustments).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ kind: "discount" })]),
      );
      expect(result.sources[item.id]).toEqual([1, 5]);
      expect(result.receipt.reviewChecks).toContainEqual(
        expect.objectContaining({
          scope: "item",
          itemId: item.id,
          field: "lineTotal",
          reason: "classification",
          confirmedValue: "",
        }),
      );
    },
  );

  it.each([
    "APPROVED - PURCHASE",
    "Ask the refund desk",
    "Refunded planter offer",
    "",
  ])("does not infer a document-wide refund from %s", (heading) => {
    const result = parse(heading);
    expect(result.receipt.items).toHaveLength(0);
    expect(result.receipt.adjustments).toContainEqual(
      expect.objectContaining({ kind: "discount", amount: "499.99" }),
    );
    expect(result.receipt.reviewChecks).toContainEqual(
      expect.objectContaining({
        scope: "receipt",
        field: "adjustments",
        reason: "classification",
      }),
    );
  });

  it("does not change an explicitly positive product into a refund", () => {
    const result = parse("APPROVED - REFUND", "2009952 DELL S322QC 499.99 Y");
    expect(result.receipt.items).toHaveLength(1);
    expect(result.receipt.items[0].lineTotal).toBe("499.99");
    expect(
      result.receipt.reviewChecks.some(
        (check) => check.reason === "classification",
      ),
    ).toBe(false);
    expect(result.sources[result.receipt.items[0].id]).toEqual([1]);
  });

  it.each(["IRC MONITOR 20.00-Y", "Coupon 20.00-", "Member Discount 20.00-"])(
    "keeps the explicitly named deduction separate: %s",
    (row) => {
      const result = parse("APPROVED - REFUND", row);
      expect(result.receipt.items).toHaveLength(0);
      expect(result.receipt.adjustments).toContainEqual(
        expect.objectContaining({ kind: "discount", amount: "20.00" }),
      );
    },
  );

  it("leaves an unreadable signed credit amount empty and pending", () => {
    const result = parse("CREDIT NOTE", "Returned vase 1.234-");
    expect(result.receipt.items).toHaveLength(1);
    expect(result.receipt.items[0].lineTotal).toBe("");
    expect(result.receipt.reviewChecks).toContainEqual(
      expect.objectContaining({
        field: "lineTotal",
        reason: "unclear",
        confirmedValue: "",
      }),
    );
  });
});
