// Version an existing sealed image pilot with the current structured contract.
// Reads only existing requests/panel provenance, never ground-truth labels.
import { readFile, mkdir, writeFile, access } from "node:fs/promises";
import { resolve, relative, dirname, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { z } from "zod";
import { aiReceiptSchema } from "../../src/lib/extraction-schema.mjs";
import { RECEIPT_INSTRUCTIONS } from "../../server/receipt-api.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
const option = (name) => args[args.indexOf(name) + 1];
const input = option("--pilot"),
  version = option("--version");
if (
  !args.includes("--pilot") ||
  !args.includes("--version") ||
  !/^[\w-]+$/.test(version || "")
)
  throw new Error(
    "Use --pilot <project-relative sealed plan> --version <new-name>",
  );
function inside(path) {
  const full = resolve(ROOT, path),
    local = relative(ROOT, full);
  if (local.startsWith("..") || isAbsolute(local))
    throw new Error("Pilot artifacts must stay in this project");
  return full;
}
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const planPath = inside(input),
  planBytes = await readFile(planPath);
const base = JSON.parse(planBytes);
if (
  !base.sealed_at ||
  !Array.isArray(base.pilot) ||
  !base.pilot.length ||
  base.pilot.length > 100
)
  throw new Error("A sealed nonempty pilot is required");
const directory = resolve(dirname(planPath), `${version}-requests`);
const output = resolve(dirname(planPath), `${version}.json`);
if (
  await access(output).then(
    () => true,
    () => false,
  )
)
  throw new Error("Preserve the old protocol and choose a new version");
const schema = z.toJSONSchema(aiReceiptSchema);
schema.properties.items.items.properties.note = { type: "string", const: "" };
schema.properties.warnings.maxItems = 4;
const requests = [];
for (const item of base.pilot) {
  if (!/^[\w-]+$/.test(item.id)) throw new Error("Invalid source ID");
  const bytes = await readFile(inside(item.request));
  if (sha(bytes) !== item.request_sha256)
    throw new Error("An old declared request changed");
  const old = JSON.parse(bytes),
    boundary = old.prompt.search(
      /\n(?:Original photo|Image [0-9]+ is original photo)/,
    );
  if (boundary < 0)
    throw new Error("Missing ordered-image instruction boundary");
  requests.push({
    item,
    request: {
      ...old,
      schema,
      prompt: RECEIPT_INSTRUCTIONS + old.prompt.slice(boundary),
      require_clean_schema: true,
    },
  });
}
await mkdir(directory); // exclusive: never overwrite an experiment in progress
const pilot = [];
for (const { item, request } of requests) {
  const path = resolve(directory, `${item.id}.json`),
    bytes = JSON.stringify(request, null, 2) + "\n";
  await writeFile(path, bytes, { flag: "wx" });
  pilot.push({
    ...item,
    request: relative(ROOT, path).replaceAll("\\", "/"),
    request_sha256: sha(bytes),
  });
}
await writeFile(
  output,
  JSON.stringify(
    {
      ...base,
      pilot,
      declared_at: new Date().toISOString(),
      sealed_at: new Date().toISOString(),
      protocol: version,
      base_plan_sha256: sha(planBytes),
      source_commit: execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: ROOT,
        encoding: "utf8",
      }).trim(),
      source_includes_uncommitted_work: true,
      builder_sha256: sha(await readFile(fileURLToPath(import.meta.url))),
      changed_from_base:
        "Equivalent explicit numeric character classes, signed printed rounding, corresponding extraction instruction; require no known decoder schema warnings. Images, original photo mapping, note/warning bounds, model/context/token settings and selection are preserved.",
    },
    null,
    2,
  ) + "\n",
  { flag: "wx" },
);
console.log(
  JSON.stringify({
    version,
    declared_cases: pilot.length,
    output: relative(ROOT, output),
  }),
);
