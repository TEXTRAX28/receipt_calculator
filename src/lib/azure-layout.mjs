import { recognitionSchema } from "./recognition-schema.mjs";
import { azureQuantityHintsSchema } from "./azure-schema.mjs";

export const AZURE_ENGINE =
  "azure-document-intelligence-2024-11-30-receipt-words";
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b),
    n = sorted.length;
  return n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
};
const wrap = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));
const normal = (token, angle) =>
  -Math.sin(angle) * token.cx + Math.cos(angle) * token.cy;
const tangent = (token, angle) =>
  Math.cos(angle) * token.cx + Math.sin(angle) * token.cy;

/** Port of the measured word-edge grouping. No native financial fields are read. */
export function projectAzurePage(record, { photo, part, width, height }) {
  const analysis = record?.analyzeResult,
    page = analysis?.pages?.[0];
  if (
    record?.status !== "succeeded" ||
    analysis?.modelId !== "prebuilt-receipt" ||
    analysis?.apiVersion !== "2024-11-30" ||
    analysis.pages.length !== 1 ||
    page?.pageNumber !== 1 ||
    page.unit !== "pixel" ||
    page.width !== width ||
    page.height !== height ||
    !Number.isFinite(page.angle) ||
    page.angle <= -180 ||
    page.angle > 180 ||
    !Array.isArray(page.words) ||
    !page.words.length ||
    page.words.length > 10000
  )
    throw new Error("Azure returned mismatched or incomplete source geometry");
  const phi = (page.angle * Math.PI) / 180;
  let characters = 0;
  const words = [],
    tokens = [];
  for (const [index, word] of page.words.entries()) {
    const p = word.polygon;
    if (
      typeof word.content !== "string" ||
      !word.content.trim() ||
      word.content.length > 2000 ||
      !Number.isFinite(word.confidence) ||
      word.confidence < 0 ||
      word.confidence > 1 ||
      !Array.isArray(p) ||
      p.length !== 8 ||
      !p.every(Number.isFinite) ||
      p.some((value, i) => value < 0 || value > (i % 2 ? height : width))
    )
      throw new Error("Invalid Azure word evidence");
    characters += word.content.length;
    if (characters > 50000)
      throw new Error("Azure word text exceeds the receipt limit");
    const xs = p.filter((_, i) => i % 2 === 0),
      ys = p.filter((_, i) => i % 2);
    const box = [
      Math.min(...xs) / width,
      Math.min(...ys) / height,
      Math.max(...xs) / width,
      Math.max(...ys) / height,
    ];
    const dx = (p[2] - p[0] + (p[4] - p[6])) / 2,
      dy = (p[3] - p[1] + (p[5] - p[7])) / 2;
    const along = Math.hypot(dx, dy),
      h =
        (Math.hypot(p[6] - p[0], p[7] - p[1]) +
          Math.hypot(p[4] - p[2], p[5] - p[3])) /
        2;
    if (along <= 0 || h <= 0 || box[0] >= box[2] || box[1] >= box[3])
      throw new Error("Degenerate Azure word polygon");
    words.push({ text: word.content, confidence: word.confidence, box });
    tokens.push({
      index,
      cx: xs.reduce((a, b) => a + b) / 4,
      cy: ys.reduce((a, b) => a + b) / 4,
      height: h,
      weight: along,
      angle: wrap(Math.atan2(dy, dx) - phi),
      polygon: p,
    });
  }
  const orientation = (row) => {
    const ordered = [...row].sort((a, b) => a.angle - b.angle),
      halfway = row.reduce((n, t) => n + t.weight, 0) / 2;
    let carried = 0;
    for (const token of ordered) {
      carried += token.weight;
      if (carried >= halfway) return phi + token.angle;
    }
    throw new Error("Empty Azure row");
  };
  const interval = (token, angle) => {
    const values = [];
    for (let i = 0; i < 8; i += 2)
      values.push(
        Math.cos(angle) * token.polygon[i] +
          Math.sin(angle) * token.polygon[i + 1],
      );
    return [Math.min(...values), Math.max(...values)];
  };
  const rows = [];
  let work = 0;
  for (const token of tokens.sort(
    (a, b) =>
      normal(a, phi) - normal(b, phi) || tangent(a, phi) - tangent(b, phi),
  )) {
    const candidates = [];
    for (const [index, row] of rows.entries()) {
      work += row.length;
      if (work > 2000000)
        throw new Error(
          "Azure layout is too complex; crop the receipt into smaller sections",
        );
      if (
        row.some(
          (member) => Math.abs(wrap(member.angle - token.angle)) > Math.PI / 12,
        )
      )
        continue;
      const h = median(row.map((member) => member.height));
      if (Math.min(h, token.height) / Math.max(h, token.height) < 0.5) continue;
      const angle = orientation([...row, token]),
        [lo, hi] = interval(token, angle);
      if (
        row.some((member) => {
          const [left, right] = interval(member, angle);
          return (
            Math.min(hi, right) - Math.max(lo, left) >
            0.25 * Math.min(hi - lo, right - left)
          );
        })
      )
        continue;
      const residual = Math.abs(
        normal(token, angle) -
          median(row.map((member) => normal(member, angle))),
      );
      if (residual <= 0.45 * Math.min(h, token.height))
        candidates.push({ residual, index });
    }
    candidates.sort((a, b) => a.residual - b.residual || a.index - b.index);
    if (candidates.length) rows[candidates[0].index].push(token);
    else rows.push([token]);
  }
  rows.sort(
    (a, b) =>
      median(a.map((t) => normal(t, phi))) -
      median(b.map((t) => normal(t, phi))),
  );
  const lines = rows.map((row) => {
    const angle = orientation(row);
    row.sort((a, b) => tangent(a, angle) - tangent(b, angle));
    const items = row.map((token) => words[token.index]);
    return {
      text: items.map((word) => word.text.trim()).join(" "),
      confidence: Math.min(...items.map((word) => word.confidence)),
      box: [
        Math.min(...items.map((w) => w.box[0])),
        Math.min(...items.map((w) => w.box[1])),
        Math.max(...items.map((w) => w.box[2])),
        Math.max(...items.map((w) => w.box[3])),
      ],
    };
  });
  return recognitionSchema.parse({
    engine: AZURE_ENGINE,
    panels: [{ photo, part, width, height, words, lines }],
  }).panels[0];
}

/** Optional role hints anchored to exact OCR words. Provider amounts/currency are never projected. */
export function projectAzureQuantities(record, panel) {
  const analysis = record?.analyzeResult;
  const content = analysis?.content;
  const original = analysis?.pages?.[0]?.words;
  const documents = analysis?.documents;
  if (
    typeof content !== "string" ||
    content.length > 60000 ||
    !Array.isArray(original) ||
    original.length !== panel.words.length ||
    !Array.isArray(documents) ||
    documents.length !== 1
  )
    return [];
  const items = documents[0]?.fields?.Items?.valueArray;
  if (!Array.isArray(items) || items.length > 300) return [];
  const spanValid = (span) =>
    span &&
    Number.isInteger(span.offset) &&
    Number.isInteger(span.length) &&
    span.offset >= 0 &&
    span.length > 0 &&
    span.offset + span.length <= content.length;
  const entries = [];
  for (const [index, word] of original.entries()) {
    const span = word?.span;
    if (
      !spanValid(span) ||
      word.content !== panel.words[index].text ||
      content.slice(span.offset, span.offset + span.length) !== word.content
    )
      return [];
    entries.push({ index, start: span.offset, end: span.offset + span.length });
  }
  entries.sort((a, b) => a.start - b.start);
  if (
    entries.some(
      (entry, index) => index > 0 && entries[index - 1].end > entry.start,
    )
  )
    return [];
  const compact = (value) => value.replace(/\s/gu, "");
  const fieldWords = (field, maximum) => {
    if (
      !field ||
      typeof field.content !== "string" ||
      field.content.length > 2000 ||
      !Array.isArray(field.spans) ||
      field.spans.length !== 1 ||
      !spanValid(field.spans[0]) ||
      !Array.isArray(field.boundingRegions) ||
      field.boundingRegions.length !== 1
    )
      return null;
    const span = field.spans[0],
      region = field.boundingRegions[0],
      polygon = region?.polygon;
    if (
      content.slice(span.offset, span.offset + span.length) !== field.content ||
      region?.pageNumber !== 1 ||
      !Array.isArray(polygon) ||
      polygon.length !== 8 ||
      !polygon.every(Number.isFinite) ||
      polygon.some((n, i) => n < 0 || n > (i % 2 ? panel.height : panel.width))
    )
      return null;
    const xs = polygon.filter((_, i) => i % 2 === 0),
      ys = polygon.filter((_, i) => i % 2);
    const box = [
      Math.min(...xs) / panel.width,
      Math.min(...ys) / panel.height,
      Math.max(...xs) / panel.width,
      Math.max(...ys) / panel.height,
    ];
    if (box[0] >= box[2] || box[1] >= box[3]) return null;
    let lo = 0,
      hi = entries.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (entries[mid].start < span.offset) lo = mid + 1;
      else hi = mid;
    }
    const selected = [];
    for (
      let i = lo;
      i < entries.length && entries[i].start < span.offset + span.length;
      i++
    ) {
      const entry = entries[i],
        word = panel.words[entry.index];
      const x = (word.box[0] + word.box[2]) / 2,
        y = (word.box[1] + word.box[3]) / 2;
      if (
        entry.end > span.offset + span.length ||
        selected.length >= maximum ||
        word.confidence < 0.75 ||
        x < box[0] ||
        x > box[2] ||
        y < box[1] ||
        y > box[3]
      )
        return null;
      selected.push(entry.index);
    }
    if (
      !selected.length ||
      selected.map((i) => compact(panel.words[i].text)).join("") !==
        compact(field.content)
    )
      return null;
    return selected;
  };
  const hints = [];
  for (const item of items) {
    const fields = item?.valueObject,
      quantity = fields?.Quantity;
    if (
      quantity?.type !== "number" ||
      !Number.isFinite(quantity.confidence) ||
      quantity.confidence < 0.98 ||
      quantity.confidence > 1
    )
      continue;
    const quantityWords = fieldWords(quantity, 1);
    const descriptionWords = fieldWords(fields.Description, 80);
    const priceWords = fieldWords(fields.TotalPrice, 8);
    if (!quantityWords || !descriptionWords || !priceWords) continue;
    const index = quantityWords[0],
      word = panel.words[index];
    const literal = compact(word.text).match(
      /^([0-9]{1,6}(?:\.[0-9]{1,6})?)(?:[xX×])?$/,
    );
    if (
      !literal ||
      Number(literal[1]) <= 0 ||
      Number(literal[1]) !== quantity.valueNumber ||
      word.confidence < 0.98 ||
      descriptionWords.includes(index) ||
      priceWords.includes(index) ||
      descriptionWords.some((i) => priceWords.includes(i))
    )
      continue;
    hints.push({
      photo: panel.photo,
      part: panel.part,
      quantity: literal[1],
      quantityWord: index,
      descriptionWords,
      priceWords,
    });
  }
  return azureQuantityHintsSchema.parse(hints);
}
