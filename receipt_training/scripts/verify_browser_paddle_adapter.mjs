// No new inference: require the app's adapter to match all 56 saved SDK panels.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
const root = fileURLToPath(new URL("../../", import.meta.url)),
  tag = process.argv[2];
assert(/^[\w-]+$/.test(tag || ""));
const out = resolve(root, "qa-artifacts", tag);
await mkdir(out);
const sha = (raw) => createHash("sha256").update(raw).digest("hex"),
  inputs = {};
async function read(name, expected) {
  const raw = await readFile(resolve(root, name));
  if (expected) assert.equal(sha(raw), expected, name);
  inputs[name] = sha(raw);
  return raw;
}
const json = async (name, expected) => JSON.parse(await read(name, expected));
const server = await createServer({
  root,
  configFile: false,
  envDir: false,
  appType: "custom",
  logLevel: "error",
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, watch: null },
});
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => {
  throw new Error("Network disabled in saved SDK geometry verification");
};
try {
  const { paddlePanel } = await server.ssrLoadModule(
    "/src/lib/paddle-layout.ts",
  );
  const comparisons = [];
  for (const [saved, converted] of [
    [
      "browser-paddle-tiny-capture-v1",
      "browser-paddle-tiny-capture-adapted-v1",
    ],
    [
      "browser-paddle-tiny-original50-v1",
      "browser-paddle-tiny-original50-adapted-v1",
    ],
  ]) {
    const raw = await json(`qa-artifacts/${saved}/capture-results.json`);
    const adapted = await json(`qa-artifacts/${converted}/adapted.json`);
    for (const entry of raw.cases) {
      const previous = adapted.cases.find(
        (c) => c.receipt_id === entry.receipt_id,
      );
      assert(previous);
      for (const [i, panel] of entry.panels.entries()) {
        const observation = await json(
            `qa-artifacts/${saved}/${panel.result}`,
            panel.result_sha256,
          ),
          f = panel.frame;
        const current = paddlePanel(
          observation.reading,
          f.width,
          f.height,
          f.photo,
          f.part,
        );
        assert.deepEqual(current, previous.recognition.panels[i]);
        comparisons.push({
          receipt_id: entry.receipt_id,
          photo: f.photo,
          part: f.part,
          fragments: current.words.length,
          identical: true,
        });
      }
    }
  }
  assert.equal(comparisons.length, 56);
  const sources = {};
  for (const path of [
    "src/lib/paddle-layout.ts",
    "src/lib/recognition-schema.mjs",
    "src/lib/parser.ts",
    "src/lib/receipt-layout.ts",
    "package-lock.json",
  ])
    sources[path] = sha(await read(path));
  const runner = await readFile(fileURLToPath(import.meta.url));
  await writeFile(resolve(out, "runner.mjs"), runner, { flag: "wx" });
  await writeFile(
    resolve(out, "result.json"),
    JSON.stringify(
      {
        comparisons,
        source_sha256: sources,
        input_sha256: inputs,
        runner_sha256: sha(runner),
        fresh_ocr_calls: 0,
        network_calls: 0,
        scope:
          "Exact comparison of actual saved polygons/scores/grouped text in the app TypeScript adapter and independent Python adapter on 56 panels. No new model inference, truth changes or claim of correct OCR.",
      },
      null,
      2,
    ) + "\n",
    { flag: "wx" },
  );
  console.log(
    JSON.stringify({ identical_panels: comparisons.length, new_ocr: 0 }),
  );
} finally {
  globalThis.fetch = originalFetch;
  await server.close();
}
