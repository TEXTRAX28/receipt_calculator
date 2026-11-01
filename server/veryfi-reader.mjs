import { randomUUID } from "node:crypto";
import { requestPanelsSchema } from "../src/lib/recognition-schema.mjs";
import { MAX_AI_BODY_BYTES } from "../src/lib/scan-limits.mjs";
export { VERYFI_NOTICE } from "../src/lib/veryfi-schema.mjs";
import { createDocumentAllowance } from "./document-allowance.mjs";
import { validatePreparedJpeg, zipReceiptSections } from "./receipt-zip.mjs";

export const VERYFI_ENDPOINT =
  "https://api.veryfi.com/api/v8/partner/documents";
export const VERYFI_OPTIONS = Object.freeze({
  compute: false,
  bounding_boxes: true,
  confidence_details: true,
});

export class VeryfiError extends Error {
  constructor(status, message, cleanup = "unknown") {
    super(message);
    this.status = status;
    this.cleanup = cleanup;
  }
}

async function responseObject(response) {
  if (
    !response.body ||
    Number(response.headers.get("content-length")) > 2_000_000
  )
    throw new Error("Response bound");
  const reader = response.body.getReader(),
    chunks = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2_000_000) throw new Error("Response bound");
      chunks.push(Buffer.from(value));
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const raw = Buffer.concat(chunks);
  const text = new TextDecoder("utf-8", { fatal: true }).decode(raw);
  // Reject ambiguous root metadata before considering deletion. Quoted OCR
  // content stays inert, including escaped quotes/braces or embedded commands.
  const keys = new Set();
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      const start = i++;
      while (i < text.length) {
        if (text[i] === "\\") i += 2;
        else if (text[i] === '"') break;
        else i++;
      }
      let next = i + 1;
      while (/\s/.test(text[next] || "x")) next++;
      if (depth === 1 && text[next] === ":") {
        const key = JSON.parse(text.slice(start, i + 1));
        if (keys.has(key)) throw new Error("Duplicate metadata");
        keys.add(key);
      }
    } else if (char === "{" || char === "[") depth++;
    else if (char === "}" || char === "]") depth--;
  }
  const object = JSON.parse(text, (key, value, context) => {
    // Never round a document identity through a JS binary float.
    if (key === "id" && typeof value === "number") {
      if (!context?.source)
        throw new Error("Exact document identity unavailable");
      return context.source;
    }
    return value;
  });
  return { object, raw };
}

/** Opt-in local-preview provider. Construction/status never contact Veryfi.
 * The operator must grant a finite persistent allowance before any scan.
 */
export function createVeryfiReader({
  clientId = "",
  bearerKey = "",
  directory = "",
  grant = "",
  limit = 0,
  fetcher = globalThis.fetch,
  cleanupTimeoutMs = 10000,
} = {}) {
  const credentialsReady =
    /^[A-Za-z0-9_-]{8,200}$/.test(clientId) &&
    /^[A-Za-z0-9_.-]{20,256}$/.test(bearerKey);
  const allowance = createDocumentAllowance({
    directory,
    account: clientId,
    grant,
    limit,
  });
  const configured = credentialsReady && allowance.configured;
  const headers = {
    "CLIENT-ID": clientId,
    Authorization: `Bearer ${bearerKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  async function getStatus() {
    if (!configured) return { configured: false, remaining: 0, maxPanels: 15 };
    try {
      const remaining = await allowance.remaining();
      return { configured: remaining > 0, remaining, maxPanels: 15 };
    } catch {
      return { configured: false, remaining: 0, maxPanels: 15 };
    }
  }
  async function extract(input, { signal }) {
    if (!configured)
      throw new VeryfiError(
        503,
        "Veryfi needs a server connection and an explicit document allowance.",
        "not-created",
      );
    signal.throwIfAborted();
    let sections;
    try {
      const panels = requestPanelsSchema.parse(input);
      if (panels.length > 15) throw new Error("Section limit");
      sections = panels.map((panel) => {
        const bytes = Buffer.from(panel.data, "base64");
        if (bytes.toString("base64") !== panel.data)
          throw new Error("Invalid encoding");
        validatePreparedJpeg(bytes);
        return bytes;
      });
    } catch {
      throw new VeryfiError(
        400,
        "Veryfi accepts up to 15 prepared receipt sections. Choose the photos again or use another reader.",
        "not-created",
      );
    }
    const externalId = "gather-" + randomUUID();
    const idempotencyKey = randomUUID();
    const body = JSON.stringify({
      file_name: "receipt.zip",
      file_data: zipReceiptSections(sections).toString("base64"),
      external_id: externalId,
      ...VERYFI_OPTIONS,
    });
    if (Buffer.byteLength(body) > MAX_AI_BODY_BYTES)
      throw new VeryfiError(
        413,
        "These receipt sections are too large together. Crop them or choose fewer photos.",
        "not-created",
      );
    let slot;
    try {
      slot = await allowance.reserve(externalId);
    } catch (error) {
      throw new VeryfiError(
        error.message.includes("exhausted") ? 429 : 503,
        error.message.includes("exhausted")
          ? "The configured Veryfi allowance has been used. Choose another reader or ask the app owner to review the allowance."
          : "Veryfi allowance storage is unavailable. No cloud request was made.",
        "not-created",
      );
    }
    let problem = null,
      resultText = null,
      documentId = null,
      cleanup = "not-created";
    try {
      signal.throwIfAborted();
      cleanup = "unknown";
      const response = await fetcher(VERYFI_ENDPOINT, {
        method: "POST",
        headers: { ...headers, "Idempotency-Key": idempotencyKey },
        body,
        signal,
        redirect: "error",
      });
      if (
        response.status !== 201 ||
        !/^application\/json\b/i.test(
          response.headers.get("content-type") || "",
        )
      ) {
        void response.body?.cancel().catch(() => {});
        throw new VeryfiError(
          response.status === 429 ? 429 : 502,
          response.status === 429
            ? "Veryfi's usage limit was reached. No automatic retry was made."
            : "Veryfi could not finish this receipt. Your photos are still available; no automatic retry was made.",
        );
      }
      const { object: record, raw } = await responseObject(response);
      if (
        !record ||
        Array.isArray(record) ||
        typeof record !== "object" ||
        typeof record.id !== "string" ||
        !/^[1-9][0-9]{0,19}$/.test(record.id) ||
        record.external_id !== externalId ||
        record.duplicate_of != null ||
        ![undefined, null, false].includes(record.is_duplicate)
      )
        throw new Error("Unproven new identity");
      documentId = record.id;
      if (
        raw.includes(Buffer.from(bearerKey)) ||
        raw.includes(Buffer.from(clientId))
      )
        throw new Error("Credential echo");
      if (
        typeof record.ocr_text !== "string" ||
        !record.ocr_text.trim() ||
        record.ocr_text.length > 60000
      )
        throw new Error("Missing bounded OCR text");
      signal.throwIfAborted();
      resultText = record.ocr_text;
    } catch (error) {
      problem = signal.aborted
        ? new VeryfiError(
            504,
            "The Veryfi scan was cancelled or timed out. It may have reached the provider; the reserved allowance is still used.",
          )
        : error instanceof VeryfiError
          ? error
          : new VeryfiError(
              502,
              "Veryfi did not return safely usable receipt text. Your photos are still available; no automatic retry was made.",
            );
    } finally {
      if (documentId) {
        try {
          const response = await fetcher(`${VERYFI_ENDPOINT}/${documentId}`, {
            method: "DELETE",
            headers,
            redirect: "error",
            signal: AbortSignal.timeout(cleanupTimeoutMs),
          });
          void response.body?.cancel().catch(() => {});
          if ([200, 204].includes(response.status))
            cleanup = "provider-reported-success";
        } catch {
          /* Uncertain deletion never causes an extraction or cleanup retry. */
        }
      }
      if (signal.aborted && !problem)
        problem = new VeryfiError(
          504,
          "The Veryfi scan was cancelled. The request may have reached the provider; its reserved allowance remains used.",
        );
      try {
        await slot.finish(
          problem ? (signal.aborted ? "cancelled" : "failed") : "completed",
          cleanup,
          documentId,
        );
      } catch {
        problem = new VeryfiError(
          503,
          "The receipt request finished but its local allowance record could not be completed. Ask the app owner to check it before another scan.",
        );
      }
    }
    if (problem) {
      problem.cleanup = cleanup;
      throw problem;
    }
    return { text: resultText, cleanup, ...(await getStatus()) };
  }
  return { configured, name: "Veryfi OCR", maxPanels: 15, getStatus, extract };
}
