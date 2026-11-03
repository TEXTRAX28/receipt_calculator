import { createHash } from "node:crypto";
import { mkdir, open, readdir, stat } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";

/** Explicit, persistent allowance. No clock/reset/retry reclaims a reservation.
 * Atomic exclusive slots also bound several processes sharing this directory.
 * Stores only request identity/state, never images, OCR text or credentials.
 */
export function createDocumentAllowance({ directory, account, grant, limit }) {
  const valid =
    isAbsolute(directory || "") &&
    typeof account === "string" &&
    account.length > 0 &&
    /^[a-zA-Z0-9_-]{8,80}$/.test(grant || "") &&
    Number.isInteger(limit) &&
    limit >= 1 &&
    limit <= 100;
  const folder = valid
    ? join(directory, createHash("sha256").update(account).digest("hex"), grant)
    : null;
  async function remaining() {
    if (!folder) return 0;
    try {
      const names = new Set(await readdir(folder));
      return Array.from(
        { length: limit },
        (_, index) => `${index + 1}.json`,
      ).filter((name) => !names.has(name)).length;
    } catch (error) {
      if (error.code === "ENOENT") {
        // Windows can report ENOENT below a file, not just a missing folder.
        // Inspect the closest existing ancestor without creating state on GET.
        let ancestor = folder;
        while (true) {
          try {
            if ((await stat(ancestor)).isDirectory()) return limit;
            break;
          } catch (cause) {
            if (cause.code !== "ENOENT" || dirname(ancestor) === ancestor)
              break;
            ancestor = dirname(ancestor);
          }
        }
      }
      throw new Error("Receipt allowance storage is unavailable");
    }
  }
  async function reserve(requestId) {
    if (!folder || !/^[a-zA-Z0-9_-]{8,100}$/.test(requestId || ""))
      throw new Error("Receipt allowance is not configured");
    await mkdir(folder, { recursive: true, mode: 0o700 });
    for (let index = 1; index <= limit; index++) {
      let handle;
      try {
        handle = await open(join(folder, `${index}.json`), "wx", 0o600);
      } catch (error) {
        if (error.code === "EEXIST") continue;
        throw new Error("Receipt allowance storage is unavailable");
      }
      const record = {
        requestId,
        reservedAt: new Date().toISOString(),
        state: "reserved",
        cleanup: "unknown",
      };
      try {
        await handle.writeFile(JSON.stringify(record) + "\n");
      } catch {
        await handle.close();
        throw new Error("Receipt allowance storage is unavailable");
      }
      let closed = false;
      return {
        async finish(state, cleanup, documentId = null) {
          if (closed) return;
          closed = true;
          try {
            if (
              !["completed", "failed", "cancelled"].includes(state) ||
              !["provider-reported-success", "unknown", "not-created"].includes(
                cleanup,
              ) ||
              (documentId !== null && !/^[1-9][0-9]{0,19}$/.test(documentId))
            )
              throw new Error("Invalid allowance completion");
            const bytes = Buffer.from(
              JSON.stringify({ ...record, state, cleanup, documentId }) + "\n",
            );
            // The slot's existence consumes it even if a crash interrupts this update.
            await handle.truncate(0);
            await handle.write(bytes, 0, bytes.length, 0);
          } finally {
            await handle.close();
          }
        },
      };
    }
    throw new Error("Receipt allowance is exhausted");
  }
  return { configured: valid, remaining, reserve };
}
