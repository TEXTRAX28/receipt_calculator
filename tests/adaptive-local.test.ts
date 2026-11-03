import { afterEach, describe, expect, it, vi } from "vitest";
import { extractComparedReceipt } from "../src/lib/compared-reader";
import { extractWithLocalModel } from "../src/lib/local-model";
import { extractLocalVisionEvidence } from "../src/lib/local-vision";
import {
  assembleRecognition,
  type Recognition,
} from "../src/lib/receipt-layout";
import { calculateReceipt } from "../src/lib/engine";
import {
  checkIsPending,
  confirmReviewCheck,
  reviewKey,
} from "../src/lib/review-checks";
import { parseReceiptWithSources } from "../src/lib/parser";
import {
  comparedDraft,
  comparedRecognition,
} from "./fixtures/compared-receipt";

vi.mock("../src/lib/local-model", () => ({ extractWithLocalModel: vi.fn() }));
vi.mock("../src/lib/local-vision", () => ({
  extractLocalVisionEvidence: vi.fn(),
}));
const clear = [
  "MARKET",
  "Tea 1x 5.50 5.50",
  "Prices include tax",
  "TOTAL GBP 5.50",
];
const images = [
  {
    id: "a",
    name: "synthetic.jpg",
    url: "blob:fixture",
    blob: new Blob(["SYNTHETIC_ONLY"]),
  },
];
function primary(texts = clear) {
  const recognition = comparedRecognition([{ photo: 1, part: 1 }], texts)
    .recognition as Recognition;
  const assembled = assembleRecognition(recognition);
  const value = {
    text: assembled.text,
    recognition,
    sourceLines: assembled.sourceLines,
    warnings: [] as string[],
  };
  vi.mocked(extractWithLocalModel).mockResolvedValue(value);
  return value;
}
function native() {
  const sample = comparedDraft();
  return {
    ...sample,
    merchant: "MARKET",
    currency: "GBP" as const,
    subtotal: "",
    printedTotal: "5.50",
    printedTax: "",
    pricesIncludeTax: true,
    printedItemCount: 1,
    taxCodes: [],
    adjustments: [],
    items: [
      {
        ...sample.items[0],
        description: "Tea",
        unitPrice: "5.50",
        lineTotal: "5.50",
        taxCode: "",
      },
    ],
  };
}
afterEach(() => vi.resetAllMocks());

describe("adaptive local model orchestration without real model/network calls", () => {
  it("a skipped comparison preserves the parser's scalar source mappings without confirming them", async () => {
    const output = primary();
    const expected = parseReceiptWithSources(output);
    const before = structuredClone(output);
    const result = await extractComparedReceipt(
      images,
      new AbortController().signal,
      vi.fn(),
      undefined,
      "auto",
    );
    expect(result.fieldSources).toEqual(expected.fieldSources);
    expect(result.fieldSources.printedTotal).toEqual([3]);
    expect(result.fieldSources.pricesIncludeTax).toEqual([2]);
    expect(output).toEqual(before);
    expect(result.comparisonAttempted).toBe(false);
    expect(
      result.receipt.reviewChecks.some((check) =>
        checkIsPending(result.receipt, check),
      ),
    ).toBe(true);
  });
  it.each(["word", "line"])(
    "a failed comparison retains a weak %s total check after purchase coverage is confirmed",
    async (weak) => {
      const output = primary();
      output.recognition.panels[0].words = structuredClone(
        output.recognition.panels[0].words,
      );
      if (weak === "word")
        output.recognition.panels[0].words[3].confidence = 0.2;
      else output.sourceLines[3]!.confidence = 0.2;
      vi.mocked(extractLocalVisionEvidence).mockRejectedValue(
        new Error("Synthetic model unavailable"),
      );
      const result = await extractComparedReceipt(
        images,
        new AbortController().signal,
        vi.fn(),
        undefined,
        "always",
      );
      expect(result.receipt.printedTotal).toBe("5.50");
      expect(result.fieldSources.printedTotal).toEqual([3]);
      const check = result.receipt.reviewChecks.find(
        (check) => check.scope === "receipt" && check.field === "printedTotal",
      )!;
      expect(check).toMatchObject({ reason: "source", confirmedValue: "" });
      const coverage = result.receipt.reviewChecks.find(
        (check) => check.field === "items",
      )!;
      const reviewed = confirmReviewCheck(result.receipt, reviewKey(coverage));
      expect(checkIsPending(reviewed, check)).toBe(true);
      expect(calculateReceipt(reviewed).issues).toContainEqual(
        expect.objectContaining({ path: "printedTotal" }),
      );
      expect(extractLocalVisionEvidence).toHaveBeenCalledOnce();
    },
  );
  it.each(["subtotal", "printedTax", "printedTotal"] as const)(
    "a failed comparison preserves actual %s regions and flags its weak words",
    async (field) => {
      const output = primary([
        "MARKET",
        "Meal 1x 18.00 18.00",
        "Subtotal 18.00",
        "Tax 2.00",
        "Total GBP 20.00",
        "Prices exclude tax",
      ]);
      const expected = parseReceiptWithSources(output);
      const index = { subtotal: 2, printedTax: 3, printedTotal: 4 }[field];
      output.recognition.panels[0].words = structuredClone(
        output.recognition.panels[0].words,
      );
      output.recognition.panels[0].words[index].confidence = 0.2;
      vi.mocked(extractLocalVisionEvidence).mockRejectedValue(
        new Error("Synthetic model unavailable"),
      );
      const result = await extractComparedReceipt(
        images,
        new AbortController().signal,
        vi.fn(),
      );
      expect(result.fieldSources).toEqual(expected.fieldSources);
      expect(result.fieldSources[field]).toEqual([index]);
      for (const key of [
        "subtotal",
        "printedTax",
        "printedTotal",
        "pricesIncludeTax",
        "taxMode",
        "taxCodes",
      ] as const)
        expect(result.receipt[key]).toEqual(expected.receipt[key]);
      expect(
        result.receipt.adjustments.map(({ id: _id, ...row }) => row),
      ).toEqual(expected.receipt.adjustments.map(({ id: _id, ...row }) => row));
      expect(result.receipt.reviewChecks).toContainEqual(
        expect.objectContaining({
          scope: "receipt",
          field,
          reason: "source",
          confirmedValue: "",
        }),
      );
    },
  );
  it("a weak purchase keeps individual field checks after a failed comparison and coverage review", async () => {
    const output = primary();
    output.recognition.panels[0].words = structuredClone(
      output.recognition.panels[0].words,
    );
    output.recognition.panels[0].words[1].confidence = 0.2;
    vi.mocked(extractLocalVisionEvidence).mockRejectedValue(
      new Error("Synthetic model unavailable"),
    );
    const result = await extractComparedReceipt(
      images,
      new AbortController().signal,
      vi.fn(),
    );
    const coverage = result.receipt.reviewChecks.find(
      (check) => check.field === "items",
    )!;
    const reviewed = confirmReviewCheck(result.receipt, reviewKey(coverage));
    for (const field of [
      "description",
      "quantity",
      "unitPrice",
      "lineTotal",
    ] as const) {
      const check = reviewed.reviewChecks.find(
        (check) => check.scope === "item" && check.field === field,
      )!;
      expect(check).toMatchObject({ reason: "source", confirmedValue: "" });
      expect(checkIsPending(reviewed, check)).toBe(true);
    }
    expect(calculateReceipt(reviewed).issues.length).toBeGreaterThan(0);
  });
  it("a failed comparison flags conflicting totals without changing the selected literal", async () => {
    primary([...clear, "TOTAL GBP 6.50"]);
    vi.mocked(extractLocalVisionEvidence).mockRejectedValue(
      new Error("Synthetic model unavailable"),
    );
    const result = await extractComparedReceipt(
      images,
      new AbortController().signal,
      vi.fn(),
    );
    expect(result.receipt.printedTotal).toBe("6.50");
    expect(result.fieldSources.printedTotal).toEqual([4]);
    expect(result.receipt.reviewChecks).toContainEqual(
      expect.objectContaining({
        field: "printedTotal",
        reason: "source",
        confirmedValue: "",
      }),
    );
  });
  it("missing source geometry produces pending checks without fabricated regions", async () => {
    const output = primary();
    output.sourceLines = [];
    vi.mocked(extractLocalVisionEvidence).mockRejectedValue(
      new Error("Synthetic model unavailable"),
    );
    const result = await extractComparedReceipt(
      images,
      new AbortController().signal,
      vi.fn(),
    );
    expect(result.sourceLines).toEqual([]);
    expect(result.fieldSources.printedTotal).toEqual([3]);
    expect(result.receipt.reviewChecks).toContainEqual(
      expect.objectContaining({
        field: "printedTotal",
        reason: "source",
        confirmedValue: "",
      }),
    );
  });
  it("reads the primary once, skips unnecessary vision and still requires source review", async () => {
    primary();
    const result = await extractComparedReceipt(
      images,
      new AbortController().signal,
      vi.fn(),
      undefined,
      "auto",
    );
    expect(extractWithLocalModel).toHaveBeenCalledOnce();
    expect(extractLocalVisionEvidence).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      comparisonComplete: false,
      comparisonAttempted: false,
    });
    expect(result.receipt.items[0].lineTotal).toBe("5.50");
    expect(result.receipt.reviewChecks).toContainEqual(
      expect.objectContaining({
        field: "items",
        reason: "source",
        confirmedValue: "",
      }),
    );
    expect(
      calculateReceipt(result.receipt).issues.some(
        (issue) => issue.path === "items",
      ),
    ).toBe(true);
  });
  it("an explicit every-scan choice always obtains the independent reading", async () => {
    primary();
    vi.mocked(extractLocalVisionEvidence).mockResolvedValue(native());
    const result = await extractComparedReceipt(
      images,
      new AbortController().signal,
      vi.fn(),
    );
    expect(extractWithLocalModel).toHaveBeenCalledOnce();
    expect(extractLocalVisionEvidence).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      comparisonComplete: true,
      comparisonAttempted: true,
    });
  });
  it("automatically obtains vision when the primary has missing or uncertain details", async () => {
    primary(["MARKET", "Tea 5.50", "TOTAL GBP 5.50"]);
    vi.mocked(extractLocalVisionEvidence).mockResolvedValue(native());
    const result = await extractComparedReceipt(
      images,
      new AbortController().signal,
      vi.fn(),
      undefined,
      "auto",
    );
    expect(extractWithLocalModel).toHaveBeenCalledOnce();
    expect(extractLocalVisionEvidence).toHaveBeenCalledOnce();
    expect(result.comparisonComplete).toBe(true);
    expect(result.receipt.items[0].quantity).toBe("1");
    expect(
      result.receipt.reviewChecks.some((check) => check.field === "quantity"),
    ).toBe(true);
  });
  it("failed comparison preserves negative-row classification independently of the coverage check", async () => {
    primary([
      "MARKET",
      "Groceries 1x 10.00 10.00",
      "Loyalty credit -2.00",
      "Prices include tax",
      "TOTAL GBP 8.00",
    ]);
    vi.mocked(extractLocalVisionEvidence).mockRejectedValue(
      new Error("Synthetic model unavailable"),
    );
    const result = await extractComparedReceipt(
      images,
      new AbortController().signal,
      vi.fn(),
      undefined,
      "auto",
    );
    expect(result).toMatchObject({
      comparisonComplete: false,
      comparisonAttempted: true,
    });
    expect(result.receipt.reviewChecks).toContainEqual(
      expect.objectContaining({
        field: "adjustments",
        reason: "classification",
      }),
    );
    const coverage = result.receipt.reviewChecks.find(
      (check) => check.field === "items",
    )!;
    const reviewed = confirmReviewCheck(result.receipt, reviewKey(coverage));
    expect(
      calculateReceipt(reviewed).issues.some(
        (issue) => issue.path === "adjustments",
      ),
    ).toBe(true);
    expect(extractLocalVisionEvidence).toHaveBeenCalledOnce();
  });
  it("failed comparison retains recovered-price association checks from parsing", async () => {
    primary([
      "MARKET",
      "6 JAM DOUGHNUTS",
      "REDUCED PRICE £0.55",
      "Prices include tax",
      "TOTAL GBP 0.55",
    ]);
    vi.mocked(extractLocalVisionEvidence).mockRejectedValue(
      new Error("Synthetic model unavailable"),
    );
    const result = await extractComparedReceipt(
      images,
      new AbortController().signal,
      vi.fn(),
      undefined,
      "auto",
    );
    expect(result.receipt.reviewChecks).toContainEqual(
      expect.objectContaining({
        scope: "item",
        field: "lineTotal",
        reason: "recovered",
      }),
    );
    expect(result.receipt.items[0].quantity).toBe("");
    expect(result.receipt.items[0].lineTotal).toBe("0.55");
  });
  it("cancellation after the first reader rejects the operation before starting another", async () => {
    const output = primary();
    const control = new AbortController();
    vi.mocked(extractWithLocalModel).mockImplementation(async () => {
      control.abort();
      return output;
    });
    await expect(
      extractComparedReceipt(
        images,
        control.signal,
        vi.fn(),
        undefined,
        "auto",
      ),
    ).rejects.toThrow("cancelled");
    expect(extractLocalVisionEvidence).not.toHaveBeenCalled();
  });
  it("cancellation during the second reader never returns the successful first draft", async () => {
    primary();
    const control = new AbortController();
    vi.mocked(extractLocalVisionEvidence).mockImplementation(async () => {
      control.abort();
      return native();
    });
    await expect(
      extractComparedReceipt(images, control.signal, vi.fn()),
    ).rejects.toThrow("cancelled");
  });
  it("a failed primary does not start another reader or retry", async () => {
    vi.mocked(extractWithLocalModel).mockRejectedValue(
      new Error("Synthetic primary failure"),
    );
    await expect(
      extractComparedReceipt(
        images,
        new AbortController().signal,
        vi.fn(),
        undefined,
        "auto",
      ),
    ).rejects.toThrow("primary failure");
    expect(extractWithLocalModel).toHaveBeenCalledOnce();
    expect(extractLocalVisionEvidence).not.toHaveBeenCalled();
  });
});
