import { describe, expect, it } from "vitest";
import { parseReceiptWithSources } from "../src/lib/parser";
import { reviewDeviceReading } from "../src/lib/device-review";
import { devicePanel, deviceRecognition } from "../src/lib/device-evidence";
import {
  confirmReviewCheck,
  reviewKey,
  checkIsPending,
} from "../src/lib/review-checks";

function fixture(
  text = "Shop\nCurrency GBP\nMilk 1x 2.50 2.50\nTOTAL GBP 2.50\nPRICES INCLUDE TAX",
) {
  const data = {
    blocks: [
      {
        paragraphs: [
          {
            lines: text.split("\n").map((text, i) => {
              let x = 10;
              const words = text.split(" ").map((text) => {
                const left = x;
                x += text.length * 7 + 10;
                return {
                  text,
                  confidence: 99,
                  bbox: {
                    x0: left,
                    y0: i * 40 + 10,
                    x1: x - 10,
                    y1: i * 40 + 35,
                  },
                };
              });
              return {
                text,
                confidence: 99,
                bbox: { x0: 10, y0: i * 40 + 10, x1: x, y1: i * 40 + 35 },
                words,
              };
            }),
          },
        ],
      },
    ],
  };
  const parsed = parseReceiptWithSources(text),
    p = devicePanel(data, text, 1000, 1200, 1, 1);
  return {
    data,
    parsed,
    p,
    read: () => {
      const evidence = devicePanel(data, text, 1000, 1200, 1, 1);
      return reviewDeviceReading(
        parsed.receipt,
        parsed.sources,
        evidence.rows.map((row) => row.source),
        deviceRecognition([evidence.panel!]),
        parsed.fieldSources,
      );
    },
  };
}
const financial = (
  receipt: ReturnType<typeof fixture>["parsed"]["receipt"],
) => ({
  items: receipt.items,
  subtotal: receipt.subtotal,
  tax: receipt.printedTax,
  total: receipt.printedTotal,
  adjustments: receipt.adjustments,
  taxCodes: receipt.taxCodes,
  pricesIncludeTax: receipt.pricesIncludeTax,
});

describe("source-informed on-device review without amount repair", () => {
  it("requires review of conflicting overlap values and the joined purchase list despite high scores", () => {
    const f = fixture();
    const next = reviewDeviceReading(
      f.parsed.receipt,
      f.parsed.sources,
      f.p.rows.map((r) => r.source),
      deviceRecognition([f.p.panel!]),
      f.parsed.fieldSources,
      [2, 3],
      2,
    );
    expect(next.reviewChecks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ scope: "item", field: "lineTotal" }),
        expect.objectContaining({ scope: "receipt", field: "printedTotal" }),
        expect.objectContaining({ scope: "receipt", field: "items" }),
      ]),
    );
    expect(financial(next)).toEqual(financial(f.parsed.receipt));
  });
  it("leaves complete strong literal rows and explicit item-tax convention unflagged", () => {
    const f = fixture(),
      before = JSON.stringify(f.parsed.receipt),
      next = f.read();
    expect(next.reviewChecks).toHaveLength(0);
    expect(financial(next)).toEqual(financial(f.parsed.receipt));
    expect(JSON.stringify(f.parsed.receipt)).toBe(before);
    expect(f.parsed.fieldSources.printedTotal).toEqual([3]);
  });
  it("a weak word cannot borrow its strong line average; every populated purchase field stays pending", () => {
    const f = fixture();
    f.data.blocks[0].paragraphs[0].lines[2].words[0].confidence = 5;
    const next = f.read(),
      item = next.items[0];
    expect(
      next.reviewChecks
        .filter((check) => check.scope === "item")
        .map((check) => check.field)
        .sort(),
    ).toEqual(["description", "quantity", "unitPrice", "lineTotal"].sort());
    expect(
      next.reviewChecks.every((check) => checkIsPending(next, check)),
    ).toBe(true);
    expect(financial(next)).toEqual(financial(f.parsed.receipt));
    expect(item.description).toBe("Milk");
    expect(item.lineTotal).toBe("2.50");
  });
  it("withholds missing geometry and flags printed financial amounts without inventing boxes or values", () => {
    const f = fixture(),
      next = reviewDeviceReading(
        f.parsed.receipt,
        f.parsed.sources,
        [],
        undefined,
        f.parsed.fieldSources,
      );
    expect(next.reviewChecks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ scope: "receipt", field: "items" }),
        expect.objectContaining({ scope: "receipt", field: "printedTotal" }),
        expect.objectContaining({
          scope: "receipt",
          field: "pricesIncludeTax",
        }),
      ]),
    );
    expect(financial(next)).toEqual(financial(f.parsed.receipt));
  });
  it("a weak total word has a real document source and an unconfirmed total check", () => {
    const f = fixture();
    f.data.blocks[0].paragraphs[0].lines[3].words[2].confidence = 0;
    const next = f.read();
    expect(next.reviewChecks).toContainEqual(
      expect.objectContaining({
        scope: "receipt",
        field: "printedTotal",
        confirmedValue: "",
      }),
    );
    expect(f.p.rows[f.parsed.fieldSources.printedTotal![0]].source!.text).toBe(
      "TOTAL GBP 2.50",
    );
    expect(next.printedTotal).toBe("2.50");
  });
  it("total-including-tax wording does not verify item-price tax inclusion", () => {
    const f = fixture(
        "Shop\nCurrency GBP\nMilk 1x 2.50 2.50\nTOTAL (INCL VAT) 2.50",
      ),
      next = f.read();
    expect(next.reviewChecks).toContainEqual(
      expect.objectContaining({ scope: "receipt", field: "pricesIncludeTax" }),
    );
  });
  it("contradictory tax interpretation and code meanings remain pending without automatic correction", () => {
    const f = fixture(
        "Costco UK\nCurrency GBP\nMilk 1x 2.50 2.50 A\nA 20.00% 2.50 0.50\nTOTAL GBP 3.00\nPRICES INCLUDE TAX",
      ),
      next = f.read();
    expect(next.pricesIncludeTax).toBe(f.parsed.receipt.pricesIncludeTax);
    expect(next.reviewChecks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ scope: "receipt", field: "taxCodes" }),
        expect.objectContaining({
          scope: "receipt",
          field: "pricesIncludeTax",
        }),
      ]),
    );
    expect(f.parsed.fieldSources.taxCodes).toEqual([3]);
  });
  it("charge roles and their actual source indices stay visible", () => {
    const f = fixture(
        "Shop\nCurrency GBP\nMilk 1x 2.50 2.50\nSubtotal 2.50\nService charge 0.50\nTOTAL 3.00\nPRICES INCLUDE TAX",
      ),
      next = f.read();
    expect(next.reviewChecks).toContainEqual(
      expect.objectContaining({ scope: "receipt", field: "adjustments" }),
    );
    expect(f.parsed.sources[next.adjustments[0].id]).toEqual([4]);
    expect(next.adjustments[0].amount).toBe("0.50");
  });
  it("conflicting final totals require a check even when both OCR readings have high scores", () => {
    const f = fixture(
      "Shop\nCurrency GBP\nMilk 1x 3.00 3.00\nTOTAL GBP 2.50\nTOTAL GBP 3.00\nPRICES INCLUDE TAX",
    );
    expect(f.read().reviewChecks).toContainEqual(
      expect.objectContaining({ scope: "receipt", field: "printedTotal" }),
    );
  });
  it("does not retain stale confirmations or duplicate checks when new evidence is weak", () => {
    const f = fixture();
    f.data.blocks[0].paragraphs[0].lines[2].words[0].confidence = 5;
    const first = f.read(),
      checked = first.reviewChecks.reduce(
        (receipt, check) => confirmReviewCheck(receipt, reviewKey(check), true),
        first,
      );
    const again = reviewDeviceReading(
      checked,
      f.parsed.sources,
      f.p.rows.map((row) => row.source),
      undefined,
      f.parsed.fieldSources,
    );
    expect(new Set(again.reviewChecks.map(reviewKey)).size).toBe(
      again.reviewChecks.length,
    );
    expect(
      again.reviewChecks.every((check) => checkIsPending(again, check)),
    ).toBe(true);
  });
});
