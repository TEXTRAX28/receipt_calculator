// Synthetic process protocol only. This fixture does not perform OCR or decode JPEGs.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";

if (process.env.GEMINI_API_KEY || process.env.OTHER_SECRET_KEY) process.exit(9);
const mode = process.argv[2];
if (mode === "verify") {
  console.log('{"verified_assets":3,"verified_runtime_files":53}');
} else if (mode === "guard") {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  const { panels } = JSON.parse(input);
  console.log(
    JSON.stringify({
      valid: !readFileSync(panels[0].path).toString().includes("INVALID"),
    }),
  );
} else if (mode === "tree") {
  const descendant = spawn(
    process.execPath,
    ["-e", "setInterval(()=>{},1000)"],
    { windowsHide: true, stdio: "ignore" },
  );
  writeFileSync(
    join(process.argv[3], "descendant.pid"),
    String(descendant.pid),
  );
  setInterval(() => {}, 1000);
} else {
  const args = process.argv.slice(3);
  const paths = args[args.indexOf("--image") + 1].split(",");
  const marker = readFileSync(paths[0]).subarray(8).toString();
  if (marker === "HANG") setInterval(() => {}, 1000);
  else if (marker === "LARGE")
    process.stdout.write("x".repeat(1024 * 1024 + 1));
  else if (marker === "JSON") process.stdout.write("Untrusted text, not JSON");
  else {
    if (marker === "RELAX")
      console.error("JSON schema conversion was incomplete");
    const draft = {
      merchant: "Synthetic fixture market",
      date: "",
      currency: marker === "UNKNOWN" ? "" : "GBP",
      subtotal: "2.00",
      printedTotal: "2.00",
      printedTax: "",
      pricesIncludeTax: true,
      printedItemCount: 1,
      taxCodes: [],
      items: [
        {
          description: "Synthetic milk",
          quantity: "1",
          unitPrice: "2.00",
          lineTotal: "2.00",
          discount: "0",
          taxCode: "",
          note: "",
          sourcePhotos: [marker === "WRONGPHOTO" ? 2 : 1],
        },
      ],
      adjustments: [],
      warnings: [],
    };
    console.log(JSON.stringify(draft));
  }
}
