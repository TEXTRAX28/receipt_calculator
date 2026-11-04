import { spawn, execFile } from "node:child_process";
import { LocalOcrError, workerEnvironment } from "./local-ocr.mjs";

const unavailable = () =>
  new LocalOcrError(
    503,
    "The local vision reader could not finish safely. Your photos are still available; choose another reader or try again.",
  );
const cancelled = () =>
  new LocalOcrError(
    504,
    "Reading was cancelled or took too long. Your photos are still available.",
  );
const stopFailed = () => {
  const error = new LocalOcrError(
    500,
    "The local vision process could not be stopped. This reader has stopped accepting scans. Check this computer before scanning again; temporary files have been retained for cleanup after the process exits.",
  );
  error.unsafeToCleanup = true;
  return error;
};

/** @param {() => number} availableBytes @param {number} minimumBytes */
export function requireAvailableMemory(availableBytes, minimumBytes) {
  try {
    const available = availableBytes();
    if (Number.isSafeInteger(available) && available >= minimumBytes) return;
  } catch {
    // A failed probe must not silently remove the operating limit.
  }
  throw new LocalOcrError(
    503,
    "The extra local receipt check cannot run with the current free memory. Your photos are still available; use the first reading or try again later.",
  );
}

/** Fixed server-owned commands only. Receipt/model output is bounded and never logged.
 * @param {string} program
 * @param {string[]} args
 * @param {{signal?: AbortSignal, cwd?: string, input?: string, timeoutMs?: number, memoryGuard?: {availableBytes: () => number, startupBytes: number, runtimeBytes: number}, spawnProcess?: (program: string, args: string[], options: import('node:child_process').SpawnOptions) => import('node:child_process').ChildProcess}} [options]
 */
export async function runPrivateProcess(
  program,
  args,
  {
    signal,
    cwd,
    input = "",
    timeoutMs = 120000,
    memoryGuard,
    spawnProcess = spawn,
  } = {},
) {
  if (signal?.aborted) throw cancelled();
  if (memoryGuard)
    requireAvailableMemory(
      memoryGuard.availableBytes,
      memoryGuard.startupBytes,
    );
  const combined = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])
    : AbortSignal.timeout(timeoutMs);
  const child = spawnProcess(program, args, {
    cwd,
    windowsHide: true,
    shell: false,
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...workerEnvironment(), PYTHONNOUSERSITE: "1" },
  });
  const buffers = [[], []];
  let bytes = 0,
    failure,
    stopping;
  let rejectClosed;
  const closed = new Promise((resolveClose, rejectClose) => {
    rejectClosed = rejectClose;
    child.once("error", () => rejectClose(unavailable()));
    child.once("close", (code) => resolveClose(code));
  });
  const stop = () => {
    if (stopping) return;
    stopping = (async () => {
      if (
        child.exitCode === null &&
        child.signalCode === null &&
        Number.isSafeInteger(child.pid)
      ) {
        if (process.platform === "win32") {
          await new Promise((done) =>
            execFile(
              "taskkill.exe",
              ["/PID", String(child.pid), "/T", "/F"],
              { windowsHide: true, timeout: 10000 },
              () => done(),
            ),
          );
        } else child.kill("SIGKILL");
      }
      // Exit can precede stream closure. Do not signal a possibly reused PID,
      // but still bound the wait before deciding whether inputs are safe to remove.
      let timer;
      try {
        await Promise.race([
          closed,
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(stopFailed()), 5000);
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    })();
    stopping.catch((error) => rejectClosed(error));
  };
  const abort = () => {
    failure ??= cancelled();
    stop();
  };
  for (const [index, stream] of [child.stdout, child.stderr].entries())
    stream.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes > 1024 * 1024) {
        failure = unavailable();
        stop();
      } else buffers[index].push(chunk);
    });
  child.stdin.on("error", () => {
    failure ??= unavailable();
    stop();
  });
  combined.addEventListener("abort", abort, { once: true });
  if (combined.aborted) abort();
  else child.stdin.end(input);
  const memoryTimer = memoryGuard
    ? setInterval(() => {
        if (failure || child.exitCode !== null || child.signalCode !== null)
          return;
        try {
          requireAvailableMemory(
            memoryGuard.availableBytes,
            memoryGuard.runtimeBytes,
          );
        } catch (error) {
          failure = error;
          stop();
        }
      }, 250)
    : undefined;
  try {
    const code = await closed;
    if (stopping) await stopping;
    if (failure) throw failure;
    if (code !== 0) throw unavailable();
    return {
      stdout: Buffer.concat(buffers[0]).toString("utf8"),
      stderr: Buffer.concat(buffers[1]).toString("utf8"),
    };
  } finally {
    clearInterval(memoryTimer);
    combined.removeEventListener("abort", abort);
    if (stopping) await stopping;
  }
}
