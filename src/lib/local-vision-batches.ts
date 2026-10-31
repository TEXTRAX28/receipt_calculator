import type { z } from "zod";
import type { aiReceiptSchema } from "./extraction-schema.mjs";
import type { ReadingPanel } from "./panel-transport";
import { MAX_AI_BODY_BYTES } from "./scan-limits.mjs";
import {
  LOCAL_VISION_JOB_TIMEOUT_MS,
  planVisionBatches,
  visionEventSchema,
} from "./vision-plan.mjs";

export type VisionBatch = {
  indices: number[];
  receipt: z.infer<typeof aiReceiptSchema>;
};

/** A complete, ordered stream is required. A prefix is never a receipt. */
export async function extractLocalVisionBatches(
  panels: ReadingPanel[],
  signal: AbortSignal,
  progress: (message: string) => void,
): Promise<VisionBatch[]> {
  const plan = planVisionBatches(panels.length);
  const body = JSON.stringify({ panels });
  if (body.length > MAX_AI_BODY_BYTES)
    throw new Error(
      "These photos are too large together. Crop them or choose fewer sections.",
    );
  const owned = new AbortController();
  const deadline = AbortSignal.timeout(LOCAL_VISION_JOB_TIMEOUT_MS + 5000);
  const combined = AbortSignal.any([signal, owned.signal, deadline]);
  const results: VisionBatch[] = [];
  let started = false,
    done = false,
    reading = -1,
    succeeded = false;
  try {
    const response = await fetch("./api/receipts/vision-batches", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-gather-request": "receipt-scan",
      },
      body,
      signal: combined,
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(
        typeof error.error === "string"
          ? error.error.slice(0, 500)
          : "The long receipt reader is unavailable.",
      );
    }
    if (
      !response.headers
        .get("content-type")
        ?.startsWith("application/x-ndjson") ||
      !response.body
    )
      throw new Error("The long receipt reader returned an invalid response.");
    const reader = response.body.getReader(),
      decoder = new TextDecoder("utf-8", { fatal: true });
    let pending = "",
      bytes = 0;
    const accept = (line: string) => {
      if (!line.trim()) return;
      if (done)
        throw new Error("Unexpected data after the long receipt completed.");
      const event = visionEventSchema.parse(JSON.parse(line));
      if (event.type === "error") throw new Error(event.error);
      if (event.type === "start") {
        if (
          started ||
          event.batches !== plan.length ||
          event.sections !== panels.length
        )
          throw new Error("The long receipt section plan did not match.");
        started = true;
        return;
      }
      if (!started)
        throw new Error("The long receipt started without a section plan.");
      if (event.type === "done") {
        if (
          event.batches !== plan.length ||
          results.length !== plan.length ||
          reading !== -1
        )
          throw new Error("Not every receipt section was read.");
        done = true;
        return;
      }
      const expected = plan[results.length];
      if (
        event.index !== results.length + 1 ||
        JSON.stringify(event.indices) !== JSON.stringify(expected)
      )
        throw new Error(
          "Receipt sections were omitted, repeated or reordered.",
        );
      if (event.type === "reading") {
        if (reading !== -1)
          throw new Error("A receipt section was started twice.");
        reading = results.length;
        progress(
          `Reading receipt sections ${expected[0] + 1}–${expected.at(-1)! + 1} of ${panels.length} (${event.index} of ${plan.length})…`,
        );
      } else {
        if (reading !== results.length)
          throw new Error("A receipt section returned without starting.");
        const photos = new Set(expected.map((index) => panels[index].photo));
        if (
          event.receipt.items.some((item) =>
            item.sourcePhotos.some((photo) => !photos.has(photo)),
          )
        )
          throw new Error(
            "A receipt section referred to an image it did not read.",
          );
        results.push({ indices: expected, receipt: event.receipt });
        reading = -1;
      }
    };
    while (true) {
      const { value, done: ended } = await reader.read();
      if (ended) break;
      bytes += value.length;
      if (bytes > 1024 * 1024)
        throw new Error("The long receipt returned too much data.");
      pending += decoder.decode(value, { stream: true });
      let newline: number;
      while ((newline = pending.indexOf("\n")) >= 0) {
        accept(pending.slice(0, newline));
        pending = pending.slice(newline + 1);
      }
    }
    pending += decoder.decode();
    if (pending.trim()) accept(pending);
    if (!done)
      throw new Error(
        "The long receipt stopped before every section completed. No partial vision draft was accepted.",
      );
    succeeded = true;
    return results;
  } catch (error) {
    if (signal.aborted)
      throw new Error("Scan cancelled. Your photos are still available.");
    if (deadline.aborted)
      throw new Error(
        "The long receipt took too long. Your photos are still available; no partial vision draft was accepted.",
      );
    throw error;
  } finally {
    if (!succeeded) owned.abort();
  }
}
