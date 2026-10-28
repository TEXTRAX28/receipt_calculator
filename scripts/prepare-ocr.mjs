import { mkdir, readdir, copyFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, "..");
const target = path.join(root, "public", "ocr");
await mkdir(target, { recursive: true });
await copyFile(
  require.resolve("tesseract.js/dist/worker.min.js"),
  path.join(target, "worker.min.js"),
);
const core = path.dirname(require.resolve("tesseract.js-core/package.json"));
for (const name of await readdir(core)) {
  if (/^tesseract-core.*\.(wasm|js)$/.test(name))
    await copyFile(path.join(core, name), path.join(target, name));
}
const data = path.dirname(
  require.resolve("@tesseract.js-data/eng/package.json"),
);
async function findLanguage(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = await findLanguage(file);
      if (found) return found;
    } else if (entry.name === "eng.traineddata.gz") return file;
  }
}
const language =
  (await findLanguage(path.join(data, "4.0.0_best_int"))) ||
  (await findLanguage(data));
if (!language)
  throw new Error("English OCR data missing. Reinstall dependencies.");
await copyFile(language, path.join(target, "eng.traineddata.gz"));
console.log(
  "Same-origin OCR worker, WASM cores and English language data are ready.",
);
