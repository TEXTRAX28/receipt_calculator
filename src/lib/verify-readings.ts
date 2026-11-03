import { aiReceiptSchema } from "./extraction-schema.mjs";
import { receiptFromAi } from "./gemini";
import {
  itemReviewFields,
  currencies,
  type Item,
  type Receipt,
  type ReviewCheck,
  type ReceiptReviewField,
} from "./model";
import { money, weight } from "./money";
import { matchCostcoRow } from "./costco-row";
import {
  normalizeAmount,
  parseReceiptWithSources,
  isFinalTotal,
} from "./parser";
import type { ReadingContext } from "./reading-context.mjs";
import {
  assembleRecognition,
  type EvidenceLine,
  type Recognition,
} from "./receipt-layout";
import { normalizeReceiptDate } from "./receipt-date";
import { matchInformationalAdjustment } from "./receipt-summaries";
import { recoverInvalidPrice } from "./recover-invalid-price";
import { isPurchaseExpressionLine } from "./purchase-expression";
import {
  recoverExclusivePriceBasis,
  readFinancialSummary,
} from "./financial-basis";
import { recoverFinancialRoles } from "./financial-roles";
import { findPaymentAdjustments } from "./payment-rows";
import { recoverReducedPriceRole } from "./reduced-price-role";
import { readZeroPriceRows } from "./zero-price-purchases";

const SOURCE_THRESHOLD = 0.75;
const currencyPatterns = Object.fromEntries(
  Object.keys(currencies).map((code) => [
    code,
    new RegExp(
      `\\b${code}\\b${code === "GBP" ? "|£" : code === "EUR" ? "|€" : code === "IDR" ? "|\\bRp[.]?(?=\\s|[0-9]|$)" : code === "TWD" ? "|NT\\$|新[臺台]幣|[臺台]幣" : ""}`,
      "i",
    ),
  ]),
) as Record<Receipt["currency"], RegExp>;
const nameKey = (value: string) =>
  value
    .normalize("NFKC")
    .toUpperCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
function grams(value: string) {
  const result = new Map<string, number>();
  for (let index = 0; index < value.length - 1; index++) {
    const pair = value.slice(index, index + 2);
    result.set(pair, (result.get(pair) || 0) + 1);
  }
  return result;
}
function similarity(a: string, b: string) {
  if (a === b && a) return 1;
  if (
    Math.min(a.length, b.length) < 4 ||
    Math.min(a.length, b.length) / Math.max(a.length, b.length) < 0.65
  )
    return 0;
  const first = grams(a),
    second = grams(b);
  let shared = 0;
  for (const [pair, count] of first)
    shared += Math.min(count, second.get(pair) || 0);
  return (2 * shared) / (a.length + b.length - 2);
}
function sameAmount(
  a: string,
  b: string,
  currency: Receipt["currency"],
  quantity = false,
) {
  if (a === "" || b === "") return a === b;
  try {
    return quantity
      ? weight(a) === weight(b)
      : money(a, currency, true) === money(b, currency, true);
  } catch {
    return false;
  }
}
function sameField(
  a: Item,
  b: Item,
  field: (typeof itemReviewFields)[number],
  currency: Receipt["currency"],
) {
  if (field === "description")
    return nameKey(a.description) === nameKey(b.description);
  if (field === "taxCode")
    return a.taxCode.trim().toUpperCase() === b.taxCode.trim().toUpperCase();
  return sameAmount(a[field], b[field], currency, field === "quantity");
}
function reliable(region: EvidenceLine, recognition: Recognition) {
  if (region.confidence < SOURCE_THRESHOLD) return false;
  const panel = recognition.panels.find(
    (panel) => panel.photo === region.photo && panel.part === region.part,
  );
  return (
    !!panel &&
    !panel.words.some((word) => {
      const x = (word.box[0] + word.box[2]) / 2,
        y = (word.box[1] + word.box[3]) / 2;
      return (
        x >= region.box[0] &&
        x <= region.box[2] &&
        y >= region.box[1] &&
        y <= region.box[3] &&
        word.confidence < SOURCE_THRESHOLD
      );
    })
  );
}

/** Keep only pairs forced by every best order-preserving alignment, including genuine repeats. */
function forcedPairs(weights: number[][], columns: number) {
  const rows = weights.length,
    width = columns + 1;
  const before = new Float64Array((rows + 1) * width),
    after = new Float64Array(before.length);
  for (let i = 0; i < rows; i++)
    for (let j = 0; j < columns; j++)
      before[(i + 1) * width + j + 1] = Math.max(
        before[i * width + j + 1],
        before[(i + 1) * width + j],
        before[i * width + j] + weights[i][j],
      );
  for (let i = rows - 1; i >= 0; i--)
    for (let j = columns - 1; j >= 0; j--)
      after[i * width + j] = Math.max(
        after[(i + 1) * width + j],
        after[i * width + j + 1],
        after[(i + 1) * width + j + 1] + weights[i][j],
      );
  const best = before[rows * width + columns],
    candidates: [number, number][] = [];
  const ranks = new Map<number, number>();
  for (let i = 0; i < rows; i++)
    for (let j = 0; j < columns; j++)
      if (
        weights[i][j] &&
        before[i * width + j] +
          weights[i][j] +
          after[(i + 1) * width + j + 1] ===
          best
      ) {
        candidates.push([i, j]);
        const rank = Math.floor(before[i * width + j] / 1_000_000);
        ranks.set(rank, (ranks.get(rank) || 0) + 1);
      }
  // Every optimal alignment has the same cardinality. A unique edge at a match
  // rank is therefore forced; row/column uniqueness alone would accept crossings.
  return candidates.filter(
    ([i, j]) => ranks.get(Math.floor(before[i * width + j] / 1_000_000)) === 1,
  );
}

/** Compare independent readings. No labels, totals-based repair or model confidence enter here. */
export function verifyIndependentReadings(
  output: unknown,
  recognition: Recognition,
  context?: ReadingContext,
  options: {
    allowPriceRecovery?: boolean;
    blockedScalarFields?: ("subtotal" | "printedTotal" | "printedTax")[];
  } = {},
) {
  const raw = aiReceiptSchema.parse(output);
  const receipt = receiptFromAi(raw, "Local vision", context);
  const originalItems = receipt.items;
  const assembled = assembleRecognition(recognition);
  const parsed = parseReceiptWithSources(assembled.text, context);
  const zeroPriceRows = readZeroPriceRows(
    parsed,
    assembled.sourceLines,
    recognition,
  );
  for (const row of zeroPriceRows) {
    if (!row.existing && parsed.receipt.items.length < 300) {
      parsed.receipt.items.push(row.item);
      parsed.sources[row.item.id] = [row.sourceIndex];
    }
    if (parsed.receipt.items.some((item) => item.id === row.item.id))
      parsed.receipt.reviewChecks.push({
        scope: "item",
        itemId: row.item.id,
        field: "lineTotal",
        reason: "source",
        other: "Confirm the zero's role in the printed item-price column.",
        confirmedValue: "",
      });
  }
  if (zeroPriceRows.length)
    parsed.receipt.items.sort(
      (a, b) =>
        Math.min(...(parsed.sources[a.id] || [Infinity])) -
        Math.min(...(parsed.sources[b.id] || [Infinity])),
    );
  const ocr = parsed.receipt,
    lines = assembled.sourceLines;
  // A crop can start at a purchase while retaining independent retailer context.
  // Keep an unrecognized heading from being overridden by product-name markers.
  const firstSourceLine = lines.findIndex((line) => line !== null);
  const startsAtPurchase =
    firstSourceLine >= 0 &&
    ocr.items.length > 0 &&
    (parsed.sources[ocr.items[0].id] || []).includes(firstSourceLine);
  const costcoSource =
    /\bcostco\b/i.test(assembled.text) ||
    (startsAtPurchase && ocr.merchant === "Costco");
  const currencyWitnesses = new Map<Receipt["currency"], number[]>();
  for (const [index, line] of lines.entries()) {
    if (
      !line ||
      !reliable(line, recognition) ||
      !/\b(?:currency|total|amount|sum|due|tax|vat|cash|savings|paid|balance)\b|[£€]\s*\d|\bRp[.]?\s*\d|NT\$\s*\d/i.test(
        line.text,
      )
    )
      continue;
    for (const code of Object.keys(currencies) as Receipt["currency"][])
      if (currencyPatterns[code].test(line.text))
        currencyWitnesses.set(code, [
          ...(currencyWitnesses.get(code) || []),
          index,
        ]);
  }
  const currencyWasRecovered =
    receipt.currencyUnresolved &&
    !ocr.currencyUnresolved &&
    currencyWitnesses.size === 1 &&
    currencyWitnesses.has(ocr.currency);
  if (currencyWasRecovered) {
    receipt.currency = ocr.currency;
    receipt.currencyUnresolved = false;
  }
  const sourceRows = ocr.items.map((item) => {
    const indices = parsed.sources[item.id] || [];
    const regions = indices.flatMap((index) =>
      lines[index] ? [lines[index]!] : [],
    );
    const positive = regions.filter((region) => {
      const row = matchCostcoRow(region.text);
      return row && !row.deduction;
    });
    const fieldGood = (field: (typeof itemReviewFields)[number]) => {
      if (positive.length !== 1)
        return (
          regions.length > 0 &&
          regions.every((region) => reliable(region, recognition))
        );
      const relevant =
        field === "description"
          ? regions.slice(0, regions.indexOf(positive[0]))
          : field === "discount"
            ? regions.filter((region) => matchCostcoRow(region.text)?.deduction)
            : positive;
      return (
        relevant.length > 0 &&
        relevant.every((region) => reliable(region, recognition))
      );
    };
    return {
      item,
      indices,
      regions,
      column: parsed.columnSources[item.id],
      good:
        regions.length > 0 &&
        regions.every((region) => reliable(region, recognition)),
      photos: new Set(regions.map((region) => region.photo)),
      fieldGood,
    };
  });
  const weights = receipt.items.map((item, index) =>
    sourceRows.map((source) => {
      if (
        !raw.items[index].sourcePhotos.some((photo) => source.photos.has(photo))
      )
        return 0;
      const likeness = similarity(
        nameKey(item.description),
        nameKey(source.item.description),
      );
      if (likeness < 0.82) return 0;
      // A million makes cardinality dominate all description/tie-break scores at the 300-row bound.
      return (
        1_000_000 +
        Math.round(likeness * 1000) +
        (sameField(item, source.item, "lineTotal", receipt.currency)
          ? 100
          : 0) +
        (sameField(item, source.item, "unitPrice", receipt.currency) ? 10 : 0)
      );
    }),
  );
  const pairs = forcedPairs(weights, sourceRows.length);
  // Transient physical-row identities for joining independently read section batches.
  // Compute before coupon recovery mutates an owner; a matching balance supplies no identity.
  const itemAnchors = pairs.map(([nativeIndex, sourceIndex]) => ({
    nativeIndex,
    reliable:
      sourceRows[sourceIndex].good &&
      (["description", "quantity", "unitPrice", "lineTotal"] as const).every(
        (field) =>
          sameField(
            receipt.items[nativeIndex],
            sourceRows[sourceIndex].item,
            field,
            receipt.currency,
          ),
      ),
    regions: (() => {
      const regions = sourceRows[sourceIndex].regions;
      const positive = regions.findIndex(
        (region) => matchCostcoRow(region.text)?.deduction === false,
      );
      // The coupon is a distinct printed row, even when its amount belongs to this purchase.
      return positive >= 0 ? regions.slice(0, positive + 1) : regions;
    })(),
  }));
  for (const [nativeIndex, item] of raw.items.entries()) {
    if (pairs.some(([index]) => index === nativeIndex)) continue;
    const candidates: EvidenceLine[][] = [];
    for (let index = 1; index < lines.length; index++) {
      const line = lines[index],
        title = lines[index - 1];
      const row = line && matchCostcoRow(line.text);
      if (
        !line ||
        !title ||
        !row?.deduction ||
        title.photo !== line.photo ||
        title.part !== line.part ||
        !item.sourcePhotos.includes(line.photo) ||
        nameKey(title.text) !== nameKey(item.description) ||
        !reliable(line, recognition) ||
        !reliable(title, recognition)
      )
        continue;
      try {
        if (
          sameAmount(
            item.quantity,
            row.quantity.replace(",", "."),
            receipt.currency,
            true,
          ) &&
          sameAmount(
            item.unitPrice,
            normalizeAmount(
              row.unitPrice,
              ocr.currencyUnresolved ? undefined : ocr.currency,
            ),
            receipt.currency,
          ) &&
          sameAmount(
            item.lineTotal,
            normalizeAmount(
              row.lineTotal,
              ocr.currencyUnresolved ? undefined : ocr.currency,
            ),
            receipt.currency,
          ) &&
          item.taxCode === row.taxCode &&
          sameAmount(item.discount || "0", "0", receipt.currency)
        )
          candidates.push([title, line]);
      } catch {
        /* An ambiguous printed deduction supplies no row identity. */
      }
    }
    if (candidates.length === 1)
      itemAnchors.push({ nativeIndex, reliable: true, regions: candidates[0] });
  }
  const paired = new Map(pairs);
  const pairedSource = new Set(pairs.map(([, index]) => index));
  const agreedPriceRows = new Set(
    pairs.flatMap(([visionIndex, sourceIndex]) =>
      sameAmount(
        raw.items[visionIndex].lineTotal,
        sourceRows[sourceIndex].item.lineTotal,
        receipt.currency,
      )
        ? sourceRows[sourceIndex].indices
        : [],
    ),
  );
  const removed = new Set<number>();
  const correctedOwners = new Set<string>();
  const corrections: {
    itemId: string;
    removedNativeIndex: number;
    sourceIndices: number[];
    discount: string;
  }[] = [];
  const checks: ReviewCheck[] = [];
  const fieldSources: Partial<Record<ReceiptReviewField, number[]>> = {};
  const sourceIndices = (predicate: (text: string) => boolean) =>
    lines.flatMap((line, index) =>
      line && predicate(line.text) ? [index] : [],
    );
  const itemCheck = (
    item: Item,
    field: (typeof itemReviewFields)[number],
    reason: ReviewCheck["reason"],
    other = "",
  ) => {
    if (
      checks.some(
        (check) =>
          check.scope === "item" &&
          check.itemId === item.id &&
          check.field === field,
      )
    )
      return;
    checks.push({
      scope: "item",
      itemId: item.id,
      field,
      reason,
      other: /\d{8,}/.test(other) ? "" : other.slice(0, 180),
      confirmedValue: "",
    });
  };
  const globalCheck = (
    field: Extract<ReviewCheck, { scope: "receipt" }>["field"],
    reason: ReviewCheck["reason"],
    other = "",
  ) => {
    const existing = checks.find(
      (check) => check.scope === "receipt" && check.field === field,
    );
    if (existing) {
      if (reason === "coverage") existing.reason = reason;
      if (other && !existing.other.includes(other))
        existing.other =
          `${existing.other}${existing.other ? "; " : ""}${other}`.slice(
            0,
            180,
          );
      return;
    }
    checks.push({
      scope: "receipt",
      field,
      reason,
      other: other.slice(0, 180),
      confirmedValue: "",
    });
  };

  const priceRecoveries: {
    itemId: string;
    sourceIndices: number[];
    evidence: NonNullable<ReturnType<typeof recoverInvalidPrice>>;
  }[] = [];
  const unitRecoveries: typeof priceRecoveries = [];
  const sourceRecoveryAllowed =
    options.allowPriceRecovery !== false &&
    !receipt.currencyUnresolved &&
    !ocr.currencyUnresolved &&
    receipt.currency === ocr.currency &&
    (!raw.currency || raw.currency === receipt.currency);
  if (sourceRecoveryAllowed) {
    for (const [nativeIndex, sourceIndex] of pairs) {
      const owner = receipt.items[nativeIndex];
      const source = sourceRows[sourceIndex];
      const leading = source.item.description.match(
        /^(\d+(?:[.,]\d+)?)\s+(.+)$/,
      );
      const sameName =
        nameKey(owner.description) === nameKey(source.item.description) ||
        (!source.item.quantity &&
          leading &&
          sameAmount(owner.quantity, leading[1], receipt.currency, true) &&
          nameKey(owner.description) === nameKey(leading[2]));
      const sourceQuantity = source.item.quantity || leading?.[1];
      const samePrintedQuantity =
        !!sourceQuantity &&
        sameAmount(owner.quantity, sourceQuantity, receipt.currency, true);
      if (!sameName && !samePrintedQuantity) continue;
      const reduced =
        nameKey(owner.description) === nameKey(source.item.description)
          ? recoverReducedPriceRole(
              owner,
              source,
              recognition,
              receipt.currency,
            )
          : null;
      if (reduced) {
        const previousDiscount = owner.discount;
        owner.lineTotal = reduced.value;
        owner.discount = "0";
        correctedOwners.add(owner.id);
        itemCheck(owner, "lineTotal", "recovered", reduced.previous);
        itemCheck(owner, "discount", "recovered", previousDiscount);
        for (const check of checks) {
          if (
            check.scope === "item" &&
            check.itemId === owner.id &&
            (check.field === "lineTotal" || check.field === "discount")
          )
            check.details = [
              {
                label: "Printed reduced selling price",
                value: reduced.literal,
              },
              { label: "Previous vision deduction", value: previousDiscount },
            ];
        }
        priceRecoveries.push({
          itemId: owner.id,
          sourceIndices: source.indices,
          evidence: reduced,
        });
      }
      const columnLine = source.column && lines[source.column.lineIndex];
      const columnToken = (field: "unitPrice" | "lineTotal") =>
        source.column && columnLine
          ? { text: columnLine.text, ...source.column[field] }
          : undefined;
      if (
        sameName &&
        source.fieldGood("unitPrice") &&
        sameField(owner, source.item, "quantity", receipt.currency)
      ) {
        const unit = recoverInvalidPrice(
          owner.unitPrice,
          source.item.unitPrice,
          receipt.currency,
          source.regions,
          recognition,
          "unitPrice",
          columnToken("unitPrice"),
        );
        if (
          unit &&
          raw.items[nativeIndex].sourcePhotos.includes(unit.region.photo)
        ) {
          owner.unitPrice = unit.value;
          itemCheck(owner, "unitPrice", "recovered", unit.previous);
          checks.find(
            (check) =>
              check.scope === "item" &&
              check.itemId === owner.id &&
              check.field === "unitPrice",
          )!.details = [
            {
              label: "Printed unit-price token — check its role",
              value: unit.value,
            },
            {
              label: "Previous invalid vision unit price",
              value: unit.previous,
            },
          ];
          unitRecoveries.push({
            itemId: owner.id,
            sourceIndices: source.indices,
            evidence: unit,
          });
        }
      }
      if (!source.fieldGood("lineTotal")) continue;
      const unitOnlyHeader = lines.some(
        (line) =>
          line &&
          source.regions.some(
            (region) =>
              line.photo === region.photo &&
              line.part === region.part &&
              line.box[3] < region.box[1],
          ) &&
          /\b(?:unit\s*price|price\s*each|price\s*per\s*unit|per\s*item)\b/i.test(
            line.text,
          ) &&
          !/\b(?:total|amount|extension)\b/i.test(line.text),
      );
      if (unitOnlyHeader) continue;
      const evidence = recoverInvalidPrice(
        owner.lineTotal,
        source.item.lineTotal,
        receipt.currency,
        source.regions,
        recognition,
        "lineTotal",
        columnToken("lineTotal"),
      );
      if (
        !evidence ||
        !raw.items[nativeIndex].sourcePhotos.includes(evidence.region.photo)
      )
        continue;
      // The existing forced name/order match can tolerate a spelling difference.
      // In that case require the same printed quantity and the same invalid
      // grouped token, not just a different amount that happens to balance.
      // Unit-price and reduced-price role recovery keep their exact-name rules.
      if (
        !sameName &&
        (!/^-?\d{1,3}(?:[.,]\d{3})+$/.test(evidence.previous) ||
          evidence.previous.replace(/,/g, ".") !==
            evidence.literal.replace(/,/g, "."))
      )
        continue;
      owner.lineTotal = evidence.value;
      itemCheck(owner, "lineTotal", "recovered", evidence.previous);
      const check = checks.find(
        (check) =>
          check.scope === "item" &&
          check.itemId === owner.id &&
          check.field === "lineTotal",
      )!;
      check.details = [
        {
          label: "Printed OCR row price — check its meaning",
          value: evidence.value,
        },
        { label: "Previous invalid vision price", value: evidence.previous },
      ];
      priceRecoveries.push({
        itemId: owner.id,
        sourceIndices: source.indices,
        evidence,
      });
    }
  }

  if (costcoSource) {
    for (const [nativeIndex, sourceIndex] of pairs) {
      const owner = receipt.items[nativeIndex],
        source = sourceRows[sourceIndex];
      const positive = source.indices.flatMap((index) => {
        const row = lines[index] && matchCostcoRow(lines[index]!.text);
        return row && !row.deduction
          ? [{ index, row, region: lines[index]! }]
          : [];
      });
      const deductions = source.indices.flatMap((index) => {
        const row = lines[index] && matchCostcoRow(lines[index]!.text);
        return row?.deduction ? [{ index, row, region: lines[index]! }] : [];
      });
      if (!source.good || positive.length !== 1 || deductions.length !== 1)
        continue;
      const purchase = positive[0],
        coupon = deductions[0],
        title = lines[coupon.index - 1];
      if (
        !title ||
        coupon.index !== purchase.index + 2 ||
        coupon.region.photo !== purchase.region.photo ||
        title.photo !== coupon.region.photo ||
        !coupon.row.taxCode ||
        coupon.row.taxCode !== purchase.row.taxCode
      )
        continue;
      if (
        !["quantity", "unitPrice", "lineTotal", "taxCode"].every((field) =>
          sameField(
            owner,
            source.item,
            field as (typeof itemReviewFields)[number],
            receipt.currency,
          ),
        )
      )
        continue;
      if (
        !sameAmount(owner.discount || "0", "0", receipt.currency) &&
        !sameAmount(owner.discount, source.item.discount, receipt.currency)
      )
        continue;
      const next =
        pairs
          .filter(([index]) => index > nativeIndex)
          .map(([index]) => index)
          .sort((a, b) => a - b)[0] ?? receipt.items.length;
      const matches: number[] = [];
      for (let index = nativeIndex + 1; index < next; index++) {
        if (paired.has(index) || removed.has(index)) continue;
        const candidate = receipt.items[index];
        if (
          nameKey(candidate.description) !== nameKey(title.text) ||
          !raw.items[index].sourcePhotos.includes(coupon.region.photo)
        )
          continue;
        if (
          sameAmount(
            candidate.quantity,
            coupon.row.quantity.replace(",", "."),
            receipt.currency,
            true,
          ) &&
          sameAmount(
            candidate.unitPrice,
            normalizeAmount(
              coupon.row.unitPrice,
              ocr.currencyUnresolved ? undefined : ocr.currency,
            ),
            receipt.currency,
          ) &&
          sameAmount(
            candidate.lineTotal,
            normalizeAmount(
              coupon.row.lineTotal,
              ocr.currencyUnresolved ? undefined : ocr.currency,
            ),
            receipt.currency,
          ) &&
          candidate.taxCode === coupon.row.taxCode &&
          sameAmount(candidate.discount || "0", "0", receipt.currency)
        )
          matches.push(index);
      }
      if (matches.length !== 1) continue;
      removed.add(matches[0]);
      const oldDiscount = owner.discount;
      owner.discount = source.item.discount;
      correctedOwners.add(owner.id);
      itemCheck(owner, "discount", "recovered", oldDiscount);
      corrections.push({
        itemId: owner.id,
        removedNativeIndex: matches[0],
        sourceIndices: source.indices,
        discount: owner.discount,
      });
    }
  }
  const sources: Record<string, number[]> = {};
  let agreements = 0;
  for (let index = 0; index < receipt.items.length; index++) {
    if (removed.has(index)) continue;
    const item = receipt.items[index],
      sourceIndex = paired.get(index);
    const source =
      sourceIndex === undefined ? undefined : sourceRows[sourceIndex];
    if (source) sources[item.id] = source.indices;
    for (const field of itemReviewFields) {
      const sourceCheck =
        source &&
        ocr.reviewChecks.find(
          (check) =>
            check.scope === "item" &&
            check.itemId === source.item.id &&
            check.field === field &&
            check.reason === "source",
        );
      // Zero is the conservative no-deduction state, not a claim that a coupon was printed.
      if (
        field === "discount" &&
        sameAmount(item.discount || "0", "0", receipt.currency) &&
        (!source ||
          sameAmount(source.item.discount || "0", "0", receipt.currency))
      )
        continue;
      if (item[field] === "") continue;
      // A copied source proposal is pending review, not independent agreement.
      if (
        field === "lineTotal" &&
        priceRecoveries.some((row) => row.itemId === item.id)
      )
        continue;
      if (
        field === "unitPrice" &&
        unitRecoveries.some((row) => row.itemId === item.id)
      )
        continue;
      if (field === "discount" && correctedOwners.has(item.id)) continue;
      if (!source || source.item[field] === "")
        itemCheck(item, field, "unsupported");
      else if (!sameField(item, source.item, field, receipt.currency))
        itemCheck(item, field, "different", source.item[field]);
      else if (sourceCheck)
        itemCheck(item, field, sourceCheck.reason, sourceCheck.other);
      else if (!source.fieldGood(field))
        itemCheck(item, field, "unclear", source.item[field]);
      else agreements++;
    }
  }
  receipt.items = receipt.items.filter((_, index) => !removed.has(index));
  fieldSources.items = sourceRows.flatMap((source, index) =>
    !pairedSource.has(index) ? source.indices : [],
  );
  if (
    ocr.reviewChecks.some(
      (check) =>
        check.scope === "receipt" &&
        check.field === "items" &&
        check.reason === "coverage",
    )
  ) {
    globalCheck(
      "items",
      "coverage",
      "Some separate quantity/price rows could not be associated with a product. Check the complete receipt.",
    );
    fieldSources.items = [
      ...new Set([
        ...fieldSources.items,
        ...sourceIndices(isPurchaseExpressionLine),
      ]),
    ];
  }
  const removedAdjustments: {
    id: string;
    label: string;
    amount: string;
    reason: string;
    sourceIndices: number[];
  }[] = [];
  if (costcoSource) {
    const negativeRows = lines.filter(
      (line) => line && matchCostcoRow(line.text)?.deduction,
    );
    let couponCount = 0,
      couponTotal = 0n;
    for (const [nativeIndex, sourceIndex] of pairs) {
      const owner = originalItems[nativeIndex],
        source = sourceRows[sourceIndex];
      const coupons = source.regions.filter(
        (region) => matchCostcoRow(region.text)?.deduction,
      );
      if (
        !source.good ||
        coupons.length !== 1 ||
        !["quantity", "unitPrice", "lineTotal", "discount", "taxCode"].every(
          (field) =>
            sameField(
              owner,
              source.item,
              field as (typeof itemReviewFields)[number],
              receipt.currency,
            ),
        )
      )
        continue;
      const coupon = matchCostcoRow(coupons[0].text)!;
      const purchase = source.regions
        .map((region) => ({ region, row: matchCostcoRow(region.text) }))
        .find(({ row }) => row && !row.deduction);
      if (
        !purchase?.row ||
        purchase.row.taxCode !== coupon.taxCode ||
        purchase.region.photo !== coupons[0].photo ||
        lines.indexOf(coupons[0]) !== lines.indexOf(purchase.region) + 2
      )
        continue;
      try {
        const value = money(
          normalizeAmount(coupon.lineTotal, receipt.currency),
          receipt.currency,
        );
        if (
          !sameAmount(
            owner.discount,
            normalizeAmount(coupon.lineTotal, receipt.currency),
            receipt.currency,
          )
        )
          continue;
        couponTotal += value;
        couponCount++;
      } catch {
        /* Incomplete/ambiguous coupon evidence cannot classify a summary. */
      }
    }
    const completeCoupons =
      negativeRows.length === couponCount && couponCount > 0;
    receipt.adjustments = receipt.adjustments.filter((adjustment) => {
      const match = matchInformationalAdjustment(adjustment, {
        lines,
        currency: receipt.currency,
        couponCount: completeCoupons ? couponCount : 0,
        couponTotal: completeCoupons ? couponTotal : null,
        reliable: (line) => reliable(line, recognition),
      });
      if (!match) return true;
      removedAdjustments.push({
        id: adjustment.id,
        label: adjustment.label,
        amount: adjustment.amount,
        ...match,
      });
      return false;
    });
    if (removedAdjustments.length) {
      globalCheck(
        "adjustments",
        "recovered",
        `${removedAdjustments.length} savings-summary, coupon-count or future-reward entries removed`,
      );
      const check = checks.find(
        (check) => check.scope === "receipt" && check.field === "adjustments",
      )!;
      check.details = removedAdjustments.map((adjustment) => ({
        label: adjustment.label,
        value: adjustment.amount,
      }));
    }
  }
  const zeroItemRecoveries: {
    itemId: string;
    sourceIndices: number[];
    anchorSourceIndices: number[];
  }[] = [];
  if (sourceRecoveryAllowed && !options.blockedScalarFields?.length) {
    for (const row of zeroPriceRows) {
      const sourceIndex = sourceRows.findIndex(
        (source) => source.item.id === row.item.id,
      );
      const region = lines[row.sourceIndex];
      if (
        sourceIndex < 0 ||
        pairedSource.has(sourceIndex) ||
        !region ||
        receipt.items.length >= 300 ||
        row.anchorIndices.filter((index) => agreedPriceRows.has(index)).length <
          2 ||
        Object.values(sources).some((indices) =>
          indices.includes(row.sourceIndex),
        ) ||
        originalItems.some(
          (item) =>
            nameKey(item.description) !== nameKey(row.item.description) &&
            nameKey(item.description).includes(nameKey(row.item.description)),
        ) ||
        originalItems.some(
          (_, index) =>
            !paired.has(index) &&
            !removed.has(index) &&
            raw.items[index].sourcePhotos.includes(region.photo),
        )
      )
        continue;
      const matchingAdjustments = receipt.adjustments.filter(
        (adjustment) =>
          nameKey(adjustment.label) === nameKey(row.item.description),
      );
      if (
        matchingAdjustments.length &&
        (matchingAdjustments.length !== 1 ||
          matchingAdjustments[0].kind !== "fee" ||
          !sameAmount(matchingAdjustments[0].amount, "0", receipt.currency))
      )
        continue;
      const item = structuredClone(row.item);
      item.note =
        "Added from a printed zero-price row omitted by the other reading. Confirm this is a separate purchase and check its quantity.";
      receipt.items.push(item);
      sources[item.id] = [row.sourceIndex];
      for (const field of ["description", "lineTotal"] as const) {
        itemCheck(
          item,
          field,
          "recovered",
          "This zero-price row was absent from the other reading. Confirm the separate purchase against its source.",
        );
        checks.find(
          (check) =>
            check.scope === "item" &&
            check.itemId === item.id &&
            check.field === field,
        )!.details = [
          { label: "Previous draft purchase", value: "Not present" },
          { label: "Printed row", value: region.text.slice(0, 180) },
        ];
      }
      zeroItemRecoveries.push({
        itemId: item.id,
        sourceIndices: [row.sourceIndex],
        anchorSourceIndices: row.anchorIndices,
      });
      const previous = matchingAdjustments[0];
      if (previous) {
        receipt.adjustments = receipt.adjustments.filter(
          (entry) => entry.id !== previous.id,
        );
        removedAdjustments.push({
          id: previous.id,
          label: previous.label,
          amount: previous.amount,
          reason: "zero-price-purchase",
          sourceIndices: [row.sourceIndex],
        });
        globalCheck(
          "adjustments",
          "recovered",
          "A zero-valued fee was proposed as a separate purchase from its printed price-column row. Confirm both roles.",
        );
        const check = checks.find(
          (entry) => entry.scope === "receipt" && entry.field === "adjustments",
        )!;
        check.details = [
          ...(check.details || []),
          {
            label: "Previous fee role",
            value: `${previous.label}: ${previous.amount}`.slice(0, 180),
          },
          { label: "Proposed purchase", value: region.text.slice(0, 180) },
        ].slice(0, 30);
      }
    }
  }
  const unrepresentedZeroRows = zeroPriceRows.filter(
    (row) =>
      !Object.values(sources).some((indices) =>
        indices.includes(row.sourceIndex),
      ),
  );
  fieldSources.items = [
    ...new Set([
      ...fieldSources.items,
      ...unrepresentedZeroRows.map((row) => row.sourceIndex),
    ]),
  ];
  if (
    pairs.length !== receipt.items.length ||
    pairedSource.size !== sourceRows.length ||
    unrepresentedZeroRows.length > 0
  )
    globalCheck(
      "items",
      "coverage",
      `Computer OCR: ${sourceRows.length} purchase rows; vision: ${raw.items.length}; combined: ${receipt.items.length}`,
    );

  const supported = (predicate: (text: string) => boolean) =>
    lines.some(
      (line) => line && predicate(line.text) && reliable(line, recognition),
    );
  const scalarRecoveries: {
    field: "subtotal" | "printedTotal" | "printedTax";
    evidence: NonNullable<ReturnType<typeof recoverInvalidPrice>>;
  }[] = [];
  const scalar = (
    field: "subtotal" | "printedTotal" | "printedTax",
    predicate: (text: string) => boolean,
  ) => {
    fieldSources[field] = sourceIndices(predicate);
    if (!receipt[field]) return;
    const regions = lines.filter(
      (line): line is EvidenceLine => !!line && predicate(line.text),
    );
    const values = new Map<string, string>();
    for (const line of lines) {
      if (!line || !predicate(line.text) || !reliable(line, recognition))
        continue;
      const token = [...line.text.matchAll(/[-−]?\d[\d,.]*-?/g)].at(-1)?.[0];
      if (!token) continue;
      try {
        const value = normalizeAmount(
          token,
          ocr.currencyUnresolved ? undefined : ocr.currency,
        );
        values.set(money(value, receipt.currency, true).toString(), value);
      } catch {
        /* Ambiguous or invalid source amounts cannot confirm a value. */
      }
    }
    if (values.size > 1)
      globalCheck(
        field,
        "different",
        "Several legible source amounts were read for this field",
      );
    else if (
      !ocr[field] ||
      ![...values.values()].some((value) =>
        sameAmount(value, ocr[field], receipt.currency),
      )
    )
      globalCheck(field, "unsupported");
    else {
      const evidence =
        sourceRecoveryAllowed &&
        !options.blockedScalarFields?.includes(field) &&
        regions.every(
          (line) =>
            reliable(line, recognition) &&
            /^[*\s]*(?:sub\s*total|grand total|total(?:\s+refund)?|refund total|amount (?:due|refunded)|balance due|vat amount|tax amount|sales tax|vat|tax)\b/i.test(
              line.text,
            ),
        )
          ? recoverInvalidPrice(
              receipt[field],
              ocr[field],
              receipt.currency,
              regions,
              recognition,
            )
          : null;
      if (evidence) {
        receipt[field] = evidence.value;
        globalCheck(field, "recovered", evidence.previous);
        checks.find(
          (check) => check.scope === "receipt" && check.field === field,
        )!.details = [
          {
            label: "Printed OCR amount — check its meaning",
            value: evidence.value,
          },
          { label: "Previous invalid vision amount", value: evidence.previous },
        ];
        scalarRecoveries.push({ field, evidence });
      } else if (!sameAmount(receipt[field], ocr[field], receipt.currency))
        globalCheck(field, "different", ocr[field]);
      else agreements++;
    }
  };
  scalar("subtotal", (text) =>
    /\b(?:subtotal|sub total|total\s*\(?\s*excl)/i.test(text),
  );
  scalar("printedTotal", isFinalTotal);
  scalar("printedTax", (text) =>
    /^(?:vat amount|tax amount|sales tax|vat|tax)\s*[:£$€]?\s*\d/i.test(text),
  );
  if (currencyWasRecovered) {
    globalCheck("currency", "recovered", "Unreadable in the vision result");
  } else if (currencyWitnesses.size > 1)
    globalCheck(
      "currency",
      "different",
      "More than one currency was read in the financial text",
    );
  else if (ocr.currencyUnresolved || !currencyWitnesses.has(receipt.currency))
    globalCheck("currency", "unsupported");
  else if (receipt.currency !== ocr.currency)
    globalCheck("currency", "different", ocr.currency);
  else agreements++;
  fieldSources.currency = [...currencyWitnesses.values()].flat();
  fieldSources.merchant = sourceIndices(
    (text) =>
      Boolean(nameKey(receipt.merchant)) &&
      nameKey(text).includes(nameKey(receipt.merchant)),
  );
  if (
    receipt.merchant &&
    !supported(
      (text) =>
        !/merchant id|tran(?:saction)? id|card|visa|mastercard|approval/i.test(
          text,
        ) && nameKey(text).includes(nameKey(receipt.merchant)),
    )
  )
    globalCheck("merchant", "unsupported");
  if (
    receipt.date &&
    !supported((text) => {
      const dates =
        text.match(/\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}[/.]\d{1,2}[/.]\d{4}\b/g) ||
        [];
      return dates.some((date) => normalizeReceiptDate(date) === receipt.date);
    })
  )
    globalCheck("date", "unsupported");
  fieldSources.date = sourceIndices((text) =>
    /\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}[/.]\d{1,2}[/.]\d{4}\b/.test(text),
  );
  const inclusive = supported((text) =>
    /prices?\s+(?:already\s+)?include(?:s|d)?\s+(?:vat|tax)|(?:vat|tax)\s+included/i.test(
      text,
    ),
  );
  const exclusive = supported((text) =>
    /prices?\s+(?:exclude|excl)|total\s*\(?\s*excl/i.test(text),
  );
  const taxBasisRecovery =
    sourceRecoveryAllowed &&
    raw.pricesIncludeTax === null &&
    !inclusive &&
    !exclusive &&
    !lines.some(
      (line) =>
        line &&
        /\b(?:includ|inclus|exclud|exclus|excl)[a-z]*\b/i.test(line.text),
    )
      ? recoverExclusivePriceBasis(lines, recognition, receipt.currency)
      : null;
  if (taxBasisRecovery) {
    receipt.pricesIncludeTax = false;
    globalCheck(
      "pricesIncludeTax",
      "recovered",
      "Printed subtotal, added tax and final total indicate net prices. Check the source.",
    );
    checks.find(
      (check) =>
        check.scope === "receipt" && check.field === "pricesIncludeTax",
    )!.details = [
      { label: "Previous vision tax basis", value: "Unknown" },
      ...taxBasisRecovery.rows.map((row) => ({
        label: row.label.slice(0, 100),
        value: row.literal.slice(0, 80),
      })),
    ];
  } else if ((!inclusive && !exclusive) || (inclusive && exclusive))
    globalCheck("pricesIncludeTax", "unsupported");
  else if (receipt.pricesIncludeTax !== inclusive)
    globalCheck(
      "pricesIncludeTax",
      "different",
      inclusive ? "Prices include tax" : "Prices exclude tax",
    );
  else agreements++;
  fieldSources.pricesIncludeTax =
    taxBasisRecovery?.sourceIndices ||
    sourceIndices((text) =>
      /prices?\s+(?:already\s+)?(?:include|exclude|excl)|(?:vat|tax)\s+included|total\s*\(?\s*excl/i.test(
        text,
      ),
    );
  const financialSection =
    sourceRecoveryAllowed &&
    !options.blockedScalarFields?.length &&
    !inclusive &&
    (raw.pricesIncludeTax === false || taxBasisRecovery)
      ? readFinancialSummary(lines, recognition, receipt.currency)
      : null;
  // A layout association supplies original regions for review, not independent
  // agreement. Keep the scalar's existing unsupported/different check pending.
  for (const [field, role] of [
    ["subtotal", "subtotal"],
    ["printedTax", "tax"],
    ["printedTotal", "total"],
  ] as const) {
    const fragments = financialSection
      ?.filter((row) => row.role === role && row.sourceIndices.length > 1)
      .flatMap((row) => row.sourceIndices);
    if (fragments?.length)
      fieldSources[field] = [
        ...new Set([...(fieldSources[field] || []), ...fragments]),
      ].sort((a, b) => a - b);
  }
  if (
    financialSection?.some(
      (row) =>
        row.sourceIndices.length > 1 &&
        row.role !== "subtotal" &&
        row.role !== "total",
    )
  )
    fieldSources.adjustments = [
      ...new Set([
        ...(fieldSources.adjustments || []),
        ...financialSection.flatMap((row) => row.sourceIndices),
      ]),
    ].sort((a, b) => a - b);
  const wordsIn = (text: string): string[] =>
    text.toUpperCase().match(/[\p{L}\p{N}]+/gu) || [];
  const codedPurchasesSupported = receipt.items.some((item) => {
    const code = item.taxCode.trim().toUpperCase();
    if (!code) return false;
    const nativeIndex = originalItems.indexOf(item),
      sourceIndex = paired.get(nativeIndex),
      source = sourceIndex === undefined ? undefined : sourceRows[sourceIndex];
    // A printed item code, incomplete item evidence or a code not confined to
    // summary labels prevents switching the tax calculation convention.
    return (
      !source ||
      !source.good ||
      source.regions.some((region) => region.confidence < 0.98) ||
      !!source.item.taxCode ||
      source.regions.some((region) => wordsIn(region.text).includes(code)) ||
      !financialSection?.some((row) => wordsIn(row.label).includes(code))
    );
  });
  const financialRoleRecovery = financialSection
    ? recoverFinancialRoles(receipt, financialSection, codedPurchasesSupported)
    : null;
  if (financialRoleRecovery) {
    receipt.adjustments = financialRoleRecovery.adjustments;
    receipt.printedTax = financialRoleRecovery.printedTax;
    receipt.taxMode = financialRoleRecovery.taxMode;
    fieldSources.pricesIncludeTax = [
      ...new Set([
        ...(fieldSources.pricesIncludeTax || []),
        ...financialRoleRecovery.sourceIndices,
      ]),
    ];
    const changedFields: ReceiptReviewField[] = ["adjustments"];
    if (financialRoleRecovery.previous.printedTax !== receipt.printedTax)
      changedFields.push("printedTax");
    if (financialRoleRecovery.previous.taxMode !== receipt.taxMode)
      changedFields.push("taxCodes");
    for (const field of changedFields) {
      globalCheck(
        field,
        "recovered",
        "Printed financial rows supplied the proposed fee/tax roles. Check every change.",
      );
      const check = checks.find(
        (entry) => entry.scope === "receipt" && entry.field === field,
      )!;
      check.details = [
        ...financialRoleRecovery.details,
        ...(field === "printedTax"
          ? [
              {
                label: "Previous printed tax",
                value:
                  financialRoleRecovery.previous.printedTax || "Unreadable",
              },
            ]
          : []),
        ...(field === "taxCodes"
          ? [
              {
                label: "Previous tax calculation",
                value: financialRoleRecovery.previous.taxMode,
              },
              {
                label: "Proposed tax calculation",
                value: "Printed receipt tax",
              },
            ]
          : []),
      ];
      fieldSources[field] = [
        ...new Set([
          ...(fieldSources[field] || []),
          ...financialRoleRecovery.sourceIndices,
        ]),
      ];
    }
  }
  const suppliedRates = receipt.taxCodes.filter((entry) => entry.rate !== "");
  const rateWitnesses = lines.flatMap((line) => {
    const match = line?.text.match(
      /^\s*([A-Z][A-Z0-9]{0,5})\s+(\d+(?:[.,]\d+)?)\s*%/,
    );
    return line && match
      ? [
          {
            code: match[1],
            rate: match[2].replace(",", "."),
            good: reliable(line, recognition),
          },
        ]
      : [];
  });
  for (const entry of suppliedRates) {
    const witnesses = rateWitnesses.filter(
      (other) => other.code === entry.code,
    );
    const legible = witnesses.filter((other) => other.good);
    if (
      legible.some(
        (other) => !sameAmount(other.rate, entry.rate, receipt.currency, true),
      )
    )
      globalCheck(
        "taxCodes",
        "different",
        `Conflicting printed rate for ${entry.code}`,
      );
    else if (!legible.length)
      globalCheck(
        "taxCodes",
        witnesses.length ? "unclear" : "unsupported",
        `No legible printed rate for ${entry.code}`,
      );
    else agreements++;
  }
  const usedCodes = new Set(
    receipt.items.map((item) => item.taxCode).filter(Boolean),
  );
  if (
    rateWitnesses.some(
      (entry) =>
        entry.good &&
        usedCodes.has(entry.code) &&
        !suppliedRates.some((other) => other.code === entry.code),
    )
  )
    globalCheck(
      "taxCodes",
      "coverage",
      "A printed rate for a purchase code is missing from the draft",
    );
  fieldSources.taxCodes = [
    ...new Set([
      ...(fieldSources.taxCodes || []),
      ...sourceIndices((text) =>
        /^\s*[A-Z][A-Z0-9]{0,5}\s+\d+(?:[.,]\d+)?\s*%|^(?:vat|tax)\s+code/i.test(
          text,
        ),
      ),
    ]),
  ];
  if (sourceRecoveryAllowed && !options.blockedScalarFields?.length) {
    const payments = findPaymentAdjustments(
      receipt.adjustments,
      lines,
      recognition,
      receipt.currency,
    );
    if (payments.length) {
      const removed = new Set(payments.map((entry) => entry.id));
      receipt.adjustments = receipt.adjustments.filter(
        (entry) => !removed.has(entry.id),
      );
      removedAdjustments.push(...payments);
      globalCheck(
        "adjustments",
        "recovered",
        "Printed payment or change rows were excluded from bill charges. Check every removed entry.",
      );
      const check = checks.find(
        (entry) => entry.scope === "receipt" && entry.field === "adjustments",
      )!;
      // A removal still needs confirmation when the resulting list is empty.
      if (check.reason !== "coverage") check.reason = "recovered";
      check.details = [
        ...(check.details || []),
        ...payments.map((entry) => ({
          label: `Payment row: ${entry.label}`.slice(0, 100),
          value: entry.printedLiteral,
        })),
      ].slice(0, 30);
    }
  }
  const financialAdjustments = receipt.adjustments
    .map(({ kind, amount }) => `${kind}:${amount}`)
    .sort();
  const otherAdjustments = ocr.adjustments
    .map(({ kind, amount }) => `${kind}:${amount}`)
    .sort();
  if (JSON.stringify(financialAdjustments) !== JSON.stringify(otherAdjustments))
    globalCheck(
      "adjustments",
      otherAdjustments.length ? "coverage" : "unsupported",
      "Check the printed charges and deductions",
    );

  fieldSources.adjustments = [
    ...new Set([
      ...(fieldSources.adjustments || []),
      ...removedAdjustments.flatMap((adjustment) => adjustment.sourceIndices),
      ...sourceIndices((text) =>
        /\b(?:discount|coupon|savings|fee|charge|tip|gratuity|deposit|rounding|reward|earned)\b/i.test(
          text,
        ),
      ),
    ]),
  ];
  // Include literal neighbouring OCR boxes for context when labels and amounts
  // are in separate columns. This viewing context never supplies extra proof.
  for (const [field, indices] of Object.entries(fieldSources)) {
    const expanded = new Set(indices);
    for (const index of indices) {
      const line = lines[index];
      if (!line) continue;
      const center = (line.box[1] + line.box[3]) / 2;
      for (const [otherIndex, other] of lines.entries())
        if (
          other &&
          other.photo === line.photo &&
          other.part === line.part &&
          Math.abs((other.box[1] + other.box[3]) / 2 - center) <=
            Math.max(line.box[3] - line.box[1], other.box[3] - other.box[1]) / 2
        )
          expanded.add(otherIndex);
    }
    fieldSources[field as ReceiptReviewField] = [...expanded].sort(
      (a, b) => a - b,
    );
  }
  receipt.reviewChecks = checks;
  const ambiguousAdjustments = ocr.reviewChecks.some(
    (check) =>
      check.scope === "receipt" &&
      check.field === "adjustments" &&
      check.reason === "classification",
  );
  if (ambiguousAdjustments) {
    globalCheck(
      "adjustments",
      "classification",
      "A negative source row may be a discount or a returned item. Confirm its type and ownership.",
    );
    fieldSources.adjustments = [
      ...new Set([
        ...(fieldSources.adjustments || []),
        ...ocr.adjustments.flatMap(
          (adjustment) => parsed.sources[adjustment.id] || [],
        ),
      ]),
    ];
  }
  receipt.warnings = receipt.warnings.filter(
    (warning) => !warning.startsWith("Local vision read an item count of"),
  );
  receipt.warnings = receipt.warnings.map((warning) =>
    raw.warnings.includes(warning)
      ? `Original vision note: ${warning}`
      : warning,
  );
  receipt.warnings.unshift(
    "Computer OCR and local vision read the photos independently. Check the marked differences against the original; agreement and balanced arithmetic can still be wrong.",
  );
  if (corrections.length)
    receipt.warnings.push(
      `Reclassified ${corrections.length} rows as item coupons using adjacent printed negative-code rows. Check the marked discounts against those source rows.`,
    );
  if (
    raw.printedItemCount !== null &&
    raw.printedItemCount !== receipt.items.length
  )
    receipt.warnings.push(
      `Local vision reported an item count of ${raw.printedItemCount}; the combined draft has ${receipt.items.length} purchase rows. Confirm any printed count against the original.`,
    );
  receipt.warnings = receipt.warnings.slice(0, 60);
  return {
    receipt,
    itemAnchors,
    sources,
    fieldSources,
    recognition,
    text: assembled.text,
    sourceLines: assembled.sourceLines,
    corrections,
    priceRecoveries,
    unitRecoveries,
    scalarRecoveries,
    taxBasisRecovery,
    financialRoleRecovery,
    removedAdjustments,
    agreements,
    matchedPurchases: pairs.length,
    ocrPurchases: sourceRows.length,
    originalVisionPurchases: raw.items.length,
    ...(zeroItemRecoveries.length ? { zeroItemRecoveries } : {}),
  };
}
