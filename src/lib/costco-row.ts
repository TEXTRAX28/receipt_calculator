/** Printed SKU/quantity/price row. Pack notation in a description is never a purchase quantity. */
export function matchCostcoRow(line: string) {
  if (line.length > 1000) return null;
  const match = line.match(
    /(?:^|\s)(\d{1,12})[\s©|]+(\d+(?:[.,]\d+)?|[Il])\s*[x×]\s+([\d,.]+)\s+([\d,.]+)\s*(-)?\s*([A-Z0-9]{1,6})?\s*[^A-Z\d.,-]{0,5}$/i,
  );
  return match
    ? {
        sku: match[1],
        quantity: match[2],
        unitPrice: match[3],
        lineTotal: match[4],
        deduction: !!match[5],
        taxCode: (match[6] || "").toUpperCase(),
      }
    : null;
}
