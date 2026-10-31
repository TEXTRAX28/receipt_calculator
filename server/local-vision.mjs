import { existsSync, readFileSync, statSync } from "node:fs";
import { mkdir, mkdtemp, realpath, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { aiReceiptSchema } from "../src/lib/extraction-schema.mjs";
import { requestPanelsSchema } from "../src/lib/recognition-schema.mjs";
import {
  MAX_AI_BODY_BYTES,
  MAX_LOCAL_VISION_PANELS,
} from "../src/lib/scan-limits.mjs";
import { LocalOcrError, removeOwnedJob } from "./local-ocr.mjs";
import { runPrivateProcess } from "./private-process.mjs";
import { RECEIPT_INSTRUCTIONS } from "./extraction-instructions.mjs";

const PROJECT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(
  readFileSync(
    new URL(
      "../receipt_training/evaluation/vision-candidate-manifest.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const schema = z.toJSONSchema(aiReceiptSchema);
schema.properties.items.items.properties.note = { type: "string", const: "" };
schema.properties.warnings.maxItems = 4;
const unavailable = () =>
  new LocalOcrError(
    503,
    "Local vision is not ready on this computer. Check the local model setup or choose another reader. Your photos are still available.",
  );
/** @param {string} program @param {string[]} args @param {import('node:child_process').SpawnOptions} options */
const launchProcess = (program, args, options) => spawn(program, args, options);

/** Opt-in pinned Qwen profile. No paths, prompts, commands or model flags come from HTTP. */
export function createLocalVisionReader({
  enabled = false,
  python = "",
  runtimeRoot = resolve(PROJECT, "private-receipts/runtime"),
  timeoutMs = 120000,
  // Protocol-test dependencies only; these are not environment/request options.
  requireAssets = true,
  spawnProcess = launchProcess,
} = {}) {
  const cacheRoot = resolve(
    PROJECT,
    "receipt_training/.cache/vision-experiment",
  );
  const models = manifest.files
    .slice(0, 2)
    .map((entry) => join(cacheRoot, entry.path));
  const cli = join(
    cacheRoot,
    `runtime-${manifest.runtime_build}`,
    "llama-mtmd-cli.exe",
  );
  let disposed = false,
    verified = false,
    current,
    inflight;
  const installed = () => {
    try {
      return (
        enabled &&
        isAbsolute(python) &&
        existsSync(python) &&
        !PROJECT.includes(",") &&
        (!requireAssets ||
          (process.platform === "win32" &&
            existsSync(cli) &&
            manifest.files.every(
              (entry) =>
                statSync(join(cacheRoot, entry.path)).size === entry.bytes,
            )))
      );
    } catch {
      return false;
    }
  };
  const reader = {
    get configured() {
      return !disposed && installed();
    },
    name: "Qwen3-VL 4B",
    maxPanels: MAX_LOCAL_VISION_PANELS,
    async extract(input, { signal } = {}) {
      if (!reader.configured) throw unavailable();
      if (inflight)
        throw new LocalOcrError(429, "A local vision scan is already running.");
      const panels = requestPanelsSchema.parse(input);
      if (panels.length > MAX_LOCAL_VISION_PANELS)
        throw new LocalOcrError(
          413,
          `Local vision currently reads up to ${MAX_LOCAL_VISION_PANELS} prepared sections together. Use another reader for this longer receipt; no sections were dropped.`,
        );
      if (
        panels.reduce((sum, panel) => sum + panel.data.length, 0) >
        MAX_AI_BODY_BYTES
      )
        throw new LocalOcrError(
          413,
          "These photos are too large together. Choose fewer sections.",
        );
      current = new AbortController();
      const combined = AbortSignal.any([
        current.signal,
        AbortSignal.timeout(timeoutMs),
        ...(signal ? [signal] : []),
      ]);
      inflight = (async () => {
        let directory,
          unsafeToCleanup = false;
        const run = (program, args, options = {}) =>
          runPrivateProcess(program, args, {
            signal: combined,
            cwd: PROJECT,
            spawnProcess,
            ...options,
          });
        try {
          if (combined.aborted)
            throw new LocalOcrError(
              504,
              "Scan cancelled. Your photos are still available.",
            );
          await mkdir(runtimeRoot, { recursive: true, mode: 0o700 });
          const root = await realpath(runtimeRoot);
          const inside = relative(await realpath(PROJECT), root);
          if (!inside || inside.startsWith("..") || isAbsolute(inside))
            throw unavailable();
          directory = await mkdtemp(join(root, "scan-"));
          const images = [];
          for (const [index, panel] of panels.entries()) {
            const data = Buffer.from(panel.data, "base64");
            if (
              data.length < 8 ||
              data.length > 6 * 1024 * 1024 ||
              data[0] !== 255 ||
              data[1] !== 216 ||
              data[2] !== 255
            )
              throw new LocalOcrError(
                400,
                "A receipt section is not a valid JPEG. Choose the photos again.",
              );
            const path = join(directory, `${index + 1}.jpg`);
            await writeFile(path, data, { flag: "wx", mode: 0o600 });
            images.push({
              path,
              photo: panel.photo,
              part: panel.part,
              sha256: createHash("sha256").update(data).digest("hex"),
            });
          }
          const guard = await run(
            python,
            [
              "-u",
              fileURLToPath(new URL("./local_image_guard.py", import.meta.url)),
              root,
            ],
            { input: JSON.stringify({ panels: images }), timeoutMs: 10000 },
          );
          if (JSON.parse(guard.stdout).valid !== true)
            throw new LocalOcrError(
              400,
              "A receipt image could not be decoded safely. Choose a clearer JPEG or another reader.",
            );
          if (!verified) {
            await run(
              python,
              [
                "-u",
                join(
                  PROJECT,
                  "receipt_training/scripts/setup_vision_candidate.py",
                ),
                "--check",
              ],
              { timeoutMs: 60000 },
            );
            verified = true;
          }
          const schemaPath = join(directory, "schema.json");
          await writeFile(schemaPath, JSON.stringify(schema), {
            flag: "wx",
            mode: 0o600,
          });
          const prompt =
            RECEIPT_INSTRUCTIONS +
            images
              .map(
                (panel, index) =>
                  `\nImage ${index + 1} is original photo ${panel.photo}, detail panel ${panel.part}.`,
              )
              .join("");
          const output = await run(cli, [
            "-m",
            models[0],
            "--mmproj",
            models[1],
            "--image",
            images.map((image) => image.path).join(","),
            "-p",
            prompt,
            "--ctx-size",
            "8192",
            "--n-predict",
            "4000",
            "--image-max-tokens",
            "1536",
            "--gpu-layers",
            "auto",
            "--batch-size",
            "256",
            "--ubatch-size",
            "128",
            "--threads",
            "4",
            "--threads-batch",
            "4",
            "--temp",
            "0",
            "--seed",
            "20261031",
            "--json-schema-file",
            schemaPath,
          ]);
          if (
            /JSON schema conversion was incomplete|accepting any string/.test(
              output.stderr,
            )
          )
            throw unavailable();
          const draft = aiReceiptSchema.parse(JSON.parse(output.stdout));
          const supplied = new Set(panels.map((panel) => panel.photo));
          if (
            draft.warnings.length > 4 ||
            draft.items.some(
              (item) =>
                item.note !== "" ||
                item.sourcePhotos.some((photo) => !supplied.has(photo)),
            )
          )
            throw unavailable();
          return draft;
        } catch (error) {
          if (error?.unsafeToCleanup) {
            unsafeToCleanup = true;
            disposed = true;
          }
          if (error instanceof LocalOcrError) throw error;
          throw unavailable();
        } finally {
          if (directory && !unsafeToCleanup) {
            try {
              await removeOwnedJob(directory, runtimeRoot);
            } catch {
              disposed = true;
              throw new LocalOcrError(
                500,
                "Temporary receipt files could not be removed. Local vision has stopped; check this computer's file permissions before scanning again.",
              );
            }
          }
        }
      })();
      try {
        return await inflight;
      } finally {
        inflight = undefined;
        current = undefined;
      }
    },
    async dispose() {
      disposed = true;
      current?.abort();
      await inflight?.catch(() => {});
    },
  };
  return reader;
}
