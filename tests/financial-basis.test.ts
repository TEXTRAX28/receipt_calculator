import { describe, expect, it } from "vitest";
import { recoverExclusivePriceBasis } from "../src/lib/financial-basis";
import { verifyIndependentReadings } from "../src/lib/verify-readings";
import { calculateReceipt } from "../src/lib/engine";
import {
  confirmReviewCheck,
  reviewKey,
  reviewMessage,
} from "../src/lib/review-checks";
import type { Recognition, EvidenceLine } from "../src/lib/receipt-layout";

function source(texts: string[]) {
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
  const recognition: Recognition = {
    engine: "paddle-ppocrv6-medium-onnx",
    panels: [
      {
        photo: 1,
        part: 1,
        width: 1000,
        height: 1600,
        words: structuredClone(lines),
        lines,
      },
    ],
  };
  return {
    recognition,
    lines: lines.map((line) => ({
      ...line,
      photo: 1,
      part: 1,
    })) as (EvidenceLine | null)[],
  };
}
const summary = [
  "Subtotal 18.00",
  "Service charge 1.00",
  "Tax 2.00",
  "Total 21.00",
];
const raw = (basis: boolean | null = null) => ({
  merchant: "Little Market",
  date: "",
  currency: "GBP",
  subtotal: "18.00",
  printedTotal: "21.00",
  printedTax: "2.00",
  pricesIncludeTax: basis,
  printedItemCount: null,
  taxCodes: [],
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
  adjustments: [{ label: "Service charge", kind: "fee", amount: "1.00" }],
  warnings: [],
});

describe("source financial-layout tax basis", () => {
  it("proposes net prices from literal subtotal, fee, added tax and total without deriving an amount", () => {
    const { recognition, lines } = source(summary);
    const before = structuredClone({ recognition, lines });
    expect(recoverExclusivePriceBasis(lines, recognition, "GBP")).toEqual({
      sourceIndices: [0, 1, 2, 3],
      rows: [
        { label: "Subtotal", literal: "18.00" },
        { label: "Service charge", literal: "1.00" },
        { label: "Tax", literal: "2.00" },
        { label: "Total", literal: "21.00" },
      ],
    });
    expect({ recognition, lines }).toEqual(before);
  });
  it("uses printed percentages as labels without inferring a rate or computing a missing tax", () => {
    const { recognition, lines } = source([
      "SUBTTL 212,500",
      "SVC CHG 6% 12,750",
      "PB1 10% 22,525",
      "TOTAL 247 775",
    ]);
    expect(
      recoverExclusivePriceBasis(lines, recognition, "IDR")?.rows.at(-1)
        ?.literal,
    ).toBe("247 775");
    expect(recoverExclusivePriceBasis(lines, recognition, "KWD")).toBeNull();
  });
  it.each(["Discount 5.00", "Discount -5.00"])(
    "validates an actual %s and printed rounding",
    (discount) => {
      const { recognition, lines } = source([
        "Subtotal 20.00",
        "Tax 2.00",
        discount,
        "Rounding -0.01",
        "Total 16.99",
      ]);
      expect(
        recoverExclusivePriceBasis(lines, recognition, "GBP"),
      ).not.toBeNull();
    },
  );
  it.each([
    ["Subtotal 18.00", "Tax 0.00", "Total 18.00"],
    ["Subtotal 18.00", "Tax 2.00", "Total 18.00"],
    ["Subtotal 18.00", "Tax 2.00", "Total 21.00"],
    ["Subtotal 18.00", "Tax 10%", "Total 20.00"],
    ["Subtotal 18.00", "Tax 2.00", "unreadable row", "Total 20.00"],
    ["Subtotal 18.00", "Coupon 2.00", "Tax 2.00", "Total 18.00"],
    ["Subtotal 18.00", "Tax -2.00", "Total 16.00"],
    ["Subtotal 18.00", "Subtotal 18.00", "Tax 2.00", "Total 20.00"],
    ["Subtotal 18.00", "Tax 2.00", "Total 20.00", "Total 20.00"],
    [
      "Subtotal 18.00",
      "Tax 2.00",
      "Total 20.00",
      "Subtotal 4.00",
      "Tax 1.00",
      "Total 5.00",
    ],
  ])(
    "withholds a proposal on incomplete, inclusive, inconsistent or repeated summaries: %j",
    (...texts) => {
      const { recognition, lines } = source(texts);
      expect(recoverExclusivePriceBasis(lines, recognition, "GBP")).toBeNull();
    },
  );
  it.each([
    "line",
    "word",
    "missing-words",
    "wrong-word-text",
    "photo",
    "part",
    "boundary",
  ])("requires actual strong source evidence: %s", (change) => {
    const { recognition, lines } = source(summary);
    if (change === "line") lines[2]!.confidence = 0.97;
    if (change === "word") recognition.panels[0].words[2].confidence = 0.97;
    if (change === "missing-words") recognition.panels[0].words = [];
    if (change === "wrong-word-text")
      recognition.panels[0].words[2].text = "Tax 8.00";
    if (change === "photo") lines[2]!.photo = 2;
    if (change === "part") lines[2]!.part = 2;
    if (change === "boundary") lines.splice(2, 0, null);
    expect(recoverExclusivePriceBasis(lines, recognition, "GBP")).toBeNull();
  });
  it("changes only an unknown basis, preserves raw amounts and keeps mandatory source review", () => {
    const { recognition } = source([
      "Little Market",
      "Meal 1 x 18.00 18.00",
      ...summary,
    ]);
    const input = raw(),
      before = structuredClone(input);
    const result = verifyIndependentReadings(input, recognition, {
      currency: "GBP",
    });
    expect(input).toEqual(before);
    expect(result.receipt.pricesIncludeTax).toBe(false);
    expect(result.receipt.printedTax).toBe("2.00");
    expect(result.receipt.adjustments.map(({ amount }) => amount)).toEqual([
      "1.00",
      "2.00",
    ]);
    expect(result.taxBasisRecovery).not.toBeNull();
    expect(result.fieldSources.pricesIncludeTax).toEqual([2, 3, 4, 5]);
    expect(result.receipt.reviewChecks).toContainEqual(
      expect.objectContaining({
        field: "pricesIncludeTax",
        reason: "recovered",
        confirmedValue: "",
        details: expect.arrayContaining([
          { label: "Previous vision tax basis", value: "Unknown" },
        ]),
      }),
    );
    expect(calculateReceipt(result.receipt).issues).toContainEqual(
      expect.objectContaining({ path: "pricesIncludeTax" }),
    );
    const check = result.receipt.reviewChecks.find(
      (check) => check.field === "pricesIncludeTax",
    )!;
    expect(reviewMessage(check)).toContain("Check this interpretation");
    const checked = confirmReviewCheck(result.receipt, reviewKey(check));
    expect(
      calculateReceipt(checked).issues.some(
        (issue) => issue.path === "pricesIncludeTax",
      ),
    ).toBe(false);
    expect(
      calculateReceipt({ ...checked, pricesIncludeTax: true }).issues.some(
        (issue) => issue.path === "pricesIncludeTax",
      ),
    ).toBe(true);
  });
  it.each([
    "valid-inclusive",
    "valid-exclusive",
    "disabled",
    "currency-conflict",
    "unresolved-currency",
    "explicit-inclusive",
    "unclear-inclusive",
    "explicit-exclusive",
  ])("does not overwrite or promote a source conflict: %s", (condition) => {
    const texts = ["Little Market", "Meal 1 x 18.00 18.00", ...summary];
    const input = raw(
      condition === "valid-inclusive"
        ? true
        : condition === "valid-exclusive"
          ? false
          : null,
    );
    if (condition === "currency-conflict") texts.push("Currency EUR");
    if (condition === "unresolved-currency") input.currency = "";
    if (condition === "explicit-inclusive" || condition === "unclear-inclusive")
      texts.push("Prices include tax");
    if (condition === "explicit-exclusive") texts.push("Prices exclude tax");
    const { recognition } = source(texts);
    if (condition === "unclear-inclusive") {
      recognition.panels[0].lines.at(-1)!.confidence = 0.6;
      recognition.panels[0].words.at(-1)!.confidence = 0.6;
    }
    const result = verifyIndependentReadings(
      input,
      recognition,
      condition === "unresolved-currency" ? undefined : { currency: "GBP" },
      condition === "disabled" ? { allowPriceRecovery: false } : {},
    );
    expect(result.taxBasisRecovery).toBeNull();
    expect(result.receipt.pricesIncludeTax).toBe(
      input.pricesIncludeTax ?? true,
    );
  });
});
