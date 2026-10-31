import type { TestInfo } from "@playwright/test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

const folders = new WeakMap<TestInfo, Promise<string>>();
const names = new WeakMap<TestInfo, Set<string>>();

/** Every test attempt owns an exclusive directory; historical evidence survives reruns. */
export async function qaArtifactPath(info: TestInfo, name: string) {
  if (name === "test.json" || !/^[a-z0-9][a-z0-9_.-]{0,179}$/i.test(name))
    throw new Error("Use a bounded artifact filename, without directories");
  let reserved = names.get(info);
  if (!reserved) names.set(info, (reserved = new Set()));
  if (reserved.has(name))
    throw new Error("An artifact name was reused in one test");
  reserved.add(name);
  let folder = folders.get(info);
  if (!folder) {
    folder = (async () => {
      const base = resolve("qa-artifacts/e2e-runs");
      await mkdir(base, { recursive: true });
      const own = await mkdtemp(
        join(base, info.project.name.replace(/[^\w-]/g, "_") + "-"),
      );
      await writeFile(
        join(own, "test.json"),
        JSON.stringify(
          {
            title: info.title,
            project: info.project.name,
            retry: info.retry,
            created_at: new Date().toISOString(),
          },
          null,
          2,
        ),
        { flag: "wx" },
      );
      await info.attach("QA artifact directory", {
        body: Buffer.from(relative(process.cwd(), own)),
        contentType: "text/plain",
      });
      return own;
    })();
    folders.set(info, folder);
  }
  return join(await folder, name);
}
