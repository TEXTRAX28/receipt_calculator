import { describe, it, expect } from "vitest";
import { readableSummary } from "../src/lib/summary";
import { assign, review, shop } from "./helpers";
describe("explainable export", () => {
  it("includes quantities, purchase packs, people and exact costs", () => {
    const s = shop(["16.00"]);
    s.receipt.items[0].packSize = "8";
    assign(s, "quantity", ["1", "3", "4"]);
    const text = readableSummary(s);
    expect(text).toContain("1 of 8 units (1 purchased × 8 per pack)");
    expect(text).toContain("Alice (person 1): £2.00");
    expect(text).toContain("Allocated: £16.00");
  });
  it("discloses allocation rounding and marks unresolved splits as drafts", () => {
    const s = shop(["1.00"]);
    expect(readableSummary(s)).toContain("DRAFT");
    s.receipt.pricesIncludeTax = false;
    s.receipt.adjustments = [
      {
        id: "tax",
        label: "Tax",
        kind: "tax",
        amount: "0.20",
        allocation: "proportional",
      },
    ];
    s.receipt.printedTotal = "1.20";
    assign(s, "equal");
    review(s);
    expect(readableSummary(s)).toContain("allocation rounding −£0.01");
    expect(readableSummary(s)).toContain("Checked split");
  });
});
