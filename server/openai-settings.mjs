import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseEnv } from "node:util";
import { createOpenAiReader } from "./openai-reader.mjs";

/** The build never reads server settings. Explicit process settings take precedence. */
export function openAiSettings(root, env = process.env) {
  const file = join(root, ".env.local");
  const local = existsSync(file) ? parseEnv(readFileSync(file, "utf8")) : {};
  const setting = (name) => env[name] ?? local[name] ?? "";
  return {
    openaiReader: createOpenAiReader({
      apiKey: setting("OPENAI_API_KEY") || setting("OPEN_AI_KEY"),
      directory: resolve(
        root,
        setting("OPENAI_ALLOWANCE_DIRECTORY") || ".receipt-reader-state/openai",
      ),
      grant: setting("OPENAI_ALLOWANCE_ID"),
      limit: Number(setting("OPENAI_REQUEST_LIMIT") || 0),
    }),
  };
}
