// Research-only Azure receipt transport. Importing it never makes a request.
import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

export const API_VERSION = "2024-11-30";
export const MODEL = "prebuilt-receipt";
export const MAX_POLLS = 30;
export const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const resultPath = `/documentintelligence/documentModels/${MODEL}/analyzeResults/`;
const png = Buffer.from("89504e470d0a1a0a", "hex");

export function azureEndpoint(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("invalid-endpoint");
  }
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
    throw new Error("invalid-endpoint");
  return url.origin;
}

export function validateAzureProbe({ image, permit, credentials }) {
  const endpoint = azureEndpoint(credentials?.endpoint || "");
  if (!/^[A-Za-z0-9+/=_-]{20,256}$/.test(credentials?.key || ""))
    throw new Error("credentials-unavailable");
  if (
    !Buffer.isBuffer(image) ||
    image.length < 100 ||
    image.length > 3_999_999 ||
    !image.subarray(0, 8).equals(png) ||
    image.toString("ascii", 12, 16) !== "IHDR"
  )
    throw new Error("invalid-image");
  const width = image.readUInt32BE(16),
    height = image.readUInt32BE(20);
  if (
    width < 50 ||
    height < 50 ||
    width > 10000 ||
    height > 10000 ||
    width * height > 16_000_000
  )
    throw new Error("invalid-image");
  if (
    permit?.provider !== "Azure Document Intelligence" ||
    permit?.approved_by_user !== true ||
    permit?.free_f0_confirmed !== true ||
    permit?.unused_free_pages_confirmed !== true ||
    permit?.image_sha256 !== sha(image) ||
    permit?.endpoint_sha256 !== sha(endpoint) ||
    permit?.model !== MODEL ||
    permit?.api_version !== API_VERSION ||
    permit?.max_processing_requests !== 1 ||
    permit?.max_deletion_requests !== 1 ||
    permit?.max_poll_requests !== MAX_POLLS ||
    permit?.automatic_retries !== 0
  )
    throw new Error("approval-required");
  return endpoint;
}

function operationUrl(value, endpoint) {
  const url = new URL(value);
  if (
    url.origin !== endpoint ||
    url.username ||
    url.password ||
    url.hash ||
    !url.pathname.startsWith(resultPath) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      url.pathname.slice(resultPath.length),
    ) ||
    [...url.searchParams].length !== 1 ||
    url.searchParams.get("api-version") !== API_VERSION
  )
    throw new Error("unproven-operation");
  return url.href;
}

async function boundedJson(response, key) {
  if (
    !/^application\/json\b/i.test(response.headers.get("content-type") || "") ||
    !response.body ||
    Number(response.headers.get("content-length")) > 2_000_000
  ) {
    await response.body?.cancel().catch(() => {});
    throw new Error("invalid-response");
  }
  const reader = response.body.getReader(),
    chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > 2_000_000) throw new Error("response-bound");
      chunks.push(Buffer.from(value));
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const raw = Buffer.concat(chunks);
  if (raw.includes(Buffer.from(key)))
    throw new Error("credential-echo-blocked");
  const value = JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(raw),
  );
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("invalid-response");
  return { raw, value };
}

export async function runAzureProbe({
  image,
  permit,
  credentials,
  consume,
  saveResponse,
  acceptOperation = async () => {},
  fetcher = fetch,
  wait = (ms, signal) => delay(ms, undefined, { signal }),
}) {
  const endpoint = validateAzureProbe({ image, permit, credentials });
  if (
    typeof consume !== "function" ||
    typeof saveResponse !== "function" ||
    typeof acceptOperation !== "function" ||
    typeof wait !== "function"
  )
    throw new Error("recording-callbacks-required");
  const meta = {
    provider: "Azure Document Intelligence",
    model: MODEL,
    api_version: API_VERSION,
    image_sha256: sha(image),
    endpoint_sha256: sha(endpoint),
    processing_requests: 0,
    poll_requests: 0,
    deletion_requests: 0,
    automatic_retries: 0,
    billing_activated: false,
    actual_billing_verified: false,
    free_f0_user_confirmed: true,
    extraction_received: false,
    deletion_status: "not-attempted",
    started_at: new Date().toISOString(),
    polls: [],
  };
  // The caller must persist an exclusive one-use record before any network call.
  await consume({ ...meta, permit });
  const signal = AbortSignal.timeout(180000),
    started = performance.now();
  const headers = {
    "Ocp-Apim-Subscription-Key": credentials.key,
    Accept: "application/json",
  };
  const body = JSON.stringify({ base64Source: image.toString("base64") });
  meta.request_sha256 = sha(body);
  let operation;
  try {
    meta.processing_requests = 1;
    const response = await fetcher(
      `${endpoint}/documentintelligence/documentModels/${MODEL}:analyze?api-version=${API_VERSION}`,
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body,
        redirect: "error",
        signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]),
      },
    );
    meta.processing_http_status = response.status;
    const location = response.headers.get("operation-location");
    await response.body?.cancel().catch(() => {});
    if (response.status !== 202)
      throw new Error("processing-response-rejected");
    const candidate = operationUrl(location, endpoint);
    await acceptOperation(candidate);
    operation = candidate;
    meta.result_id = new URL(operation).pathname.slice(resultPath.length);
    let completed = false;
    for (let index = 0; index < MAX_POLLS; index++) {
      await wait(2000, signal);
      signal.throwIfAborted();
      meta.poll_requests++;
      const poll = await fetcher(operation, {
        method: "GET",
        headers,
        redirect: "error",
        signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]),
      });
      if (poll.status !== 200) {
        await poll.body?.cancel().catch(() => {});
        throw new Error("poll-response-rejected");
      }
      const { raw, value } = await boundedJson(poll, credentials.key);
      meta.polls.push({ status: value.status, response_sha256: sha(raw) });
      if (["notStarted", "running"].includes(value.status)) continue;
      if (value.status !== "succeeded") throw new Error("analysis-failed");
      const result = value.analyzeResult;
      if (
        result?.apiVersion !== API_VERSION ||
        result?.modelId !== MODEL ||
        !Array.isArray(result.pages) ||
        result.pages.length !== 1 ||
        !Array.isArray(result.documents) ||
        result.documents.length > 10
      )
        throw new Error("invalid-analysis-result");
      await saveResponse(raw);
      meta.response_sha256 = sha(raw);
      meta.document_count = result.documents.length;
      meta.extraction_received = true;
      completed = true;
      break;
    }
    if (!completed) throw new Error("poll-bound");
  } catch (error) {
    const safe = new Set([
      "processing-response-rejected",
      "unproven-operation",
      "poll-response-rejected",
      "analysis-failed",
      "invalid-analysis-result",
      "invalid-response",
      "response-bound",
      "credential-echo-blocked",
      "poll-bound",
    ]);
    meta.error = safe.has(error?.message)
      ? error.message
      : "transport-or-local-recording-failed";
  } finally {
    // Only the operation proven by this request's 202 response can be deleted.
    if (operation) {
      meta.deletion_requests = 1;
      try {
        await wait(1000, AbortSignal.timeout(5000));
        const cleanup = await fetcher(operation, {
          method: "DELETE",
          headers,
          redirect: "error",
          signal: AbortSignal.timeout(20000),
        });
        meta.deletion_http_status = cleanup.status;
        meta.deletion_status =
          cleanup.status === 204
            ? "provider-reported-success"
            : "failed-or-unconfirmed";
        await cleanup.body?.cancel().catch(() => {});
      } catch {
        meta.deletion_status = "failed-or-unknown";
      }
    }
    meta.elapsed_ms = Math.round(performance.now() - started);
    meta.completed_at = new Date().toISOString();
  }
  return meta;
}
