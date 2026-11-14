import { describe, expect, it } from "vitest";
import { calculateReceipt, calculateSplit } from "../src/lib/engine";
import { receiptFromOpenAi } from "../src/lib/openai-draft";
import { receiptStamp, type Currency } from "../src/lib/model";
import { formatReceiptMoney } from "../src/lib/money";
import { parseReceiptText } from "../src/lib/parser";
import { loadDraft, saveDraft } from "../src/lib/storage";
import { readableSummary } from "../src/lib/summary";
import { aiCostcoDraft } from "./fixtures/ai-receipt";
import { assign, review, shop } from "./helpers";

describe("currency evidence is required before money can be checked", () => {
  it.each(["", "$", "¥"])(
    "leaves absent or ambiguous %s evidence unresolved",
    (symbol) => {
      const receipt = parseReceiptText(
        `Market\nMilk 1x ${symbol}2.00 ${symbol}2.00\nTOTAL ${symbol}2.00`,
      );
      expect(receipt.currencyUnresolved).toBe(true);
      expect(calculateReceipt(receipt).printed).toBeNull();
      expect(calculateReceipt(receipt).discrepancy).toBeNull();
      expect(calculateReceipt(receipt).issues).toEqual([
        expect.objectContaining({ path: "currency" }),
      ]);
      expect(formatReceiptMoney(0n, receipt)).toBe("—");
    },
  );

  it.each(["GBP", "JPY", "KWD", "TWD"])(
    "retains explicit %s evidence",
    (currency) => {
      const receipt = parseReceiptText(
        `Market\nCurrency ${currency}\nMilk 1x 2 2\nTOTAL 2`,
      );
      expect(receipt.currency).toBe(currency);
      expect(receipt.currencyUnresolved).toBe(false);
    },
  );

  it("blocks a fully assigned and manually stamped balanced AI draft when currency is missing", () => {
    const state = shop();
    state.receipt = receiptFromOpenAi({ ...aiCostcoDraft(), currency: "" });
    state.receipt.items.forEach((item) => {
      item.assignment.participants = state.people.map((person) => person.id);
    });
    review(state);
    expect(state.receipt.currencyUnresolved).toBe(true);
    expect(calculateSplit(state).canFinalize).toBe(false);
    expect(readableSummary(state)).toContain("Currency: Choose currency");
    expect(readableSummary(state)).toContain("Receipt total: —");
    expect(readableSummary(state)).not.toContain("£");
    expect(readableSummary(state)).not.toContain("Checked split");
    state.receipt.currencyUnresolved = false; // Explicit selection of GBP, even though it was the internal placeholder.
    expect(calculateReceipt(state.receipt).total).toBe(17678n);
    expect(calculateSplit(state).canFinalize).toBe(false); // The currency change requires renewed review.
    review(state);
    expect(calculateSplit(state).canFinalize).toBe(true);
  });

  it.each<[Currency, string, bigint]>([
    ["JPY", "250", 250n],
    ["KWD", "1.234", 1234n],
  ])(
    "preserves decimal strings until %s is selected, then calculates in the correct minor units",
    (currency, price, minor) => {
      const state = shop();
      state.receipt.items[0].lineTotal = price;
      state.receipt.printedTotal = price;
      state.receipt.currencyUnresolved = true;
      assign(state, "equal");
      review(state);
      expect(
        calculateReceipt(state.receipt).issues.map((issue) => issue.path),
      ).toEqual(["currency"]);
      expect(state.receipt.items[0].lineTotal).toBe(price);
      state.receipt.currency = currency;
      state.receipt.currencyUnresolved = false;
      review(state);
      const result = calculateSplit(state);
      expect(result.canFinalize).toBe(true);
      expect(result.receipt.total).toBe(minor);
      expect(result.assignedTotal).toBe(minor);
    },
  );

  it("keeps a legacy known-currency review valid without dropping its items or assignments", () => {
    const state = shop();
    assign(state, "equal");
    review(state);
    const legacy = JSON.parse(JSON.stringify(state));
    delete legacy.receipt.currencyUnresolved;
    const loaded = loadDraft({ getItem: () => JSON.stringify(legacy) });
    expect(loaded.warning).toBe("");
    expect(loaded.state.receipt.currencyUnresolved).toBe(false);
    expect(loaded.state.reviewedStamp).toBe(receiptStamp(loaded.state.receipt));
    expect(calculateSplit(loaded.state).canFinalize).toBe(true);
  });

  it.each([
    "Currency was unclear. Confirm the selected currency.",
    "Currency was not identified. Confirm the selected currency.",
    "Dollar symbols can mean several currencies. Confirm the selected currency.",
  ])(
    "reopens a legacy extracted draft for explicit currency selection: %s",
    (warning) => {
      const state = shop();
      state.receipt.source = "ai";
      state.receipt.warnings = [warning];
      assign(state, "equal");
      review(state);
      const legacy = JSON.parse(JSON.stringify(state));
      delete legacy.receipt.currencyUnresolved;
      legacy.step = "summary";
      legacy.finalizedStamp = "legacy fingerprint";
      const loaded = loadDraft({ getItem: () => JSON.stringify(legacy) });
      expect(loaded.warning).toContain("currency selected");
      expect(loaded.state.step).toBe("review");
      expect(loaded.state.receipt.items).toEqual(state.receipt.items);
      expect(loaded.state.receipt.currencyUnresolved).toBe(true);
      expect(loaded.state.reviewedStamp).toBe("");
      expect(loaded.state.finalizedStamp).toBe("");
      expect(calculateSplit(loaded.state).canFinalize).toBe(false);
    },
  );

  it("preserves explicit selection across refresh even when the original warning remains", () => {
    const state = shop();
    state.receipt.source = "ai";
    state.receipt.warnings = [
      "Currency was unclear. Confirm the selected currency.",
    ];
    assign(state, "equal");
    review(state);
    let raw = "";
    saveDraft(
      {
        setItem: (_key, value) => {
          raw = value;
        },
      },
      state,
    );
    const loaded = loadDraft({ getItem: () => raw });
    expect(loaded.state.receipt.currencyUnresolved).toBe(false);
    expect(calculateSplit(loaded.state).canFinalize).toBe(true);
  });
});
