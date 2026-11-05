import { randomUUID } from "node:crypto";
import {
  lstat,
  mkdtemp,
  open,
  opendir,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

export const JOB_OWNER_FILE = ".receipt-owner.json";
const jobName = /^scan-[\w-]{1,120}$/;
const validPid = (pid) => Number.isInteger(pid) && pid > 0 && pid <= 2147483647;

/** Signal zero probes existence; permission/unknown errors never mean dead. */
export function receiptProcessExists(pid) {
  if (!validPid(pid)) return undefined;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "ESRCH" ? false : undefined;
  }
}

async function ownedPath(directory, runtimeRoot) {
  let info;
  try {
    info = await lstat(directory);
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  const root = await realpath(runtimeRoot);
  const actual = await realpath(directory);
  if (
    !info.isDirectory() ||
    info.isSymbolicLink() ||
    actual !== resolve(directory) ||
    dirname(actual) !== root ||
    !jobName.test(basename(actual))
  )
    throw new Error("Refusing cleanup outside the owned receipt directory");
  return actual;
}

/** Only a caller-owned, direct, real scan directory may be removed. */
export async function removeOwnedJob(directory, runtimeRoot) {
  const actual = await ownedPath(directory, runtimeRoot);
  if (actual)
    await rm(actual, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 150,
    });
}

/** Record both owners before any JPEG is written. No receipt content is stored here. */
export async function createReceiptJob(runtimeRoot, workerPid, panels) {
  if (
    !validPid(workerPid) ||
    !Number.isInteger(panels) ||
    panels < 1 ||
    panels > 24
  )
    throw new Error("Invalid receipt job ownership");
  const root = await realpath(runtimeRoot);
  const directory = await mkdtemp(
    join(root, `scan-${process.pid}-${randomUUID()}-`),
  );
  try {
    await writeFile(
      join(directory, JOB_OWNER_FILE),
      JSON.stringify({
        kind: "gather-native-ocr",
        version: 1,
        job: basename(directory),
        ownerPid: process.pid,
        workerPid,
        panels,
        createdAt: Date.now(),
      }),
      { flag: "wx", mode: 0o600 },
    );
    return directory;
  } catch (error) {
    // No JPEG has been written if the ownership record fails.
    await removeOwnedJob(directory, root);
    throw error;
  }
}

async function ownership(directory) {
  let file;
  try {
    const path = join(directory, JOB_OWNER_FILE),
      before = await lstat(path);
    if (
      !before.isFile() ||
      before.isSymbolicLink() ||
      before.nlink !== 1 ||
      before.size > 1024
    )
      return;
    file = await open(path, "r");
    const info = await file.stat();
    if (
      info.dev !== before.dev ||
      info.ino !== before.ino ||
      info.size !== before.size ||
      !info.isFile()
    )
      return;
    const bytes = Buffer.alloc(1025),
      { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
    if (!bytesRead || bytesRead !== info.size || bytesRead > 1024) return;
    const value = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(
        bytes.subarray(0, bytesRead),
      ),
    );
    if (
      Object.keys(value).sort().join(",") !==
        "createdAt,job,kind,ownerPid,panels,version,workerPid" ||
      value.kind !== "gather-native-ocr" ||
      value.version !== 1 ||
      value.job !== basename(directory) ||
      !validPid(value.ownerPid) ||
      !validPid(value.workerPid) ||
      !value.job.startsWith(`scan-${value.ownerPid}-`) ||
      !Number.isInteger(value.panels) ||
      value.panels < 1 ||
      value.panels > 24 ||
      !Number.isSafeInteger(value.createdAt) ||
      value.createdAt < 1 ||
      value.createdAt > Date.now()
    )
      return;
    return value;
  } catch {
    // Missing, malformed or unreadable ownership is never authority to delete.
    return;
  } finally {
    await file?.close();
  }
}

async function knownContents(directory, panels, signal) {
  let count = 0;
  for await (const entry of await opendir(directory)) {
    signal?.throwIfAborted();
    if (++count > 25 || !entry.isFile() || entry.isSymbolicLink()) return false;
    if (entry.name !== JOB_OWNER_FILE) {
      if (
        !/^[1-9]\d?\.jpg$/.test(entry.name) ||
        Number(entry.name.split(".")[0]) > panels
      )
        return false;
      const info = await lstat(join(directory, entry.name));
      if (
        !info.isFile() ||
        info.isSymbolicLink() ||
        info.nlink !== 1 ||
        info.size > 6 * 1024 ** 2
      )
        return false;
    }
  }
  return true;
}

/** Bounded recovery before the next native scan, never based on age alone.
 * processExists is a protocol-test dependency, not an HTTP or environment option.
 * @param {string} runtimeRoot
 * @param {{signal?: AbortSignal, processExists?: (pid: number) => boolean | undefined}} [options]
 */
export async function recoverReceiptJobs(
  runtimeRoot,
  { signal, processExists = receiptProcessExists } = {},
) {
  const root = await realpath(runtimeRoot);
  let inspected = 0,
    removed = 0;
  for await (const entry of await opendir(root)) {
    signal?.throwIfAborted();
    if (++inspected > 128) break;
    if (
      !entry.isDirectory() ||
      entry.isSymbolicLink() ||
      !jobName.test(entry.name)
    )
      continue;
    const directory = join(root, entry.name);
    try {
      if (!(await ownedPath(directory, root))) continue;
      const owner = await ownership(directory);
      if (!owner) continue;
      const absent = () => {
        try {
          return (
            processExists(owner.ownerPid) === false &&
            processExists(owner.workerPid) === false
          );
        } catch {
          return false;
        } // Unknown process state retains the job.
      };
      if (!absent() || !(await knownContents(directory, owner.panels, signal)))
        continue;
      // Recheck both processes immediately before the bounded, path-checked removal.
      if (!absent()) continue;
      signal?.throwIfAborted();
      await removeOwnedJob(directory, root);
      if (++removed === 16) break;
    } catch (error) {
      if (error.code === "ENOENT") continue; // Another reaper may have finished it.
      throw error;
    }
  }
  return { inspected: Math.min(inspected, 128), removed };
}
