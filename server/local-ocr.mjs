import { spawn, execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import {
  dirname,
  resolve,
  join,
  relative,
  isAbsolute,
  basename,
} from "node:path";
import { fileURLToPath } from "node:url";
import { StringDecoder } from "node:string_decoder";
import {
  validateRecognition,
  requestPanelsSchema,
} from "../src/lib/recognition-schema.mjs";
import { MAX_AI_BODY_BYTES } from "../src/lib/scan-limits.mjs";

const PROJECT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MAX_OUTPUT = 1024 * 1024;
const modelManifest = JSON.parse(
  readFileSync(new URL("./local-model-manifest.json", import.meta.url), "utf8"),
);
export function verifiedModelCache(engine, cacheRoot) {
  try {
    const files = modelManifest[engine]?.files;
    return (
      !!files?.length &&
      files.every((entry) => {
        const path = resolve(cacheRoot, entry.path);
        return (
          statSync(path).size === entry.bytes &&
          createHash("sha256").update(readFileSync(path)).digest("hex") ===
            entry.sha256
        );
      })
    );
  } catch {
    return false;
  }
}
/** @param {string} program @param {string[]} args @param {import('node:child_process').SpawnOptions} options */
const launchWorker = (program, args, options) => spawn(program, args, options);
export class LocalOcrError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const failure = () =>
  new LocalOcrError(
    503,
    "The computer's receipt reader is unavailable. Check its model setup, or use the on-device reader. Your photos are still available.",
  );
const cancelled = () =>
  new LocalOcrError(
    504,
    "Reading was cancelled or took too long. Your photos are still available.",
  );

// Keep provider credentials out of the model process, including unrelated keys.
export function workerEnvironment() {
  const names = [
    "SystemRoot",
    "WINDIR",
    "COMSPEC",
    "PATH",
    "PATHEXT",
    "TEMP",
    "TMP",
    "LOCALAPPDATA",
    "APPDATA",
    "USERPROFILE",
    "HOMEDRIVE",
    "HOMEPATH",
    "PROGRAMDATA",
    "NUMBER_OF_PROCESSORS",
  ];
  return {
    ...Object.fromEntries(
      Object.entries(process.env).filter(([key]) =>
        names.some((name) => name.toLowerCase() === key.toLowerCase()),
      ),
    ),
    HF_HUB_OFFLINE: "1",
    PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK: "True",
  };
}

export async function removeOwnedJob(directory, runtimeRoot) {
  let actual;
  try {
    actual = await realpath(directory);
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  const root = await realpath(runtimeRoot);
  if (dirname(actual) !== root || !/^scan-[\w-]+$/.test(basename(actual)))
    throw new Error("Refusing cleanup outside the owned receipt directory");
  await rm(actual, {
    recursive: true,
    force: true,
    maxRetries: 3,
    retryDelay: 150,
  });
}

/** One persistent model, one active job. All paths/configuration are server-owned. */
export function createLocalModelReader({
  python = "",
  engine = "paddle-v6",
  cacheRoot = resolve(PROJECT, "receipt_training/.cache"),
  runtimeRoot = resolve(PROJECT, "private-receipts/runtime"),
  idleMs = 60000,
  timeoutMs = 120000,
  // Injected only by protocol tests; never read from an HTTP request or env var.
  workerScript = fileURLToPath(
    new URL("./local_ocr_worker.py", import.meta.url),
  ),
  requireModels = true,
  spawnWorker = launchWorker,
} = {}) {
  const configured =
    ["paddle-v6", "doctr"].includes(engine) &&
    isAbsolute(python) &&
    existsSync(python) &&
    (!requireModels || verifiedModelCache(engine, cacheRoot));
  const name = engine === "paddle-v6" ? "PaddleOCR" : "docTR";
  const expectedEngine =
    engine === "paddle-v6"
      ? "paddle-ppocrv6-medium-onnx"
      : "doctr-db-resnet50-parseq-cpu";
  let child,
    ready,
    pending,
    idle,
    active = false,
    disposed = false;

  async function stop(error = failure()) {
    clearTimeout(idle);
    ready?.reject(error);
    pending?.reject(error);
    ready = undefined;
    pending = undefined;
    const processToStop = child;
    child = undefined;
    if (
      !processToStop ||
      processToStop.exitCode !== null ||
      processToStop.signalCode !== null
    )
      return;
    const closed = new Promise((resolveClose) =>
      processToStop.once("close", resolveClose),
    );
    if (
      process.platform === "win32" &&
      Number.isSafeInteger(processToStop.pid)
    ) {
      await new Promise((resolveKill) =>
        execFile(
          "taskkill.exe",
          ["/PID", String(processToStop.pid), "/T", "/F"],
          { windowsHide: true, timeout: 10000 },
          () => resolveKill(),
        ),
      );
    } else if (Number.isSafeInteger(processToStop.pid))
      processToStop.kill("SIGKILL");
    let timer;
    try {
      await Promise.race([
        closed,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(failure()), 5000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  async function start(signal) {
    if (child) return;
    if (!configured || disposed) throw failure();
    await mkdir(runtimeRoot, { recursive: true, mode: 0o700 });
    const root = await realpath(runtimeRoot);
    const project = await realpath(PROJECT);
    const inside = relative(project, root);
    if (inside.startsWith("..") || isAbsolute(inside)) throw failure();
    if (signal.aborted) throw cancelled();
    let resolveReady, rejectReady;
    const promise = new Promise((ok, fail) => {
      resolveReady = ok;
      rejectReady = fail;
    });
    ready = { resolve: resolveReady, reject: rejectReady };
    const proc = spawnWorker(
      python,
      [
        "-u",
        workerScript,
        "--engine",
        engine,
        "--runtime-root",
        root,
        "--cache-root",
        resolve(cacheRoot),
      ],
      {
        cwd: PROJECT,
        shell: false,
        windowsHide: true,
        env: workerEnvironment(),
        stdio: ["pipe", "pipe", "ignore"],
      },
    );
    child = proc;
    const decoder = new StringDecoder("utf8");
    let buffer = "";
    const fail = () => {
      if (child === proc) void stop().catch(() => {});
    };
    proc.on("error", fail);
    proc.on("close", () => {
      if (child !== proc) return;
      child = undefined;
      ready?.reject(failure());
      pending?.reject(failure());
      ready = undefined;
      pending = undefined;
    });
    proc.stdin.on("error", fail);
    proc.stdout.on("data", (chunk) => {
      if (child !== proc) return;
      buffer += decoder.write(chunk);
      if (Buffer.byteLength(buffer) > MAX_OUTPUT) return fail();
      let end;
      while ((end = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 1);
        try {
          const value = JSON.parse(line);
          if (ready) {
            if (value.ready !== true || value.engine !== expectedEngine)
              return fail();
            const waiting = ready;
            ready = undefined;
            waiting.resolve();
          } else if (pending) {
            const waiting = pending;
            pending = undefined;
            waiting.resolve(value);
          } else return fail();
        } catch {
          return fail();
        }
      }
    });
    await promise;
  }

  return {
    configured,
    name,
    async extract(panels, { signal } = {}) {
      if (!configured || disposed) throw failure();
      if (active)
        throw new LocalOcrError(
          429,
          "The computer is already reading a receipt. Wait for it to finish.",
        );
      if (!requestPanelsSchema.safeParse(panels).success)
        throw new LocalOcrError(
          400,
          "The receipt sections are incomplete or repeated. Choose the photos again.",
        );
      if (panels.reduce((sum, p) => sum + p.data.length, 0) > MAX_AI_BODY_BYTES)
        throw new LocalOcrError(
          413,
          "These photos are too large together. Choose fewer sections.",
        );
      active = true;
      clearTimeout(idle);
      const combined = signal
        ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])
        : AbortSignal.timeout(timeoutMs);
      let directory, stopping;
      const abort = () => {
        stopping = stop(cancelled());
        stopping.catch(() => {});
      };
      combined.addEventListener("abort", abort, { once: true });
      try {
        if (combined.aborted) throw cancelled();
        await start(combined);
        if (combined.aborted) throw cancelled();
        directory = await mkdtemp(join(await realpath(runtimeRoot), "scan-"));
        const inputs = [];
        for (const [index, panel] of panels.entries()) {
          if (combined.aborted) throw cancelled();
          const data = Buffer.from(panel.data, "base64");
          if (
            data.length > 6 * 1024 * 1024 ||
            data.length < 8 ||
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
          inputs.push({
            path,
            photo: panel.photo,
            part: panel.part,
            sha256: createHash("sha256").update(data).digest("hex"),
          });
        }
        if (combined.aborted || !child) throw cancelled();
        const response = new Promise((resolveResponse, rejectResponse) => {
          pending = { resolve: resolveResponse, reject: rejectResponse };
        });
        child.stdin.write(JSON.stringify({ panels: inputs }) + "\n");
        const result = await response;
        if (combined.aborted || !child) throw cancelled();
        if (result.error === "invalid-image")
          throw new LocalOcrError(
            400,
            "A receipt image could not be decoded safely. Choose a clearer JPEG or use the on-device reader.",
          );
        const parsed = validateRecognition(result, panels);
        if (parsed.engine !== expectedEngine) throw failure();
        return parsed;
      } catch (error) {
        if (!stopping)
          stopping = stop(combined.aborted ? cancelled() : failure());
        await stopping;
        if (combined.aborted) throw cancelled();
        if (error instanceof LocalOcrError) throw error;
        throw failure();
      } finally {
        combined.removeEventListener("abort", abort);
        try {
          if (stopping) await stopping;
          if (directory) {
            try {
              await removeOwnedJob(directory, runtimeRoot);
            } catch {
              await stop();
              try {
                await removeOwnedJob(directory, runtimeRoot);
              } catch {
                throw new LocalOcrError(
                  500,
                  "Temporary receipt files could not be removed. The computer reader has stopped. Check the computer's file permissions before scanning again.",
                );
              }
            }
          }
        } finally {
          active = false;
          if (child) {
            idle = setTimeout(() => {
              void stop().catch(() => {});
            }, idleMs);
            idle.unref();
          }
        }
      }
    },
    async release() {
      if (active)
        throw new LocalOcrError(429, "A computer scan is already running.");
      await stop();
    },
    async dispose() {
      disposed = true;
      await stop(cancelled());
    },
  };
}
