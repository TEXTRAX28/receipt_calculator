import { z } from "zod";
export const requestPanelsSchema = z
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

const box = z
  .tuple([
    z.number().min(0).max(1),
    z.number().min(0).max(1),
    z.number().min(0).max(1),
    z.number().min(0).max(1),
  ])
  .refine(([x0, y0, x1, y1]) => x0 < x1 && y0 < y1);
const region = z.strictObject({
  text: z.string().max(2000),
  confidence: z.number().min(0).max(1),
  box,
});
export const recognitionSchema = z.strictObject({
  engine: z.enum([
    "paddle-ppocrv6-medium-onnx",
    "doctr-db-resnet50-parseq-cpu",
    "azure-document-intelligence-2024-11-30-receipt-words",
  ]),
  panels: z
    .array(
      z
        .strictObject({
          photo: z.number().int().min(1).max(12),
          part: z.number().int().min(1).max(12),
          width: z.number().int().min(8).max(4000),
          height: z.number().int().min(8).max(4000),
          words: z.array(region).max(10000),
          lines: z.array(region).max(2000),
        })
        .refine((panel) => panel.width * panel.height <= 4_000_000),
    )
    .min(1)
    .max(24),
});

export function validateRecognition(output, suppliedPanels) {
  const result = recognitionSchema.parse(output);
  const key = (p) => `${p.photo}:${p.part}`;
  const supplied = new Set(suppliedPanels.map(key));
  const returned = new Set(result.panels.map(key));
  if (
    result.panels.length !== suppliedPanels.length ||
    returned.size !== suppliedPanels.length ||
    [...returned].some((value) => !supplied.has(value))
  )
    throw new Error("Receipt evidence refers to missing or repeated sections");
  return result;
}
