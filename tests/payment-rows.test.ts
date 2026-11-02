import { describe, expect, it } from "vitest";
import { findPaymentAdjustments } from "../src/lib/payment-rows";
import { verifyIndependentReadings } from "../src/lib/verify-readings";
import {
  assembleRecognition,
  type Recognition,
} from "../src/lib/receipt-layout";
import { calculateReceipt, calculateSplit } from "../src/lib/engine";
import { receiptSchema } from "../src/lib/model";
import { confirmReviewCheck, reviewKey } from "../src/lib/review-checks";
import { assign, review, shop } from "./helpers";

function source(
  rows = ["Total 18.00", "Cash 20.00", "Change 2.00"],
): Recognition {
  const texts = [
    "Little Market",
    "Currency GBP",
    "Meal 1 x 18.00 18.00",
    "Prices include tax",
    ...rows,
  ];
  const lines = texts.map((text, index) => ({
    text,
    confidence: 0.99,
    box: [
      0.1,
      (index + 0.1) / (texts.length + 1),
      0.9,
      (index + 0.8) / (texts.length + 1),
    ] as [number, number, number, number],
  }));
  return {
    engine: "paddle-ppocrv6-medium-onnx",
    panels: [
      {
        photo: 1,
        part: 1,
        width: 1000,
        height: 1400,
        lines,
        words: structuredClone(lines),
      },
    ],
  };
}
function draft() {
  return {
    merchant: "Little Market",
    date: "",
    currency: "GBP",
    subtotal: "",
    printedTotal: "18.00",
    printedTax: "",
    pricesIncludeTax: true,
    printedItemCount: null,
    taxCodes: [],
    warnings: [],
    items: [
      {
        description: "Meal",
        quantity: "1",
        unitPrice: "18.00",
        lineTotal: "18.00",
        discount: "0",
        taxCode: "",
        note: "",
        sourcePhotos: [1],
      },
    ],
    adjustments: [
      { label: "Cash", kind: "tip", amount: "20.00" },
      { label: "Change", kind: "fee", amount: "2.00" },
    ],
  };
}

describe("source-backed payment and change exclusions", () => {
  it("keeps excluded payments pending even with no adjustments left, then splits the printed bill exactly", () => {
    const raw = draft(),
      recognition = source(),
      untouched = structuredClone({ raw, recognition });
    const result = verifyIndependentReadings(raw, recognition);
    expect({ raw, recognition }).toEqual(untouched);
    expect(result.receipt.adjustments).toEqual([]);
    expect(result.removedAdjustments.map((entry) => entry.reason)).toEqual([
      "payment-tender",
      "payment-change",
    ]);
    expect(result.fieldSources.adjustments).toEqual([4, 5, 6]);
    const check = result.receipt.reviewChecks.find(
      (entry) => entry.field === "adjustments",
    )!;
    expect(check).toMatchObject({
      reason: "recovered",
      confirmedValue: "",
      details: [
        { label: "Payment row: Cash", value: "20.00" },
        { label: "Payment row: Change", value: "2.00" },
      ],
    });
    expect(receiptSchema.safeParse(result.receipt).success).toBe(true);
    expect(calculateReceipt(result.receipt).total).toBe(1800n);
    expect(calculateReceipt(result.receipt).issues).toContainEqual(
      expect.objectContaining({ path: "adjustments" }),
    );
    const state = shop(["18.00"], ["Alice", "Bob"]);
    state.receipt = result.receipt;
    assign(state, "equal");
    expect(calculateSplit(state).canFinalize).toBe(false);
    for (const entry of state.receipt.reviewChecks)
      state.receipt = confirmReviewCheck(state.receipt, reviewKey(entry));
    review(state);
    const split = calculateSplit(state);
    expect(split.canFinalize).toBe(true);
    expect(split.totals.map((entry) => entry.total)).toEqual([900n, 900n]);
    state.receipt.adjustments.push({
      id: crypto.randomUUID(),
      label: "Added fee",
      kind: "fee",
      amount: "1.00",
      allocation: "proportional",
    });
    expect(calculateReceipt(state.receipt).issues).toContainEqual(
      expect.objectContaining({ path: "adjustments" }),
    );
  });

  it.each([
    "Cash",
    "Cash paid",
    "Tendered",
    "Amount paid",
    "Paid by card",
    "Credit card",
    "BCA Card",
    "Visa",
    "Change due",
    "Tunai",
    "Kembali",
    "Kembalian",
  ])(
    "requires a literal printed %s row, independent of the model's claimed adjustment kind",
    (label) => {
      const recognition = source(["Total 18.00", `${label}: 20.00`]);
      const raw = draft();
      raw.adjustments = [{ label, kind: "discount", amount: "20.00" }];
      expect(
        verifyIndependentReadings(raw, recognition).removedAdjustments,
      ).toHaveLength(1);
    },
  );

  it.each([
    "Coupon",
    "Gift voucher",
    "Rewards",
    "Cash discount",
    "Card surcharge",
    "Change fee",
    "Cashback",
    "Gift card",
    "Loyalty card",
  ])("preserves %s rather than assuming it is a payment", (label) => {
    const recognition = source(["Total 18.00", `${label} 20.00`]);
    const raw = draft();
    raw.adjustments = [{ label, kind: "discount", amount: "20.00" }];
    expect(
      verifyIndependentReadings(raw, recognition).removedAdjustments,
    ).toEqual([]);
    expect(
      verifyIndependentReadings(raw, recognition).receipt.adjustments,
    ).toHaveLength(1);
  });

  it.each([
    "weak-line",
    "weak-word",
    "no-words",
    "different-words",
    "weak-total",
    "weak-total-word",
    "second-total",
    "unclear-total",
    "weak-second-total",
    "zero-total",
    "before-total",
    "second-part",
    "duplicate-payment",
    "duplicate-model",
    "valid-conflict",
    "negative",
    "unprinted-label",
    "no-amount",
    "currency",
    "disabled",
    "blocked-total",
  ])("abstains for %s evidence", (change) => {
    const raw = draft(),
      recognition = source();
    raw.adjustments = [raw.adjustments[0]];
    const panel = recognition.panels[0];
    if (change === "weak-line") panel.lines[5].confidence = 0.97;
    if (change === "weak-word") panel.words[5].confidence = 0.97;
    if (change === "no-words") panel.words = [];
    if (change === "different-words") panel.words[5].text = "Cash 200.00";
    if (change === "weak-total") panel.lines[4].confidence = 0.97;
    if (change === "weak-total-word") panel.words[4].confidence = 0.97;
    if (
      ["second-total", "unclear-total", "weak-second-total"].includes(change)
    ) {
      const extra = {
        ...panel.lines[4],
        text: change === "unclear-total" ? "Total unreadable" : "Total 18.00",
        confidence: change === "weak-second-total" ? 0.3 : 0.99,
      };
      panel.lines.push(extra);
    }
    if (change === "zero-total") {
      panel.lines[4].text = "Total 0.00";
      panel.words[4].text = "Total 0.00";
    }
    if (change === "before-total") {
      [panel.lines[4], panel.lines[5]] = [panel.lines[5], panel.lines[4]];
      [panel.lines[4].box, panel.lines[5].box] = [
        panel.lines[5].box,
        panel.lines[4].box,
      ];
      panel.words = structuredClone(panel.lines);
    }
    if (change === "second-part") {
      const second = structuredClone(panel);
      second.part = 2;
      second.lines = [panel.lines[5]];
      second.words = [panel.words[5]];
      panel.lines.splice(5, 1);
      panel.words.splice(5, 1);
      recognition.panels.push(second);
    }
    if (change === "duplicate-payment")
      panel.lines.push(structuredClone(panel.lines[5]));
    if (change === "duplicate-model")
      raw.adjustments.push({ ...raw.adjustments[0] });
    if (change === "valid-conflict") raw.adjustments[0].amount = "2.00";
    if (change === "negative") {
      raw.adjustments[0].kind = "rounding";
      raw.adjustments[0].amount = "-20.00";
    }
    if (change === "unprinted-label") raw.adjustments[0].label = "Tendered";
    if (change === "no-amount") {
      panel.lines[5].text = "Cash";
      panel.words[5].text = "Cash";
    }
    if (change === "currency") raw.currency = "USD";
    const result = verifyIndependentReadings(
      raw,
      recognition,
      { currency: "GBP" },
      {
        allowPriceRecovery: change !== "disabled",
        blockedScalarFields: change === "blocked-total" ? ["printedTotal"] : [],
      },
    );
    expect(result.removedAdjustments).toEqual([]);
    expect(result.receipt.adjustments).toHaveLength(raw.adjustments.length);
  });

  it("matches invalid grouped model strings only to the literal source amount in a resolved currency", () => {
    const recognition = source([
      "Total 25.000",
      "Cash 30.000",
      "Kembalian 5.000",
    ]);
    const lines = assembleRecognition(recognition).sourceLines;
    const adjustments = [
      {
        id: "cash",
        label: "Cash",
        kind: "deposit" as const,
        amount: "30.000",
        allocation: "proportional" as const,
      },
      {
        id: "change",
        label: "Kembalian",
        kind: "rounding" as const,
        amount: "5.000",
        allocation: "proportional" as const,
      },
    ];
    expect(
      findPaymentAdjustments(adjustments, lines, recognition, "IDR").map(
        (entry) => entry.id,
      ),
    ).toEqual(["cash", "change"]);
    expect(
      findPaymentAdjustments(adjustments, lines, recognition, "GBP"),
    ).toEqual([]);
  });

  it("does not depend on cash minus change balancing the bill, or derive a missing amount", () => {
    const recognition = source(["Total 18.00", "Cash 3.00", "Change 1.00"]);
    const raw = draft();
    raw.adjustments[0].amount = "3.00";
    raw.adjustments[1].amount = "1.00";
    const result = verifyIndependentReadings(raw, recognition);
    expect(result.removedAdjustments).toHaveLength(2);
    expect(result.receipt.printedTotal).toBe("18.00");
    expect(result.receipt.items[0].lineTotal).toBe("18.00");
  });
});
