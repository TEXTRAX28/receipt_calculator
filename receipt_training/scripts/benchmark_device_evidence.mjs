// Paired real browser Tesseract calls, frozen code, original manifest; no cloud/config/key loading.
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium } from "@playwright/test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i < 0 ? fallback : process.argv[i + 1]; };
const run = arg("--run", "tesseract-source-original50-v1");
const beforeCommit = "6613870";
if (!/^[\w-]+$/.test(run)) throw Error("Invalid run name");
const limit = Number(arg("--limit", "50"));
if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw Error("Invalid limit");
const out = resolve(root, "receipt_training/evaluation/runs", run);
await mkdir(out); // Exclusive: an earlier run is never overwritten.
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const store = async (path, data) => { await mkdir(dirname(path), { recursive: true }); await writeFile(path, data, { flag: "wx" }); };
const manifestBytes = await readFile(resolve(root, "receipt_training/manifest.jsonl"));
const records = manifestBytes.toString().trim().split(/\r?\n/).map(JSON.parse).filter((r) => r.real_receipt && r.included_in_pilot !== false).slice(0, limit);
if (records.length !== limit || records.some((r) => r.external_processing_allowed !== false)) throw Error("Unexpected original cohort/permission");
const source_sha256 = {};
for (const variant of ["before", "after"]) {
  const names = variant === "before"
    ? execFileSync("git", ["ls-tree", "-r", "--name-only", beforeCommit, "src/lib"], { cwd: root, encoding: "utf8" }).trim().split(/\r?\n/).filter((p) => /\.(ts|mjs)$/.test(p))
    : (await readdir(resolve(root, "src/lib"))).filter((p) => /\.(ts|mjs)$/.test(p)).map((p) => `src/lib/${p}`);
  for (const name of names) {
    const bytes = variant === "before" ? execFileSync("git", ["show", `${beforeCommit}:${name}`], { cwd: root }) : await readFile(resolve(root, name));
    const path = `source/${variant}/${name.slice("src/lib/".length)}`;
    await store(resolve(out, path), bytes);
    source_sha256[path] = sha(bytes);
  }
}
await store(resolve(out, "runner.mjs"), await readFile(fileURLToPath(import.meta.url)));
const metadata = {
  run, before_commit: beforeCommit, source_commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  started_at: new Date().toISOString(), node: process.version, manifest_sha256: sha(manifestBytes),
  dependency_lock_sha256: sha(await readFile(resolve(root, "package-lock.json"))),
  source_sha256, original_receipts: records.length,
  selected_ids: records.map((r) => r.receipt_id),
  scope: "Fresh paired native browser English Tesseract. Before/after order alternates by case. Same images, local assets, PSM and parameters; after requests actual blocks and joins matching source areas. No labels loaded during inference. No automatic currency selection from ground truth.",
  timing_scope: "Per-variant image preparation, panel hashing, new worker, OCR, parsing, review gating, source collection and reconciliation. Browser/server/module startup excluded; shared browser asset cache. Metadata and source collection are included only in after, so this measures the full local workflow overhead, not pure model time. No concurrent native benchmark is intended.",
  api_requests: 0, api_cost_usd: 0, compute_cost: null, physical_phone: false,
};
await store(resolve(out, "metadata.json"), JSON.stringify(metadata, null, 2));
const prefix = "/" + relative(root, out).replaceAll("\\", "/");
const server = await createServer({
  root, configFile: false, envDir: false, logLevel: "error", cacheDir: resolve(out, "vite-cache"),
  optimizeDeps: { noDiscovery: true, include: ["zod", "tesseract.js"] },
  server: { host: "127.0.0.1", port: 5276, strictPort: true, hmr: false, watch: { ignored: ["**/receipt_training/**", "**/qa-artifacts/**"] } },
  plugins: [{ name: "local-only-evidence-page", configureServer(vite) { vite.middlewares.use((req, res, next) => {
    if (req.url !== "/__device_evidence") return next();
    res.setHeader("content-type", "text/html"); res.end("<!doctype html><title>Local Tesseract evidence</title>");
  }); } }],
});
let browser;
const results = [], blocked = [], requests = { post: 0, external: 0 };
try {
  await server.listen();
  browser = await chromium.launch({ channel: "chrome", headless: true });
  metadata.browser = browser.version();
  const context = await browser.newContext({ serviceWorkers: "block" });
  await context.route("**/*", (route) => {
    const request = route.request(), url = new URL(request.url());
    if (request.method() === "POST") requests.post++;
    if (url.origin !== "http://127.0.0.1:5276") { requests.external++; blocked.push(url.origin); return route.abort("blockedbyclient"); }
    return route.continue();
  });
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:5276/__device_evidence");
  // Load both graphs first, excluding module compilation from per-case timings.
  await page.evaluate(async (prefix) => { for (const variant of ["before", "after"]) for (const file of ["images", "ocr", "parser", "engine"]) await import(/* @vite-ignore */ `${prefix}/source/${variant}/${file}.ts`); }, prefix);
  for (const [index, record] of records.entries()) {
    const photos = [];
    for (const source of record.source_files || [record]) {
      const bytes = await readFile(resolve(root, "receipt_training", source.file_path));
      if (sha(bytes) !== source.sha256) throw Error("Source image hash changed");
      photos.push({ base64: bytes.toString("base64"), mime: /\.png$/i.test(source.file_path) ? "image/png" : /\.webp$/i.test(source.file_path) ? "image/webp" : "image/jpeg" });
    }
    const result = { receipt_id: record.receipt_id, group_id: record.group_id, image_sha256: record.sha256, split: record.split, order: index % 2 ? ["after", "before"] : ["before", "after"] };
    for (const variant of result.order) {
      result[variant] = await page.evaluate(async ({ prefix, variant, photos, id }) => {
        const path = `${prefix}/source/${variant}`;
        const { prepareImage, readingBlobs } = await import(/* @vite-ignore */ `${path}/images.ts`);
        const { localOcrProvider, joinDetailText } = await import(/* @vite-ignore */ `${path}/ocr.ts`);
        const { parseReceiptWithSources, PHOTO_SEPARATOR } = await import(/* @vite-ignore */ `${path}/parser.ts`);
        const { calculateReceipt } = await import(/* @vite-ignore */ `${path}/engine.ts`);
        const images = [], started = performance.now();
        try {
          for (const [i, photo] of photos.entries()) images.push(await prepareImage(new File([Uint8Array.from(atob(photo.base64), (c) => c.charCodeAt(0))], `${id}-${i}`, { type: photo.mime })));
          const panels = [];
          for (const [photo, image] of images.entries()) for (const [part, blob] of readingBlobs(image).entries()) {
            const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
            panels.push({ photo: photo + 1, part: part + 1, bytes: blob.size, sha256: [...new Uint8Array(digest)].map((n) => n.toString(16).padStart(2, "0")).join("") });
          }
          const extracted = await localOcrProvider.extract(images, new AbortController().signal, () => {});
          const parsed = parseReceiptWithSources(extracted);
          let receipt = parsed.receipt, evidence;
          let parser_finances_equal = null, legacy_text_from_current_sections = null;
          if (variant === "after") {
            const { reviewDeviceReading } = await import(/* @vite-ignore */ `${path}/device-review.ts`);
            const { collectReceiptEvidence } = await import(/* @vite-ignore */ `${path}/receipt-evidence.ts`);
            receipt.warnings = [...receipt.warnings, ...(extracted.warnings || [])].slice(0, 60);
            receipt = reviewDeviceReading(receipt, parsed.sources, extracted.sourceLines || [], extracted.recognition, parsed.fieldSources, extracted.sourceConflicts, extracted.joinedSectionRows);
            if (extracted.recognition && extracted.sourceLines) evidence = collectReceiptEvidence(receipt, extracted.text, parsed.sources, extracted.sourceLines, extracted.recognition, images, parsed.fieldSources, extracted.sourceAlternatives);
            const oldParser = await import(/* @vite-ignore */ `${prefix}/source/before/parser.ts`);
            const financial = (r) => JSON.stringify({ currency: r.currency, items: r.items.map(({ id, ...item }) => item), adjustments: r.adjustments.map(({ id, ...item }) => item), subtotal: r.subtotal, printedTax: r.printedTax, printedTotal: r.printedTotal, taxCodes: r.taxCodes, taxMode: r.taxMode, pricesIncludeTax: r.pricesIncludeTax });
            parser_finances_equal = financial(oldParser.parseReceiptWithSources(extracted).receipt) === financial(parsed.receipt);
            const grouped = new Map();
            for (const section of extracted.rawSections || []) { const list = grouped.get(section.photo) || []; list.push(section.text); grouped.set(section.photo, list); }
            legacy_text_from_current_sections = [...grouped.values()].map(joinDetailText).join(`\n${PHOTO_SEPARATOR}\n`);
          }
          const calculation = calculateReceipt(receipt);
          const summary = evidence ? { items_with_source: Object.keys(evidence.items).length, purchases: receipt.items.length, fields_with_source: Object.keys(evidence.fields || {}), review_checks: receipt.reviewChecks.length } : null;
          return JSON.parse(JSON.stringify({ receipt, calculation, text: extracted.text, recognition: extracted.recognition, sourceLines: extracted.sourceLines, sourceAlternatives: extracted.sourceAlternatives, sourceConflicts: extracted.sourceConflicts, joinedSectionRows: extracted.joinedSectionRows, rawSections: extracted.rawSections, panels, source_summary: summary, parser_finances_equal, legacy_text_from_current_sections, elapsed_ms: Math.round(performance.now() - started) }, (_, value) => typeof value === "bigint" ? value.toString() : value));
        } catch (error) { return { error: String(error).slice(0, 1000), elapsed_ms: Math.round(performance.now() - started) }; }
        finally { images.forEach((image) => URL.revokeObjectURL(image.url)); }
      }, { prefix, variant, photos, id: record.receipt_id });
    }
    result.identical_prepared_pixels = JSON.stringify(result.before.panels) === JSON.stringify(result.after.panels);
    result.identical_text = result.before.text === result.after.text;
    result.identical_legacy_text = result.before.text === result.after.legacy_text_from_current_sections;
    results.push(result);
    await writeFile(resolve(out, "paired.jsonl"), results.map((r) => JSON.stringify(r)).join("\n") + "\n");
    console.log(`${index + 1}/${records.length} ${record.receipt_id}: ${result.before.receipt?.items.length ?? "error"}->${result.after.receipt?.items.length ?? "error"} rows; text ${result.identical_text ? "same" : "changed"}; ${result.before.elapsed_ms}/${result.after.elapsed_ms}ms`);
  }
  metadata.completed_at = new Date().toISOString();
  metadata.requests_observed = requests; metadata.blocked_external_origins = [...new Set(blocked)];
  metadata.paired_sha256 = sha(await readFile(resolve(out, "paired.jsonl")));
  await writeFile(resolve(out, "metadata.json"), JSON.stringify(metadata, null, 2));
} finally { await browser?.close(); await server.close(); }
