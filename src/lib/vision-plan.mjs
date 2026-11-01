import { z } from "zod";
import { aiReceiptSchema } from "./extraction-schema.mjs";
import { MAX_LOCAL_VISION_PANELS, MAX_READING_PANELS } from "./scan-limits.mjs";

export const LOCAL_VISION_JOB_TIMEOUT_MS = 900000;
export const LOCAL_VISION_TIMEOUT_MS = 200000;
export const LOCAL_VISION_MODEL_TIMEOUT_MS = 180000;
// Retain the exports used by the frozen multi-photo research runners.
export const LOCAL_VISION_MULTI_PHOTO_TIMEOUT_MS = LOCAL_VISION_TIMEOUT_MS;
export const LOCAL_VISION_MULTI_PHOTO_MODEL_TIMEOUT_MS =
  LOCAL_VISION_MODEL_TIMEOUT_MS;
export function hasMultipleSourcePhotos(panels) {
  return new Set(panels.map((panel) => panel.photo)).size > 1;
}
export const MAX_VISION_BATCHES = Math.ceil(
  MAX_READING_PANELS / (MAX_LOCAL_VISION_PANELS - 1),
);
/** Repeat one full input section as context; never shorten, reorder or omit an input. */
export function planVisionBatches(count) {
  if (!Number.isInteger(count) || count < 1 || count > MAX_READING_PANELS)
    throw new Error("Invalid receipt section count");
  const batches = [];
  for (let start = 0; start < count; start += MAX_LOCAL_VISION_PANELS - 1) {
    batches.push(
      Array.from(
        { length: Math.min(MAX_LOCAL_VISION_PANELS, count - start) },
        (_, index) => start + index,
      ),
    );
    if (start + MAX_LOCAL_VISION_PANELS >= count) break;
  }
  return batches;
}
const ordinal = z.number().int().min(1).max(MAX_VISION_BATCHES);
const indices = z
  .array(
    z
      .number()
      .int()
      .min(0)
      .max(MAX_READING_PANELS - 1),
  )
  .min(1)
  .max(MAX_LOCAL_VISION_PANELS);
export const visionEventSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("start"),
    batches: ordinal,
    sections: z.number().int().min(1).max(MAX_READING_PANELS),
  }),
  z.strictObject({ type: z.literal("reading"), index: ordinal, indices }),
  z.strictObject({
    type: z.literal("batch"),
    index: ordinal,
    indices,
    receipt: aiReceiptSchema,
  }),
  z.strictObject({ type: z.literal("done"), batches: ordinal }),
  z.strictObject({ type: z.literal("error"), error: z.string().max(500) }),
]);
