import { cp, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const source = path.dirname(require.resolve("pdfjs-dist/package.json"));
const target = path.resolve(
  import.meta.dirname,
  "../.receipt-assets/pdf-assets",
);
await mkdir(target, { recursive: true });
for (const directory of ["cmaps", "standard_fonts", "wasm", "iccs"])
  await cp(path.join(source, directory), path.join(target, directory), {
    recursive: true,
  });
console.log(
  "Same-origin PDF fonts, character maps, image decoders and profiles are ready.",
);
