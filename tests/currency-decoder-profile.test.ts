import { describe, expect, it } from "vitest";
import { z } from "zod";
import { aiReceiptSchema } from "../src/lib/extraction-schema.mjs";
import { currencyPrecisionSchema } from "../receipt_training/scripts/currency_decoder_profile.mjs";
import { currencies } from "../src/lib/model";
import { money } from "../src/lib/money";

const base = z.toJSONSchema(aiReceiptSchema);
const profile = currencyPrecisionSchema(base);
const quantitySchema = (
  base.properties!.items as { items: { properties: Record<string, unknown> } }
).items.properties.quantity;
const branchFor = (currency: string) =>
  profile.anyOf.filter((branch: any) =>
    branch.properties.currency.enum.includes(currency),
  );
describe("research-only currency-specific native decoding", () => {
  it.each(Object.keys(currencies))(
    "preserves the declared %s precision without interpreting printed separators",
    (currency) => {
      const branches = branchFor(currency);
      expect(branches).toHaveLength(1);
      const precision = currencies[currency as keyof typeof currencies];
      const allowed = precision ? "123." + "4".repeat(precision) : "123";
      const tooMany = allowed + (precision ? "4" : ".0");
      for (const pattern of [
        branches[0].properties.printedTotal.pattern,
        branches[0].properties.items.items.properties.lineTotal.pattern,
      ]) {
        const test = new RegExp(pattern);
        expect(test.test(allowed)).toBe(true);
        expect(test.test("-" + allowed)).toBe(true);
        expect(test.test(tooMany)).toBe(false);
        expect(test.test("1,234.50")).toBe(false);
        expect(test.test("")).toBe(true);
        expect(() =>
          money(allowed, currency as keyof typeof currencies, true),
        ).not.toThrow();
      }
    },
  );
  it("keeps six-place quantities/rates and unknown-currency evidence without mutation", () => {
    const before = JSON.stringify(base);
    currencyPrecisionSchema(base);
    expect(JSON.stringify(base)).toBe(before);
    expect(branchFor("")).toHaveLength(1);
    expect(
      new RegExp(branchFor("")[0].properties.printedTotal.pattern).test(
        "43.636",
      ),
    ).toBe(true);
    for (const branch of profile.anyOf) {
      expect(branch.properties.items.items.properties.quantity).toEqual(
        quantitySchema,
      );
      expect(branch.properties.taxCodes).toEqual(base.properties!.taxCodes);
      expect(branch.additionalProperties).toBe(false);
      expect(branch.required).toEqual(base.required);
      const item = branch.properties.items.items.properties;
      expect(new RegExp(item.discount.pattern).test("-1")).toBe(false);
      for (const choice of branch.properties.adjustments.items.anyOf)
        expect(choice.properties.amount.pattern).toBe(
          branch.properties.printedTotal.pattern,
        );
    }
  });
});
