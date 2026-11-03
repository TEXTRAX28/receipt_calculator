export function azureQuantityFixture(copies = 1, width = 700, height = 700) {
  const rows = [
    "SYNTHETIC MARKET",
    ...Array.from({ length: copies }, () => "Tea 2 5.00"),
    `TOTAL GBP ${(copies * 5).toFixed(2)}`,
    "PRICES INCLUDE TAX",
  ];
  let content = "";
  const words: {
    content: string;
    confidence: number;
    polygon: number[];
    span: { offset: number; length: number };
  }[] = [];
  const starts: number[] = [];
  for (const [row, line] of rows.entries()) {
    starts.push(words.length);
    let x = 45;
    for (const text of line.split(" ")) {
      const y = 45 + row * 75,
        right = x + text.length * 16;
      const polygon = [x, y, right, y, right, y + 28, x, y + 28].map(
        (v, i) => (v * (i % 2 ? height : width)) / 700,
      );
      words.push({
        content: text,
        confidence: 0.995,
        polygon,
        span: { offset: content.length, length: text.length },
      });
      content += text + " ";
      x = right + 16;
    }
    content = content.slice(0, -1) + "\n";
  }
  const field = (index: number) => ({
    content: words[index].content,
    confidence: 0.995,
    spans: [{ ...words[index].span }],
    boundingRegions: [{ pageNumber: 1, polygon: [...words[index].polygon] }],
  });
  const items = Array.from({ length: copies }, (_, i) => {
    const first = starts[i + 1];
    return {
      valueObject: {
        Description: { type: "string", valueString: "Tea", ...field(first) },
        Quantity: { type: "number", valueNumber: 2, ...field(first + 1) },
        TotalPrice: {
          type: "currency",
          valueCurrency: { amount: 999999, currencyCode: "AUD" },
          ...field(first + 2),
        },
      },
    };
  });
  return {
    dimensions: { photo: 1, part: 1, width, height },
    record: {
      status: "succeeded",
      analyzeResult: {
        apiVersion: "2024-11-30",
        modelId: "prebuilt-receipt",
        content,
        pages: [
          { pageNumber: 1, unit: "pixel", width, height, angle: 0, words },
        ],
        documents: [
          {
            fields: {
              Items: { valueArray: items },
              Total: { valueCurrency: { amount: 999999, currencyCode: "AUD" } },
            },
          },
        ],
      },
    },
  };
}
