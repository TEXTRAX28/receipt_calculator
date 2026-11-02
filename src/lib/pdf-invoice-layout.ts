import type { PdfPageText } from "./pdf-text";
import type {
  InvoiceRow as PdfRow,
  InvoiceWord as PdfCell,
} from "./invoice-layout";
export type {
  InvoiceWord as PdfCell,
  InvoiceRow as PdfRow,
  InvoiceColumn as PdfColumn,
} from "./invoice-layout";
export {
  invoiceColumns as pdfColumns,
  invoiceCell as pdfCell,
  centerY,
} from "./invoice-layout";

/** Row ownership comes from actual native text operators, never guessed cells. */
export function pdfRows(page: PdfPageText, offset: number): PdfRow[] | null {
  if (
    !page.words?.length ||
    page.words.length > 10000 ||
    page.lines.length > 2000
  )
    return null;
  const rows = page.lines.map((line, index) => ({
    cells: [] as PdfCell[],
    index: offset + index,
    text: line.text,
  }));
  for (const cell of page.words) {
    if (
      !Number.isInteger(cell.lineIndex) ||
      cell.lineIndex! < 0 ||
      cell.lineIndex! >= rows.length ||
      !cell.box.every(Number.isFinite)
    )
      return null;
    rows[cell.lineIndex!].cells.push(cell);
  }
  for (const row of rows) {
    row.cells.sort((a, b) => a.box[0] - b.box[0]);
    if (
      row.cells.map((cell) => cell.text.replace(/\s/g, "")).join("") !==
      row.text.replace(/\s/g, "")
    )
      return null;
  }
  return rows;
}
