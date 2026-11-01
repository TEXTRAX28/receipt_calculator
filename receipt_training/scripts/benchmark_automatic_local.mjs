// Actual two-photo local UI workflow plus an owned Node/browser/model memory tree.
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import assert from "node:assert/strict";
import { createServer, loadEnv } from "vite";
import { chromium, expect } from "@playwright/test";

const root = fileURLToPath(new URL("../../", import.meta.url));
const run = process.argv[2];
const simple = process.argv.includes("--simple");
assert(/^[\w-]+$/.test(run || ""), "Use a new local run name");
const out = resolve(root, "receipt_training/evaluation/runs", run);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const writeJson = (name, data) =>
  writeFile(resolve(out, name), JSON.stringify(data, null, 2) + "\n", {
    flag: "wx",
  });
const localEnv = loadEnv("development", root, "LOCAL_");
const childEnv = {
  ...process.env,
  LOCAL_OCR_PYTHON: localEnv.LOCAL_OCR_PYTHON || "",
  LOCAL_OCR_ENGINE: "paddle-v6",
  LOCAL_VISION_ENABLED: "1",
  GEMINI_API_KEY: "",
  VERYFI_CLIENT_ID: "",
  VERYFI_BEARER_KEY: "",
  VERYFI_ALLOWANCE_ID: "",
  VERYFI_DOCUMENT_LIMIT: "0",
};
assert(
  childEnv.LOCAL_OCR_PYTHON,
  "The existing local Python installation is needed",
);

if (process.argv[3] !== "--worker") {
  await mkdir(out);
  const hashes = {};
  async function save(name) {
    const bytes = await readFile(resolve(root, name));
    hashes[name] = sha(bytes);
    const target = resolve(out, "source", name);
    await mkdir(resolve(target, ".."), { recursive: true });
    await writeFile(target, bytes, { flag: "wx" });
  }
  async function walk(name) {
    for (const entry of await readdir(resolve(root, name), {
      withFileTypes: true,
    })) {
      const path = name + "/" + entry.name;
      if (entry.isDirectory()) await walk(path);
      else if (/\.(ts|tsx|mjs|py|css|json)$/.test(path)) await save(path);
    }
  }
  await walk("src");
  await walk("server");
  for (const name of [
    "vite.config.ts",
    "index.html",
    "package-lock.json",
    "receipt_training/scripts/benchmark_automatic_local.mjs",
    "receipt_training/scripts/observe_process_memory.py",
    "receipt_training/scripts/setup_vision_candidate.py",
    "receipt_training/evaluation/vision-candidate-manifest.json",
    "receipt_training/annotations/private/supplement-manifest.jsonl",
  ])
    await save(name);
  const manifest = (
    await readFile(
      resolve(
        root,
        "receipt_training/annotations/private/supplement-manifest.jsonl",
      ),
      "utf8",
    )
  )
    .trim()
    .split(/\r?\n/)
    .map(JSON.parse);
  const record = simple
    ? {
        receipt_id: "synthetic-clear-automatic-local",
        synthetic: true,
        external_processing_allowed: false,
        source_files: [],
        rows: [
          "MARKET",
          "Tea 1x 5.50 5.50",
          "Prices include tax",
          "TOTAL GBP 5.50",
        ],
      }
    : manifest.find(
        (row) => row.receipt_id === "supplement-user-uk-20261026-group",
      );
  assert(
    record &&
      record.external_processing_allowed === false &&
      (simple || record.source_files.length === 2),
  );
  for (const source of record.source_files)
    assert.equal(
      sha(await readFile(resolve(root, "receipt_training", source.file_path))),
      source.sha256,
    );
  await writeJson("plan.json", {
    scope: simple
      ? "Synthetic clear printed receipt through actual installed PaddleOCR, automatic routing and exact reviewed split. Real local inference, not real-receipt accuracy or handset performance. No retries or cloud requests."
      : "One previously measured, source-informed UK development transaction with actual installed local models. No retries, cloud requests, model accuracy holdout or handset performance claim.",
    record,
    source_sha256: hashes,
    started_at: new Date().toISOString(),
  });
  // Keep the proven sampling algorithm byte-for-byte except its source-root constant
  // and descriptive scope label. The exact executed observer is saved with the run.
  const observer = (
    await readFile(
      resolve(root, "receipt_training/scripts/observe_process_memory.py"),
      "utf8",
    )
  )
    .replace(
      "ROOT = Path(__file__).resolve().parents[2]",
      `ROOT = Path(${JSON.stringify(root.replaceAll("\\", "/"))})`,
    )
    .replace(
      "Excludes browser, Node parent and GPU memory;",
      "Includes the owned Node app root, its Chrome browser and local model descendants; excludes GPU and unrelated apps; shared pages may be counted more than once;",
    );
  await writeFile(resolve(out, "observe-app-memory.py"), observer, {
    flag: "wx",
  });
  const worker = spawn(
    process.execPath,
    [
      fileURLToPath(import.meta.url),
      run,
      "--worker",
      ...(simple ? ["--simple"] : []),
    ],
    {
      cwd: root,
      env: childEnv,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let stdout = "",
    stderr = "";
  worker.stdout.on("data", (bytes) => {
    stdout += bytes.toString();
  });
  worker.stderr.on("data", (bytes) => {
    stderr += bytes.toString();
  });
  assert(worker.pid);
  const monitor = spawn(
    childEnv.LOCAL_OCR_PYTHON,
    [
      "-X",
      "utf8",
      resolve(out, "observe-app-memory.py"),
      "--pid",
      String(worker.pid),
      "--output",
      resolve(out, "memory.json"),
    ],
    {
      cwd: root,
      env: childEnv,
      windowsHide: true,
      stdio: ["ignore", "ignore", "pipe"],
    },
  );
  let monitorError = "";
  monitor.stderr.on("data", (bytes) => {
    monitorError += bytes.toString();
  });
  const monitorDone = once(monitor, "close");
  const [code, signal] = await once(worker, "close");
  const [monitorCode] = await monitorDone;
  await writeFile(resolve(out, "worker-stdout.log"), stdout, { flag: "wx" });
  await writeFile(resolve(out, "worker-stderr.log"), stderr, { flag: "wx" });
  let unchanged = true;
  for (const [name, expected] of Object.entries(hashes))
    if (sha(await readFile(resolve(root, name))) !== expected)
      unchanged = false;
  await writeJson("execution.json", {
    worker_pid: worker.pid,
    worker_exit_code: code,
    worker_signal: signal,
    observer_exit_code: monitorCode,
    observer_error: monitorError,
    source_unchanged: unchanged,
    observer_sha256: sha(observer),
    source_sha256: hashes,
    memory_scope:
      "250ms sampled working-set sum for this owned Node app, Chrome and local OCR/vision descendants. Excludes GPU/unrelated apps/supervisor/observer; shared resident pages may be double-counted and short peaks missed. Desktop with phone viewport, not phone memory.",
    completed_at: new Date().toISOString(),
  });
  console.log(
    JSON.stringify({
      run,
      worker_exit_code: code,
      observer_exit_code: monitorCode,
      source_unchanged: unchanged,
    }),
  );
  process.exitCode = code || monitorCode || (unchanged ? 0 : 1);
} else {
  for (const [key, value] of Object.entries(childEnv)) process.env[key] = value;
  const plan = JSON.parse(await readFile(resolve(out, "plan.json"), "utf8"));
  const meta = {
    scope: plan.scope,
    started_at: new Date().toISOString(),
    pid: process.pid,
    node: process.version,
    browser: null,
    native_http_requests: [],
    blocked_requests: [],
    external_requests: 0,
    api_cost: "0",
    no_financial_edits: true,
  };
  let browser, server;
  try {
    server = await createServer({
      root,
      server: { host: "127.0.0.1", port: 0, strictPort: false, hmr: false },
      cacheDir: resolve(root, "node_modules/.vite-" + run),
      logLevel: "warn",
    });
    await server.listen();
    const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
    browser = await chromium.launch({ channel: "chrome", headless: true });
    meta.browser = browser.version();
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      serviceWorkers: "block",
    });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    const requests = [],
      responses = [];
    await page.route("**/*", (route) => {
      const request = route.request(),
        url = new URL(request.url());
      if (
        url.origin !== origin ||
        (request.method() !== "GET" &&
          !(
            request.method() === "POST" &&
            ["/api/receipts/recognize", "/api/receipts/vision"].includes(
              url.pathname,
            )
          ))
      ) {
        meta.blocked_requests.push({
          method: request.method(),
          origin: url.origin,
          path: url.pathname,
        });
        return route.abort();
      }
      if (request.method() === "POST") requests.push(request);
      return route.continue();
    });
    page.on("response", (response) => {
      if (response.request().method() !== "POST") return;
      responses.push(
        (async () => {
          const bytes = await response.body(),
            path = new URL(response.url()).pathname;
          await writeFile(
            resolve(
              out,
              path.endsWith("/vision")
                ? "vision-response.json"
                : "ocr-response.json",
            ),
            bytes,
            { flag: "wx" },
          );
          return {
            path,
            status: response.status(),
            response_sha256: sha(bytes),
          };
        })(),
      );
    });
    await page.goto(origin);
    const providers = await (
      await context.request.get(origin + "/api/receipts/providers")
    ).json();
    const gemini = await (
      await context.request.get(origin + "/api/receipts/config")
    ).json();
    assert(
      providers.localModel.configured &&
        providers.localVision.configured &&
        !gemini.configured,
    );
    assert.equal(providers.veryfi.remaining, 0);
    assert.equal(providers.veryfi.configured, false);
    meta.providers = providers;
    meta.gemini_configured = gemini.configured;
    await expect(
      page.getByRole("button", { name: "This computer", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.getByLabel("Local vision comparison", { exact: true }),
    ).toHaveValue("auto");
    const inputs = simple
      ? await (async () => {
          const image = await page.evaluate((rows) => {
            const canvas = document.createElement("canvas");
            canvas.width = 800;
            canvas.height = 1000;
            const ctx = canvas.getContext("2d");
            ctx.fillStyle = "white";
            ctx.fillRect(0, 0, 800, 1000);
            ctx.fillStyle = "black";
            ctx.font = "32px monospace";
            rows.forEach((row, index) =>
              ctx.fillText(row, 70, 120 + index * 95),
            );
            return canvas.toDataURL("image/png").split(",")[1];
          }, plan.record.rows);
          const bytes = Buffer.from(image, "base64");
          await writeFile(resolve(out, "synthetic-source.png"), bytes, {
            flag: "wx",
          });
          meta.synthetic_source_sha256 = sha(bytes);
          return [
            { name: "synthetic.png", mimeType: "image/png", buffer: bytes },
          ];
        })()
      : plan.record.source_files.map((source) =>
          resolve(root, "receipt_training", source.file_path),
        );
    await page.getByLabel("Upload receipt images").setInputFiles(inputs);
    await expect(
      page.getByRole("button", {
        name: "Read receipt on this computer",
        exact: true,
      }),
    ).toBeEnabled();
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page
      .getByLabel("Local vision comparison", { exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(out, "capture-phone.png") });
    const started = performance.now();
    await page
      .getByRole("button", {
        name: "Read receipt on this computer",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "A quick check, then we share.",
        exact: true,
      }),
    ).toBeVisible({ timeout: 260000 });
    meta.click_to_review_ms = Math.round(performance.now() - started);
    meta.timing_scope =
      "One scan-button click through preparation, actual PaddleOCR/model loading and independent Qwen inference, browser verification and editable review. Existing disk/OS/shader caches, no parallel tests during measurement; excludes upload selection and human review. Not p95.";
    meta.native_http_requests = await Promise.all(responses);
    assert.deepEqual(
      meta.native_http_requests.map((item) => item.path),
      ["/api/receipts/recognize", ...(simple ? [] : ["/api/receipts/vision"])],
    );
    assert(meta.native_http_requests.every((item) => item.status === 200));
    const bodies = requests.map((request) => JSON.parse(request.postData()));
    if (!simple) assert.deepEqual(bodies[0], bodies[1]);
    assert.deepEqual(Object.keys(bodies[0]), ["panels"]);
    meta.request_body_sha256 = requests.map((request) =>
      sha(request.postData()),
    );
    meta.panels = [];
    for (const [index, panel] of bodies[0].panels.entries()) {
      const bytes = Buffer.from(panel.data, "base64");
      await writeFile(resolve(out, `panel-${index + 1}.jpg`), bytes, {
        flag: "wx",
      });
      meta.panels.push({
        photo: panel.photo,
        part: panel.part,
        bytes: bytes.length,
        sha256: sha(bytes),
      });
    }
    const observed = await page.evaluate(async () => {
      const state = JSON.parse(localStorage.getItem("gather.receipt.v1"));
      const { calculateReceipt } = await import("/src/lib/engine.ts");
      return JSON.parse(
        JSON.stringify(
          {
            receipt: state.receipt,
            calculation: calculateReceipt(state.receipt),
          },
          (_, value) => (typeof value === "bigint" ? String(value) : value),
        ),
      );
    });
    await writeJson("app-draft.json", observed);
    const { costcoDemo } = await server.ssrLoadModule("/src/lib/demo.ts");
    const financial = (receipt) =>
      receipt.items.map((item) =>
        [item.quantity, item.unitPrice, item.lineTotal, item.discount]
          .map(Number)
          .concat(item.taxCode),
      );
    assert.deepEqual(
      financial(observed.receipt),
      simple ? [[1, 5.5, 5.5, 0, ""]] : financial(costcoDemo()),
      "Source-checked UK financial vector differs; preserve draft, no retry",
    );
    assert.equal(observed.calculation.total, simple ? "550" : "17678");
    meta.source_checked_financial_rows_match = true;
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.screenshot({ path: resolve(out, "review-phone.png") });
    const confirm = page.getByRole("button", {
      name: "Confirm receipt & add people",
      exact: true,
    });
    await expect(confirm).toBeDisabled();
    // The previously source-checked vector above is required before any review click.
    for (const checkbox of await page
      .locator(".verification-checks")
      .getByRole("checkbox")
      .all())
      if (await checkbox.isEnabled()) await checkbox.check();
    await expect(confirm).toBeEnabled();
    await confirm.click();
    for (const name of ["Alice", "Bob", "Charlie"]) {
      await page
        .getByRole("textbox", { name: "Person’s name", exact: true })
        .fill(name);
      await page
        .getByRole("button", { name: "Add person", exact: true })
        .click();
    }
    await page
      .getByRole("button", { name: "Let’s share it", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Whole receipt", exact: true })
      .click();
    for (const checkbox of await page
      .getByTestId("whole-assignment")
      .getByRole("checkbox")
      .all())
      await checkbox.check();
    await page
      .getByRole("button", { name: "Finalize split", exact: true })
      .click();
    meta.shares = [];
    for (const [index, amount] of (simple
      ? ["£1.84", "£1.83", "£1.83"]
      : ["£58.93", "£58.93", "£58.92"]
    ).entries()) {
      await expect(page.getByTestId(`person-total-${index}`)).toHaveText(
        amount,
      );
      meta.shares.push(amount);
    }
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    assert.deepEqual(meta.blocked_requests, []);
    await page.screenshot({ path: resolve(out, "split-phone.png") });
    meta.completed_workflow = true;
  } catch (error) {
    meta.error = String(error);
    process.exitCode = 1;
  } finally {
    await browser?.close();
    await server?.close();
    meta.completed_at = new Date().toISOString();
    await writeJson("metadata.json", meta);
  }
}
