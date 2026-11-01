import {
  aiReceiptSchema,
  aiReceiptJsonSchema,
} from "../src/lib/extraction-schema.mjs";
import {
  DEFAULT_GEMINI_MODEL,
  MAX_AI_BODY_BYTES,
} from "../src/lib/scan-limits.mjs";
import { z } from "zod";
import {
  requestPanelsSchema,
  validateRecognition,
} from "../src/lib/recognition-schema.mjs";
import { LocalOcrError } from "./local-ocr.mjs";
import { VeryfiError } from "./veryfi-reader.mjs";
import { AzureError } from "./azure-reader.mjs";
import { azureRequestSchema } from "../src/lib/azure-schema.mjs";
import { veryfiRequestSchema } from "../src/lib/veryfi-schema.mjs";
import { once } from "node:events";
import {
  LOCAL_VISION_JOB_TIMEOUT_MS,
  planVisionBatches,
} from "../src/lib/vision-plan.mjs";
import { MAX_READING_PANELS } from "../src/lib/scan-limits.mjs";

const requestSchema = z.strictObject({
  consent: z.literal(true),
  panels: requestPanelsSchema,
});
const localRequestSchema = z.strictObject({ panels: requestPanelsSchema });
import { RECEIPT_INSTRUCTIONS } from "./extraction-instructions.mjs";
export { RECEIPT_INSTRUCTIONS };

class ScanError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function extractWithGemini(
  panels,
  { apiKey, model = DEFAULT_GEMINI_MODEL, signal, fetcher = globalThis.fetch },
) {
  const input = [
    {
      type: "text",
      text: "Read these ordered sections as one receipt. Return a draft for human review.",
    },
  ];
  for (const panel of panels) {
    const bytes = Buffer.from(panel.data, "base64");
    if (bytes[0] !== 255 || bytes[1] !== 216 || bytes[2] !== 255)
      throw new ScanError(
        400,
        "A receipt panel is not a valid JPEG. Choose the photos again.",
      );
    input.push({
      type: "text",
      text: `Original photo ${panel.photo}, detail panel ${panel.part}.`,
    });
    input.push({ type: "image", mime_type: "image/jpeg", data: panel.data });
  }
  const response = await fetcher(
    "https://generativelanguage.googleapis.com/v1beta/interactions",
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      signal,
      body: JSON.stringify({
        model,
        store: false,
        system_instruction: RECEIPT_INSTRUCTIONS,
        input,
        response_format: {
          type: "text",
          mime_type: "application/json",
          schema: aiReceiptJsonSchema,
        },
        generation_config: { max_output_tokens: 24000, thinking_level: "low" },
      }),
    },
  );
  if (!response.ok) {
    await response.body?.cancel();
    if ([502, 503, 504].includes(response.status))
      throw new ScanError(
        503,
        "Gemini is busy or temporarily unavailable. Your photos are still available. Try again later, or use the on-device reader. No automatic retry was made.",
      );
    if (response.status === 429)
      throw new ScanError(
        429,
        "Gemini's usage limit was reached. Wait before trying again, or use the on-device reader. No automatic retry was made.",
      );
    if ([401, 403].includes(response.status))
      throw new ScanError(
        502,
        "Gemini could not authenticate. Check the server's API key and project access.",
      );
    throw new ScanError(
      502,
      "Gemini could not read this receipt. Check the configured model and try again, or use the on-device reader.",
    );
  }
  // Bound model responses before JSON parsing, independently of upstream promises.
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 1024 * 1024)
      throw new ScanError(
        502,
        "Gemini returned too much data. Use fewer photos.",
      );
    chunks.push(chunk);
  }
  const result = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (result.status !== "completed")
    throw new ScanError(
      502,
      "Gemini did not finish reading the whole receipt. Your photos are still available; try fewer sections or enter missing rows manually.",
    );
  // REST returns steps; output_text is an SDK convenience, not a REST field.
  // Never parse thoughts, user echoes or tool results as the financial draft.
  const text = Array.isArray(result.steps)
    ? result.steps
        .filter((step) => step.type === "model_output")
        .flatMap((step) => step.content || [])
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("")
    : typeof result.output_text === "string"
      ? result.output_text
      : (result.outputs || [])
          .filter((part) => part.type === "text")
          .map((part) => part.text)
          .join("");
  if (!text)
    throw new ScanError(
      502,
      "Gemini returned no receipt draft. Your photos are still available; try again later or enter the receipt manually.",
    );
  const draft = aiReceiptSchema.parse(JSON.parse(text));
  const suppliedPhotos = new Set(panels.map((panel) => panel.photo));
  if (
    draft.items.some((item) =>
      item.sourcePhotos.some((photo) => !suppliedPhotos.has(photo)),
    )
  )
    throw new ScanError(
      502,
      "Gemini returned an invalid photo reference. Review using the on-device reader or try again.",
    );
  return draft;
}

/** Local-only adapter. No credentials, receipt text or image data are logged or saved.
 * @param {{apiKey?: string, model?: string, fetcher?: typeof fetch, timeoutMs?: number, visionTimeoutMs?: number, visionJobTimeoutMs?: number, localReader?: {configured: boolean, name: string, release?: () => Promise<void>, extract: (panels: unknown[], options: {signal: AbortSignal}) => Promise<unknown>}, localVision?: {configured: boolean, name: string, maxPanels: number, extract: (panels: unknown[], options: {signal: AbortSignal}) => Promise<unknown>}, veryfiReader?: ReturnType<typeof import("./veryfi-reader.mjs").createVeryfiReader>, azureReader?: ReturnType<typeof import("./azure-reader.mjs").createAzureReader>}} [options]
 */
export function createReceiptApi({
  apiKey = "",
  model = DEFAULT_GEMINI_MODEL,
  fetcher = globalThis.fetch,
  timeoutMs = 120000,
  visionTimeoutMs = timeoutMs,
  visionJobTimeoutMs = LOCAL_VISION_JOB_TIMEOUT_MS,
  localReader,
  localVision,
  veryfiReader,
  azureReader,
} = {}) {
  let active = false;
  let attempts = [];
  return async (req, res, next) => {
    const pathname = (req.url || "").split("?")[0];
    if (!pathname.startsWith("/api/receipts/")) return next();
    let streaming = false;
    const send = (status, data) => {
      if (res.destroyed || res.writableEnded) return;
      if (streaming) {
        res.end(
          JSON.stringify({
            type: "error",
            error: String(
              data.error || "The long receipt could not finish.",
            ).slice(0, 500),
          }) + "\n",
        );
        return;
      }
      res.writeHead(status, {
        "content-type": "application/json",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      });
      res.end(JSON.stringify(data));
    };
    // A preview is not a publicly authenticated API. Keep this adapter loopback-only.
    const address = req.socket.remoteAddress;
    if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(address))
      return send(403, {
        error:
          "The AI reader is available only on this computer's local preview.",
      });
    const host = req.headers.host || "";
    if (!/^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host))
      return send(403, { error: "Unrecognized local host." });
    if (
      req.headers.origin &&
      req.headers.origin !== `http://${host}` &&
      req.headers.origin !== `https://${host}`
    )
      return send(403, {
        error: "The receipt request must come from Gather on this computer.",
      });
    if (pathname === "/api/receipts/config" && req.method === "GET")
      return send(200, { configured: !!apiKey, provider: "Gemini", model });
    if (pathname === "/api/receipts/providers" && req.method === "GET")
      return send(200, {
        localModel: {
          configured: !!localReader?.configured,
          name: localReader?.name || "PaddleOCR",
        },
        localVision: {
          configured: !!localVision?.configured,
          name: localVision?.name || "Qwen3-VL 4B",
          maxPanels: localVision?.maxPanels || 3,
          maxReceiptPanels: MAX_READING_PANELS,
          supportsBatches: true,
        },
        ...(veryfiReader ? { veryfi: await veryfiReader.getStatus() } : {}),
        ...(azureReader ? { azure: await azureReader.getStatus() } : {}),
      });
    const isVeryfi = pathname === "/api/receipts/veryfi";
    const isAzure = pathname === "/api/receipts/azure";
    const isBatchedVision = pathname === "/api/receipts/vision-batches";
    const isVision = isBatchedVision || pathname === "/api/receipts/vision";
    const isLocal = isVision || pathname === "/api/receipts/recognize";
    if (
      (!isLocal &&
        !isVeryfi &&
        !isAzure &&
        pathname !== "/api/receipts/extract") ||
      req.method !== "POST"
    )
      return send(404, { error: "Receipt endpoint not found." });
    if (isVision && !localVision?.configured)
      return send(503, {
        error:
          "Local vision is not installed or enabled on this computer. Choose another receipt reader.",
      });
    if (isLocal && !isVision && !localReader?.configured)
      return send(503, {
        error:
          "The computer's receipt model is not installed or configured. You can still use the on-device reader.",
      });
    if (isVeryfi && !veryfiReader?.configured)
      return send(503, {
        error:
          "Veryfi is not enabled with a document allowance on this server.",
      });
    if (isAzure && !azureReader?.configured)
      return send(503, {
        error: "Azure is not enabled with a section allowance on this server.",
      });
    if (!isLocal && !isVeryfi && !isAzure && !apiKey)
      return send(503, {
        error:
          "Gemini is not connected yet. Add GEMINI_API_KEY to .env.local on this computer and restart Gather. You can still use the on-device reader.",
      });
    if (
      req.headers["x-gather-request"] !== "receipt-scan" ||
      !/^application\/json(?:;|$)/.test(req.headers["content-type"] || "")
    )
      return send(415, {
        error: "Use Gather's receipt scanner to send these photos.",
      });
    if (Number(req.headers["content-length"]) > MAX_AI_BODY_BYTES)
      return send(413, {
        error:
          "These photos are too large together. Crop them or choose fewer sections.",
      });
    const abort = new AbortController();
    const disconnected = () => abort.abort();
    req.on("aborted", disconnected);
    res.on("close", disconnected);
    let deadline = setTimeout(() => {
      abort.abort();
      // A stalled request body must not hold a local connection open indefinitely.
      if (!req.complete) req.destroy();
    }, timeoutMs);
    let ownsActive = false;
    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > MAX_AI_BODY_BYTES)
          throw new ScanError(
            413,
            "These photos are too large together. Crop them or choose fewer sections.",
          );
        chunks.push(chunk);
      }
      let body;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        throw new ScanError(
          400,
          "The receipt request is not valid JSON. Choose the photos again.",
        );
      }
      const parsed = (
        isAzure
          ? azureRequestSchema
          : isVeryfi
            ? veryfiRequestSchema
            : isLocal
              ? localRequestSchema
              : requestSchema
      ).safeParse(body);
      if (!parsed.success)
        throw new ScanError(
          400,
          isAzure
            ? "Confirm sending these receipt sections to Azure after reviewing its data-use notice."
            : isVeryfi
              ? "Confirm sending these receipt sections to Veryfi after reviewing its data-use notice."
              : isLocal
                ? "The receipt request is incomplete or invalid. Choose the photos again."
                : "The receipt request is incomplete or invalid. Choose the photos again and confirm sending them to Gemini.",
        );
      attempts = attempts.filter((time) => Date.now() - time < 3600000);
      if (
        active ||
        attempts.length >= 10 ||
        attempts.filter((time) => Date.now() - time < 60000).length >= 2
      )
        throw new ScanError(
          429,
          "Please wait before another scan. This local preview allows one scan at a time, two per minute and ten per hour. You can use the on-device reader meanwhile.",
        );
      active = true;
      ownsActive = true;
      attempts.push(Date.now());
      if (isAzure) {
        clearTimeout(deadline);
        deadline = setTimeout(() => abort.abort(), 180000);
        return send(
          200,
          await azureReader.extract(parsed.data.panels, {
            signal: abort.signal,
          }),
        );
      }
      if (isVeryfi) {
        const result = await veryfiReader.extract(parsed.data.panels, {
          signal: abort.signal,
        });
        return send(200, result);
      }
      if (isVision) {
        clearTimeout(deadline);
        deadline = setTimeout(
          () => abort.abort(),
          isBatchedVision ? visionJobTimeoutMs : visionTimeoutMs,
        );
      }
      if (isVision) {
        // Release the idle CPU model before loading the GPU vision model on this host.
        await localReader?.release?.();
        if (isBatchedVision) {
          const sections = parsed.data.panels;
          const plan = planVisionBatches(sections.length);
          let sentBytes = 0;
          const event = async (value) => {
            if (abort.signal.aborted)
              throw new ScanError(
                504,
                "Long receipt reading was cancelled or timed out.",
              );
            const line = JSON.stringify(value) + "\n";
            sentBytes += Buffer.byteLength(line);
            if (sentBytes > 1024 * 1024)
              throw new ScanError(
                502,
                "The long receipt returned too much data. Choose fewer sections.",
              );
            if (!res.write(line))
              await once(res, "drain", { signal: abort.signal });
          };
          res.writeHead(200, {
            "content-type": "application/x-ndjson",
            "cache-control": "no-store",
            "x-content-type-options": "nosniff",
          });
          streaming = true;
          await event({
            type: "start",
            batches: plan.length,
            sections: sections.length,
          });
          for (const [index, indices] of plan.entries()) {
            await event({ type: "reading", index: index + 1, indices });
            const inputs = indices.map((i) => sections[i]);
            const draft = aiReceiptSchema.parse(
              await localVision.extract(inputs, { signal: abort.signal }),
            );
            const supplied = new Set(inputs.map((panel) => panel.photo));
            if (
              draft.items.some((item) =>
                item.sourcePhotos.some((photo) => !supplied.has(photo)),
              )
            )
              throw new ScanError(
                502,
                "Local vision returned an invalid photo reference. The whole receipt remains unverified.",
              );
            await event({
              type: "batch",
              index: index + 1,
              indices,
              receipt: draft,
            });
          }
          await event({ type: "done", batches: plan.length });
          res.end();
          return;
        }
        const draft = aiReceiptSchema.parse(
          await localVision.extract(parsed.data.panels, {
            signal: abort.signal,
          }),
        );
        const supplied = new Set(
          parsed.data.panels.map((panel) => panel.photo),
        );
        if (
          draft.items.some((item) =>
            item.sourcePhotos.some((photo) => !supplied.has(photo)),
          )
        )
          throw new ScanError(
            502,
            "Local vision returned an invalid photo reference. Your photos are still available; choose another reader or try again.",
          );
        return send(200, { receipt: draft });
      }
      if (isLocal) {
        const recognition = validateRecognition(
          await localReader.extract(parsed.data.panels, {
            signal: abort.signal,
          }),
          parsed.data.panels,
        );
        return send(200, { recognition });
      }
      const draft = await extractWithGemini(parsed.data.panels, {
        apiKey,
        model,
        signal: abort.signal,
        fetcher,
      });
      send(200, { receipt: draft });
    } catch (error) {
      if (error instanceof VeryfiError || error instanceof AzureError)
        send(error.status, { error: error.message, cleanup: error.cleanup });
      else if (abort.signal.aborted)
        send(504, {
          error: isAzure
            ? "Azure reading was cancelled or took too long. Uploaded sections can use the allowance; deletion may be unconfirmed."
            : isVeryfi
              ? "The Veryfi scan was cancelled or took too long. It may have reached the provider; its allowance remains reserved. Cleanup may be unconfirmed."
              : isBatchedVision
                ? "The long receipt was cancelled or took too long. Your photos are still available; no partial result was accepted."
                : isVision
                  ? "The local vision scan was cancelled or timed out. Your photos are still available."
                  : "The scan was cancelled or took longer than two minutes. Your photos are still available.",
        });
      else if (error instanceof ScanError || error instanceof LocalOcrError)
        send(error.status, { error: error.message });
      else
        send(502, {
          error: isAzure
            ? "Azure could not finish this receipt. Your photos are still available; no automatic retry was made."
            : isVeryfi
              ? "Veryfi could not finish this receipt. Your photos are still available; no automatic retry was made."
              : isVision
                ? "Local vision could not return a complete receipt draft. Your photos are still available; choose another reader or try again."
                : isLocal
                  ? "The computer reader could not return valid receipt evidence. Try clearer photos or use the on-device reader."
                  : "Gemini could not return a complete receipt draft. Try clearer photos or use the on-device reader. No items were invented.",
        });
    } finally {
      if (ownsActive) active = false;
      clearTimeout(deadline);
      req.off("aborted", disconnected);
      res.off("close", disconnected);
    }
  };
}
