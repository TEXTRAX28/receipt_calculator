import {
  currencies,
  newItem,
  newReceipt,
  type Currency,
  type ReceiptReviewField,
} from "./model";
import type { ReadingContext } from "./reading-context.mjs";
import type { parseReceiptWithSources } from "./parser";
import { money, weight } from "./money";
import { printedAmount } from "./printed-amount";
import { normalizeReceiptDate } from "./receipt-date";
import {
  invoiceColumns,
  invoiceCell,
  invoiceCellWords,
  type InvoiceRow,
  type InvoiceColumn,
} from "./invoice-layout";

type Parsed = ReturnType<typeof parseReceiptWithSources>;
type Table = {
  invalid: false;
  rows: InvoiceRow[];
  header: number;
  description: InvoiceColumn;
  quantity: InvoiceColumn;
  unit: InvoiceColumn;
  total: InvoiceColumn;
  basis?: "net" | "gross";
};
type TableCandidate = Table | { invalid: true };
const currencyCode = Object.keys(currencies).join("|");
const currencyPattern = new RegExp(`\\b(${currencyCode})\\b`, "g");
const moneyText = (value: string) => value.replace(currencyPattern, "").trim();
const monetary = (text: string) =>
  /^[-−]?\s*(?:(?:[A-Z]{3}|[£$€])\s*)?[-−]?\s*\d[\d., ]*-?$/.test(text.trim());
const unique = (values: string[]) => [...new Set(values)];
type AmountRole = "total" | "net" | "tax" | "fee";
const names: [AmountRole, RegExp][] = [
  [
    "total",
    /^(?:invoice\s+total|total\s+payable|grand\s+total|total\s+amount|amount\s+due|balance\s+due)$/i,
  ],
  [
    "net",
    /^(?:invoice\s+subtotal|net\s+subtotal|total\s+net(?:\s+amount)?|total\s+before\s+tax)$/i,
  ],
  ["tax", /^(?:total\s+(?:tax|vat)(?:\s+amount)?|(?:tax|vat)\s+total)$/i],
  [
    "fee",
    /^(?:carriage|shipping|delivery|handling|service)(?:\s+(?:charges?|fees?))?(?:\s+(?:net|gross))?$/i,
  ],
];
const labelKey = (text: string) => text.replace(/^[▌|•\s]+|[:\s]+$/g, "");
const amountConfidence = (words: InvoiceRow["cells"]) =>
  Math.min(
    ...words
      .filter((word) => !/^[£$€]$/.test(word.text.trim()))
      .map((word) => word.confidence),
  );

function namedAmounts(rows: InvoiceRow[]) {
  const found: {
    role: AmountRole;
    literal: string;
    index: number;
    label: string;
    confidence: number;
  }[] = [];
  for (const row of rows) {
    for (const [start, cell] of row.cells.entries()) {
      for (
        let end = start;
        end < Math.min(row.cells.length, start + 4);
        end++
      ) {
        const label = labelKey(
          row.cells
            .slice(start, end + 1)
            .map((word) => word.text)
            .join(" "),
        );
        const role = names.find(([, pattern]) => pattern.test(label))?.[0];
        const following = row.cells
          .slice(end + 1)
          .map((word) => word.text)
          .join(" ");
        if (role && monetary(following))
          found.push({
            role,
            literal: following,
            index: row.index,
            label,
            confidence: amountConfidence(row.cells.slice(start)),
          });
      }
      // Some native PDFs report the complete label/value as one text operator.
      const inline = cell.text.match(
        /^(invoice\s+total|total\s+payable|grand\s+total|total\s+amount|amount\s+due|balance\s+due|invoice\s+subtotal|net\s+subtotal|total\s+net(?:\s+amount)?|total\s+before\s+tax|total\s+(?:tax|vat)(?:\s+amount)?|(?:carriage|shipping|delivery|handling|service)(?:\s+(?:charges?|fees?))?(?:\s+(?:net|gross))?)\s*:?\s+(.+)$/i,
      );
      if (inline && monetary(inline[2])) {
        const role = names.find(([, pattern]) => pattern.test(inline[1]))?.[0];
        if (role)
          found.push({
            role,
            literal: inline[2],
            index: row.index,
            label: inline[1],
            confidence: cell.confidence,
          });
      }
    }
  }
  return found;
}

function taxSummary(rows: InvoiceRow[]) {
  const found: { net: string; tax: string; index: number; header: number }[] =
    [];
  for (const [position, row] of rows.entries()) {
    const columns = invoiceColumns(rows, position);
    const nets = columns.filter(
      (column) =>
        column.role === "net" ||
        (column.role === "line" && column.basis === "net"),
    );
    const taxes = columns.filter((column) => column.role === "tax");
    if (
      columns.some((column) => column.invalid) ||
      nets.length !== 1 ||
      taxes.length !== 1 ||
      columns.some((column) => column.role === "quantity")
    )
      continue;
    const candidates = rows
      .slice(position + 1, position + 9)
      .flatMap((candidate) => {
        const net = invoiceCell(candidate, nets[0]),
          tax = invoiceCell(candidate, taxes[0]);
        return monetary(net) && monetary(tax)
          ? [
              {
                net,
                tax,
                index: candidate.index,
                header: row.index,
                total: /^Total\b/i.test(candidate.text),
              },
            ]
          : [];
      });
    const totals = candidates.filter((candidate) => candidate.total);
    if (totals.length === 1) found.push(totals[0]);
    else if (candidates.length === 1) found.push(candidates[0]);
  }
  return found;
}

/** Literal word boxes supply proposed roles; no model or balancing repair. */
export function readInvoiceColumns(
  pages: InvoiceRow[][],
  text: string,
  context?: ReadingContext,
  origin: "native-pdf" | "ocr" = "native-pdf",
): Parsed | null {
  if (!pages.length || pages.length > 24 || pages.flat().length > 2000)
    return null;
  const rows = pages.flat();
  const ids = unique(
    rows.flatMap((row) =>
      [
        ...row.text.matchAll(
          /\bInvoice\s*(?:#|No\.?|Number)\s*:?\s*([A-Z0-9][A-Z0-9-]*)/gi,
        ),
      ].map((match) => match[1]),
    ),
  );
  if (ids.length > 1 || (pages.length > 1 && ids.length !== 1)) return null;
  const tables = pages.flatMap<TableCandidate>((page) =>
    page.flatMap<TableCandidate>((row, position) => {
      const columns = invoiceColumns(page, position);
      const descriptions = columns.filter(
          (column) => column.role === "description",
        ),
        quantities = columns.filter((column) => column.role === "quantity");
      if (descriptions.length !== 1 || quantities.length !== 1) return [];
      if (
        columns.some((column) => column.invalid) ||
        (origin === "ocr" && row.cells.some((cell) => cell.confidence < 0.9))
      )
        return [{ invalid: true }];
      const units = columns.filter((column) => column.role === "unit"),
        totals = columns.filter((column) =>
          ["line", "net", "gross"].includes(column.role),
        );
      const pairs = units.flatMap((unit) =>
        totals.flatMap((total) =>
          unit.basis === total.basis ||
          (!unit.basis && ["net", "gross"].includes(total.role))
            ? [{ unit, total, basis: total.basis }]
            : [],
        ),
      );
      const gross = pairs.filter((pair) => pair.basis === "gross"),
        net = pairs.filter((pair) => pair.basis === "net");
      const selected =
        gross.length === 1
          ? gross
          : net.length === 1
            ? net
            : pairs.length === 1
              ? pairs
              : [];
      if (selected.length !== 1) return [{ invalid: true as const }];
      return [
        {
          invalid: false as const,
          rows: page.slice(position + 1),
          header: row.index,
          description: descriptions[0],
          quantity: quantities[0],
          ...selected[0],
        },
      ];
    }),
  );
  if (!tables.length || tables.some((table) => table.invalid)) return null;
  const valid = tables.filter((table): table is Table => !table.invalid);
  const amounts = namedAmounts(rows),
    taxTables = pages.flatMap(taxSummary);
  if (amounts.length > 64 || taxTables.length > 12) return null;
  const currencyHints = unique(
    [
      ...amounts.map((amount) => amount.literal),
      ...taxTables.flatMap((table) => [table.net, table.tax]),
      ...valid.flatMap((table) =>
        table.rows.flatMap((row) => {
          const quantity = invoiceCell(row, table.quantity),
            unit = invoiceCell(row, table.unit),
            line = invoiceCell(row, table.total),
            label = invoiceCell(row, table.description);
          return /^(?:\d{1,9}(?:[.,]\d{1,6})?)$/.test(quantity) ||
            /^(?:promotions?|discounts?|shipping(?:\s+charges?)?|delivery(?:\s+charges?)?)$/i.test(
              label,
            )
            ? [unit, line].filter(monetary)
            : [];
        }),
      ),
      ...rows
        .filter((row) => /^Currency\s*:/i.test(row.text))
        .map((row) => row.text),
    ].flatMap((text) => [
      ...[...text.matchAll(currencyPattern)].map((match) => match[1]),
      ...(text.includes("£") ? ["GBP"] : []),
      ...(text.includes("€") ? ["EUR"] : []),
    ]),
  );
  if (currencyHints.length !== 1) return null;
  const currency = currencyHints[0] as Currency;
  const decode = (literal: string) => {
    if (
      literal.includes("$") &&
      !["USD", "CAD", "AUD", "NZD", "TWD"].includes(currency)
    )
      throw new Error("Ambiguous invoice currency symbol");
    return printedAmount(moneyText(literal), { currency });
  };
  const one = (role: "total" | "net" | "tax") => {
    const candidates = amounts.filter((amount) => amount.role === role);
    const values = unique(
      candidates.map((candidate) => decode(candidate.literal)),
    );
    if (values.length > 1)
      throw new Error("Conflicting printed invoice summaries");
    return values.length === 1
      ? {
          value: values[0],
          indices: candidates.map((candidate) => candidate.index),
        }
      : null;
  };
  try {
    const total = one("total");
    if (!total || money(total.value, currency) <= 0n) return null;
    const fiscalNets = unique(taxTables.map((table) => decode(table.net))),
      fiscalTaxes = unique(taxTables.map((table) => decode(table.tax)));
    if (fiscalNets.length > 1 || fiscalTaxes.length > 1) return null;
    const namedNet = one("net"),
      namedTax = one("tax");
    if (
      (namedNet && fiscalNets.length && namedNet.value !== fiscalNets[0]) ||
      (namedTax && fiscalTaxes.length && namedTax.value !== fiscalTaxes[0])
    )
      return null;
    const net =
      namedNet ||
      (fiscalNets.length
        ? {
            value: fiscalNets[0],
            indices: taxTables.flatMap((table) => [table.header, table.index]),
          }
        : null);
    const tax =
      namedTax ||
      (fiscalTaxes.length
        ? {
            value: fiscalTaxes[0],
            indices: taxTables.flatMap((table) => [table.header, table.index]),
          }
        : null);
    const explicit = unique(
      valid.flatMap((table) => (table.basis ? [table.basis] : [])),
    );
    if (explicit.length > 1) return null;
    const basis =
      explicit[0] ||
      (net &&
      tax &&
      money(tax.value, currency) > 0n &&
      money(net.value, currency) + money(tax.value, currency) ===
        money(total.value, currency)
        ? "net"
        : null);
    if (!basis) return null;
    const receipt = newReceipt();
    receipt.source = origin === "ocr" ? "ocr" : "text";
    receipt.rawText = text;
    receipt.currency = currency;
    if (origin === "ocr") {
      const financialRows = new Set(amounts.map((amount) => amount.index));
      const symbol = currency === "GBP" ? "£" : currency === "EUR" ? "€" : null;
      const supportedCurrency = rows.some(
        (row) =>
          financialRows.has(row.index) &&
          row.cells.some(
            (word) =>
              word.confidence >= 0.9 &&
              (new RegExp(`\\b${currency}\\b`).test(word.text) ||
                (symbol && word.text.includes(symbol))),
          ),
      );
      if (!supportedCurrency) {
        receipt.currencyUnresolved = true;
        receipt.warnings.push(
          "The OCR currency words need a source check. Choose the currency explicitly before sharing.",
        );
      }
    }
    if (context && context.currency !== currency) {
      receipt.currencyUnresolved = true;
      receipt.reviewChecks.push({
        scope: "receipt",
        field: "currency",
        reason: "different",
        other: `Selected reading currency: ${context.currency}`,
        confirmedValue: "",
      });
    }
    receipt.pricesIncludeTax = basis === "gross";
    receipt.printedTotal = total.value;
    receipt.printedTax = tax?.value || "";
    receipt.subtotal = basis === "net" ? net?.value || "" : "";
    const sources: Parsed["sources"] = {},
      fieldSources: Parsed["fieldSources"] = {
        printedTotal: total.indices,
        printedTax: tax?.indices || [],
        subtotal: net?.indices || [],
        currency: [...total.indices, ...valid.map((table) => table.header)],
        pricesIncludeTax: [
          ...valid.map((table) => table.header),
          ...total.indices,
          ...(net?.indices || []),
          ...(tax?.indices || []),
        ],
      };
    const headerIndices = (table: Table) => [
      table.header,
      ...(table.unit.qualifierIndices || []),
      ...(table.total.qualifierIndices || []),
    ];
    fieldSources.pricesIncludeTax = [
      ...new Set([
        ...(fieldSources.pricesIncludeTax || []),
        ...valid.flatMap(headerIndices),
      ]),
    ];
    const sellers = rows.filter((row) => /^Sold by\s+\S/i.test(row.text));
    const sellerNames = unique(
      sellers.map((row) => row.text.replace(/^Sold by\s+/i, "")),
    );
    if (sellerNames.length === 1) {
      receipt.merchant = sellerNames[0].slice(0, 100);
      fieldSources.merchant = sellers.map((row) => row.index);
    } else if (!sellerNames.length) {
      const heading = rows.flatMap((row) => {
        if (!row.cells.length || !row.cells.every((cell) => cell.box[3] < 0.18))
          return [];
        // Separate adjacent letterhead/logo runs only at a real horizontal gap.
        const runs: (typeof row.cells)[] = [];
        for (const cell of row.cells) {
          const previous = runs.at(-1)?.at(-1);
          if (
            !previous ||
            cell.box[0] - previous.box[2] >
              Math.max(0.025, (cell.box[3] - cell.box[1]) * 3)
          )
            runs.push([cell]);
          else runs.at(-1)!.push(cell);
        }
        return runs.flatMap((cells) => {
          const name = cells.map((cell) => cell.text).join(" ");
          // OCR spelling is preserved, including uncertain glyphs; never repair a company name.
          return /^[\p{L}\p{N} .&'\[\]-]+\b(?:Ltd\.?|Limited|Inc\.?|LLC|GmbH)$/iu.test(
            name,
          )
            ? [{ ...row, cells, text: name }]
            : [];
        });
      });
      if (unique(heading.map((row) => row.text)).length === 1) {
        const position = rows.findIndex(
            (row) => row.index === heading[0].index,
          ),
          before = rows[position - 1];
        const prefix =
          before &&
          /^T\s*\/\s*a\s*:/i.test(before.text) &&
          Math.abs(before.cells[0].box[0] - heading[0].cells[0].box[0]) <
            0.02 &&
          heading[0].cells[0].box[1] - before.cells[0].box[3] < 0.025
            ? before
            : undefined;
        receipt.merchant =
          `${prefix ? prefix.text.replace(/^T\s*\/\s*a\s*:\s*/i, "") + " " : ""}${heading[0].text}`.slice(
            0,
            100,
          );
        fieldSources.merchant = [
          ...(prefix ? [prefix.index] : []),
          ...heading.map((row) => row.index),
        ];
      }
    }
    const dates = rows.flatMap((row) => {
      const match = row.text.match(
        /\b(?:Invoice|Document)\s+date(?:\s*\/\s*Delivery\s+date)?\s*:?\s+(.+)$/i,
      );
      return match ? [{ literal: match[1].trim(), index: row.index }] : [];
    });
    if (unique(dates.map((date) => date.literal)).length === 1) {
      const literal = dates[0].literal;
      const normalized = normalizeReceiptDate(literal);
      if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
        const date = new Date(`${normalized}T00:00:00Z`);
        if (
          Number.isFinite(date.getTime()) &&
          date.toISOString().slice(0, 10) === normalized
        )
          receipt.date = normalized;
      } else {
        const named = literal.match(
          /^(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})$/i,
        );
        if (named) {
          const months =
            "january february march april may june july august september october november december".split(
              " ",
            );
          const candidate = `${named[3]}-${String(months.indexOf(named[2].toLowerCase()) + 1).padStart(2, "0")}-${named[1].padStart(2, "0")}`;
          const date = new Date(`${candidate}T00:00:00Z`);
          if (
            Number.isFinite(date.getTime()) &&
            date.toISOString().slice(0, 10) === candidate
          )
            receipt.date = candidate;
        }
      }
      if (receipt.date) fieldSources.date = dates.map((date) => date.index);
      else
        receipt.warnings.push(
          "The printed invoice date is ambiguous. Check its day, month and year on the source.",
        );
    }
    let closed = false;
    for (const table of valid) {
      let previous:
        | { item: (typeof receipt.items)[number]; y: number; open: boolean }
        | undefined;
      closed = false;
      for (const row of table.rows) {
        if (
          row.index ===
            valid.find((candidate) => candidate.header > table.header)
              ?.header ||
          amounts.some((amount) => amount.index === row.index) ||
          /^(?:▌\s*)?VAT Details\b/i.test(row.text)
        )
          break;
        const description = invoiceCell(row, table.description),
          quantity = invoiceCell(row, table.quantity),
          unit = invoiceCell(row, table.unit),
          line = invoiceCell(row, table.total);
        if (/^\(?\s*(?:incl|excl)/i.test(row.text)) continue;
        if (/^\d{1,9}(?:[.,]\d{1,6})?$/.test(quantity)) {
          if (
            /[.,]\d{3}$/.test(quantity) ||
            receipt.items.length >= 300 ||
            !description ||
            !monetary(unit) ||
            !monetary(line) ||
            weight(quantity.replace(",", ".")) <= 0n
          )
            return null;
          if (
            origin === "ocr" &&
            [table.quantity, table.unit, table.total].some((column) =>
              invoiceCellWords(row, column).some(
                (word) => word.confidence < 0.9,
              ),
            )
          )
            return null;
          const item = newItem();
          item.description = description.slice(0, 180);
          item.quantity = quantity.replace(",", ".");
          item.unitPrice = decode(unit);
          item.lineTotal = decode(line);
          if (
            money(item.unitPrice, currency) < 0n ||
            money(item.lineTotal, currency) < 0n
          )
            return null;
          if (description.length > 450) return null;
          if (description.length > 180)
            item.note =
              `Description continues: ${description.slice(180)}`.slice(0, 300);
          receipt.items.push(item);
          sources[item.id] = [...headerIndices(table), row.index];
          previous = { item, y: row.cells[0].box[3], open: true };
          closed = false;
        } else if (monetary(unit) || monetary(line)) {
          if (quantity || !description || !monetary(line)) return null;
          const value = decode(line),
            number = money(value, currency, true);
          const discount = /^(?:promotions?|discounts?)$/i.test(description),
            fee =
              /^(?:shipping|delivery|handling|service)(?:\s+(?:charges?|fees?))?$/i.test(
                description,
              );
          if ((!discount && !fee) || (fee && number < 0n)) return null;
          if (receipt.adjustments.length >= 30) return null;
          const id = crypto.randomUUID();
          receipt.adjustments.push({
            id,
            label: description.slice(0, 100),
            kind: discount ? "discount" : "fee",
            amount: discount ? value.replace(/^-/, "") : value,
            allocation: "proportional",
          });
          sources[id] = [table.header, row.index];
          (fieldSources.adjustments ||= []).push(table.header, row.index);
          closed = true;
        } else if (/^Discount\b/i.test(description)) {
          if (!/already\s+(?:deducted|applied)/i.test(row.text)) return null;
          (fieldSources.adjustments ||= []).push(row.index);
          if (previous) previous.open = false;
        } else if (
          /^(?:ASIN|SKU|item\s+code|despatch\s+date|dispatch\s+date|serial|EAN|UPC)\b/i.test(
            description,
          )
        ) {
          if (previous) previous.open = false;
        } else if (
          previous?.open &&
          !closed &&
          description &&
          !quantity &&
          !unit &&
          !line &&
          row.cells.every((cell) => cell.box[2] < table.description.right) &&
          row.cells[0].box[1] - previous.y < 0.025
        ) {
          const full = `${previous.item.description} ${description}`;
          if (full.length <= 180) previous.item.description = full;
          else {
            const note = `${previous.item.note}${previous.item.note ? " " : ""}Description continues: ${description}`;
            if (note.length > 300) return null;
            previous.item.note = note;
          }
          sources[previous.item.id].push(row.index);
          previous.y = row.cells[0].box[3];
        }
      }
    }
    if (
      !receipt.items.length ||
      receipt.items.length > 300 ||
      receipt.adjustments.length > 30
    )
      return null;
    if (!explicit.length && net) {
      const observed =
        receipt.items.reduce(
          (sum, item) => sum + money(item.lineTotal, currency),
          0n,
        ) +
        receipt.adjustments.reduce(
          (sum, entry) =>
            sum +
            money(entry.amount, currency) *
              (entry.kind === "discount" ? -1n : 1n),
          0n,
        );
      if (observed !== money(net.value, currency)) return null;
    }
    for (const amount of amounts.filter((entry) => entry.role === "fee")) {
      const feeBasis = /\bnet$/i.test(amount.label)
        ? "net"
        : /\bgross$/i.test(amount.label)
          ? "gross"
          : undefined;
      if (
        !feeBasis ||
        feeBasis !== basis ||
        amounts.filter(
          (entry) =>
            entry.role === "fee" &&
            entry.label.toLowerCase() === amount.label.toLowerCase(),
        ).length !== 1 ||
        receipt.adjustments.length >= 30
      )
        return null;
      const value = decode(amount.literal);
      if (money(value, currency) < 0n) return null;
      const id = crypto.randomUUID();
      receipt.adjustments.push({
        id,
        label: amount.label,
        kind: "fee",
        amount: value,
        allocation: "proportional",
      });
      sources[id] = [amount.index];
      (fieldSources.adjustments ||= []).push(amount.index);
    }
    if (basis === "net" && tax) {
      if (receipt.adjustments.length >= 30) return null;
      const id = crypto.randomUUID();
      receipt.adjustments.push({
        id,
        label: "Printed tax",
        kind: "tax",
        amount: tax.value,
        allocation: "proportional",
      });
      sources[id] = tax.indices;
      (fieldSources.adjustments ||= []).push(...tax.indices);
    }
    if (origin === "ocr") {
      if (amounts.some((amount) => amount.confidence < 0.9) || taxTables.length)
        return null;
      const covered = new Set([
        ...Object.values(sources).flat(),
        ...Object.values(fieldSources).flatMap((indices) => indices || []),
      ]);
      const firstHeader = Math.min(...valid.map((table) => table.header));
      if (
        rows.some(
          (row) =>
            row.index > firstHeader &&
            !covered.has(row.index) &&
            row.cells.some(
              (cell) =>
                monetary(cell.text) && /[.,]\d{2,3}-?$/.test(cell.text.trim()),
            ),
        )
      )
        return null;
      receipt.reviewChecks.push({
        scope: "receipt",
        field: "items",
        reason: "source",
        other:
          "OCR column headers supplied this proposed purchase list. Compare every row, including missing or repeated purchases, with the original.",
        confirmedValue: "",
      });
    }
    for (const field of [
      "currency",
      "printedTotal",
      "pricesIncludeTax",
      ...(origin === "ocr" && receipt.merchant ? ["merchant"] : []),
      ...(receipt.printedTax ? ["printedTax"] : []),
      ...(receipt.subtotal ? ["subtotal"] : []),
      ...(receipt.adjustments.length || fieldSources.adjustments?.length
        ? ["adjustments"]
        : []),
    ] as ReceiptReviewField[])
      receipt.reviewChecks.push({
        scope: "receipt",
        field,
        reason: "source",
        other:
          "Printed invoice headers supplied these proposed roles. Check the printed columns and summaries.",
        confirmedValue: "",
        details:
          field === "pricesIncludeTax"
            ? [
                { label: "Selected printed price basis", value: basis },
                ...(net
                  ? [{ label: "Printed net subtotal", value: net.value }]
                  : []),
                ...(tax ? [{ label: "Printed tax", value: tax.value }] : []),
              ]
            : undefined,
      });
    receipt.warnings.push(
      origin === "ocr"
        ? "Invoice columns were proposed from actual OCR word positions. OCR scores are not source verification; check every purchase and financial summary."
        : "Invoice columns were read from native PDF positions. Check every purchase, price basis and summary against the rendered pages.",
    );
    return { receipt, sources, columnSources: {}, fieldSources };
  } catch {
    return null;
  }
}
