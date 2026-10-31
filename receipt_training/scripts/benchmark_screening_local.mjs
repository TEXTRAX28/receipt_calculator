// Real localhost Paddle + independent vision reads of the sealed screening PNGs.
// No provider key, ground truth, cloud request or automatic retry in this runner.
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = fileURLToPath(new URL("../../", import.meta.url));
const folder = resolve(
  root,
  "qa-artifacts/provider-review/veryfi-screening-crops-v2",
);
const out = resolve(folder, "local-comparison-v1");
const base = "http://127.0.0.1:5174";
const sha = (raw) => createHash("sha256").update(raw).digest("hex");
const planBytes = await readFile(
  resolve(root, "receipt_training/evaluation/veryfi-screening-plan-v1.json"),
);
const plan = JSON.parse(planBytes);
const manifestBytes = await readFile(resolve(folder, "manifest.json"));
if (
  sha(manifestBytes) !== plan.manifest_sha256 ||
  sha(await readFile(new URL(import.meta.url))) !== plan.local_runner_sha256
)
  throw new Error("Prepared local protocol changed");
const manifest = JSON.parse(manifestBytes),
  inputs = [];
for (const row of manifest.cases) {
  const bytes = await readFile(resolve(folder, row.crop_file));
  if (sha(bytes) !== row.crop_sha256)
    throw new Error("Inspected pixels changed");
  inputs.push({ ...row, encoded: bytes.toString("base64") });
}
await mkdir(out);
const sources = {};
for (const directory of ["src/lib", "server"])
  for (const name of await readdir(resolve(root, directory))) {
    if (!/[.](?:ts|mjs|py|json)$/.test(name)) continue;
    const path = directory + "/" + name,
      bytes = await readFile(resolve(root, path));
    sources[path] = sha(bytes);
    await mkdir(resolve(out, "source", directory), { recursive: true });
    await writeFile(resolve(out, "source", path), bytes, { flag: "wx" });
  }
for (const path of [
  "package-lock.json",
  "receipt_training/scripts/benchmark_screening_local.mjs",
]) {
  const bytes = await readFile(resolve(root, path));
  sources[path] = sha(bytes);
  await mkdir(resolve(out, "source", path, ".."), { recursive: true });
  await writeFile(resolve(out, "source", path), bytes, { flag: "wx" });
}
const browser = await chromium.launch({ channel: "chrome", headless: true });
const http = [],
  blocked = [],
  pending = [],
  cases = [],
  modules = {};
let active = null;
try {
  const page = await browser.newPage();
  await page.route("**/*", (route) => {
    const request = route.request(),
      url = new URL(request.url());
    const allowedPost = ["/api/receipts/recognize", "/api/receipts/vision"];
    if (
      url.origin !== base ||
      (request.method() === "POST" &&
        (!active ||
          !allowedPost.includes(url.pathname) ||
          active.posts.has(url.pathname)))
    ) {
      blocked.push({
        origin: url.origin,
        path: url.pathname,
        method: request.method(),
      });
      return route.abort();
    }
    if (request.method() === "POST") {
      let exactInput = false;
      try {
        const packet = JSON.parse(request.postData());
        exactInput =
          Object.keys(packet).join() === "panels" &&
          packet.panels.length === 1 &&
          sha(Buffer.from(packet.panels[0].data, "base64")) ===
            active.crop_sha256;
      } catch {
        /* A changed request is blocked before model inference. */
      }
      if (!exactInput) {
        blocked.push({
          case: active.id,
          path: url.pathname,
          reason: "changed-input",
        });
        return route.abort();
      }
      active.posts.add(url.pathname);
    }
    return route.continue();
  });
  page.on("response", (response) => {
    const request = response.request(),
      url = new URL(request.url());
    if (url.pathname.startsWith("/src/lib/") && !modules[url.pathname]) {
      modules[url.pathname] = "pending";
      pending.push(
        response.body().then(async (raw) => {
          const path = "transformed" + url.pathname + ".js";
          await mkdir(resolve(out, path, ".."), { recursive: true });
          await writeFile(resolve(out, path), raw, { flag: "wx" });
          modules[url.pathname] = { path, sha256: sha(raw) };
        }),
      );
    }
    if (request.method() !== "POST" || !active) return;
    const id = active.id,
      packet = JSON.parse(request.postData());
    const metadata = {
      case: id,
      path: url.pathname,
      status: response.status(),
      request_sha256: sha(request.postData()),
      images: packet.panels.map((p) => ({
        photo: p.photo,
        part: p.part,
        sha256: sha(Buffer.from(p.data, "base64")),
      })),
    };
    http.push(metadata);
    const file = resolve(
      out,
      id,
      url.pathname.endsWith("recognize")
        ? "response-recognize.json"
        : "response-vision.json",
    );
    pending.push(
      response.body().then(async (raw) => {
        metadata.response_sha256 = sha(raw);
        await writeFile(file, raw, { flag: "wx" });
      }),
    );
  });
  await page.goto(base + "/");
  for (const input of inputs) {
    active = {
      id: input.case,
      crop_sha256: input.crop_sha256,
      posts: new Set(),
    };
    await mkdir(resolve(out, input.case));
    let result;
    try {
      result = await page.evaluate(async (encoded) => {
        const { extractComparedReceipt } =
          await import("/src/lib/compared-reader.ts");
        const { calculateReceipt } = await import("/src/lib/engine.ts");
        const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
        const blob = new Blob([bytes], { type: "image/png" });
        const image = {
          id: "screening-photo",
          name: "receipt.png",
          url: URL.createObjectURL(blob),
          blob,
        };
        const progress = [],
          started = performance.now();
        try {
          const reading = await extractComparedReceipt(
            [image],
            AbortSignal.timeout(180000),
            (s) => progress.push(s),
          );
          const calculation = calculateReceipt(reading.receipt);
          return JSON.parse(
            JSON.stringify(
              {
                reading,
                calculation,
                progress,
                elapsed_ms: performance.now() - started,
              },
              (_k, value) =>
                typeof value === "bigint" ? value.toString() : value,
            ),
          );
        } finally {
          URL.revokeObjectURL(image.url);
        }
      }, input.encoded);
    } catch (error) {
      result = { error: String(error.message).slice(0, 500) };
    }
    await Promise.all(pending);
    await writeFile(
      resolve(out, input.case, "result.json"),
      JSON.stringify(result, null, 2),
      { flag: "wx" },
    );
    const metadata = {
      case: input.case,
      original_split: input.original_split,
      http_requests: http.filter((row) => row.case === input.case),
      result_sha256: sha(
        await readFile(resolve(out, input.case, "result.json")),
      ),
      comparison_complete: result.reading?.comparisonComplete || false,
      error: result.error || null,
      elapsed_ms: result.elapsed_ms || null,
    };
    cases.push(metadata);
    console.log(
      JSON.stringify({
        case: input.case,
        comparison_complete: metadata.comparison_complete,
        proposed_rows: result.reading?.receipt.items.length ?? null,
        local_model_requests: metadata.http_requests.length,
        elapsed_ms: metadata.elapsed_ms,
        error: metadata.error,
      }),
    );
  }
  active = null;
  await Promise.all(pending);
  for (const [path, digest] of Object.entries(sources))
    if (sha(await readFile(resolve(root, path))) !== digest)
      throw new Error("Application source changed during the screen");
  const metadata = {
    scope:
      "Six source-informed cropped receipts, actual current installed local Paddle and independent Qwen reads. Exact lossless PNG inputs, no label/currency hint or previous OCR passed to vision. Not a new holdout or production selection.",
    cases,
    http,
    blocked_requests: blocked,
    source_sha256: sources,
    loaded_modules: modules,
    browser_version: browser.version(),
    browser_channel: "chrome",
    headless: true,
    physical_phone: false,
    node_version: process.version,
    plan_sha256: sha(planBytes),
    manifest_sha256: sha(manifestBytes),
    external_receipt_uploads: 0,
    external_api_requests: 0,
    label_files_read: false,
    automatic_retries: 0,
    source_unchanged: true,
    timing_scope:
      "Whole browser extraction and independent comparison, with warm-worker/cache/order/host-load effects. Crop preparation and offline variants excluded; six observations are not a controlled provider speed comparison or p95.",
  };
  await writeFile(
    resolve(out, "metadata.json"),
    JSON.stringify(metadata, null, 2),
    { flag: "wx" },
  );
  if (blocked.length || cases.some((row) => !row.comparison_complete))
    process.exitCode = 1;
} finally {
  await browser.close();
}
