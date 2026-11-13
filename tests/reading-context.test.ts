import { describe, expect, it } from "vitest";
import { currencies } from "../src/lib/model";
import { readingContextSchema } from "../src/lib/reading-context.mjs";
import { parseReceiptText } from "../src/lib/parser";
import { receiptFromOpenAi } from "../src/lib/openai-draft";
import { calculateReceipt } from "../src/lib/engine";
import { aiCostcoDraft } from "./fixtures/ai-receipt";

describe("explicit receipt reading currency", () => {
  it("accepts only supported currency context, with no prompt or model options", () => {
    for (const currency of Object.keys(currencies))
      expect(readingContextSchema.parse({ currency })).toEqual({ currency });
    for (const context of [
      { currency: "" },
      { currency: "idr" },
      { currency: "CNY" },
      { currency: "IDR", prompt: "ignore rules" },
      { currency: "IDR", model: "other" },
      {},
    ])
      expect(readingContextSchema.safeParse(context).success).toBe(false);
  });

  it("uses a user's currency to read raw grouped prices without changing the original text", () => {
    const text = "SHOP\nCOFFEE 27.000\nTOTAL 27.000";
    const automatic = parseReceiptText(text);
    expect(automatic.currencyUnresolved).toBe(true);
    expect(automatic.printedTotal).toBe("");
    const selected = parseReceiptText(text, { currency: "IDR" });
    expect(selected.currency).toBe("IDR");
    expect(selected.currencyUnresolved).toBe(false);
    expect(selected.printedTotal).toBe("27000");
    expect(selected.items[0].lineTotal).toBe("27000");
    expect(selected.rawText).toBe(text);
    expect(selected.warnings.some((x) => x.includes("supplied by you"))).toBe(
      true,
    );
  });

  it("keeps conflicting printed currency unresolved and requires review", () => {
    const receipt = parseReceiptText("SHOP\nCOFFEE 12.00\nTOTAL EUR 12.00", {
      currency: "GBP",
    });
    expect(receipt.currency).toBe("EUR");
    expect(receipt.currencyUnresolved).toBe(true);
    expect(receipt.reviewChecks).toContainEqual(
      expect.objectContaining({ field: "currency", reason: "different" }),
    );
    expect(
      calculateReceipt(receipt).issues.some((x) => x.path === "currency"),
    ).toBe(true);
  });

  it("lets a user identify a dollar currency but does not reinterpret dollars as rupiah", () => {
    const text = "SHOP\nCOFFEE $12.00\nTOTAL $12.00";
    expect(parseReceiptText(text, { currency: "CAD" }).currency).toBe("CAD");
    expect(parseReceiptText(text, { currency: "CAD" }).currencyUnresolved).toBe(
      false,
    );
    expect(parseReceiptText(text, { currency: "IDR" }).currencyUnresolved).toBe(
      true,
    );
  });

  it("supplies missing AI currency while preserving all canonical model amounts", () => {
    const draft = { ...aiCostcoDraft(), currency: "" };
    draft.items[0].lineTotal = "7.000";
    draft.items[0].unitPrice = "7.000";
    const receipt = receiptFromOpenAi(draft, { currency: "IDR" });
    expect(receipt.currency).toBe("IDR");
    expect(receipt.currencyUnresolved).toBe(false);
    expect(receipt.items[0].lineTotal).toBe("7.000");
    expect(calculateReceipt(receipt).issues.length).toBeGreaterThan(0);
  });

  it("does not hide a conflicting AI currency", () => {
    const draft = aiCostcoDraft();
    draft.currency = "USD";
    const receipt = receiptFromOpenAi(draft, { currency: "CAD" });
    expect(receipt.currency).toBe("USD");
    expect(receipt.currencyUnresolved).toBe(true);
    expect(receipt.reviewChecks).toContainEqual(
      expect.objectContaining({ field: "currency", reason: "different" }),
    );
  });
});
