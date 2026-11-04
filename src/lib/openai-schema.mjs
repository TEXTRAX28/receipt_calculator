import { z } from "zod";
import { requestPanelsSchema } from "./recognition-schema.mjs";

export const OPENAI_MODEL = "gpt-6-astra";
export const OPENAI_ESTIMATE_GUARD_USD = 0.6;
export const openaiRequestSchema = z.strictObject({
  consent: z.literal(true),
  useCredits: z.literal(true),
  panels: requestPanelsSchema,
});
export const openaiStatusSchema = z.object({
  provider: z.literal("OpenAI"),
  model: z.literal(OPENAI_MODEL),
  configured: z.boolean(),
  remaining: z.number().int().min(0).max(100),
  estimateGuardUsd: z.literal(OPENAI_ESTIMATE_GUARD_USD),
  availability: z.enum([
    "missing-key",
    "missing-allowance",
    "ready",
    "exhausted",
    "storage-unavailable",
  ]),
});
