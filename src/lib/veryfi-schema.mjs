import { z } from "zod";
import { requestPanelsSchema } from "./recognition-schema.mjs";

export const VERYFI_NOTICE = "veryfi-us-training-v1";
export const veryfiRequestSchema = z.strictObject({
  consent: z.literal(true),
  privacyNotice: z.literal(VERYFI_NOTICE),
  panels: requestPanelsSchema.refine((panels) => panels.length <= 15),
});
export const veryfiStatusSchema = z.object({
  configured: z.boolean(),
  remaining: z.number().int().min(0).max(100),
  maxPanels: z.literal(15),
});
export const veryfiResultSchema = z.object({
  text: z.string().min(1).max(60000),
  cleanup: z.enum(["provider-reported-success", "unknown"]),
  remaining: z.number().int().min(0).max(100),
});
