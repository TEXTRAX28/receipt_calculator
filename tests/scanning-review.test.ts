import { describe, expect, it } from "vitest";
import {
  parseReceiptText,
  PHOTO_SEPARATOR,
  isFinalTotal,
} from "../src/lib/parser";
import { calculateReceipt } from "../src/lib/engine";
import { confirmReviewCheck, reviewKey } from "../src/lib/review-checks";
import { matchFinancialSummaryRow } from "../src/lib/financial-basis";
import {
  countedPurchaseRows,
  findTaxRegistrations,
  isTaxRegistrationLine,
} from "../src/lib/receipt-roles";

const menu = `SYNTHETIC RESTAURANT
GBP
VAT: 123456789
QtyDish Amount
I Tori Karaage 8.00
1 Tonkotsu Ramen 18.00
2 Spicy Tantan Tonkotsu ramen 18.60 37.20
1 Cold Udon 6.50
1 Salmon Roll 22.00
1 Tofu 8.00
1 Chocolate Tart 5.50
1 Banana Fritters 5.50
Subtotal: 110.70
Total to pay: 110.70
Service charge is not included`;

describe("VAT identification", () => {
  it.each([
    "VAT: 123456789",
    "VAT: GB 123 4567 89",
    "VAT No: 123456789",
    "VAT Registration Number: 123456789",
    "GST Reg: ABC123456",
  ])("keeps %s out of monetary tax", (line) => {
    const receipt = parseReceiptText(`GBP\n${line}\nSoup 8.00\nTotal 8.00`);
    expect(receipt.taxRegistrationNumber).toBeTruthy();
    expect(receipt.printedTax).toBe("");
    expect(receipt.printedTaxRate).toBe("");
    expect(
      receipt.adjustments.filter((row) => row.kind === "tax"),
    ).toHaveLength(0);
    expect(matchFinancialSummaryRow(line)).toBeNull();
  });
  it("recognises a wrapped registration without treating its digits as a charge", () => {
    const receipt = parseReceiptText(
      "GBP\nVAT:\n123456789\nSoup 8.00\nTotal 8.00",
    );
    expect(receipt.taxRegistrationNumber).toBe("123456789");
    expect(receipt.printedTax).toBe("");
  });
  it("retains separately printed rates and actual tax amounts", () => {
    const receipt = parseReceiptText(
      "GBP\nVAT No: 123456789\nSoup 10.00\nVAT 20%: 2.00\nTotal 12.00",
    );
    expect(receipt.taxRegistrationNumber).toBe("123456789");
    expect(receipt.printedTaxRate).toBe("20");
    expect(receipt.printedTax).toBe("2.00");
  });
  it.each(["VAT amount: 123456789", "VAT: 123456789.00", "VAT 20%: 8.00"])(
    "does not mistake explicit monetary evidence for an identifier: %s",
    (line) => {
      expect(isTaxRegistrationLine(line)).toBe(false);
      expect(matchFinancialSummaryRow(line)?.role).toBe("tax");
    },
  );
  it("retains legitimate large integer tax in an explicitly selected non-GBP currency", () => {
    expect(isTaxRegistrationLine("VAT: 123456789", "IDR")).toBe(false);
    expect(findTaxRegistrations(["IDR", "VAT: 123456789"]).values).toEqual([]);
    expect(matchFinancialSummaryRow("VAT: 123456789", "IDR")?.literal).toBe(
      "123456789",
    );
  });
  it("does not choose between conflicting registration details or rate rows", () => {
    const receipt = parseReceiptText(
      "GBP\nVAT No: 123456789\nVAT No: 987654321\nVAT 5%: 1.00\nVAT 20%: 2.00\nSoup 8.00\nTotal 8.00",
    );
    expect(receipt.taxRegistrationNumber).toBe("");
    expect(receipt.printedTaxRate).toBe("");
    expect(
      receipt.warnings.some((value) => /registration identifiers/.test(value)),
    ).toBe(true);
  });
  it("deduplicates the same identifier across overlapping photos", () => {
    expect(
      findTaxRegistrations([
        "VAT No: 123456789",
        PHOTO_SEPARATOR,
        "VAT No: 123456789",
      ]).values,
    ).toEqual(["123456789"]);
  });
});

describe("quantity columns and exact unit prices", () => {
  it("maps the reported restaurant layout into eight purchases and the correct ramen fields", () => {
    const receipt = parseReceiptText(menu);
    expect(receipt.items).toHaveLength(8);
    expect(receipt.items.map((row) => row.quantity)).toEqual([
      "1",
      "1",
      "2",
      "1",
      "1",
      "1",
      "1",
      "1",
    ]);
    expect(receipt.items[2]).toMatchObject({
      description: "Spicy Tantan Tonkotsu ramen",
      quantity: "2",
      unitPrice: "18.60",
      lineTotal: "37.20",
    });
    expect(receipt.items[0]).toMatchObject({
      description: "Tori Karaage",
      quantity: "1",
      unitPrice: "8.00",
      lineTotal: "8.00",
    });
    expect(receipt.printedTax).toBe("");
    expect(receipt.printedTotal).toBe("110.70");
    const recovered = receipt.reviewChecks.filter(
      (check) => check.scope === "item" && check.field === "quantity",
    );
    expect(recovered).toHaveLength(1);
    const checked = confirmReviewCheck(receipt, reviewKey(recovered[0]));
    expect(calculateReceipt(checked).issues).toEqual([]);
    expect(calculateReceipt(checked).total).toBe(11070n);
  });
  it.each([
    "Qty Dish Amount",
    "Quantity Description Total",
    "Qty Item Line Total",
    "OtyDish Amount",
    "(tyDish Amount",
    "QtyDish\nAmount",
  ])("detects the %s heading without a retailer name", (heading) => {
    const receipt = parseReceiptText(
      `GBP\n${heading}\n1 Soup 8.00\n2 Ramen 37.20\nTotal 45.20`,
    );
    expect(receipt.items.map(({ quantity }) => quantity)).toEqual(["1", "2"]);
    expect(receipt.items[1].unitPrice).toBe("18.60");
  });
  it.each(["I", "l", "|"])(
    "repairs isolated %s only with quantity-column context",
    (glyph) => {
      const receipt = parseReceiptText(
        `GBP\nQty Dish Amount\n${glyph} Soup 8.00\n1 Udon 6.50\n2 Ramen 37.20\nTotal 51.70`,
      );
      expect(receipt.items[0].quantity).toBe("1");
      expect(receipt.items[0].description).toBe("Soup");
      expect(
        receipt.reviewChecks.some(
          (check) => check.scope === "item" && check.field === "quantity",
        ),
      ).toBe(true);
    },
  );
  it("does not strip brand/pack prefixes from an unlabelled receipt", () => {
    const receipt = parseReceiptText(
      "GBP\n7 Up 2.00\n2 Pack Rolls 5.00\nI Love Soup 8.00\nTotal 15.00",
    );
    expect(receipt.items.map((row) => row.description)).toEqual([
      "7 Up",
      "2 Pack Rolls",
      "I Love Soup",
    ]);
    expect(receipt.items.every((row) => row.quantity === "")).toBe(true);
  });
  it("does not treat a price-only heading as evidence of a purchased-count column", () => {
    expect(
      countedPurchaseRows(
        ["Qty Product Price", "2 Rolls 5.00"],
        "GBP",
        PHOTO_SEPARATOR,
      ).rows.size,
    ).toBe(0);
  });
  it("leaves a lone ambiguous glyph unfilled when there are no numeric peer counts", () => {
    const receipt = parseReceiptText(
      "GBP\nQty Dish Amount\nI Soup 8.00\nTotal 8.00",
    );
    expect(receipt.items[0].quantity).toBe("");
  });
  it("keeps a contradictory printed unit price instead of replacing it with a balancing value", () => {
    const receipt = parseReceiptText(
      "GBP\nQty Dish Amount\n2 Ramen 18.50 37.20\nTotal 37.20",
    );
    expect(receipt.items[0]).toMatchObject({
      quantity: "2",
      unitPrice: "18.50",
      lineTotal: "37.20",
    });
    expect(
      calculateReceipt(receipt).issues.some(
        (issue) => issue.path === "items.0.unitPrice",
      ),
    ).toBe(true);
  });
  it("does not round an unprinted unit price when division is not exact", () => {
    const receipt = parseReceiptText(
      "GBP\nQty Dish Amount\n3 Dumplings 10.00\nTotal 10.00",
    );
    expect(receipt.items[0]).toMatchObject({
      quantity: "3",
      unitPrice: "",
      lineTotal: "10.00",
    });
  });
  it("uses the selected currency's three-decimal precision", () => {
    const receipt = parseReceiptText(
      "KWD\nQty Dish Amount\n2 Dates 1.250\nTotal 1.250",
    );
    expect(receipt.items[0].unitPrice).toBe("0.625");
  });
  it("preserves genuinely repeated menu items", () => {
    const receipt = parseReceiptText(
      "GBP\nQty Dish Amount\n1 Soup 8.00\n1 Soup 8.00\nTotal 16.00",
    );
    expect(receipt.items).toHaveLength(2);
  });
  it("does not carry a quantity header across a photo boundary", () => {
    const receipt = parseReceiptText(
      `GBP\nQty Dish Amount\n1 Soup 8.00\n${PHOTO_SEPARATOR}\n2 Pack Rolls 5.00\nTotal 13.00`,
    );
    expect(receipt.items[1]).toMatchObject({
      description: "2 Pack Rolls",
      quantity: "",
    });
  });
  it("never invents the missing count on an otherwise readable menu row", () => {
    const receipt = parseReceiptText(
      "GBP\nQty Dish Amount\n1 Soup 8.00\nChocolate Tart 5.50\nTotal 13.50",
    );
    expect(receipt.items[1]).toMatchObject({
      description: "Chocolate Tart",
      quantity: "",
      unitPrice: "",
      lineTotal: "5.50",
    });
  });
});

describe("final total wording", () => {
  it.each([
    "Total to pay: 110.70",
    "TOTAL TO PAY 110.70",
    "*** TOTAL TO PAY: GBP 110.70",
  ])("recognises %s", (line) => {
    expect(isFinalTotal(line)).toBe(true);
    expect(parseReceiptText(`GBP\nSoup 110.70\n${line}`).printedTotal).toBe(
      "110.70",
    );
  });
  it("does not match a product name containing those words", () => {
    expect(isFinalTotal("Guide to total to pay 8.00")).toBe(false);
  });
});
