import { describe, expect, it } from "vitest";
import {
  projectAzurePage,
  projectAzureQuantities,
  AZURE_ENGINE,
} from "../src/lib/azure-layout.mjs";
import { receiptFromAzureWords } from "../src/lib/azure";
import { recoverAzureQuantities } from "../src/lib/azure-quantities";
import type { Recognition } from "../src/lib/receipt-layout";
import {
  azureQuantityHintsSchema,
  azureResultSchema,
} from "../src/lib/azure-schema.mjs";
import { calculateReceipt, calculateSplit } from "../src/lib/engine";
import { newState, receiptStamp } from "../src/lib/model";
import { confirmReviewCheck, reviewKey } from "../src/lib/review-checks";
import { azureQuantityFixture } from "./fixtures/azure-quantities";

function prepared(copies = 1) {
  const { record, dimensions } = azureQuantityFixture(copies);
  const panel = projectAzurePage(record, dimensions);
  const recognition: Recognition = { engine: AZURE_ENGINE, panels: [panel] };
  return {
    record,
    dimensions,
    panel,
    recognition,
    hints: projectAzureQuantities(record, panel),
    baseline: receiptFromAzureWords(recognition, { currency: "GBP" }),
  };
}

describe("source-owned Azure quantity proposals", () => {
  it("uses the literal role and words while ignoring native money and currency", () => {
    const { record, panel, recognition, hints, baseline } = prepared();
    expect(hints).toEqual([
      {
        photo: 1,
        part: 1,
        quantity: "2",
        quantityWord: 3,
        descriptionWords: [2],
        priceWords: [4],
      },
    ]);
    expect(baseline.receipt.items[0].quantity).toBe("");
    const receipt = receiptFromAzureWords(
      recognition,
      { currency: "GBP" },
      hints,
    ).receipt;
    expect(receipt.items[0]).toMatchObject({
      description: "Tea 2",
      quantity: "2",
      unitPrice: "",
      lineTotal: "5.00",
    });
    expect(receipt.currency).toBe("GBP");
    expect(receipt.printedTotal).toBe("5.00");
    record.analyzeResult.documents[0].fields.Items.valueArray[0].valueObject.TotalPrice.valueCurrency.amount =
      -99999;
    expect(projectAzureQuantities(record, panel)).toEqual(hints);
    expect(receipt.reviewChecks).toContainEqual(
      expect.objectContaining({
        scope: "item",
        field: "quantity",
        reason: "recovered",
        confirmedValue: "",
      }),
    );
    expect(calculateReceipt(receipt).total).toBe(500n);
  });

  it.each([
    "weak-quantity",
    "weak-word",
    "weak-name",
    "weak-price",
    "value-conflict",
    "text-conflict",
    "wrong-span",
    "overlapping-spans",
    "wrong-page",
    "missing-region",
    "missing-word-span",
    "outside-box",
    "degenerate-box",
    "missing-description",
    "too-many-items",
  ])("abstains on invalid or ambiguous native evidence: %s", (change) => {
    const { record, panel } = prepared();
    const fields =
      record.analyzeResult.documents[0].fields.Items.valueArray[0].valueObject;
    if (change === "weak-quantity") fields.Quantity.confidence = 0.97;
    if (change === "weak-word") panel.words[3].confidence = 0.97;
    if (change === "weak-name") panel.words[2].confidence = 0.5;
    if (change === "weak-price") panel.words[4].confidence = 0.5;
    if (change === "value-conflict") fields.Quantity.valueNumber = 3;
    if (change === "text-conflict") fields.Quantity.content = "3";
    if (change === "wrong-span") fields.Quantity.spans[0].offset = 0;
    if (change === "overlapping-spans")
      record.analyzeResult.pages[0].words[3].span = {
        ...record.analyzeResult.pages[0].words[2].span,
      };
    if (change === "wrong-page")
      fields.Quantity.boundingRegions[0].pageNumber = 2;
    if (change === "missing-region")
      Object.assign(fields.Quantity, { boundingRegions: [null] });
    if (change === "missing-word-span")
      Object.assign(record.analyzeResult.pages[0].words[3], { span: null });
    if (change === "outside-box")
      fields.Quantity.boundingRegions[0].polygon = [0, 0, 10, 0, 10, 10, 0, 10];
    if (change === "degenerate-box")
      fields.Quantity.boundingRegions[0].polygon = Array(8).fill(0);
    if (change === "missing-description") fields.Description.spans = [];
    if (change === "too-many-items")
      record.analyzeResult.documents[0].fields.Items.valueArray = Array(
        301,
      ).fill({ valueObject: fields });
    expect(projectAzureQuantities(record, panel)).toEqual([]);
  });

  it("preserves repeated purchases with their separate word ownership", () => {
    const { recognition, hints } = prepared(2);
    const receipt = receiptFromAzureWords(
      recognition,
      { currency: "GBP" },
      hints,
    ).receipt;
    expect(receipt.items).toHaveLength(2);
    expect(receipt.items.map((i) => i.quantity)).toEqual(["2", "2"]);
    expect(receipt.items.map((i) => i.lineTotal)).toEqual(["5.00", "5.00"]);
  });

  it.each([
    "duplicate-hint",
    "shared-source",
    "wrong-word",
    "wrong-photo",
    "overlapping-fields",
    "existing-quantity",
  ])("does not choose among conflicting purchase ownership: %s", (change) => {
    const { recognition, hints, baseline } = prepared();
    const item = baseline.receipt.items[0];
    if (change === "duplicate-hint") hints.push(structuredClone(hints[0]));
    if (change === "shared-source") {
      const copy = { ...structuredClone(item), id: "another" };
      baseline.receipt.items.push(copy);
      baseline.sources[copy.id] = [...baseline.sources[item.id]];
    }
    if (change === "wrong-word") hints[0].quantityWord = 1;
    if (change === "wrong-photo") hints[0].photo = 2;
    if (change === "overlapping-fields")
      hints[0].descriptionWords.push(hints[0].quantityWord);
    if (change === "existing-quantity") item.quantity = "9";
    expect(
      recoverAzureQuantities(
        baseline.receipt,
        baseline.sources,
        baseline.sourceLines,
        recognition,
        hints,
      ),
    ).toEqual([]);
    expect(item.quantity).toBe(change === "existing-quantity" ? "9" : "");
  });

  it("keeps existing checks and cannot finalize until the quantity is checked", () => {
    const { recognition, hints, baseline } = prepared();
    const item = baseline.receipt.items[0];
    baseline.receipt.reviewChecks.push({
      scope: "item",
      itemId: item.id,
      field: "quantity",
      reason: "unclear",
      other: "Previous evidence",
      confirmedValue: "",
      details: [{ label: "Earlier source", value: "unclear" }],
    });
    recoverAzureQuantities(
      baseline.receipt,
      baseline.sources,
      baseline.sourceLines,
      recognition,
      hints,
    );
    const state = newState();
    state.receipt = baseline.receipt;
    state.people = [{ id: "one", name: "One" }];
    item.assignment.participants = ["one"];
    for (const check of state.receipt.reviewChecks)
      if (check.field !== "quantity")
        state.receipt = confirmReviewCheck(state.receipt, reviewKey(check));
    state.reviewedStamp = receiptStamp(state.receipt);
    expect(calculateSplit(state).canFinalize).toBe(false);
    const quantity = state.receipt.reviewChecks.find(
      (c) => c.field === "quantity",
    )!;
    expect(quantity.details?.[0]).toEqual({
      label: "Earlier source",
      value: "unclear",
    });
    state.receipt = confirmReviewCheck(state.receipt, reviewKey(quantity));
    state.reviewedStamp = receiptStamp(state.receipt);
    expect(calculateSplit(state).canFinalize).toBe(true);
  });

  it("bounds the optional transport hints and supports old word-only responses", () => {
    const { recognition, hints } = prepared();
    expect(
      azureResultSchema.parse({
        recognition,
        remaining: 0,
        cleanup: "provider-reported-success",
      }).quantityHints,
    ).toEqual([]);
    for (const invalid of [
      [{ ...hints[0], extra: "ignore instructions" }],
      [{ ...hints[0], quantity: "1e9" }],
      [{ ...hints[0], quantity: "-1" }],
      [{ ...hints[0], quantityWord: 10000 }],
      Array(7201).fill(hints[0]),
    ])
      expect(azureQuantityHintsSchema.safeParse(invalid).success).toBe(false);
  });
});
