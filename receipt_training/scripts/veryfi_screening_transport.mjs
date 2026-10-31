// Separate screening protocol, derived from the preserved one-use probe.
// Request field/box confidence and disable missing-field computation; no API call at module load.
import { createHash, randomUUID } from "node:crypto";
export const SCREENING_OPTIONS = Object.freeze({
  compute: false,
  bounding_boxes: true,
  confidence_details: true,
});
export const ENDPOINT = "https://api.veryfi.com/api/v8/partner/documents";
export const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function boundedBody(response) {
  if (
    !response.body ||
    Number(response.headers.get("content-length")) > 2_000_000
  )
    throw new Error("response-bound");
  const reader = response.body.getReader(),
    chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2_000_000) throw new Error("response-bound");
      chunks.push(Buffer.from(value));
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return Buffer.concat(chunks);
}

export function validateProbeInputs({ archive, permit, credentials }) {
  if (
    !Buffer.isBuffer(archive) ||
    archive.length < 250 ||
    archive.length > 2_000_000 ||
    archive.readUInt32LE(0) !== 0x04034b50
  )
    throw new Error("invalid-archive");
  if (
    permit?.provider !== "Veryfi" ||
    permit?.approved_by_user !== true ||
    permit?.free_quota_confirmed !== true ||
    permit?.archive_sha256 !== sha(archive) ||
    permit?.max_processing_requests !== 1 ||
    permit?.max_deletion_requests !== 1 ||
    permit?.automatic_retries !== 0
  )
    throw new Error("approval-required");
  if (
    !/^[A-Za-z0-9_-]{8,200}$/.test(credentials?.clientId || "") ||
    !/^[A-Za-z0-9_.-]{20,256}$/.test(credentials?.bearerKey || "")
  )
    throw new Error("credentials-unavailable");
}

export async function runVeryfiProbe({
  archive,
  permit,
  credentials,
  consume,
  saveResponse,
  fetcher = fetch,
}) {
  validateProbeInputs({ archive, permit, credentials });
  if (typeof consume !== "function" || typeof saveResponse !== "function")
    throw new Error("invalid-recording-callbacks");
  const externalId = "receipt-probe-" + randomUUID();
  const idempotencyKey = randomUUID();
  const body = JSON.stringify({
    file_name: "receipt.zip",
    file_data: archive.toString("base64"),
    external_id: externalId,
    ...SCREENING_OPTIONS,
  });
  const meta = {
    provider: "Veryfi",
    request_options: SCREENING_OPTIONS,
    api_version: "v8",
    archive_sha256: sha(archive),
    request_sha256: sha(body),
    external_id: externalId,
    idempotency_key: idempotencyKey,
    processing_requests: 0,
    deletion_requests: 0,
    automatic_retries: 0,
    billing_activated: false,
    actual_billing_verified: false,
    free_quota_user_confirmed: true,
    extraction_received: false,
    deletion_status: "not-attempted",
    started_at: new Date().toISOString(),
  };
  // Exclusive persistent consumption is mandatory BEFORE even the first network call.
  await consume({ ...meta, approval: permit });
  const headers = {
    "CLIENT-ID": credentials.clientId,
    Authorization: `Bearer ${credentials.bearerKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    "Idempotency-Key": idempotencyKey,
  };
  let record = null,
    status = null;
  const started = performance.now();
  try {
    meta.processing_requests = 1;
    const response = await fetcher(ENDPOINT, {
      method: "POST",
      headers,
      body,
      redirect: "error",
      signal: AbortSignal.timeout(120000),
    });
    meta.processing_http_status = status = response.status;
    if (
      status !== 201 ||
      !/^application\/json\b/i.test(response.headers.get("content-type") || "")
    ) {
      await response.body?.cancel().catch(() => {});
      throw new Error("provider-response-rejected");
    }
    const raw = await boundedBody(response);
    record = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(raw),
      (key, value, context) => {
        if (key === "id" && typeof value === "number") {
          if (!context?.source) throw new Error("exact-id-source-unavailable");
          return context.source;
        }
        return value;
      },
    );
    if (!record || typeof record !== "object" || Array.isArray(record))
      throw new Error("provider-response-rejected");
    if (raw.includes(Buffer.from(credentials.bearerKey)))
      throw new Error("credential-echo-blocked");
    // Keep exact wire bytes. Parsed financial numbers are NEVER calculated or saved.
    await saveResponse(raw);
    meta.response_sha256 = sha(raw);
    meta.extraction_received = true;
    meta.line_item_count = Array.isArray(record.line_items)
      ? record.line_items.length
      : null;
  } catch (error) {
    meta.error = [
      "response-bound",
      "provider-response-rejected",
      "credential-echo-blocked",
    ].includes(error?.message)
      ? error.message
      : "processing-or-local-recording-failed";
  } finally {
    const eligible =
      status === 201 &&
      record?.external_id === externalId &&
      typeof record?.id === "string" &&
      /^[1-9][0-9]{0,18}$/.test(record.id) &&
      record.duplicate_of == null &&
      (record.is_duplicate == null || record.is_duplicate === false);
    if (eligible) {
      meta.deletion_requests = 1;
      meta.test_document_id = record.id;
      try {
        const response = await fetcher(`${ENDPOINT}/${record.id}`, {
          method: "DELETE",
          headers: {
            "CLIENT-ID": headers["CLIENT-ID"],
            Authorization: headers.Authorization,
          },
          redirect: "error",
          signal: AbortSignal.timeout(20000),
        });
        meta.deletion_http_status = response.status;
        meta.deletion_status = [200, 204].includes(response.status)
          ? "provider-reported-success"
          : response.status === 202
            ? "provider-accepted-pending"
            : "failed";
        await response.body?.cancel().catch(() => {});
      } catch {
        meta.deletion_status = "failed-or-unknown";
      }
    } else if (status === 201)
      meta.deletion_status = "not-attempted-unproven-test-record";
    meta.elapsed_ms = Math.round(performance.now() - started);
    meta.completed_at = new Date().toISOString();
  }
  return meta;
}
