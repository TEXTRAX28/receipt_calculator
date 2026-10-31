// Six predeclared cases, one attempt each. No API call at module load.
import {
  runVeryfiProbe,
  validateProbeInputs,
  sha,
} from "./veryfi_screening_transport.mjs";

export async function runScreeningBatch({
  cases,
  authorization,
  credentials,
  consumeBatch,
  consumeCase,
  saveResponse,
  saveMetadata,
  fetcher,
}) {
  if (
    !Array.isArray(cases) ||
    cases.length !== 6 ||
    new Set(cases.map((item) => item.id)).size !== 6 ||
    cases.some((item) => !/^case-0[1-6]$/.test(item.id)) ||
    authorization?.provider !== "Veryfi" ||
    authorization.approved_by_user !== true ||
    authorization.free_quota_confirmed !== true ||
    authorization.max_processing_requests !== 6 ||
    authorization.max_deletion_requests !== 6 ||
    authorization.automatic_retries !== 0 ||
    typeof authorization.user_reply !== "string" ||
    !authorization.user_reply.trim()
  )
    throw new Error(
      "Separate six-case authorization and quota confirmation required",
    );
  const permits = cases.map((item) => {
    if (
      !Buffer.isBuffer(item.archive) ||
      sha(item.archive) !== item.archive_sha256
    )
      throw new Error("A predeclared archive changed");
    const permit = {
      provider: "Veryfi",
      approved_by_user: true,
      free_quota_confirmed: true,
      archive_sha256: item.archive_sha256,
      max_processing_requests: 1,
      max_deletion_requests: 1,
      automatic_retries: 0,
      parent_plan_sha256: authorization.plan_sha256,
      user_reply: authorization.user_reply,
    };
    validateProbeInputs({ archive: item.archive, permit, credentials });
    return permit;
  });
  // The exclusive global ledger prevents repeating even an interrupted batch.
  await consumeBatch({
    started_at: new Date().toISOString(),
    authorization,
    cases: cases.map(({ id, archive_sha256 }) => ({ id, archive_sha256 })),
    max_processing_requests: 6,
    max_deletion_requests: 6,
    automatic_retries: 0,
  });
  const results = [];
  for (const [index, item] of cases.entries()) {
    const metadata = await runVeryfiProbe({
      archive: item.archive,
      permit: permits[index],
      credentials,
      consume: (record) => consumeCase(item.id, record),
      saveResponse: (raw) => saveResponse(item.id, raw),
      fetcher,
    });
    // A failed POST is recorded once; move to the next distinct case, never retry it.
    await saveMetadata(item.id, metadata);
    results.push({ case: item.id, ...metadata });
  }
  return results;
}
