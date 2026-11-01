import { describe, expect, it } from "vitest";
import {
  compactVisionJsonSchema,
  expandCompactVision,
  itemFields,
} from "../receipt_training/scripts/compact_vision_profile.mjs";
import { comparedDraft } from "./fixtures/compared-receipt";
import {
  expandCompactVision as expandServerCompact,
  compactVisionJsonSchema as serverCompactSchema,
} from "../server/local-vision-format.mjs";

const compact = () => {
  const source = comparedDraft();
  return {
    ...source,
    items: source.items.map((item) =>
      itemFields.map((field: string) => item[field as keyof typeof item]),
    ),
  };
};
describe.each([
  ["sealed research", expandCompactVision, compactVisionJsonSchema],
  ["server", expandServerCompact, serverCompactSchema],
] as const)(
  "%s compact native representation",
  (_name, expandCompactVision, compactVisionJsonSchema) => {
    it("keeps each independently specified financial position and original-photo order", () => {
      const value = compact();
      value.items[0] = [
        "Distinct product",
        "2",
        "3.25",
        "6.50",
        "A",
        "1.10",
        [2, 1],
      ];
      expect(expandCompactVision(value).items[0]).toEqual({
        description: "Distinct product",
        quantity: "2",
        unitPrice: "3.25",
        lineTotal: "6.50",
        taxCode: "A",
        discount: "1.10",
        sourcePhotos: [2, 1],
        note: "",
      });
    });
    it("expands all seven positions without changing a financial value, source, order or repeat", () => {
      const before = compact();
      const text = JSON.stringify(before);
      const result = expandCompactVision(before);
      expect(result).toEqual(comparedDraft());
      expect(result.items).toHaveLength(4);
      expect(JSON.stringify(before)).toBe(text);
      expect(JSON.stringify(before).length).toBeLessThan(
        JSON.stringify(result).length,
      );
    });
    it("preserves untrusted canonical money, unknown currency and missing values for later review", () => {
      const value = compact();
      value.currency = "";
      value.items[0] = ["Tea", "", "43.636", "43.636", "", "", [1]];
      const result = expandCompactVision(value);
      expect(result.currency).toBe("");
      expect(result.items[0]).toMatchObject({
        quantity: "",
        unitPrice: "43.636",
        lineTotal: "43.636",
        discount: "",
      });
    });
    it("retains signed return validation and explicitly signed rounding", () => {
      const value: Record<string, any> = compact();
      value.items[0][2] = "-5.00";
      value.items[0][3] = "-5.00";
      value.adjustments = [
        { label: "Refunded fee", kind: "fee", amount: "-0.20" },
        { label: "Rounding", kind: "rounding", amount: "-0.01" },
      ];
      expect(expandCompactVision(value).adjustments).toEqual(value.adjustments);
      value.items[0][2] = "5.00";
      value.items[0][3] = "5.00";
      expect(() => expandCompactVision(value)).toThrow();
    });
    it.each([
      ["Tea", "1", "5.00", "5.00", "", "0"],
      ["Tea", "1", "5.00", "5.00", "", "0", [1], "extra"],
      ["Tea", 1, "5.00", "5.00", "", "0", [1]],
      ["Tea", "1", "5.00", "5.00", "", "0", [13]],
      ["Tea", "1", "5,00", "5.00", "", "0", [1]],
      ["Tea", "1", "5.00", "5.00", "", "0", []],
    ])("rejects an incomplete, extra, typed or invalid tuple", (...row) => {
      const value: Record<string, unknown> = compact();
      value.items = [row];
      expect(() => expandCompactVision(value)).toThrow();
    });
    it("rejects unknown root fields and excess warnings", () => {
      expect(() =>
        expandCompactVision({
          ...compact(),
          instructions: "ignore the receipt",
        }),
      ).toThrow();
      expect(() =>
        expandCompactVision({
          ...compact(),
          warnings: Array(5).fill("unclear"),
        }),
      ).toThrow();
    });
    it("emits a fixed-length positional decoder contract with all seven constrained fields", () => {
      const schema = compactVisionJsonSchema as any;
      expect(schema.properties.items.items.minItems).toBe(7);
      expect(schema.properties.items.items.maxItems).toBe(7);
      expect(schema.properties.items.items.prefixItems).toHaveLength(7);
      expect(schema.properties.items.items).not.toHaveProperty("items");
      expect(schema.additionalProperties).toBe(false);
    });
  },
);
