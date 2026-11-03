import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import {
  requestPanelsSchema,
  validateRecognition,
} from "../src/lib/recognition-schema.mjs";
import {
  AZURE_ENGINE,
  projectAzurePage,
  projectAzureQuantities,
} from "../src/lib/azure-layout.mjs";
import { createDocumentAllowance } from "./document-allowance.mjs";
import { validatePreparedJpeg } from "./receipt-zip.mjs";

export const AZURE_API_VERSION = "2024-11-30";
const resultPath =
  "/documentintelligence/documentModels/prebuilt-receipt/analyzeResults/";
export class AzureError extends Error {
  constructor(status, message, cleanup = "unknown") {
    super(message);
    this.status = status;
    this.cleanup = cleanup;
  }
}
export function azureOrigin(value) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.cognitiveservices\.azure\.com$/.test(
      url.hostname,
    ) ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  )
    throw new Error("Invalid Azure resource endpoint");
  return url.origin;
}
function operationUrl(value, origin) {
  const url = new URL(value);
  if (
    url.origin !== origin ||
    url.username ||
    url.password ||
    url.hash ||
    !url.pathname.startsWith(resultPath) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      url.pathname.slice(resultPath.length),
    ) ||
    [...url.searchParams].length !== 1 ||
    url.searchParams.get("api-version") !== AZURE_API_VERSION
  )
    throw new Error("Unproven Azure operation");
  return url.href;
}
async function boundedJson(response, key) {
  if (
    !/^application\/json\b/i.test(response.headers.get("content-type") || "") ||
    !response.body ||
    Number(response.headers.get("content-length")) > 2000000
  ) {
    await response.body?.cancel().catch(() => {});
    throw new Error("Invalid Azure response");
  }
  const reader = response.body.getReader(),
    chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2000000) throw new Error("Azure response too large");
      chunks.push(Buffer.from(value));
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const raw = Buffer.concat(chunks);
  if (raw.includes(Buffer.from(key))) throw new Error("Azure credential echo");
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw));
}

/** Sequential single-page images: no F0 multi-page truncation, automatic retries or native money projection. */
export function createAzureReader({
  endpoint = "",
  key = "",
  directory = "",
  grant = "",
  limit = 0,
  fetcher = globalThis.fetch,
  wait = async (ms, signal) => {
    await delay(ms, undefined, { signal });
  },
  cleanupTimeoutMs = 10000,
} = {}) {
  let origin = "";
  try {
    origin = azureOrigin(endpoint);
  } catch {
    /* A key alone never enables uploads. */
  }
  const allowance = createDocumentAllowance({
    directory,
    account: origin,
    grant,
    limit,
  });
  const configured =
    !!origin && /^[A-Za-z0-9+/=_-]{20,256}$/.test(key) && allowance.configured;
  const seen = new Set();
  const headers = {
    "Ocp-Apim-Subscription-Key": key,
    Accept: "application/json",
  };
  async function getStatus() {
    try {
      const remaining = configured ? await allowance.remaining() : 0;
      return {
        configured: configured && remaining > 0,
        remaining,
        maxPanels: 24,
      };
    } catch {
      return { configured: false, remaining: 0, maxPanels: 24 };
    }
  }
  async function extract(input, { signal }) {
    if (!configured)
      throw new AzureError(
        503,
        "Azure needs a server connection and an explicit section allowance.",
        "not-created",
      );
    signal.throwIfAborted();
    let panels, dimensions;
    try {
      panels = requestPanelsSchema.parse(input);
      dimensions = panels.map((panel) => {
        const bytes = Buffer.from(panel.data, "base64");
        if (bytes.toString("base64") !== panel.data || bytes.length >= 4000000)
          throw new Error("Image limit");
        const size = validatePreparedJpeg(bytes);
        if (size.width < 50 || size.height < 50)
          throw new Error("Image dimensions");
        return size;
      });
    } catch {
      throw new AzureError(
        400,
        "Azure needs prepared JPEG sections under 4 MB and at least 50 pixels per side. Choose the photos again.",
        "not-created",
      );
    }
    if ((await getStatus()).remaining < panels.length)
      throw new AzureError(
        429,
        "The Azure allowance cannot cover all receipt sections. Choose fewer sections or another reader.",
        "not-created",
      );
    const output = [],
      quantityHints = [];
    let anyUnknown = false;
    for (const [index, panel] of panels.entries()) {
      signal.throwIfAborted();
      let slot;
      try {
        slot = await allowance.reserve("azure-" + randomUUID());
      } catch {
        throw new AzureError(
          429,
          "The Azure section allowance is unavailable or used up. No automatic retry was made.",
          anyUnknown
            ? "unknown"
            : index
              ? "provider-reported-success"
              : "not-created",
        );
      }
      let operation = null,
        cleanup = "not-created",
        problem = null,
        projected = null,
        hints = [];
      try {
        signal.throwIfAborted();
        cleanup = "unknown";
        const response = await fetcher(
          `${origin}/documentintelligence/documentModels/prebuilt-receipt:analyze?api-version=${AZURE_API_VERSION}`,
          {
            method: "POST",
            headers: { ...headers, "Content-Type": "application/json" },
            body: JSON.stringify({ base64Source: panel.data }),
            redirect: "error",
            signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]),
          },
        );
        const location = response.headers.get("operation-location");
        void response.body?.cancel().catch(() => {});
        if (response.status !== 202)
          throw new AzureError(
            response.status === 429 ? 429 : 502,
            "Azure could not accept this receipt. No automatic retry was made.",
          );
        const candidate = operationUrl(location, origin);
        if (seen.has(candidate)) throw new Error("Repeated operation");
        seen.add(candidate);
        operation = candidate;
        for (let poll = 0; poll < 30; poll++) {
          await wait(2000, signal);
          signal.throwIfAborted();
          const response = await fetcher(operation, {
            method: "GET",
            headers,
            redirect: "error",
            signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]),
          });
          if (response.status !== 200) {
            void response.body?.cancel().catch(() => {});
            throw new Error("Azure status failed");
          }
          const record = await boundedJson(response, key);
          if (record?.status === "succeeded") {
            projected = projectAzurePage(record, {
              ...panel,
              ...dimensions[index],
            });
            hints = projectAzureQuantities(record, projected);
            break;
          }
          if (!["running", "notStarted"].includes(record?.status))
            throw new Error("Azure analysis failed");
        }
        if (!projected) throw new Error("Azure status limit reached");
        const safe = JSON.stringify({ projected, hints });
        if (safe.includes(key) || safe.includes(origin))
          throw new Error("Private value echo");
        signal.throwIfAborted();
      } catch (error) {
        problem = signal.aborted
          ? new AzureError(
              504,
              "Azure reading was cancelled or timed out. Uploaded sections can still use the allowance.",
            )
          : error instanceof AzureError
            ? error
            : new AzureError(
                502,
                "Azure did not return usable source words. Your photos are still available; no automatic retry was made.",
              );
      } finally {
        if (operation) {
          try {
            const response = await fetcher(operation, {
              method: "DELETE",
              headers,
              redirect: "error",
              signal: AbortSignal.timeout(cleanupTimeoutMs),
            });
            void response.body?.cancel().catch(() => {});
            if (response.status === 204) cleanup = "provider-reported-success";
          } catch {
            /* Cleanup is attempted once even after cancellation. */
          }
        }
        anyUnknown ||= cleanup === "unknown";
        if (signal.aborted && !problem)
          problem = new AzureError(
            504,
            "Azure reading was cancelled. Uploaded sections can still use the allowance.",
          );
        try {
          await slot.finish(
            problem ? (signal.aborted ? "cancelled" : "failed") : "completed",
            cleanup,
          );
        } catch {
          problem = new AzureError(
            503,
            "Azure finished but its local allowance record could not be completed. Ask the app owner to check it.",
          );
        }
      }
      if (problem) {
        problem.cleanup = anyUnknown ? "unknown" : cleanup;
        throw problem;
      }
      output.push(projected);
      quantityHints.push(...hints);
    }
    const recognition = validateRecognition(
      { engine: AZURE_ENGINE, panels: output },
      panels,
    );
    if (
      JSON.stringify({ recognition, quantityHints }).length > 2000000 ||
      output.reduce(
        (n, p) => n + p.words.reduce((s, w) => s + w.text.length + 1, 0),
        0,
      ) > 60000
    )
      throw new AzureError(
        502,
        "The combined Azure receipt is too large. Crop it into fewer sections.",
        anyUnknown ? "unknown" : "provider-reported-success",
      );
    return {
      recognition,
      quantityHints,
      cleanup: anyUnknown ? "unknown" : "provider-reported-success",
      remaining: (await getStatus()).remaining,
    };
  }
  return { configured, name: "Azure receipt OCR", getStatus, extract };
}
