import { z } from "zod";
import { aiReceiptJsonSchema } from "./extraction-schema.mjs";

// Explicit user currency for parsing and review. It never enters model prompts
// or changes returned canonical amounts. Receipt text cannot supply this choice.
export const readingContextSchema = z.strictObject({
  currency: z.enum(
    aiReceiptJsonSchema.properties.currency.enum.filter(Boolean),
  ),
});

/** @typedef {{currency: import('./model').Currency}} ReadingContext */
