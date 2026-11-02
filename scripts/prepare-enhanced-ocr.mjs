// Optional, checksum-pinned public models. Never reads receipt files or env keys.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  rename,
  rm,
  statfs,
  writeFile,
} from "node:fs/promises";
import { resolve } from "node:path";
import assets from "./enhanced-ocr-assets.json" with { type: "json" };

const root = resolve(import.meta.dirname, "..");
const cache = resolve(root, ".cache/enhanced-ocr");
const output = resolve(root, "public/ocr-enhanced");
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const read = async (path, info) => {
  const bytes = await readFile(path);
  assert.equal(bytes.length, info.bytes, "Unexpected asset size: " + path);
  assert.equal(sha(bytes), info.sha256, "Unexpected asset checksum: " + path);
  return bytes;
};
async function atomic(path, bytes) {
  const temporary = path + "." + randomUUID() + ".tmp";
  try {
    await writeFile(temporary, bytes, { flag: "wx" });
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}
function tar(files) {
  const blocks = [];
  for (const [name, bytes] of files) {
    const header = Buffer.alloc(512);
    const octal = (n, at, width) =>
      header.write(
        n.toString(8).padStart(width - 1, "0") + "\0",
        at,
        width,
        "ascii",
      );
    header.write(name, 0, 100, "ascii");
    octal(0o444, 100, 8);
    octal(0, 108, 8);
    octal(0, 116, 8);
    octal(bytes.length, 124, 12);
    octal(0, 136, 12);
    header.fill(32, 148, 156);
    header[156] = 48;
    header.write("ustar", 257, 5, "ascii");
    header.write("00", 263, 2, "ascii");
    const sum = header.reduce((a, b) => a + b, 0);
    header.write(sum.toString(8).padStart(6, "0") + "\0 ", 148, 8, "ascii");
    blocks.push(
      header,
      bytes,
      Buffer.alloc((512 - (bytes.length % 512)) % 512),
    );
  }
  blocks.push(Buffer.alloc(1024));
  const content = Buffer.concat(blocks);
  return Buffer.concat([
    content,
    Buffer.alloc((10240 - (content.length % 10240)) % 10240),
  ]);
}
async function download(model, file) {
  // Immutable official repository, no caller-supplied URLs, keys or request data.
  const url = `https://huggingface.co/${model.repository}/resolve/${model.revision}/${file.name}`;
  const response = await fetch(url, {
    signal: AbortSignal.timeout(120000),
    credentials: "omit",
  });
  assert(
    response.ok && response.url.startsWith("https://") && response.body,
    "Public model download failed",
  );
  const chunks = [];
  let count = 0;
  for await (const chunk of response.body) {
    count += chunk.length;
    if (count > file.bytes) {
      await response.body.cancel().catch(() => {});
      throw new Error("Model size bound exceeded");
    }
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks);
  assert.equal(bytes.length, file.bytes);
  assert.equal(sha(bytes), file.sha256);
  return bytes;
}
await mkdir(cache, { recursive: true });
const disk = await statfs(root);
assert(
  disk.bavail * disk.bsize > 100 * 1024 ** 2,
  "At least 100 MiB free is required for optional reader assets",
);
const prepared = [];
for (const model of assets.models) {
  const target = resolve(cache, model.file);
  let bytes;
  try {
    bytes = await read(target, model);
  } catch (error) {
    if (!process.argv.includes("--download")) {
      if (error.code !== "ENOENT") throw error;
      console.log(
        "Enhanced reader models are optional. Run npm run setup:enhanced to install them; the basic reader remains available.",
      );
      process.exit(0);
    }
    const files = [];
    for (const file of model.files)
      files.push([file.name, await download(model, file)]);
    bytes = tar(files);
    assert.equal(bytes.length, model.bytes);
    assert.equal(sha(bytes), model.sha256);
    await atomic(target, bytes);
  }
  prepared.push([model.file, bytes]);
}
const modules = resolve(root, "node_modules");
assert.equal(
  JSON.parse(
    await readFile(resolve(modules, "@paddleocr/paddleocr-js/package.json")),
  ).version,
  assets.sdk,
);
assert.equal(
  JSON.parse(await readFile(resolve(modules, "onnxruntime-web/package.json")))
    .version,
  assets.ort,
);
await read(
  resolve(modules, "@paddleocr/paddleocr-js/dist/assets", assets.worker.file),
  assets.worker,
);
for (const file of assets.runtime)
  prepared.push([
    file.file,
    await read(resolve(modules, "onnxruntime-web/dist", file.file), file),
  ]);
await mkdir(output, { recursive: true });
for (const [name, bytes] of prepared)
  await atomic(resolve(output, name), bytes);
console.log(
  "Enhanced reader's pinned models and WASM files are ready for same-origin, on-device use.",
);
