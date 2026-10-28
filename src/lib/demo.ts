import { newItem, newReceipt, type Receipt } from "./model";
/** Safe manual transcription: no membership, payment, address or transaction identifiers. Never an OCR result. */
export function costcoDemo(): Receipt {
  const r = newReceipt();
  r.merchant = "Costco";
  r.date = "2026-10-26";
  r.currency = "GBP";
  r.source = "demo";
  r.pricesIncludeTax = false;
  r.taxMode = "codes";
  r.taxCodes = [
    { code: "A", rate: "20" },
    { code: "Z", rate: "0" },
  ];
  r.subtotal = "163.16";
  r.printedTotal = "176.78";
  r.printedTax = "13.62";
  const rows = [
    ["SPAM 6 × 340g", "14.99", "Z", "0"],
    ["JW tuna in oil 12 × 145g", "9.99", "Z", "0"],
    ["Medium eggs 5 dozen", "9.99", "Z", "0"],
    ["Chicken skewers 15", "9.49", "Z", "2.00"],
    ["Rowse honey 1.36kg", "5.99", "Z", "0"],
    ["Belvedere vodka 70cl", "23.99", "A", "1.60"],
    ["Meadowchurn 4 × 250g", "5.49", "Z", "0"],
    ["Scotch scourers 24 pack", "5.29", "A", "0"],
    ["Ferrero Rocher T48", "10.99", "A", "0"],
    ["Kinder Bueno T20", "9.79", "A", "1.80"],
    ["Prawn wonton soup", "11.59", "Z", "0"],
    ["Parmareggio 30M", "19.03", "Z", "0"],
    ["Baby plum tomatoes 1kg", "4.99", "Z", "0"],
    ["Garlic 1kg", "5.49", "Z", "0"],
    ["Plastic containers 38oz", "7.99", "A", "0"],
    ["KS rotisserie chicken", "3.99", "A", "0"],
    ["KS rotisserie chicken", "3.99", "A", "0"],
    ["Spontex cloths 24 pack", "6.99", "A", "1.50"],
  ];
  r.items = rows.map(([description, price, taxCode, discount]) => ({
    ...newItem(),
    description,
    unitPrice: price,
    lineTotal: price,
    taxCode,
    discount,
  }));
  r.warnings = [
    "Demo: manually transcribed shopping data. This was not scanned by OCR.",
    "Pack sizes have not been inferred from names. Confirm units per pack when splitting physical quantities.",
  ];
  return r;
}
