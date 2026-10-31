// Compare frozen independent outputs; no model, receipt upload or truth labels are used.
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const project = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const root = resolve(project, "receipt_training");
const base = process.argv[2] || "independent-compare-v1";
if (!/^[\w-]+$/.test(base)) throw new Error("Choose a simple, new run name");
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const jsonl = (bytes) =>
  bytes.toString("utf8").trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
const inputs = {};
async function input(path) {
  const bytes = await readFile(resolve(project, path));
  inputs[path] = sha(bytes);
  return bytes;
}
const nativeBase =
  "receipt_training/evaluation/runs/qwen-full-v2-verified-import";
const nativeBytes = await input(`${nativeBase}/structured.jsonl`);
const nativeMeta = JSON.parse(await input(`${nativeBase}/metadata.json`));
if (
  nativeMeta.structured_sha256 !== sha(nativeBytes) ||
  !nativeMeta.completed_at ||
  nativeMeta.ocr_text_supplied
)
  throw new Error("Unverified or dependent vision cache");
const vision = new Map(
  jsonl(nativeBytes).map((record) => [record.receipt_id, record]),
);
if (vision.size !== jsonl(nativeBytes).length)
  throw new Error("Duplicate native cache records");
const cohorts = [];
for (const name of ["development", "evaluation", "supplement"]) {
  const folder = `receipt_training/evaluation/runs/paddle-v6-http-v1-${name}`;
  const bytes = await input(`${folder}/predictions.jsonl`);
  const meta = JSON.parse(await input(`${folder}/metadata.json`));
  if (
    !meta.completed_at ||
    !meta.source_unchanged ||
    sha(bytes) !== meta.predictions_sha256
  )
    throw new Error("Unverified primary cache");
  const manifest = await input(
    meta.manifest_path || "receipt_training/manifest.jsonl",
  );
  if (sha(manifest) !== meta.manifest_sha256)
    throw new Error("Primary manifest changed after inference");
  const records = new Map(
    jsonl(manifest).map((record) => [record.receipt_id, record]),
  );
  const predictions = jsonl(bytes);
  for (const prediction of predictions) {
    const record = records.get(prediction.receipt_id),
      second = vision.get(prediction.receipt_id);
    if (
      !record ||
      !second ||
      prediction.image_sha256 !== record.sha256 ||
      second.image_sha256 !== record.sha256 ||
      !prediction.local_recognition
    )
      throw new Error(
        "Original image hashes or independent evidence do not match",
      );
  }
  cohorts.push({ name, meta, predictions });
}
if (
  cohorts.reduce((n, cohort) => n + cohort.predictions.length, 0) !==
  vision.size
)
  throw new Error("The independent caches do not cover the same cohort");
const library = resolve(project, "src/lib");
const paths = (await readdir(library))
  .filter((path) => /\.(?:ts|mjs)$/.test(path))
  .sort();
const source = new Map(
  await Promise.all(
    paths.map(async (path) => [path, await readFile(resolve(library, path))]),
  ),
);
const hashes = Object.fromEntries(
  [...source].map(([path, bytes]) => [path, sha(bytes)]),
);
const config = await input("receipt_training/evaluation/config.json");
const runnerBytes = await readFile(fileURLToPath(import.meta.url));
for (const cohort of cohorts) {
  const out = resolve(root, "evaluation/runs", `${base}-${cohort.name}`);
  await mkdir(out); // Refuse overwriting a prior run.
  await mkdir(resolve(out, "source"));
  for (const [path, bytes] of source)
    await writeFile(resolve(out, "source", path), bytes);
  await writeFile(resolve(out, "replay-runner.mjs"), runnerBytes);
  cohort.out = out;
}
const frozen = new Map(
  [...source].map(([path, bytes]) => [
    resolve(library, path).replaceAll("\\", "/"),
    bytes.toString("utf8"),
  ]),
);
const server = await createServer({
  configFile: false,
  root: project,
  logLevel: "error",
  server: { middlewareMode: true },
  optimizeDeps: { noDiscovery: true, include: [] },
  cacheDir: resolve(root, ".cache/independent-replay-vite"),
  plugins: [
    {
      name: "frozen-independent-replay",
      enforce: "pre",
      load(id) {
        return frozen.get(id.split("?")[0].replaceAll("\\", "/")) ?? null;
      },
    },
  ],
});
try {
  const { verifyIndependentReadings } = await server.ssrLoadModule(
    "/src/lib/verify-readings.ts",
  );
  const { calculateReceipt } = await server.ssrLoadModule("/src/lib/engine.ts");
  for (const cohort of cohorts) {
    const predictions = [];
    for (const primary of cohort.predictions) {
      const second = vision.get(primary.receipt_id),
        started = performance.now();
      const compared = verifyIndependentReadings(
        second.receipt,
        primary.local_recognition,
      );
      const calculation = calculateReceipt(compared.receipt);
      const comparisonMs = performance.now() - started;
      predictions.push({
        receipt_id: primary.receipt_id,
        group_id: primary.group_id,
        image_sha256: primary.image_sha256,
        elapsed_ms: Math.round(comparisonMs),
        receipt: compared.receipt,
        calculation,
        independent_cache_times_ms: {
          primary: primary.elapsed_ms,
          vision: second.inference_ms,
        },
        cached_panels_over_current_pixel_limit:
          primary.cached_panels_over_current_pixel_limit,
        reading_panels: primary.reading_panels,
        comparison: {
          matches: compared.matchedPurchases,
          coupons_recovered: compared.corrections.length,
          informational_adjustments_removed: compared.removedAdjustments.length,
          agreements: compared.agreements,
          pending_checks: compared.receipt.reviewChecks.length,
        },
      });
    }
    const serialized =
      predictions
        .map((record) =>
          JSON.stringify(record, (_key, value) =>
            typeof value === "bigint" ? String(value) : value,
          ),
        )
        .join("\n") + "\n";
    await writeFile(resolve(cohort.out, "predictions.jsonl"), serialized);
    const unchanged = (
      await Promise.all(
        paths.map(
          async (path) =>
            sha(await readFile(resolve(library, path))) === hashes[path],
        ),
      )
    ).every(Boolean);
    if (!unchanged) throw new Error("Source changed during replay");
    await writeFile(
      resolve(cohort.out, "metadata.json"),
      JSON.stringify(
        {
          provider: "independent-paddle-qwen-cached-comparison",
          split: cohort.meta.split,
          source_sha256: hashes,
          source_unchanged: unchanged,
          source_served_from_frozen_snapshot: true,
          config_sha256: sha(config),
          predictions_sha256: sha(serialized),
          api_requests: 0,
          api_cost_usd: "0",
          completed_at: new Date().toISOString(),
          input_sha256: inputs,
          comparison_runner_sha256: sha(runnerBytes),
          label_files_read_for_comparison: [],
          timing_scope:
            "Pure deterministic comparison only, excluding cached model inference, preprocessing, HTTP, browser and model startup; never use these times as receipt-scanning latency",
          limitations: [
            "Cached primary and native outputs used their original, distinct panel preparation; some frozen panels exceed today's API pixel or section limits.",
            "Previously inspected evaluation cohort is a regression set, not a fresh blind holdout. Missing truth remains unknown.",
            "This replay does not test app integration or fresh model reliability; those require separate real HTTP/browser checks.",
          ],
        },
        null,
        2,
      ) + "\n",
    );
    console.log(
      JSON.stringify({
        run: `${base}-${cohort.name}`,
        samples: predictions.length,
        couponsRecovered: predictions.reduce(
          (n, p) => n + p.comparison.coupons_recovered,
          0,
        ),
        informationalAdjustmentsRemoved: predictions.reduce(
          (n, p) => n + p.comparison.informational_adjustments_removed,
          0,
        ),
        receiptsWithPendingChecks: predictions.filter(
          (p) => p.comparison.pending_checks,
        ).length,
      }),
    );
  }
} finally {
  await server.close();
}
