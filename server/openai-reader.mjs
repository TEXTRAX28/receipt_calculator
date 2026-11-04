import { randomUUID } from "node:crypto";
import {
  aiReceiptJsonSchema,
  aiReceiptSchema,
} from "../src/lib/extraction-schema.mjs";
import { requestPanelsSchema } from "../src/lib/recognition-schema.mjs";
import { MAX_AI_BODY_BYTES } from "../src/lib/scan-limits.mjs";
import {
  OPENAI_MODEL,
  OPENAI_ESTIMATE_GUARD_USD,
} from "../src/lib/openai-schema.mjs";
import { RECEIPT_INSTRUCTIONS } from "./extraction-instructions.mjs";
import { createDocumentAllowance } from "./document-allowance.mjs";
import { validatePreparedJpeg } from "./receipt-zip.mjs";

export const OPENAI_ENDPOINT = "https://api.openai.com/v1/responses";
export class OpenAiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const invalid = () =>
  new OpenAiError(
    502,
    "OpenAI did not return a complete valid receipt draft. Your photos are still available; no automatic retry was made.",
  );

export function prepareOpenAiRequest(input) {
  const panels = requestPanelsSchema.parse(input),
    dimensions = [];
  const content = panels.flatMap((panel) => {
    dimensions.push(validatePreparedJpeg(Buffer.from(panel.data, "base64")));
    return [
      {
        type: "input_text",
        text: `Photograph ${panel.photo}, panel ${panel.part}.`,
      },
      {
        type: "input_image",
        image_url: "data:image/jpeg;base64," + panel.data,
        detail: "original",
      },
    ];
  });
  const body = {
    model: OPENAI_MODEL,
    instructions: RECEIPT_INSTRUCTIONS,
    input: [{ role: "user", content }],
    text: {
      format: {
        type: "json_schema",
        name: "receipt",
        strict: true,
        schema: aiReceiptJsonSchema,
      },
    },
    reasoning: { effort: "medium" },
    max_output_tokens: 6000,
    store: false,
    stream: false,
    background: false,
    service_tier: "default",
    tools: [],
  };
  // No image-byte clone: estimate prompt overhead separately from JPEG patches.
  const withoutImages = {
    ...body,
    input: [
      {
        role: "user",
        content: content.map((part) =>
          part.type === "input_image"
            ? { ...part, image_url: "[image bytes counted separately]" }
            : part,
        ),
      },
    ],
  };
  const imageTokens = dimensions.reduce((sum, { width, height }) => {
    const patches = Math.ceil(width / 32) * Math.ceil(height / 32);
    if (width > 65535 || height > 65535 || patches > 30000)
      throw new OpenAiError(
        400,
        "A receipt section is too large for this OpenAI setting. Crop it or choose another reader.",
      );
    return sum + Math.ceil(patches * 1.2);
  }, 0);
  const assumedInput =
    Buffer.byteLength(JSON.stringify(withoutImages)) + 2048 + imageTokens;
  // Doubled listed cache-write input rate, plus the full output ceiling.
  // An intentionally conservative estimate; never an account spending cap.
  const estimateUsd =
    (assumedInput * 25 + body.max_output_tokens * 50) / 1_000_000;
  if (estimateUsd > OPENAI_ESTIMATE_GUARD_USD)
    throw new OpenAiError(
      413,
      "These sections exceed this reader's $0.60 estimate guard. Choose fewer sections or another reader. No OpenAI request was sent.",
    );
  const serialized = JSON.stringify(body);
  if (Buffer.byteLength(serialized) > MAX_AI_BODY_BYTES)
    throw new OpenAiError(
      413,
      "These receipt sections are too large together. Choose fewer sections or another reader.",
    );
  return {
    serialized,
    estimateUsd,
    photos: new Set(panels.map((panel) => panel.photo)),
  };
}

async function limitedText(response, signal) {
  const declared = response.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > 1048576)) {
    void response.body?.cancel().catch(() => {});
    throw invalid();
  }
  const reader = response.body?.getReader();
  if (!reader) throw invalid();
  const cancel = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener("abort", cancel, { once: true });
  const chunks = [];
  let size = 0;
  try {
    signal.throwIfAborted();
    for (;;) {
      const { value, done } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      size += value.byteLength;
      if (size > 1048576) {
        void reader.cancel().catch(() => {});
        throw invalid();
      }
      chunks.push(value);
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(
      Buffer.concat(chunks, size),
    );
  } finally {
    signal.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
}

function decode(data, photos, key) {
  if (
    data.status !== "completed" ||
    !/^gpt-6-astra(?:[-.][a-zA-Z0-9.-]+)?$/.test(data.model || "") ||
    !Array.isArray(data.output)
  )
    throw invalid();
  const texts = [];
  for (const output of data.output) {
    if (output.type === "reasoning") continue;
    if (
      output.type !== "message" ||
      output.role !== "assistant" ||
      !Array.isArray(output.content)
    )
      throw invalid();
    for (const part of output.content) {
      if (part.type !== "output_text" || typeof part.text !== "string")
        throw invalid();
      texts.push(part.text);
    }
  }
  if (texts.length !== 1) throw invalid();
  // Redact decoded strings too, so Unicode escapes cannot reflect a credential.
  const draft = JSON.parse(texts[0], (_, value) =>
    typeof value === "string" ? value.replaceAll(key, "[REDACTED]") : value,
  );
  const parsed = aiReceiptSchema.safeParse(draft);
  if (
    !parsed.success ||
    parsed.data.items.some((item) =>
      item.sourcePhotos.some((photo) => !photos.has(photo)),
    )
  )
    throw invalid();
  return parsed.data; // Literal financial fields remain unchanged.
}

export function createOpenAiReader({
  apiKey = "",
  directory = "",
  grant = "",
  limit = 0,
  fetcher = globalThis.fetch,
  timeoutMs = 90000,
} = {}) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 90000)
    throw new TypeError("Invalid OpenAI timeout");
  const allowance = createDocumentAllowance({
    directory,
    grant,
    limit,
    account: "openai",
  });
  const keyConfigured = /^sk-[A-Za-z0-9_-]{20,500}$/.test(apiKey);
  let active = false;
  async function getStatus() {
    const base = {
      provider: "OpenAI",
      model: OPENAI_MODEL,
      configured: false,
      remaining: 0,
      estimateGuardUsd: OPENAI_ESTIMATE_GUARD_USD,
    };
    if (!keyConfigured) return { ...base, availability: "missing-key" };
    if (!allowance.configured)
      return { ...base, availability: "missing-allowance" };
    try {
      const remaining = await allowance.remaining();
      return {
        ...base,
        remaining,
        configured: remaining > 0,
        availability: remaining ? "ready" : "exhausted",
      };
    } catch {
      return { ...base, availability: "storage-unavailable" };
    }
  }
  return {
    configured: keyConfigured && allowance.configured,
    getStatus,
    async extract(panels, { signal } = {}) {
      if (!keyConfigured || !allowance.configured)
        throw new OpenAiError(
          503,
          "OpenAI needs a server key and an explicit finite attempt allowance before scanning.",
        );
      if (active)
        throw new OpenAiError(
          429,
          "An OpenAI scan is already running. Wait for it to finish.",
        );
      let prepared;
      try {
        prepared = prepareOpenAiRequest(panels);
      } catch (error) {
        if (error instanceof OpenAiError) throw error;
        throw new OpenAiError(
          400,
          "The receipt sections are incomplete or invalid. Choose the photos again.",
        );
      }
      signal?.throwIfAborted();
      active = true;
      const timeout = AbortSignal.timeout(timeoutMs);
      const abort = signal ? AbortSignal.any([signal, timeout]) : timeout;
      let reservation;
      try {
        try {
          reservation = await allowance.reserve(randomUUID());
        } catch (error) {
          throw new OpenAiError(
            error.message === "Receipt allowance is exhausted" ? 429 : 503,
            "OpenAI's local attempt allowance is unavailable or used up. No request was sent.",
          );
        }
        abort.throwIfAborted();
        const response = await fetcher(OPENAI_ENDPOINT, {
          method: "POST",
          redirect: "error",
          signal: abort,
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: prepared.serialized,
        });
        const raw = await limitedText(response, abort);
        if (!response.ok)
          throw new OpenAiError(
            response.status === 429 ? 429 : 502,
            "OpenAI could not read this receipt. The attempt remains used and may have used API credits. Your photos are still available; no automatic retry was made.",
          );
        const receipt = decode(
          JSON.parse(raw.replaceAll(apiKey, "[REDACTED]")),
          prepared.photos,
          apiKey,
        );
        abort.throwIfAborted();
        await reservation.finish("completed", "unknown").catch(() => {});
        return { receipt };
      } catch (error) {
        await reservation
          ?.finish(abort.aborted ? "cancelled" : "failed", "unknown")
          .catch(() => {});
        if (error instanceof OpenAiError) throw error;
        if (abort.aborted)
          throw new OpenAiError(
            504,
            "The OpenAI scan was cancelled or timed out. An attempt that reached the provider may still use API credits. No automatic retry was made.",
          );
        throw invalid();
      } finally {
        active = false;
      }
    },
  };
}
