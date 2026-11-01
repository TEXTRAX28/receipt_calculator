// A separate Azure approval is mandatory; Veryfi approvals cannot be reused.
import {
  API_VERSION,
  MODEL,
  MAX_POLLS,
  sha,
  azureEndpoint,
  validateAzureProbe,
  runAzureProbe,
} from "./azure_receipt_probe.mjs";
import { setTimeout as delay } from "node:timers/promises";

export async function runAzureBatch({
  cases,
  authorization,
  credentials,
  planSha256,
  consumeBatch,
  consumeCase,
  saveResponse,
  saveMetadata,
  fetcher,
  wait = (ms, signal) => delay(ms, undefined, { signal }),
}) {
  const endpoint = azureEndpoint(credentials?.endpoint || "");
  if (
    authorization?.provider !== "Azure Document Intelligence" ||
    authorization?.approved_by_user !== true ||
    authorization?.free_f0_confirmed !== true ||
    authorization?.unused_free_pages_confirmed !== true ||
    authorization?.max_processing_requests !== 6 ||
    authorization?.max_deletion_requests !== 6 ||
    authorization?.max_poll_requests !== 180 ||
    authorization?.automatic_retries !== 0 ||
    authorization?.plan_sha256 !== planSha256 ||
    authorization?.endpoint_sha256 !== sha(endpoint) ||
    !/^[a-z][a-z0-9 -]{1,63}$/i.test(authorization?.resource_region || "") ||
    !Array.isArray(cases) ||
    cases.length !== 6 ||
    new Set(cases.map((row) => row.id)).size !== 6
  )
    throw new Error("separate-six-case-azure-approval-required");
  const permits = cases.map((row, index) => {
    if (
      row.id !== `case-0${index + 1}` ||
      authorization.images?.[row.id] !== sha(row.image)
    )
      throw new Error("approved-image-scope-changed");
    const permit = {
      provider: "Azure Document Intelligence",
      approved_by_user: true,
      free_f0_confirmed: true,
      unused_free_pages_confirmed: true,
      endpoint_sha256: sha(endpoint),
      image_sha256: sha(row.image),
      model: MODEL,
      api_version: API_VERSION,
      max_processing_requests: 1,
      max_deletion_requests: 1,
      max_poll_requests: MAX_POLLS,
      automatic_retries: 0,
    };
    validateAzureProbe({ image: row.image, permit, credentials });
    return permit;
  });
  for (const callback of [
    consumeBatch,
    consumeCase,
    saveResponse,
    saveMetadata,
  ])
    if (typeof callback !== "function")
      throw new Error("recording-callbacks-required");
  await consumeBatch({
    provider: "Azure Document Intelligence",
    plan_sha256: planSha256,
    endpoint_sha256: sha(endpoint),
    authorization,
    started_at: new Date().toISOString(),
  });
  const results = [],
    operations = new Set();
  for (const [index, row] of cases.entries()) {
    if (index) await wait(1000, AbortSignal.timeout(5000));
    const result = await runAzureProbe({
      image: row.image,
      permit: permits[index],
      credentials,
      consume: (meta) => consumeCase(row.id, meta),
      saveResponse: (raw) => saveResponse(row.id, raw),
      acceptOperation: async (url) => {
        if (operations.has(url)) throw new Error("unproven-operation");
        operations.add(url);
      },
      fetcher,
      wait,
    });
    results.push({ id: row.id, ...result });
    await saveMetadata(row.id, results.at(-1));
    if (
      !result.extraction_received ||
      result.deletion_status !== "provider-reported-success"
    )
      break;
  }
  return results;
}
