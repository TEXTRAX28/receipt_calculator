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
export const azureResultSchema = z.object({
  recognition: recognitionSchema.refine(
    (value) =>
      value.engine === "azure-document-intelligence-2024-11-30-receipt-words",
  ),
  cleanup: z.enum(["provider-reported-success", "unknown"]),
  remaining: z.number().int().min(0).max(100),
});
