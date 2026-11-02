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

function fragmented(row = 3, reversed = false, purchases = false) {
  const prefix = purchases ? ["Little Market", "Meal 1 x 18.00 18.00"] : [];
  const fixture = source([
    ...prefix,
    ...summary.slice(0, 3),
    "Grand Total 21.00",
  ]);
  const index = prefix.length + row;
  const original = fixture.lines[index]!;
  const [, label, amount] = original.text.match(/^(.*) ([^ ]+)$/)!;
  const heading = {
    ...original,
    text: label,
    box: [...original.box] as EvidenceLine["box"],
  };
  const value = {
    ...original,
    text: amount,
    box: [...original.box] as EvidenceLine["box"],
  };
  heading.box[2] = 0.4;
  value.box[0] = 0.65;
  fixture.lines.splice(
    index,
    1,
    ...(reversed ? [value, heading] : [heading, value]),
  );
  function sync() {
    fixture.recognition.panels[0].lines = fixture.lines.flatMap((line) =>
      line
        ? [
            {
              text: line.text,
              confidence: line.confidence,
              box: [...line.box] as EvidenceLine["box"],
            },
          ]
        : [],
    );
    fixture.recognition.panels[0].words = structuredClone(
      fixture.recognition.panels[0].lines,
    );
  }
  sync();
  return { ...fixture, heading, value, sync };
}

describe("separate printed financial label and amount", () => {
  it.each([false, true])(
    "keeps both original regions when amount-first order is %s",
    (reversed) => {
      const fixture = fragmented(3, reversed);
      // A larger total can begin above its label; their actual vertical spans overlap.
      fixture.value.box[1] -= 0.035;
      fixture.sync();
      const before = structuredClone({
        lines: fixture.lines,
        recognition: fixture.recognition,
      });
      expect(
        recoverExclusivePriceBasis(fixture.lines, fixture.recognition, "GBP"),
      ).toEqual({
        sourceIndices: [0, 1, 2, 3, 4],
        rows: [
          ...summary.slice(0, 3).map((text) => ({
            label: text.slice(0, text.lastIndexOf(" ")),
            literal: text.slice(text.lastIndexOf(" ") + 1),
          })),
          { label: "Grand Total", literal: "21.00" },
        ],
      });
      expect({
        lines: fixture.lines,
        recognition: fixture.recognition,
      }).toEqual(before);
    },
  );
  it.each([0, 1, 2])(
    "also preserves original indices for a separated summary row %i",
    (row) => {
      const fixture = fragmented(row);
      expect(
        recoverExclusivePriceBasis(fixture.lines, fixture.recognition, "GBP")
          ?.sourceIndices,
      ).toEqual([0, 1, 2, 3, 4]);
    },
  );
  it.each(["same-amount", "different-amount", "weak-alternative"])(
    "rejects an alternative amount without choosing by arithmetic: %s",
    (kind) => {
      const fixture = fragmented();
      fixture.lines.push({
        ...fixture.value,
        text: kind === "different-amount" ? "999.00" : "21.00",
        confidence: kind === "weak-alternative" ? 0.2 : 0.99,
      });
      fixture.sync();
      expect(
        recoverExclusivePriceBasis(fixture.lines, fixture.recognition, "GBP"),
      ).toBeNull();
    },
  );
  it("rejects two headings competing for one amount", () => {
    const fixture = fragmented(1);
    fixture.lines.push({ ...fixture.heading, text: "Fee" });
    fixture.sync();
    expect(
      recoverExclusivePriceBasis(fixture.lines, fixture.recognition, "GBP"),
    ).toBeNull();
  });
  it.each([
    "photo",
    "part",
    "left",
    "overprint",
    "vertical",
    "line-confidence",
    "word-confidence",
    "wrong-word",
    "unowned-word",
    "boundary",
    "intervening-row",
    "arithmetic",
    "budget",
  ])("withholds an unsupported fragment association: %s", (failure) => {
    const fixture = fragmented();
    if (failure === "photo") fixture.value.photo = 2;
    if (failure === "part") fixture.value.part = 2;
    if (failure === "left")
      fixture.value.box = [
        0.01,
        fixture.value.box[1],
        0.08,
        fixture.value.box[3],
      ];
    if (failure === "overprint") fixture.value.box[0] = 0.35;
    if (failure === "vertical") {
      const height = fixture.value.box[3] - fixture.value.box[1];
      fixture.value.box[1] += height * 0.8;
      fixture.value.box[3] += height * 0.8;
    }
    if (failure === "line-confidence") fixture.value.confidence = 0.97;
    if (failure === "boundary") fixture.lines.splice(4, 0, null);
    if (failure === "intervening-row")
      fixture.lines.splice(4, 0, { ...fixture.value, text: "unreadable row" });
    if (failure === "arithmetic") fixture.value.text = "22.00";
    if (failure === "budget")
      fixture.lines.push(...Array.from({ length: 508 }, () => null));
    fixture.sync();
    if (failure === "word-confidence")
      fixture.recognition.panels[0].words[4].confidence = 0.97;
    if (failure === "wrong-word")
      fixture.recognition.panels[0].words[4].text = "31.00";
    if (failure === "unowned-word")
      fixture.recognition.panels[0].words.push({
        text: "?",
        confidence: 0.99,
        box: [0.45, fixture.value.box[1], 0.55, fixture.value.box[3]],
      });
    expect(
      recoverExclusivePriceBasis(fixture.lines, fixture.recognition, "GBP"),
    ).toBeNull();
  });
  it("permits a two-pixel box border overlap but retains all words", () => {
    const fixture = fragmented();
    fixture.value.box[0] =
      fixture.heading.box[2] - 2 / fixture.recognition.panels[0].width;
    fixture.sync();
    expect(
      recoverExclusivePriceBasis(fixture.lines, fixture.recognition, "GBP"),
    ).not.toBeNull();
  });
  it("does not reassign an amount from a row that already has one", () => {
    const fixture = fragmented(1);
    fixture.value.text = "2.00";
    fixture.lines[3]!.text = "Tax 1.00";
    fixture.sync();
    // This printed section balances as written. Its literal roles must not be swapped.
    expect(
      recoverExclusivePriceBasis(fixture.lines, fixture.recognition, "GBP")
        ?.rows,
    ).toContainEqual({ label: "Service charge", literal: "2.00" });
    expect(
      recoverExclusivePriceBasis(fixture.lines, fixture.recognition, "GBP")
        ?.rows,
    ).toContainEqual({ label: "Tax", literal: "1.00" });
  });
  it("keeps existing complete rows usable beyond the optional fragment-search budget", () => {
    const fixture = source(summary);
    fixture.lines.push(...Array.from({ length: 509 }, () => null));
    expect(
      recoverExclusivePriceBasis(fixture.lines, fixture.recognition, "GBP"),
    ).not.toBeNull();
  });
  it.each(["21.00", "99.00"])(
    "links both fragments without accepting or changing the model total %s",
    (total) => {
      const fixture = fragmented(3, true, true);
      const input = raw();
      input.printedTotal = total;
      input.adjustments.push({ label: "Tax", kind: "fee", amount: "2.00" });
      const original = structuredClone(input);
      const result = verifyIndependentReadings(input, fixture.recognition, {
        currency: "GBP",
      });
      expect(input).toEqual(original);
      expect(result.receipt.pricesIncludeTax).toBe(false);
      expect(result.receipt.printedTotal).toBe(total);
      expect(result.receipt.printedTax).toBe("2.00");
      expect(result.receipt.items[0]).toMatchObject({
        quantity: "1",
        unitPrice: "18.00",
        lineTotal: "18.00",
      });
      expect(result.fieldSources.pricesIncludeTax).toEqual([2, 3, 4, 5, 6]);
      expect(result.fieldSources.printedTotal).toEqual([5, 6]);
      expect(result.receipt.reviewChecks).toContainEqual(
        expect.objectContaining({ field: "printedTotal", confirmedValue: "" }),
      );
      expect(result.financialRoleRecovery?.sourceIndices).toEqual([
        2, 3, 4, 5, 6,
      ]);
      expect(result.receipt.reviewChecks).toContainEqual(
        expect.objectContaining({
          field: "pricesIncludeTax",
          reason: "recovered",
          confirmedValue: "",
        }),
      );
      expect(calculateReceipt(result.receipt).issues).toContainEqual(
        expect.objectContaining({ path: "pricesIncludeTax" }),
      );
    },
  );
});

describe("source financial-layout tax basis", () => {
  it("links a split tax amount when the earlier scalar lookup has no source list", () => {
    const fixture = fragmented(2, true, true);
    const result = verifyIndependentReadings(raw(), fixture.recognition, {
      currency: "GBP",
    });
    expect(result.receipt.printedTax).toBe("2.00");
    expect(result.fieldSources.printedTax).toEqual([4, 5]);
    expect(result.fieldSources.adjustments).toEqual([2, 3, 4, 5, 6]);
    expect(result.receipt.reviewChecks).toContainEqual(
      expect.objectContaining({ field: "adjustments", confirmedValue: "" }),
    );
    expect(result.receipt.reviewChecks).toContainEqual(
      expect.objectContaining({ field: "printedTax", confirmedValue: "" }),
    );
  });
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
