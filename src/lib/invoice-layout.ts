import type { Recognition } from "./receipt-layout";

export type InvoiceWord = Recognition["panels"][number]["words"][number];
export type InvoiceRow = { cells: InvoiceWord[]; index: number; text: string };
export type InvoiceColumn = {
  role:
    | "description"
    | "quantity"
    | "unit"
    | "line"
    | "rate"
    | "tax"
    | "net"
    | "gross"
    | "other";
  text: string;
  box: [number, number, number, number];
  basis?: "net" | "gross";
  invalid?: boolean;
  qualifierIndices?: number[];
  left: number;
  right: number;
};
const compact = (text: string) => text.toUpperCase().replace(/[\s().:%]/g, "");
const roles: [InvoiceColumn["role"], RegExp][] = [
  [
    "description",
    /^(?:DESCRIPTION|ITEMDESCRIPTION|PRODUCTDESCRIPTION|PRODUCT)$/,
  ],
  ["quantity", /^(?:QTY|QUANTITY)$/],
  ["unit", /^(?:UNITPRICE|UNITCOST|PRICE)$/],
  [
    "line",
    /^(?:ITEMSUBTOTAL|SUBTOTAL|LINETOTAL|LINEAMOUNT|EXTENDEDPRICE|TOTALPRICE|AMOUNT)$/,
  ],
  ["rate", /^(?:VATRATE|TAXRATE|VAT%|TAX%)$/],
  ["tax", /^(?:VATSUBTOTAL|TAXSUBTOTAL|VATAMOUNT|TAXAMOUNT|VAT|TAX)$/],
  ["net", /^(?:NET|NETAMT|NETAMOUNT)$/],
  ["gross", /^(?:GROSS|GROSSAMT|GROSSAMOUNT)$/],
  [
    "other",
    /^(?:UOM|UNIT|UNITS|SKU|CODE|ITEMCODE|PRODUCTCODE|OURREF|NO|LINE)$/,
  ],
];
const roleKey = (text: string) => text.toUpperCase().replace(/[\s().:]/g, "");
export const centerY = (cell: InvoiceWord) => (cell.box[1] + cell.box[3]) / 2;

/** Literal printed header phrases and adjacent qualifiers define column bands. */
export function invoiceColumns(
  rows: InvoiceRow[],
  rowIndex: number,
): InvoiceColumn[] {
  const cells = rows[rowIndex].cells;
  const result: InvoiceColumn[] = [];
  for (let start = 0; start < cells.length; start++) {
    let chosen:
      | {
          end: number;
          role: InvoiceColumn["role"];
          text: string;
          basis?: "net" | "gross";
        }
      | undefined;
    for (let end = start; end < Math.min(cells.length, start + 4); end++) {
      const text = cells
        .slice(start, end + 1)
        .map((cell) => cell.text)
        .join(" ");
      const qualifier = text.match(
        /\s*\((incl(?:uding)?|excl(?:uding)?)\.?\s+(?:VAT|tax)\)\s*$/i,
      );
      const label = qualifier ? text.slice(0, qualifier.index) : text;
      const role = roles.find(([, pattern]) =>
        pattern.test(roleKey(label)),
      )?.[0];
      if (role)
        chosen = {
          end,
          role,
          text,
          basis: qualifier
            ? /^incl/i.test(qualifier[1])
              ? "gross"
              : "net"
            : undefined,
        };
    }
    if (!chosen) continue;
    const selected = cells.slice(start, chosen.end + 1);
    result.push({
      role: chosen.role,
      text: chosen.text,
      basis:
        chosen.basis ||
        (chosen.role === "net"
          ? "net"
          : chosen.role === "gross"
            ? "gross"
            : undefined),
      invalid:
        (chosen.role === "net" && chosen.basis === "gross") ||
        (chosen.role === "gross" && chosen.basis === "net"),
      box: [
        selected[0].box[0],
        Math.min(...selected.map((cell) => cell.box[1])),
        selected.at(-1)!.box[2],
        Math.max(...selected.map((cell) => cell.box[3])),
      ],
      left: 0,
      right: 1,
    });
    start = chosen.end;
  }
  for (const [index, column] of result.entries()) {
    const before = result[index - 1],
      after = result[index + 1];
    column.left = before
      ? (before.box[2] + column.box[0]) / 2
      : Math.max(
          0,
          column.box[0] - (after ? (after.box[0] - column.box[2]) / 2 : 0.03),
        );
    column.right = after
      ? (column.box[2] + after.box[0]) / 2
      : Math.min(
          1,
          column.box[2] + Math.max(0.025, column.box[2] - column.box[0]),
        );
    // Descriptions extend to the first numeric column, not to a midpoint
    // between a short "Description" label and a wide product name.
    if (column.role === "description" && after)
      column.right =
        after.box[0] -
        (result[index + 2]
          ? (result[index + 2].box[0] - after.box[2]) / 2
          : 0.02);
    if (column.role === "description")
      column.left = Math.max(
        0,
        column.box[0] - Math.min(0.025, (column.box[3] - column.box[1]) * 2),
      );
    if (column.role === "quantity" && before?.role === "description" && after)
      column.left = column.box[0] - (after.box[0] - column.box[2]) / 2;
    const qualifiers = rows
      .slice(rowIndex + 1, rowIndex + 3)
      .flatMap((row) => row.cells)
      .filter(
        (cell) =>
          centerY(cell) > column.box[3] &&
          centerY(cell) - column.box[3] <=
            (column.box[3] - column.box[1]) * 3 &&
          (cell.box[0] + cell.box[2]) / 2 >= column.left &&
          (cell.box[0] + cell.box[2]) / 2 <= column.right,
      );
    const text = compact(qualifiers.map((cell) => cell.text).join(" "));
    const below = /^(?:EXCL|EXCLUDING)(?:VAT|TAX)$/.test(text)
      ? "net"
      : /^(?:INCL|INCLUDING)(?:VAT|TAX)$/.test(text)
        ? "gross"
        : undefined;
    if (below && column.basis && below !== column.basis) column.invalid = true;
    if (below) column.basis = below;
    if (below)
      column.qualifierIndices = rows
        .slice(rowIndex + 1, rowIndex + 3)
        .filter((row) => row.cells.some((cell) => qualifiers.includes(cell)))
        .map((row) => row.index);
  }
  return result;
}

export function invoiceCellWords(row: InvoiceRow, column: InvoiceColumn) {
  return row.cells.filter((cell) => {
    const center = (cell.box[0] + cell.box[2]) / 2;
    return center >= column.left && center < column.right;
  });
}

export function invoiceCell(row: InvoiceRow, column: InvoiceColumn) {
  return invoiceCellWords(row, column)
    .map((cell) => cell.text)
    .join(" ")
    .trim();
}
