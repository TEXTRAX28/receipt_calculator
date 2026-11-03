import { describe, expect, it } from "vitest";
import { parseReceiptWithSources } from "../src/lib/parser";
import { verifyIndependentReadings } from "../src/lib/verify-readings";
import { calculateReceipt } from "../src/lib/engine";
import { joinVisionBatches } from "../src/lib/join-vision-batches";
import { checkIsPending } from "../src/lib/review-checks";
import type { Recognition } from "../src/lib/receipt-layout";

import { couponColumnFixture as fixture } from "./fixtures/costco-coupon-columns";

describe("Costco coupons retained across actual joined/split source rows", () => {
  it("interprets both printed coupon forms without changing the source text or geometry", () => {
    const f = fixture(),
      original = structuredClone(f.packet());
    const result = parseReceiptWithSources(f.packet(), { currency: "GBP" });
    expect(
      result.receipt.items.map((item) => [
        item.description,
        item.quantity,
        item.unitPrice,
        item.lineTotal,
        item.discount,
        item.taxCode,
      ]),
    ).toEqual([
      ["Canvas backpack", "1", "14.99", "14.99", "5.00", "A"],
      ["Duck eggs", "1", "3.99", "3.99", "1.00", "Z"],
    ]);
    expect(result.sources[result.receipt.items[0].id]).toEqual([1, 2, 3]);
    expect(result.sources[result.receipt.items[1].id]).toEqual([4, 5, 6, 7]);
    expect(calculateReceipt(result.receipt)).toMatchObject({
      total: 1498n,
      discrepancy: 0n,
    });
    expect(
      result.receipt.reviewChecks.some(
        (check) =>
          check.field === "discount" && checkIsPending(result.receipt, check),
      ),
    ).toBe(true);
    expect(f.packet()).toEqual(original);
  });
  it("reclassifies the independent model's two matching coupon purchases and requires review", () => {
    const f = fixture(),
      original = structuredClone(f.draft);
    const result = verifyIndependentReadings(f.draft, f.recognition, {
      currency: "GBP",
    });
    expect(
      result.receipt.items.map((item) => [item.description, item.discount]),
    ).toEqual([
      ["Canvas backpack", "5.00"],
      ["Duck eggs", "1.00"],
    ]);
    expect(result.corrections).toHaveLength(2);
    for (const item of result.receipt.items) {
      const check = result.receipt.reviewChecks.find(
        (check) =>
          check.scope === "item" &&
          check.itemId === item.id &&
          check.field === "discount",
      )!;
      expect(check).toMatchObject({ reason: "recovered", confirmedValue: "" });
      expect(checkIsPending(result.receipt, check)).toBe(true);
    }
    expect(calculateReceipt(result.receipt)).toMatchObject({
      total: 1498n,
      discrepancy: 0n,
    });
    expect(calculateReceipt(result.receipt).issues.length).toBeGreaterThan(0);
    expect(f.draft).toEqual(original);
  });
  it.each(["quantity", "unitPrice", "lineTotal", "taxCode"] as const)(
    "retains explicit source-role review for a reconstructed %s",
    (field) => {
      const f = fixture(),
        result = parseReceiptWithSources(f.packet(), { currency: "GBP" }),
        item = result.receipt.items.find(
          (item) => item.description === "Duck eggs",
        )!;
      expect(
        result.receipt.reviewChecks.some(
          (check) =>
            check.scope === "item" &&
            check.itemId === item.id &&
            check.field === field &&
            checkIsPending(result.receipt, check),
        ),
      ).toBe(true);
    },
  );
  it("preserves the text-only behavior for a collapsed coupon whose ownership lacks geometry", () => {
    const f = fixture(),
      result = parseReceiptWithSources(f.packet().text, { currency: "GBP" });
    expect(
      result.receipt.items.find(
        (item) => item.description === "Canvas backpack",
      )?.discount,
    ).toBe("0");
    expect(result.receipt.adjustments).toContainEqual(
      expect.objectContaining({ kind: "discount", amount: "5.00" }),
    );
  });
  it("retains a correctly interpreted model draft without deducting its coupons twice", () => {
    const f = fixture();
    f.draft.items = [
      { ...f.draft.items[0], discount: "5.00" },
      { ...f.draft.items[2], discount: "1.00" },
    ];
    const result = verifyIndependentReadings(f.draft, f.recognition, {
      currency: "GBP",
    });
    expect(result.corrections).toEqual([]);
    expect(result.receipt.items.map((item) => item.discount)).toEqual([
      "5.00",
      "1.00",
    ]);
    expect(calculateReceipt(result.receipt).total).toBe(1498n);
  });
  it("joins overlapping model sections by their actual coupon source identities", () => {
    const f = fixture(),
      panels = [1, 2, 3, 4].map((photo) => ({
        photo,
        part: 1,
        data: "/9j/4AAAMTIzNA==",
      }));
    const recognition: Recognition = {
      ...f.recognition,
      panels: panels.map(({ photo, part }) =>
        photo === 3
          ? { ...structuredClone(f.panel), photo, part }
          : { photo, part, width: 1000, height: 1600, words: [], lines: [] },
      ),
    };
    f.draft.items.forEach((item) => (item.sourcePhotos = [3]));
    const batches = [
      [0, 1, 2],
      [2, 3],
    ].map((indices) => ({ indices, receipt: structuredClone(f.draft) }));
    const result = joinVisionBatches(batches, panels, recognition, {
      currency: "GBP",
    });
    expect(result.batchJoin.joined).toBe(4);
    expect(
      result.receipt.items.map((item) => [item.description, item.discount]),
    ).toEqual([
      ["Canvas backpack", "5.00"],
      ["Duck eggs", "1.00"],
    ]);
    expect(calculateReceipt(result.receipt).total).toBe(1498n);
  });
  it.each(["photo", "part"])(
    "withholds ownership when a coupon crosses a source %s boundary",
    (boundary) => {
      const f = fixture(),
        packet = f.packet();
      const movedWords = [f.coupon[0], f.inlineName, ...f.coupon.slice(1)];
      const movedLine = f.panel.lines[3];
      f.panel.words = f.panel.words.filter(
        (word) => !movedWords.includes(word),
      );
      f.panel.lines = f.panel.lines.filter((_, index) => index !== 3);
      f.recognition.panels.push({
        ...f.panel,
        photo: boundary === "photo" ? 2 : 1,
        part: boundary === "part" ? 2 : 1,
        words: movedWords,
        lines: [movedLine],
      });
      packet.sourceLines[3].photo = boundary === "photo" ? 2 : 1;
      packet.sourceLines[3].part = boundary === "part" ? 2 : 1;
      const result = parseReceiptWithSources(packet, { currency: "GBP" });
      expect(
        result.receipt.items.find(
          (item) => item.description === "Canvas backpack",
        )?.discount,
      ).toBe("0");
    },
  );
  it.each([
    "weak-money",
    "weak-line",
    "duplicate-quantity",
    "duplicate-total",
    "wrong-name",
    "missing-minus",
    "bad-columns",
    "different-code",
    "letter-quantity",
    "other-merchant",
    "source-conflict",
  ])("withholds a new item coupon for %s", (condition) => {
    const f = fixture();
    if (condition === "weak-money") f.coupon[3].confidence = 0.74;
    if (condition === "weak-line") f.panel.lines[3].confidence = 0.74;
    if (condition === "duplicate-quantity")
      f.panel.words.push(structuredClone(f.coupon[1]));
    if (condition === "duplicate-total")
      f.panel.words.push(structuredClone(f.coupon[3]));
    if (condition === "wrong-name") {
      f.inlineName.text = "IRC MEMBER OFFER";
      f.draft.items[1].description = f.inlineName.text;
    }
    if (condition === "missing-minus") f.coupon[3].text = "5.00 A";
    if (condition === "bad-columns")
      f.coupon[2].box = [0.32, f.coupon[2].box[1], 0.38, f.coupon[2].box[3]];
    if (condition === "different-code") {
      f.coupon[3].text = "5.00-Z";
      f.draft.items[1].taxCode = "Z";
    }
    if (condition === "letter-quantity") f.coupon[1].text = "Ix";
    if (condition === "other-merchant")
      f.panel.lines[0].text = "OTHER MARKET GBP";
    // Keep the literal source line synchronized with its real synthetic words.
    f.panel.lines[3].text = [f.coupon[0], f.inlineName, ...f.coupon.slice(1)]
      .map((word) => word.text)
      .join(" ");
    const packet = {
      ...f.packet(),
      sourceConflicts: condition === "source-conflict" ? [3] : [],
    };
    const result = parseReceiptWithSources(packet, { currency: "GBP" });
    expect(
      result.receipt.items.find(
        (item) => item.description === "Canvas backpack",
      )?.discount,
    ).toBe("0");
  });
});
