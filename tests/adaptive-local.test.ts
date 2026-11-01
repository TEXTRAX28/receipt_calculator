import { afterEach, describe, expect, it, vi } from "vitest";
import { extractComparedReceipt } from "../src/lib/compared-reader";
import { extractWithLocalModel } from "../src/lib/local-model";
import { extractLocalVisionEvidence } from "../src/lib/local-vision";
import {
  assembleRecognition,
  type Recognition,
} from "../src/lib/receipt-layout";
import { calculateReceipt } from "../src/lib/engine";
import { confirmReviewCheck, reviewKey } from "../src/lib/review-checks";
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
