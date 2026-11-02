import type { ReceiptImage } from "./images";
import type { ReadingContext } from "./reading-context.mjs";
import { pdfRows } from "./pdf-invoice-layout";
import { readInvoiceColumns } from "./invoice-columns";

/** Native PDF operators retain their own provenance and exact row ownership. */
export function readPdfInvoice(
  images: ReceiptImage[],
  text: string,
  context?: ReadingContext,
) {
  if (
    !images.length ||
    images.some((image) => image.document?.id !== images[0].document?.id)
  )
    return null;
  let offset = 0;
  const pages = [];
  for (const image of images) {
    const page = image.document?.text;
    if (!page) return null;
    const rows = pdfRows(page, offset);
    if (!rows) return null;
    pages.push(rows);
    offset += page.lines.length + 1;
    if (offset > 2000) return null;
  }
  return readInvoiceColumns(pages, text, context, "native-pdf");
}
