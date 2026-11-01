// Seals identical-pixel pairs before inference. Never reads receipt annotations.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { currencyPrecisionSchema } from "./currency_decoder_profile.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const out = resolve(root, "qa-artifacts/currency-decoder-v1");
const sha = (raw) => createHash("sha256").update(raw).digest("hex");
const write = async (name, data) => {
  const bytes = JSON.stringify(data, null, 2) + "\n";
  await writeFile(resolve(out, name), bytes, { flag: "wx" });
  return {
    path: relative(root, resolve(out, name)).replaceAll("\\", "/"),
    sha256: sha(bytes),
  };
};
await mkdir(out);
const self = await readFile(new URL(import.meta.url));
const profile = await readFile(
  new URL("./currency_decoder_profile.mjs", import.meta.url),
);
await writeFile(resolve(out, "builder.mjs"), self, { flag: "wx" });
await writeFile(resolve(out, "profile.mjs"), profile, { flag: "wx" });
const cases = [];
const baseFolder = resolve(
  root,
  "qa-artifacts/advanced-ocr/qwen-raw-printed-v1-requests",
);
for (const id of [
  "cord-v2-train-003",
  "cord-v2-train-004",
  "supplement-user-uk-20261026-group",
]) {
  const requestBytes = await readFile(
    resolve(baseFolder, id + "-control.json"),
  );
  const request = JSON.parse(requestBytes);
  const inputImages = [];
  for (const image of request.images) {
    const path = resolve(root, image);
    if (relative(root, path).startsWith(".."))
      throw new Error("Image outside project");
    const bytes = await readFile(path);
    inputImages.push({ path: image, sha256: sha(bytes), bytes: bytes.length });
  }
  const baseline = {
    ...request,
    constrain_schema: true,
    normalize_numeric_json: false,
    require_clean_schema: true,
  };
  const candidate = {
    ...baseline,
    schema: currencyPrecisionSchema(baseline.schema),
  };
  for (const key of Object.keys(baseline))
    if (
      key !== "schema" &&
      JSON.stringify(baseline[key]) !== JSON.stringify(candidate[key])
    )
      throw new Error("Only decoding schema may change");
  cases.push({
    id,
    split: "previously inspected development/supplement",
    source_request_sha256: sha(requestBytes),
    images: inputImages,
    control: await write(id + "-control.json", baseline),
    candidate: await write(id + "-candidate.json", candidate),
  });
}
const template = JSON.parse(
  await readFile(resolve(baseFolder, "cord-v2-train-004-control.json"), "utf8"),
);
const smokes = [];
for (const currency of ["JPY", "KWD"]) {
  const image = `qa-artifacts/currency-decoder-v1/smoke-${currency}.png`;
  const request = {
    ...template,
    images: [image],
    schema: currencyPrecisionSchema(template.schema),
    prompt:
      template.prompt.slice(
        0,
        template.prompt.search(
          /\n(?:Original photo|Image [0-9]+ is original photo)/,
        ),
      ) + "\nOriginal photo 1, section 1 of 1.",
    context: 8192,
    max_tokens: 1600,
    image_tokens: 1536,
    constrain_schema: true,
    normalize_numeric_json: false,
    require_clean_schema: true,
  };
  smokes.push({
    currency,
    image,
    request: await write("smoke-" + currency + ".json", request),
  });
}
const manifestBytes = await readFile(
  resolve(root, "receipt_training/evaluation/vision-candidate-manifest.json"),
);
await write("plan.json", {
  declared_at: new Date().toISOString(),
  variant: "currency-specific canonical precision, root anyOf branches",
  selection:
    "Same three predeclared development/supplement images used in the earlier raw-profile pilot; not a fresh holdout",
  cases,
  smokes,
  model_manifest_sha256: sha(manifestBytes),
  harness_sha256: sha(
    await readFile(
      resolve(root, "receipt_training/scripts/benchmark_vision_cli.py"),
    ),
  ),
  profile_sha256: sha(profile),
  builder_sha256: sha(self),
  native_request_limit: 8,
  retries: 0,
  real_receipt_uploads: 0,
  paid_activation: false,
  comparison:
    "Control and candidate differ only in schema. Prompts, source pixels/order, model/runtime and effective inference settings match. Fresh control first; timing is not a speed comparison.",
  acceptance:
    "Score source-known money/quantity/descriptions, missing/extra rows, adjustments, tax basis, copied and calculated totals. Numeric syntax compliance alone is not an accuracy improvement. Preserve unknown values and blockers.",
  docs: [
    "https://github.com/ggml-org/llama.cpp/blob/8642541b255bfb5dc39cd351a178be09013a55d6/grammars/README.md",
  ],
});
process.stdout.write(
  JSON.stringify({
    prepared_real_pairs: 3,
    synthetic_smokes: 2,
    native_requests_made: 0,
    real_uploads: 0,
  }) + "\n",
);
