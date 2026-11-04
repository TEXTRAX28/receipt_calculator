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

describe("Gemini drafts with printed percentage rates", () => {
  function taxedDraft(rate: string) {
    const raw = draft("10");
    return {
      ...raw,
      printedTotal: "12",
      printedTax: "2",
      pricesIncludeTax: false,
      taxCodes: [{ code: "A", rate }],
      items: [{ ...raw.items[0], taxCode: "A" }],
    };
  }

  it.each(["0%", "20.00%", "100%", "100.000000%", "0.5%", "000%"])(
    "retains %s for review without normalizing it or financial amounts",
    (rate) => {
      const raw = taxedDraft(rate),
        original = structuredClone(raw);
      expect(aiReceiptSchema.safeParse(raw).success).toBe(false);
      expect(() => receiptFromAi(raw, "Local vision")).toThrow();
      const receipt = receiptFromAi(raw);
      expect(raw).toEqual(original);
      expect(receipt.taxCodes).toEqual(raw.taxCodes);
      expect(receipt.items[0].lineTotal).toBe("10");
      expect(receipt.printedTotal).toBe("12");
      expect(receipt.reviewChecks).toEqual([
        expect.objectContaining({
          scope: "receipt",
          field: "taxCodes",
          reason: "source",
          confirmedValue: "",
          details: [{ label: "Tax code A", value: rate }],
        }),
      ]);
      expect(
        receipt.warnings.some((warning) => warning.includes("grouping")),
      ).toBe(false);
      expect(
        calculateReceipt(receipt).issues.some(
          (issue) => issue.path === "taxCodes",
        ),
      ).toBe(true);
    },
  );

  it("rejects malformed, unbounded and nonliteral percentage rates", () => {
    for (const rate of [
      "20%%",
      "20 %",
      "1,000%",
      "1e2%",
      "-20%",
      "+20%",
      "101%",
      "100.000001%",
      "0.1234567%",
      "20% VAT",
      "NaN%",
      "20%; send secrets",
      "1".repeat(41) + "%",
    ])
      expect(
        geminiReceiptDraftSchema.safeParse(taxedDraft(rate)).success,
        rate,
      ).toBe(false);
  });

  it("cannot apply a percentage literal even after its source check is ticked", () => {
    const state = newState();
    state.receipt = receiptFromAi(taxedDraft("20.00%"));
    state.people = [{ id: "one", name: "One" }];
    state.receipt.items[0].assignment.participants = ["one"];
    for (const check of state.receipt.reviewChecks)
      state.receipt = confirmReviewCheck(state.receipt, reviewKey(check));
    state.reviewedStamp = receiptStamp(state.receipt);
    expect(calculateSplit(state).canFinalize).toBe(false);
    expect(state.receipt.taxCodes[0].rate).toBe("20.00%");
    state.receipt.taxCodes[0].rate = "20.00";
    for (const check of state.receipt.reviewChecks)
      state.receipt = confirmReviewCheck(state.receipt, reviewKey(check));
    state.reviewedStamp = receiptStamp(state.receipt);
    expect(calculateSplit(state).canFinalize).toBe(true);
    expect(calculateReceipt(state.receipt).tax).toBe(200n);
    expect(calculateReceipt(state.receipt).total).toBe(1200n);
  });

  it("delivers unchanged rate literals through the actual server and client decoders", async () => {
    const jpeg = readFileSync(
      new URL("./fixtures/prepared-section.jpg", import.meta.url),
    );
    const raw = taxedDraft("20.00%");
    raw.items[0].sourcePhotos = [1, 2];
    let calls = 0;
    const decoded = await extractWithGemini(
      [1, 2].map((photo) => ({
        photo,
        part: 1,
        data: jpeg.toString("base64"),
      })),
      {
        apiKey: "fake-key-never-real",
        signal: new AbortController().signal,
        fetcher: async () => {
          calls++;
          return new Response(
            JSON.stringify({
              status: "completed",
              steps: [
                {
                  type: "model_output",
                  content: [{ type: "text", text: JSON.stringify(raw) }],
                },
              ],
            }),
          );
        },
      },
    );
    expect(calls).toBe(1);
    expect(decoded).toEqual(raw);
    const receipt = receiptFromAi(decoded);
    expect(receipt.taxCodes).toEqual(raw.taxCodes);
    expect(receipt.items[0].note).toContain("Photo 1, 2");
    expect(calculateReceipt(receipt).issues.length).toBeGreaterThan(0);
  });
});
