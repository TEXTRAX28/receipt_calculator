// Research-only schema. No application imports, receipt interpretation or repairs.
// The model chooses a currency branch; unknown currency retains the old six-place
// contract and still requires review. Syntax constraints do not establish accuracy.
export function currencyPrecisionSchema(base) {
  if (!base?.properties?.currency?.enum || base.anyOf || base.oneOf)
    throw new Error("Expected the canonical receipt object schema");
  const groups = [
    { precision: 0, currencies: ["JPY", "KRW"] },
    {
      precision: 2,
      currencies: [
        "GBP",
        "USD",
        "EUR",
        "CAD",
        "AUD",
        "NZD",
        "CHF",
        "SEK",
        "IDR",
        "TWD",
      ],
    },
    { precision: 3, currencies: ["KWD", "BHD"] },
    { precision: 6, currencies: [""] },
  ];
  const existing = [...base.properties.currency.enum].sort();
  if (
    JSON.stringify(existing) !==
    JSON.stringify(groups.flatMap((group) => group.currencies).sort())
  )
    throw new Error("Currency set changed; review this research profile");
  return {
    anyOf: groups.map(({ precision, currencies }) => {
      const branch = structuredClone(base);
      delete branch.$schema;
      branch.properties.currency.enum = currencies;
      const price = (signed) => ({
        type: "string",
        pattern: `^(?:${signed ? "-?" : ""}[0-9]{1,12}${precision ? `(?:[.][0-9]{1,${precision}})?` : ""})?$`,
      });
      for (const key of ["subtotal", "printedTotal", "printedTax"])
        branch.properties[key] = price(true);
      const item = branch.properties.items.items.properties;
      item.unitPrice = price(true);
      item.lineTotal = price(true);
      item.discount = price(false);
      const adjustment = branch.properties.adjustments.items;
      const choices = adjustment.anyOf || adjustment.oneOf;
      if (!Array.isArray(choices) || !choices.length)
        throw new Error("Expected explicit adjustment variants");
      for (const choice of choices) choice.properties.amount = price(true);
      return branch;
    }),
  };
}
