// Non-private synthetic protocol comparison, one request per transport and no retries.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import {
  aiReceiptSchema,
  aiReceiptJsonSchema,
} from "../../src/lib/extraction-schema.mjs";
import { RECEIPT_INSTRUCTIONS } from "../../server/extraction-instructions.mjs";
import { extractWithGemini } from "../../server/receipt-api.mjs";

const project = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const out = resolve(
  project,
  "qa-artifacts/advanced-ocr/gemini-synthetic-transports-v1",
);
const image = await readFile(
  resolve(project, "qa-artifacts/advanced-ocr/synthetic-smoke.jpg"),
);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
if (
  sha(image) !==
  "aada1cd4b8523365d0c9e16514697575fee53c5b29edbd272d49db4c346290d9"
)
  throw new Error("Synthetic-only fixture changed");
const env = loadEnv("development", project, "");
if (!env.GEMINI_API_KEY) throw new Error("No configured server-side key");
await mkdir(out);
const metadata = {
  scope:
    "Existing two-purchase synthetic fixture, no private receipt or personal data",
  model: "gemini-3.1-flash-lite",
  image_sha256: sha(image),
  requests: [],
  billing_activated: false,
  private_receipt_requests: 0,
  automatic_retries: 0,
  actual_account_billing_verified: false,
  source_sha256: Object.fromEntries(
    await Promise.all(
      [
        "server/receipt-api.mjs",
        "server/extraction-instructions.mjs",
        "src/lib/extraction-schema.mjs",
      ].map(async (path) => [
        path,
        sha(await readFile(resolve(project, path))),
      ]),
    ),
  ),
  started_at: new Date().toISOString(),
};
const base64 = image.toString("base64");
for (const transport of ["generateContent", "interactions"]) {
  const run = { transport, requests: 0 };
  const started = performance.now();
  try {
    let receipt;
    if (transport === "generateContent") {
      const body = JSON.stringify({
        systemInstruction: { parts: [{ text: RECEIPT_INSTRUCTIONS }] },
        contents: [
          {
            role: "user",
            parts: [
              {
                text: "Read these ordered sections as one receipt. Return a draft for human review. Original photo 1, detail panel 1.",
              },
              { inlineData: { mimeType: "image/jpeg", data: base64 } },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseJsonSchema: aiReceiptJsonSchema,
          maxOutputTokens: 24000,
        },
      });
      run.request_sha256 = sha(body);
      run.requests++;
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${metadata.model}:generateContent`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-goog-api-key": env.GEMINI_API_KEY,
          },
          body,
          signal: AbortSignal.timeout(120000),
        },
      );
      run.http_status = response.status;
      const chunks = [];
      let size = 0;
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > 1024 * 1024)
          throw new Error("Provider response exceeded bound");
        chunks.push(chunk);
      }
      const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      await writeFile(
        resolve(out, `${transport}-response.json`),
        JSON.stringify(value, null, 2) + "\n",
        { flag: "wx" },
      );
      if (!response.ok)
        throw new Error(
          `Provider HTTP ${response.status}: ${value.error?.status || "unavailable"}`,
        );
      const candidates = value.candidates || [];
      if (candidates.length !== 1 || candidates[0].finishReason !== "STOP")
        throw new Error("The model did not complete a single draft");
      const text = (candidates[0].content?.parts || [])
        .filter((part) => typeof part.text === "string" && !part.thought)
        .map((part) => part.text)
        .join("");
      receipt = aiReceiptSchema.parse(JSON.parse(text));
      run.usage = value.usageMetadata || null;
    } else {
      receipt = await extractWithGemini([{ photo: 1, part: 1, data: base64 }], {
        apiKey: env.GEMINI_API_KEY,
        model: metadata.model,
        signal: AbortSignal.timeout(120000),
        fetcher: async (url, options) => {
          if (run.requests) throw new Error("No transport retry permitted");
          run.requests++;
          run.request_sha256 = sha(options.body);
          const response = await fetch(url, options);
          run.http_status = response.status;
          return response;
        },
      });
    }
    await writeFile(
      resolve(out, `${transport}-receipt.json`),
      JSON.stringify(receipt, null, 2) + "\n",
      { flag: "wx" },
    );
    run.strict_schema = true;
    run.item_count = receipt.items.length;
    run.printed_total = receipt.printedTotal;
    run.expected_financial_rows =
      receipt.items.length === 2 &&
      receipt.items.every(
        (item, index) =>
          Number(item.quantity) === 1 &&
          Number(item.unitPrice) === [2, 1.5][index] &&
          Number(item.lineTotal) === [2, 1.5][index] &&
          Number(item.discount) === 0,
      ) &&
      Number(receipt.printedTotal) === 3.5;
    run.success = true;
  } catch (error) {
    run.success = false;
    run.error = String(error?.message || error).slice(0, 400);
  }
  run.elapsed_ms = Math.round(performance.now() - started);
  metadata.requests.push(run);
  await writeFile(
    resolve(out, "metadata.json"),
    JSON.stringify(metadata, null, 2) + "\n",
  );
  console.log(JSON.stringify(run));
}
