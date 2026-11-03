import { z } from "zod";
import {
  requestPanelsSchema,
  recognitionSchema,
} from "./recognition-schema.mjs";

export const AZURE_NOTICE = "azure-regional-temporary-storage-v1";
export const azureRequestSchema = z.strictObject({
  consent: z.literal(true),
  privacyNotice: z.literal(AZURE_NOTICE),
  panels: requestPanelsSchema,
});
export const azureStatusSchema = z.object({
  configured: z.boolean(),
  remaining: z.number().int().min(0).max(100),
  maxPanels: z.literal(24),
});
const wordIndex = z.number().int().min(0).max(9999);
export const azureQuantityHintsSchema = z
  .array(
    z.strictObject({
      photo: z.number().int().min(1).max(12),
      part: z.number().int().min(1).max(12),
      quantity: z
        .string()
        .regex(/^[0-9]{1,6}(?:\.[0-9]{1,6})?$/)
        .refine((value) => Number(value) > 0),
      quantityWord: wordIndex,
      descriptionWords: z.array(wordIndex).min(1).max(80),
      priceWords: z.array(wordIndex).min(1).max(8),
    }),
  )
  .max(7200);
export const azureResultSchema = z.object({
  recognition: recognitionSchema.refine(
    (value) =>
      value.engine === "azure-document-intelligence-2024-11-30-receipt-words",
  ),
  quantityHints: azureQuantityHintsSchema.default([]),
  cleanup: z.enum(["provider-reported-success", "unknown"]),
  remaining: z.number().int().min(0).max(100),
});
