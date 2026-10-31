import { z } from "zod";

export const currencies = {
  GBP: 2,
  USD: 2,
  EUR: 2,
  CAD: 2,
  AUD: 2,
  NZD: 2,
  CHF: 2,
  SEK: 2,
  JPY: 0,
  KRW: 0,
  KWD: 3,
  BHD: 3,
  IDR: 2,
  TWD: 2,
} as const;
export type Currency = keyof typeof currencies;
const id = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[\w-]+$/);
const numericDraft = z.string().max(40);
export const assignmentSchema = z.object({
  mode: z.enum(["equal", "quantity", "ratio", "percent"]),
  participants: z.array(id).max(30),
  values: z.record(id, numericDraft),
});
export type Assignment = z.infer<typeof assignmentSchema>;
export const itemSchema = z.object({
  id,
  description: z.string().max(180),
  quantity: numericDraft,
  unitPrice: numericDraft,
  lineTotal: numericDraft,
  discount: numericDraft,
  taxCode: z.string().max(12),
  packSize: numericDraft,
  unitKind: z.enum(["whole", "measured"]),
  note: z.string().max(300),
  assignment: assignmentSchema,
});
export type Item = z.infer<typeof itemSchema>;
export const adjustmentSchema = z.object({
  id,
  label: z.string().max(100),
  kind: z.enum(["discount", "tax", "fee", "tip", "deposit", "rounding"]),
  amount: numericDraft,
  allocation: z.enum(["proportional", "equal-people"]),
});
export type Adjustment = z.infer<typeof adjustmentSchema>;
export const itemReviewFields = [
  "description",
  "quantity",
  "unitPrice",
  "lineTotal",
  "discount",
  "taxCode",
] as const;
export const receiptReviewFields = [
  "merchant",
  "date",
  "currency",
  "subtotal",
  "printedTotal",
  "printedTax",
  "pricesIncludeTax",
  "taxCodes",
  "adjustments",
  "items",
] as const;
export type ReceiptReviewField = (typeof receiptReviewFields)[number];
const reviewDetails = {
  reason: z.enum([
    "different",
    "unsupported",
    "unclear",
    "recovered",
    "coverage",
    "document",
  ]),
  other: z.string().max(180).default(""),
  confirmedValue: z.string().max(250000).default(""),
  details: z
    .array(z.object({ label: z.string().max(100), value: z.string().max(80) }))
    .max(30)
    .optional(),
};
export const reviewCheckSchema = z.discriminatedUnion("scope", [
  z.object({
    scope: z.literal("item"),
    itemId: id,
    field: z.enum(itemReviewFields),
    ...reviewDetails,
  }),
  z.object({
    scope: z.literal("receipt"),
    field: z.enum(receiptReviewFields),
    ...reviewDetails,
  }),
]);
export type ReviewCheck = z.infer<typeof reviewCheckSchema>;
export const receiptSchema = z.object({
  id,
  merchant: z.string().max(100),
  date: z.string().max(20),
  currency: z.enum(Object.keys(currencies) as [Currency, ...Currency[]]),
  currencyUnresolved: z.boolean().default(false),
  subtotal: numericDraft,
  printedTotal: numericDraft,
  printedTax: numericDraft.default(""),
  pricesIncludeTax: z.boolean(),
  taxMode: z.enum(["printed", "codes"]),
  taxCodes: z
    .array(z.object({ code: z.string().max(12), rate: numericDraft }))
    .max(20),
  items: z.array(itemSchema).max(300),
  adjustments: z.array(adjustmentSchema).max(30),
  source: z.enum(["manual", "ocr", "ai", "text", "demo"]),
  rawText: z.string().max(60000),
  warnings: z.array(z.string().max(400)).max(60),
  reviewChecks: z.array(reviewCheckSchema).max(2100).default([]),
});
export type Receipt = z.infer<typeof receiptSchema>;
export const personSchema = z.object({ id, name: z.string().min(1).max(50) });
export type Person = z.infer<typeof personSchema>;
export const appSchema = z
  .object({
    version: z.literal(1),
    receipt: receiptSchema,
    people: z.array(personSchema).max(30),
    splitMode: z.enum(["items", "whole"]),
    wholeAssignment: assignmentSchema,
    reviewedStamp: z.string().max(250000),
    finalizedStamp: z.string().max(250000),
    step: z.enum(["scan", "review", "people", "assign", "summary"]),
  })
  .superRefine((state, ctx) => {
    for (const group of [
      state.receipt.items,
      state.receipt.adjustments,
      state.people,
    ]) {
      if (new Set(group.map((x) => x.id)).size !== group.length)
        ctx.addIssue({
          code: "custom",
          message: "Duplicate internal identifiers.",
        });
    }
  });
export type AppState = z.infer<typeof appSchema>;
export const uid = () => crypto.randomUUID();
export const emptyAssignment = (): Assignment => ({
  mode: "equal",
  participants: [],
  values: {},
});
export function newItem(): Item {
  return {
    id: uid(),
    description: "",
    quantity: "1",
    unitPrice: "",
    lineTotal: "",
    discount: "0",
    taxCode: "",
    packSize: "",
    unitKind: "whole",
    note: "",
    assignment: emptyAssignment(),
  };
}
export function newReceipt(): Receipt {
  return {
    id: uid(),
    merchant: "",
    date: "",
    currency: "GBP",
    currencyUnresolved: false,
    subtotal: "",
    printedTotal: "",
    printedTax: "",
    pricesIncludeTax: true,
    taxMode: "printed",
    taxCodes: [],
    items: [],
    adjustments: [],
    source: "manual",
    rawText: "",
    warnings: [],
    reviewChecks: [],
  };
}
export function newState(): AppState {
  return {
    version: 1,
    receipt: newReceipt(),
    people: [],
    splitMode: "items",
    wholeAssignment: emptyAssignment(),
    reviewedStamp: "",
    finalizedStamp: "",
    step: "scan",
  };
}
export const receiptStamp = (receipt: Receipt) => {
  const {
    currencyUnresolved,
    reviewChecks: _reviewChecks,
    ...fields
  } = receipt;
  return JSON.stringify({
    ...fields,
    // Preserve valid review fingerprints from drafts saved before this flag existed.
    ...(currencyUnresolved ? { currencyUnresolved: true } : {}),
    rawText: "",
    items: receipt.items.map(
      ({
        assignment: _assignment,
        packSize: _packSize,
        unitKind: _unitKind,
        ...financial
      }) => financial,
    ),
  });
};
export const finalStamp = (state: AppState) =>
  JSON.stringify([
    state.receipt,
    state.people,
    state.splitMode,
    state.wholeAssignment,
  ]);
