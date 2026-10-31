/** Local advisory-quality sanity check on unchanged representative receipt files. */
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";

const root = process.cwd();
const run = process.argv[2];
if (!run || !/^[\w-]+$/.test(run))
  throw new Error("Choose a new simple run name");
const out = resolve(root, "qa-artifacts/capture-guidance", run);
const sources = [
  "src/lib/image-quality.ts",
  "src/lib/images.ts",
  "receipt_training/scripts/benchmark_capture_quality.mjs",
];
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sourceHashes = Object.fromEntries(
  await Promise.all(
    sources.map(async (name) => [name, digest(await readFile(name))]),
  ),
);
const manifestPath = "receipt_training/manifest.jsonl";
const supplementPath =
  "receipt_training/annotations/private/supplement-manifest.jsonl";
const rows = (bytes) =>
  bytes.toString("utf8").trim().split("\n").map(JSON.parse);
const original = await readFile(manifestPath),
  supplement = await readFile(supplementPath);
const ids = [
  "cord-v2-train-000",
  "cord-v2-train-001",
  "costco-tw-20121104",
  "user-costco-bristol-001",
  "tesco-gb-1994",
];
const selected = ids.map((id) => {
  const record = rows(original).find((row) => row.receipt_id === id);
  if (!record?.file_path)
    throw new Error("Missing original representative input");
  return {
    id,
    path: `receipt_training/${record.file_path}`,
    sha256: record.sha256,
  };
});
const grouped = rows(supplement).find(
  (row) => row.receipt_id === "supplement-user-uk-20261026-group",
);
for (const [index, file] of grouped.source_files.entries())
  selected.push({
    id: `${grouped.receipt_id}-photo-${index + 1}`,
    path: `receipt_training/${file.file_path}`,
    sha256: file.sha256,
  });
await mkdir(resolve(root, "qa-artifacts/capture-guidance"), {
  recursive: true,
});
await mkdir(out, { recursive: false });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const blocked = [],
  records = [];
try {
  const page = await browser.newPage();
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== "http://127.0.0.1:5174") {
      blocked.push(url.origin);
      return route.abort();
    }
    return route.continue();
  });
  await page.goto("http://127.0.0.1:5174/");
  for (const item of selected) {
    const bytes = await readFile(item.path);
    if (digest(bytes) !== item.sha256) throw new Error("Receipt input changed");
    const type = /\.webp$/.test(item.path) ? "image/webp" : "image/jpeg";
    const metrics = await page.evaluate(
      async ({ encoded, type }) => {
        const { prepareImage } = await import("/src/lib/images.ts");
        const { inspectCapture } = await import("/src/lib/image-quality.ts");
        const bytes = Uint8Array.from(atob(encoded), (character) =>
          character.charCodeAt(0),
        );
        const file = new File([bytes], "local-receipt", { type });
        const started = performance.now();
        const prepared = await prepareImage(file);
        const preparationMs = performance.now() - started;
        const bitmap = await createImageBitmap(file);
        const analysisStarted = performance.now();
        const repeated = inspectCapture(bitmap);
        const analysisMs = performance.now() - analysisStarted;
        const dimensions = { width: bitmap.width, height: bitmap.height };
        bitmap.close();
        URL.revokeObjectURL(prepared.url);
        if (JSON.stringify(repeated) !== JSON.stringify(prepared.quality))
          throw new Error("Advisory analysis is not repeatable");
        return {
          ...dimensions,
          quality: prepared.quality ?? null,
          preparation_ms: preparationMs,
          repeated_quality_only_ms: analysisMs,
        };
      },
      { encoded: bytes.toString("base64"), type },
    );
    records.push({ ...item, ...metrics });
  }
} finally {
  await browser.close();
}
for (const [name, expected] of Object.entries(sourceHashes))
  if (digest(await readFile(name)) !== expected)
    throw new Error("Assessment source changed during the check");
const report = {
  scope:
    "Seven unchanged representative original/supplement photographs, local advisory-only sanity check. No quality ground-truth labels, OCR rerun, accuracy metric or phone-performance claim.",
  records,
  source_sha256: sourceHashes,
  manifest_sha256: digest(original),
  supplement_manifest_sha256: digest(supplement),
  blocked_browser_origins: [...new Set(blocked)],
  external_receipt_uploads: 0,
  provider_api_requests: 0,
  timing_scope:
    "Headless desktop Chrome on the existing local Vite app, serial inputs, existing OS/browser caches. Preparation includes image processing and assessment; a second assessment-only measurement uses the same original bitmap. Not a representative latency distribution.",
};
await writeFile(
  resolve(out, "metadata.json"),
  JSON.stringify(report, null, 2),
  { encoding: "utf8", flag: "wx" },
);
console.log(
  JSON.stringify({
    cases: records.length,
    flagged: records
      .filter((record) => record.quality?.flags.length)
      .map((record) => ({ id: record.id, flags: record.quality.flags })),
    blocked_browser_origins: report.blocked_browser_origins,
  }),
);
