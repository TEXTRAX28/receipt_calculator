import { z } from "zod";

const requestPanelsSchema = z
  .array(
    z.strictObject({
      photo: z.number().int().min(1).max(12),
      part: z.number().int().min(1).max(12),
      data: z
        .string()
        .min(8)
        .max(6 * 1024 * 1024)
        .regex(/^[A-Za-z0-9+/]+={0,2}$/),
    }),
  )
  .min(1)
  .max(24)
  .refine(
    (panels) =>
      new Set(panels.map((p) => `${p.photo}:${p.part}`)).size === panels.length,
  );

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
