import { describe, expect, it } from "vitest";
import { pdfTextRows, canReadPdfText, readPdfText } from "../src/lib/pdf-text";
import type { ReceiptImage } from "../src/lib/images";
import {
  collectReceiptEvidence,
  sourceViewport,
} from "../src/lib/receipt-evidence";
import { calculateReceipt } from "../src/lib/engine";
import {
  checkIsPending,
  confirmReviewCheck,
  reviewKey,
} from "../src/lib/review-checks";
import { prepareReceiptFile } from "../src/lib/receipt-files";

const viewport = { width: 300, height: 400, transform: [1, 0, 0, -1, 0, 400] };
const token = (str: string, x = 20, y = 350, width = str.length * 6) => ({
  str,
  dir: "ltr",
  width,
  height: 12,
  transform: [12, 0, 0, 12, x, y],
  fontName: "test",
});
const page = (rows: string[], index = 1): ReceiptImage => ({
  id: `page-${index}`,
  name: `PDF page ${index}`,
  url: "blob:test",
  blob: new Blob(["rendered page"]),
  panels: [
    new Blob(["first detail section"]),
    new Blob(["last detail section"]),
  ],
  document: {
    kind: "pdf",
    id: "document",
    page: index,
    pages: 2,
    original: new File(["%PDF-1.7"], "test.pdf"),
    text: pdfTextRows(
      rows.map((row, i) => token(row, 15, 370 - i * 25)),
      {},
      viewport,
    ),
  },
});

describe("embedded PDF text and literal page coordinates", () => {
  it("keeps source rectangles finite when a PDF font has unavailable metrics", () => {
    const result = pdfTextRows(
      [token("Milk 2.50"), token("TOTAL GBP 2.50", 20, 320)],
      { test: { ascent: NaN } },
      viewport,
    )!;
    expect(result.lines.every((line) => line.box.every(Number.isFinite))).toBe(
      true,
    );
  });
  it("sorts original PDF cells into printed rows without confusing content order or losing a repeated purchase", () => {
    const result = pdfTextRows(
      [
        token("2.50", 230, 310, 25),
        token("Milk", 20, 310, 25),
        token("TOTAL GBP 5.00", 20, 280),
        token("Milk 2.50", 20, 350),
      ],
      {},
      viewport,
    )!;
    expect(result.lines.map((line) => line.text)).toEqual([
      "Milk 2.50",
      "Milk 2.50",
      "TOTAL GBP 5.00",
    ]);
    expect(result.lines[1].box).toEqual([
      20 / 300,
      (90 - 12 * 0.85) / 400,
      255 / 300,
      (90 + 12 * 0.15) / 400,
    ]);
  });
  it.each([
    ["rotated writing", { transform: [0, 12, -12, 0, 20, 350] }],
    ["right-to-left layout", { dir: "rtl" }],
    ["unmapped glyph", { str: "Milk \ufffd 2.50" }],
    ["non-finite geometry", { width: NaN }],
    ["clipped content", { transform: [12, 0, 0, 12, -10, 350] }],
  ])("uses an image reader for %s", (_name, patch) => {
    expect(
      pdfTextRows(
        [{ ...token("Milk 2.50"), ...patch }, token("TOTAL GBP 2.50", 20, 320)],
        {},
        viewport,
      ),
    ).toBeUndefined();
  });
  it("rejects ambiguous overlapping text and header-only text layers", () => {
    expect(
      pdfTextRows(
        [token("Milk 2.50"), token("Milk 2.50"), token("TOTAL 2.50", 20, 320)],
        {},
        viewport,
      ),
    ).toBeUndefined();
    expect(pdfTextRows([token("Logo 2026")], {}, viewport)).toBeUndefined();
    expect(
      pdfTextRows([token("Shop"), token("Thanks", 20, 320)], {}, viewport),
    ).toBeUndefined();
  });
  it("never silently truncates an overlong token or text layer", () => {
    expect(
      pdfTextRows(
        [token("x".repeat(2001)), token("TOTAL 2.50", 20, 320)],
        {},
        viewport,
      ),
    ).toBeUndefined();
    expect(
      pdfTextRows(
        Array.from({ length: 10001 }, () => token("1")),
        {},
        viewport,
      ),
    ).toBeUndefined();
  });
  it("reads all pages directly, retains duplicate purchases and blocks acceptance until complete-list review", () => {
    const images = [
      page([
        "Little Market",
        "Currency GBP",
        "Milk 1x 2.50 2.50",
        "Milk 1x 2.50 2.50",
      ]),
      page(["Bread 1x 1.50 1.50", "TOTAL GBP 6.50", "PRICES INCLUDE TAX"], 2),
    ];
    const output = readPdfText(images);
    expect(
      output.receipt.items.map((item) => [item.description, item.lineTotal]),
    ).toEqual([
      ["Milk", "2.50"],
      ["Milk", "2.50"],
      ["Bread", "1.50"],
    ]);
    expect(output.receipt.printedTotal).toBe("6.50");
    expect(output.receipt.source).toBe("text");
    expect(output.sourceLines.filter((line) => !line)).toHaveLength(1);
    expect(output.recognition.engine).toBe("pdf-embedded-text");
    expect(
      calculateReceipt(output.receipt).issues.some(
        (issue) => issue.path === "items",
      ),
    ).toBe(true);
    const check = output.receipt.reviewChecks.at(-1)!;
    expect(checkIsPending(output.receipt, check)).toBe(true);
    const confirmed = confirmReviewCheck(output.receipt, reviewKey(check));
    expect(calculateReceipt(confirmed).issues).toEqual([]);
    confirmed.items[0].lineTotal = "2.40";
    expect(checkIsPending(confirmed, confirmed.reviewChecks.at(-1)!)).toBe(
      true,
    );
    const evidence = collectReceiptEvidence(
      output.receipt,
      output.text,
      output.sources,
      output.sourceLines,
      output.recognition,
      images,
    )!;
    const item = output.receipt.items[0];
    expect(evidence.items[item.id].panels[0].blob).toBe(images[0].blob);
    expect(evidence.items[item.id].panels[0].blob).not.toBe(
      images[0].panels![0],
    );
    expect(
      sourceViewport(evidence.items[item.id].panels[0]).height,
    ).toBeGreaterThan(0);
  });
  it("refuses to use a partial text draft when a page, photo or crop needs image recognition", () => {
    const digital = page(["Little Market", "TOTAL GBP 6.50"]);
    expect(canReadPdfText([])).toBe(false);
    for (const other of [
      { ...digital, document: undefined },
      { ...digital, crop: { left: 10, right: 0, top: 0, bottom: 0 } },
      { ...digital, document: { ...digital.document!, text: undefined } },
    ]) {
      expect(canReadPdfText([digital, other])).toBe(false);
      expect(() => readPdfText([digital, other])).toThrow(/every page/);
    }
  });
});

describe("receipt-file boundary before optional PDF parsing", () => {
  const options = () => ({
    signal: new AbortController().signal,
    remaining: 12,
    progress: () => {},
  });
  it("rejects oversized/empty and disguised documents before decoding", async () => {
    await expect(
      prepareReceiptFile(
        new File([], "empty.pdf", { type: "application/pdf" }),
        options(),
      ),
    ).rejects.toThrow(/12 MB/);
    await expect(
      prepareReceiptFile(
        new File(["not a pdf"], "fake.pdf", { type: "application/pdf" }),
        options(),
      ),
    ).rejects.toThrow(/signature/);
    await expect(
      prepareReceiptFile(
        new File(["%PDF-1.7 fake"], "fake.png", { type: "image/png" }),
        options(),
      ),
    ).rejects.toThrow(/signature/);
    await expect(
      prepareReceiptFile(
        new File([new Uint8Array(12 * 1024 * 1024 + 1)], "big.pdf", {
          type: "application/pdf",
        }),
        options(),
      ),
    ).rejects.toThrow(/12 MB/);
  });
  it("honours cancellation before reading bytes or loading a parser", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      prepareReceiptFile(new File(["%PDF-1.7"], "test.pdf"), {
        ...options(),
        signal: controller.signal,
      }),
    ).rejects.toThrow();
  });
});
