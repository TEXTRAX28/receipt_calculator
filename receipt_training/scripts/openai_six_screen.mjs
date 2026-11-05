// One-shot six-crop comparison. Preparation never reads credentials or sends data.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  readFile,
  writeFile,
  mkdir,
  copyFile,
  realpath,
} from "node:fs/promises";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  createOpenAiReader,
  prepareOpenAiRequest,
  OPENAI_ENDPOINT,
} from "../../server/openai-reader.mjs";
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const OLD = "C:/Users/natan/.codex/worktrees/receipt-ocr-baseline/costco_calc";
export const FOLDER = resolve(
  ROOT,
  "qa-artifacts/provider-review/openai-six-v1",
);
export const digest = (b) => createHash("sha256").update(b).digest("hex");
const json = (v) => JSON.stringify(v, null, 2) + "\n";
const load = async (p) => JSON.parse(await readFile(p));
const save = (p, v) => writeFile(p, json(v), { flag: "wx" });
export const LIMITS = Object.freeze({
  posts: 6,
  retries: 0,
  timeout_ms: 90000,
  response_bytes: 1048576,
  minimum_start_interval_ms: 31000,
  per_request_estimate_guard_usd: 0.6,
  billing_changes: false,
  other_provider_requests: 0,
});
function destination(folder) {
  assert.equal(
    dirname(resolve(folder)),
    resolve(ROOT, "qa-artifacts/provider-review"),
  );
  assert.match(basename(folder), /^openai-six-(?:v1|test-[\w-]+)$/);
}
export async function prepare() {
  const priorPath = resolve(
    OLD,
    "qa-artifacts/provider-review/gemini35-screen-v1/plan.json",
  );
  const priorBytes = await readFile(priorPath);
  assert.equal(
    digest(priorBytes),
    "4520ce9af8f63e9edcddd51f51967b4e51bf750f2dccabf3cc8fe41b8dc16f0b",
  );
  const prior = JSON.parse(priorBytes);
  assert.equal(prior.cases.length, 6);
  const source = {
    ...(
      await load(
        resolve(
          ROOT,
          "receipt_training/evaluation/advanced-native-job-recovery-v1.json",
        ),
      )
    ).source_sha256,
  };
  for (const name of [
    "receipt_training/scripts/openai_six_screen.mjs",
    "receipt_training/scripts/test_openai_six_screen.mjs",
    "receipt_training/scripts/review_openai_six.py",
    "receipt_training/scripts/review_gemini35_screening.py",
    "receipt_training/scripts/review_veryfi_screening.py",
  ])
    source[name] = digest(await readFile(resolve(ROOT, name)));
  for (const [name, h] of Object.entries(source))
    assert.equal(digest(await readFile(resolve(ROOT, name))), h, name);
  const cases = [];
  const payloads = [];
  for (const entry of prior.cases) {
    const bytes = await readFile(resolve(OLD, entry.image));
    assert.equal(digest(bytes), entry.sha256);
    assert.equal(
      digest(await readFile(resolve(OLD, entry.source_png))),
      entry.source_png_sha256,
    );
    const prepared = prepareOpenAiRequest([
      { photo: 1, part: 1, data: bytes.toString("base64") },
    ]);
    cases.push({
      case: entry.case,
      receipt_id: entry.receipt_id,
      image: entry.case + ".jpg",
      image_sha256: entry.sha256,
      width: entry.width,
      height: entry.height,
      request: entry.case + "-request.json",
      request_sha256: digest(prepared.serialized),
      conservative_estimate_usd: prepared.estimateUsd,
    });
    payloads.push({ bytes, request: prepared.serialized });
  }
  const labelsPath =
    "qa-artifacts/provider-review/veryfi-screening-crops-v2/screening-labels-v1.jsonl";
  const labels = await readFile(resolve(OLD, labelsPath));
  const priorReport = await load(
    resolve(
      ROOT,
      "receipt_training/evaluation/advanced-gemini35-screening-result-v1.json",
    ),
  );
  assert.equal(digest(labels), priorReport.evidence_sha256[labelsPath]);
  destination(FOLDER);
  await mkdir(dirname(FOLDER), { recursive: true });
  await mkdir(FOLDER);
  for (let i = 0; i < cases.length; i++) {
    await writeFile(resolve(FOLDER, cases[i].image), payloads[i].bytes, {
      flag: "wx",
    });
    await writeFile(resolve(FOLDER, cases[i].request), payloads[i].request, {
      flag: "wx",
    });
  }
  await writeFile(resolve(FOLDER, "labels.jsonl"), labels, { flag: "wx" });
  await copyFile(
    resolve(ROOT, "receipt_training/evaluation/config.json"),
    resolve(FOLDER, "scoring-config.json"),
  );
  const plan = {
    prepared_at: new Date().toISOString(),
    status: "awaiting-new-user-upload-and-spend-approval",
    model: "gpt-6-astra",
    endpoint: OPENAI_ENDPOINT,
    limits: LIMITS,
    cases,
    source_sha256: source,
    labels_sha256: digest(labels),
    scoring_config_sha256: digest(
      await readFile(resolve(FOLDER, "scoring-config.json")),
    ),
    conservative_total_estimate_usd: cases.reduce(
      (s, c) => s + c.conservative_estimate_usd,
      0,
    ),
    input_scope:
      "Byte-identical six identifier-reduced JPEGs used for Gemini 3.5; same framing, different encoding from Azure/Veryfi PNGs. Familiar partial references, not a blind holdout.",
    pricing_checked_at: "2026-11-05",
    pricing_source: "https://developers.openai.com/api/docs/models/gpt-6-astra",
    privacy_source: "https://developers.openai.com/api/docs/guides/your-data",
    key_alias: "OPEN_AI_KEY",
    key_file:
      "Existing user-designated ignored env file in OLD, read only after approval and exclusive run reservation.",
    real_keys_read: 0,
    provider_requests: 0,
  };
  await save(resolve(FOLDER, "plan.json"), plan);
  return {
    folder: FOLDER,
    plan_sha256: digest(json(plan)),
    cases: 6,
    conservative_total_estimate_usd: plan.conservative_total_estimate_usd,
    requests: 0,
    real_keys_read: 0,
  };
}
export async function preflight(folder = FOLDER) {
  destination(folder);
  const bytes = await readFile(resolve(folder, "plan.json")),
    plan = JSON.parse(bytes);
  assert.equal(plan.model, "gpt-6-astra");
  assert.equal(plan.endpoint, OPENAI_ENDPOINT);
  assert.deepEqual(plan.limits, LIMITS);
  assert.equal(plan.cases.length, 6);
  assert.equal(
    digest(await readFile(resolve(folder, "labels.jsonl"))),
    plan.labels_sha256,
  );
  assert.equal(
    digest(await readFile(resolve(folder, "scoring-config.json"))),
    plan.scoring_config_sha256,
  );
  for (const [n, h] of Object.entries(plan.source_sha256))
    assert.equal(digest(await readFile(resolve(ROOT, n))), h, n);
  const panels = [];
  for (const [i, c] of plan.cases.entries()) {
    assert.equal(c.case, `case-0${i + 1}`);
    assert.equal(c.image, c.case + ".jpg");
    assert.equal(c.request, c.case + "-request.json");
    const image = await readFile(resolve(folder, c.image));
    assert.equal(digest(image), c.image_sha256);
    const input = [{ photo: 1, part: 1, data: image.toString("base64") }],
      p = prepareOpenAiRequest(input);
    assert.equal(digest(p.serialized), c.request_sha256);
    assert.equal(
      digest(await readFile(resolve(folder, c.request))),
      c.request_sha256,
    );
    assert.equal(p.estimateUsd, c.conservative_estimate_usd);
    panels.push(input);
  }
  assert.equal(
    plan.conservative_total_estimate_usd,
    plan.cases.reduce((s, c) => s + c.conservative_estimate_usd, 0),
  );
  return { plan, panels, plan_sha256: digest(bytes) };
}
export async function capture(response, signal, key) {
  const declared = response.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > 1048576)) {
    void response.body?.cancel().catch(() => {});
    throw Error("Response exceeds bound");
  }
  const reader = response.body?.getReader();
  if (!reader) throw Error("Missing response body");
  const cancel = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener("abort", cancel, { once: true });
  const chunks = [];
  let length = 0;
  try {
    signal.throwIfAborted();
    for (;;) {
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      length += value.byteLength;
      if (length > 1048576) {
        cancel();
        throw Error("Response exceeds bound");
      }
      chunks.push(value);
    }
  } finally {
    signal.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
  const redact = (_, v) =>
    typeof v === "string" ? v.replaceAll(key, "[REDACTED]") : v;
  let data;
  try {
    data = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(
        Buffer.concat(chunks, length),
      ),
      redact,
    );
    for (const out of data.output || [])
      for (const part of out.content || [])
        if (part.type === "output_text") {
          try {
            let changed = false;
            const parsed = JSON.parse(part.text, (_, v) => {
              if (typeof v === "string" && v.includes(key)) {
                changed = true;
                return v.replaceAll(key, "[REDACTED]");
              }
              return v;
            });
            if (changed) part.text = JSON.stringify(parsed);
          } catch {
            part.text = "Malformed receipt JSON omitted from retained response";
          }
        }
  } catch {
    data = {
      response_omitted: "Invalid JSON/UTF-8; untrusted content not retained",
      received_bytes: length,
    };
  }
  return { data, serialized: JSON.stringify(data), received_bytes: length };
}
export async function runSix({
  folder = FOLDER,
  approval,
  loadKey,
  fetcher = globalThis.fetch,
  wait = (ms) => new Promise((done) => setTimeout(done, ms)),
  now = Date.now,
}) {
  const { plan, panels, plan_sha256 } = await preflight(folder);
  if (
    !approval?.approved_by_user ||
    approval.plan_sha256 !== plan_sha256 ||
    approval.model !== plan.model ||
    approval.posts !== 6 ||
    approval.use_credits !== true
  )
    throw Error("Specific six-crop upload-and-spend approval required");
  const output = resolve(folder, "run");
  await mkdir(output); // Existing/interrupted run cannot resume.
  await save(resolve(output, "scope.json"), {
    plan_sha256,
    limits: LIMITS,
    approval,
    real_requests: 0,
  });
  const key = await loadKey();
  if (!/^sk-[A-Za-z0-9_-]{20,500}$/.test(key))
    throw Error("Existing key is not configured");
  const record = {
    plan_sha256,
    model: plan.model,
    started_at: new Date(now()).toISOString(),
    provider_requests: 0,
    retries: 0,
    billing_changes: false,
    cases: [],
  };
  let index = 0,
    previous = null,
    stop = false;
  const reader = createOpenAiReader({
    apiKey: key,
    directory: resolve(output, "allowance"),
    grant: "openai-six-" + plan_sha256.slice(0, 16),
    limit: 6,
    fetcher: async (url, options) => {
      const c = plan.cases[index];
      if (
        url !== OPENAI_ENDPOINT ||
        options.method !== "POST" ||
        options.headers.Authorization !== "Bearer " + key ||
        options.redirect !== "error" ||
        digest(options.body) !== c.request_sha256 ||
        record.provider_requests >= 6
      )
        throw Error("Transport outside approved scope");
      await save(resolve(output, c.case + "-attempt.json"), {
        started_at: new Date(now()).toISOString(),
        request_sha256: c.request_sha256,
      });
      record.provider_requests++;
      const response = await fetcher(url, options);
      record.cases[index].http_status = response.status;
      if ([401, 403, 429].includes(response.status)) stop = true;
      const captured = await capture(response, options.signal, key);
      record.cases[index].response_bytes = captured.received_bytes;
      await save(resolve(output, c.case + "-response.json"), captured.data);
      return new Response(captured.serialized, {
        status: response.status,
        headers: { "content-type": "application/json" },
      });
    },
  });
  for (index = 0; index < 6; index++) {
    const c = plan.cases[index],
      r = { case: c.case, receipt_id: c.receipt_id };
    record.cases.push(r);
    if (stop) {
      r.status = "not-attempted-after-auth-or-quota-failure";
      continue;
    }
    if (previous !== null) await wait(Math.max(0, previous + 31000 - now()));
    previous = now();
    r.started_at = new Date(previous).toISOString();
    try {
      const { receipt } = await reader.extract(panels[index]);
      await save(resolve(output, c.case + "-receipt.json"), receipt);
      r.status = "strict-schema-passed";
    } catch (error) {
      r.status = "failed-no-retry";
      r.error = String(error.message)
        .replaceAll(key, "[REDACTED]")
        .slice(0, 600);
    }
    r.elapsed_ms = now() - previous;
  }
  record.finished_at = new Date(now()).toISOString();
  await save(resolve(output, "metadata.json"), record);
  return record;
}
async function execute() {
  const folder = FOLDER,
    approval = await load(resolve(folder, "authorization.json"));
  return runSix({
    folder,
    approval,
    loadKey: async () => {
      const text = await readFile(resolve(OLD, ".env.local"), "utf8");
      const matches = text
        .split(/\r?\n/)
        .filter((l) => /^\s*(?:export\s+)?OPEN_AI_KEY\s*=/.test(l));
      if (matches.length !== 1)
        throw Error("Existing OPEN_AI_KEY is not configured");
      const raw = matches[0].slice(matches[0].indexOf("=") + 1).trim();
      return /^("|').*\1$/.test(raw) ? raw.slice(1, -1) : raw;
    },
  });
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    if (process.argv[2] === "--prepare")
      console.log(JSON.stringify(await prepare()));
    else if (process.argv[2] === "--check") {
      const p = await preflight();
      console.log(
        JSON.stringify({
          plan_sha256: p.plan_sha256,
          cases: 6,
          real_keys_read: 0,
          provider_requests: 0,
        }),
      );
    } else if (process.argv[2] === "--execute")
      console.log(JSON.stringify(await execute()));
    else throw Error("Choose explicit prepare/check/execute mode");
  } catch {
    console.error(
      "Six-crop operation failed; no automatic retry. Review local evidence without printing credentials.",
    );
    process.exitCode = 1;
  }
}
