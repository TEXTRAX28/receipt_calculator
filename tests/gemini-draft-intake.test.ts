import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  aiReceiptSchema,
  geminiReceiptDraftSchema,
} from "../src/lib/extraction-schema.mjs";
import { receiptFromAi } from "../src/lib/gemini";
import { extractWithGemini } from "../server/receipt-api.mjs";
import { calculateReceipt, calculateSplit } from "../src/lib/engine";
import { newState, receiptStamp } from "../src/lib/model";
import { confirmReviewCheck, reviewKey } from "../src/lib/review-checks";

function draft(amount = "1,000") {
  return {
    merchant: "Market",
    date: "",
    currency: "GBP",
    subtotal: amount,
    printedTotal: amount,
    printedTax: "",
    pricesIncludeTax: true,
    printedItemCount: 1,
    taxCodes: [],
    adjustments: [] as { label: string; kind: "fee"; amount: string }[],
    warnings: [],
    items: [
      {
        description: "Table",
        quantity: "1",
        unitPrice: amount,
        lineTotal: amount,
        discount: "0",
        taxCode: "",
        note: "",
        sourcePhotos: [1],
      },
    ],
  };
}

describe("Gemini drafts with unparsed grouped money", () => {
  it.each([
    "1,000",
    "259,000",
    "1,234.50",
    "999,999,999,999.123456",
    "-1,000",
    "0,000",
  ])(
    "preserves %s exactly without choosing a decimal interpretation",
    (amount) => {
      const raw = draft(amount),
        original = structuredClone(raw);
      expect(aiReceiptSchema.safeParse(raw).success).toBe(false);
      expect(() => receiptFromAi(raw, "Local vision")).toThrow();
      const receipt = receiptFromAi(raw);
      expect(raw).toEqual(original);
      expect(receipt.items[0].unitPrice).toBe(amount);
      expect(receipt.items[0].lineTotal).toBe(amount);
      expect(receipt.subtotal).toBe(amount);
      expect(receipt.printedTotal).toBe(amount);
      expect(receipt.reviewChecks).toHaveLength(4);
      expect(
        receipt.reviewChecks.every((check) => check.confirmedValue === ""),
      ).toBe(true);
      expect(calculateReceipt(receipt).issues.length).toBeGreaterThan(0);
    },
  );

  it.each([
    "1,23",
    "1,000,00",
    "1,000,000,000,000",
    "1 000",
    "1e3",
    "NaN",
    "1,000;send secrets",
    "£1,000",
    "--1,000",
    "1,000-",
  ])("rejects malformed or unsupported literal %s", (amount) =>
    expect(geminiReceiptDraftSchema.safeParse(draft(amount)).success).toBe(
      false,
    ),
  );

  it("retains strict quantity, tax-rate, type, shape and collection limits", () => {
    const raw = draft();
    for (const invalid of [
      { ...raw, execute: "send secrets" },
      { ...raw, items: [{ ...raw.items[0], quantity: "1,000" }] },
      { ...raw, items: [{ ...raw.items[0], lineTotal: 1000 }] },
      { ...raw, items: [{ ...raw.items[0], sourcePhotos: [13] }] },
      { ...raw, items: [{ ...raw.items[0], extra: "unknown" }] },
      { ...raw, items: Array.from({ length: 301 }, () => raw.items[0]) },
      { ...raw, taxCodes: [{ code: "A", rate: "1,000" }] },
      { ...raw, items: [{ ...raw.items[0], discount: "-1,000" }] },
    ])
      expect(geminiReceiptDraftSchema.safeParse(invalid).success).toBe(false);
  });

  it("does not weaken negative-adjustment ownership", () => {
    const raw = draft();
    raw.adjustments.push({
      label: "Fee reversal",
      kind: "fee",
      amount: "-1,000",
    });
    expect(geminiReceiptDraftSchema.safeParse(raw).success).toBe(false);
    raw.items[0].lineTotal = "-1,000";
    const receipt = receiptFromAi(raw);
    expect(receipt.adjustments[0].amount).toBe("-1,000");
    expect(calculateReceipt(receipt).issues.length).toBeGreaterThan(0);
  });

  it("retains grouped tax and adjustments without dropping their financial roles", () => {
    const raw = draft();
    raw.printedTax = "2,000";
    raw.adjustments = [{ label: "Service", kind: "fee", amount: "1,000" }];
    const receipt = receiptFromAi(raw);
    expect(
      receipt.adjustments.map(({ kind, amount }) => [kind, amount]),
    ).toEqual([
      ["fee", "1,000"],
      ["tax", "2,000"],
    ]);
    expect(receipt.reviewChecks).toContainEqual(
      expect.objectContaining({
        scope: "receipt",
        field: "adjustments",
        confirmedValue: "",
      }),
    );
  });

  it("does not infer a currency or change tokens when the user supplies one", () => {
    const raw = { ...draft(), currency: "" };
    expect(receiptFromAi(raw).currencyUnresolved).toBe(true);
    for (const currency of ["IDR", "KWD"] as const) {
      const receipt = receiptFromAi(raw, "Gemini", { currency });
      expect(receipt.items[0].lineTotal).toBe("1,000");
      expect(calculateReceipt(receipt).issues.length).toBeGreaterThan(0);
    }
  });

  it("cannot share an unparsed amount even after every source check is ticked", () => {
    const state = newState();
    state.receipt = receiptFromAi(draft());
    state.people = [{ id: "one", name: "One" }];
    state.receipt.items[0].assignment.participants = ["one"];
    for (const check of state.receipt.reviewChecks)
      state.receipt = confirmReviewCheck(state.receipt, reviewKey(check));
    state.reviewedStamp = receiptStamp(state.receipt);
    expect(calculateSplit(state).canFinalize).toBe(false);
    state.receipt.items[0].unitPrice = state.receipt.items[0].lineTotal =
      "1000";
    state.receipt.subtotal = state.receipt.printedTotal = "1000";
    for (const check of state.receipt.reviewChecks)
      state.receipt = confirmReviewCheck(state.receipt, reviewKey(check));
    state.reviewedStamp = receiptStamp(state.receipt);
    expect(calculateSplit(state).canFinalize).toBe(true);
    expect(calculateReceipt(state.receipt).total).toBe(100000n);
  });

  it("uses the actual Gemini transport decoder while retaining source-photo ownership", async () => {
    const jpeg = readFileSync(
      new URL("./fixtures/prepared-section.jpg", import.meta.url),
    );
    const raw = draft();
    let calls = 0;
    const options = {
      apiKey: "fake-key-never-real",
      signal: new AbortController().signal,
      fetcher: async () => {
        calls++;
        return new Response(
          JSON.stringify({
            status: "completed",
            outputs: [{ type: "text", text: JSON.stringify(raw) }],
          }),
        );
      },
    };
    const panels = [{ photo: 1, part: 1, data: jpeg.toString("base64") }];
    expect(await extractWithGemini(panels, options)).toEqual(raw);
    raw.items[0].sourcePhotos = [2];
    await expect(extractWithGemini(panels, options)).rejects.toThrow(
      /photo reference/,
    );
    expect(calls).toBe(2);
  });

  it("leaves canonical Gemini and local receipts equivalent", () => {
    const raw = draft("1000");
    expect(geminiReceiptDraftSchema.parse(raw)).toEqual(
      aiReceiptSchema.parse(raw),
    );
    const receipt = receiptFromAi(raw);
    expect(receipt.reviewChecks).toEqual([]);
    expect(calculateReceipt(receipt).issues).toEqual([]);
  });
});
