// Run the preserved nine-case safety suite against the separate screening transport.
// Only its module import is changed; all synthetic fixtures and assertions remain.
import { readFile } from "node:fs/promises";
const source = await readFile(
  new URL("./test_veryfi_probe.mjs", import.meta.url),
  "utf8",
);
const from = '"./veryfi_probe_transport.mjs"';
if (source.split(from).length !== 2)
  throw new Error("Unexpected original test import");
const adapted = source.replace(
  from,
  JSON.stringify(
    new URL("./veryfi_screening_transport.mjs", import.meta.url).href,
  ),
);
await import(
  "data:text/javascript;base64," + Buffer.from(adapted).toString("base64")
);
