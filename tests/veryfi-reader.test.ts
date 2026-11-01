import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { inflateRawSync } from "node:zlib";
import { createDocumentAllowance } from "../server/document-allowance.mjs";
import {
  zipReceiptSections,
  validatePreparedJpeg,
} from "../server/receipt-zip.mjs";
import {
  createVeryfiReader,
  VERYFI_ENDPOINT,
  VERYFI_OPTIONS,
} from "../server/veryfi-reader.mjs";

const folders: string[] = [];
const clientId = "synthetic_client_id";
const bearerKey = "synthetic_bearer_key_only_for_offline_tests";
const text = "Market\nTea 1x 5.50 5.50\nTOTAL GBP 5.50";
async function folder() {
  const path = await mkdtemp(join(tmpdir(), "gather-veryfi-"));
  folders.push(path);
  return path;
}
afterEach(async () => {
  for (const path of folders.splice(0)) {
    if (
      !resolve(path).startsWith(resolve(tmpdir()) + sep) ||
      !path.includes("gather-veryfi-")
    )
      throw new Error("Unexpected temporary directory");
    await rm(path, { recursive: true, force: true });
  }
});
function jpeg(width = 32, height = 32) {
  // Header-validation control, not an actual receipt or codec/recognition fixture.
  const bytes = Buffer.alloc(300);
  bytes.set([255, 216, 255, 224, 0, 16], 0);
  bytes.set([255, 192, 0, 17, 8], 20);
  bytes.writeUInt16BE(height, 25);
  bytes.writeUInt16BE(width, 27);
  bytes[29] = 3;
  bytes.set([255, 217], 298);
  return bytes;
}
const panels = () => [{ photo: 1, part: 1, data: jpeg().toString("base64") }];
type Call = { url: string; options: RequestInit };
async function setup({
  limit = 1,
  post,
  deletion,
}: {
  limit?: number;
  post?: (
    body: Record<string, unknown>,
    call: Call,
  ) => Response | Promise<Response>;
  deletion?: (call: Call) => Response | Promise<Response>;
} = {}) {
  const directory = await folder();
  const calls: Call[] = [];
  const options = {
    clientId,
    bearerKey,
    directory,
    grant: "offline-grant-1",
    limit,
    fetcher: async (
      input: Parameters<typeof globalThis.fetch>[0],
      options: RequestInit = {},
    ) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      const call = { url, options };
      calls.push(call);
      expect(options.redirect).toBe("error");
      expect(options.headers).toMatchObject({
        Authorization: `Bearer ${bearerKey}`,
        "CLIENT-ID": clientId,
      });
      if (options.method === "POST") {
        expect(url).toBe(VERYFI_ENDPOINT);
        const body = JSON.parse(options.body as string);
        expect(body).toMatchObject({
          file_name: "receipt.zip",
          ...VERYFI_OPTIONS,
        });
        return post
          ? post(body, call)
          : new Response(
              JSON.stringify({
                id: 123,
                external_id: body.external_id,
                ocr_text: text,
              }),
              { status: 201, headers: { "content-type": "application/json" } },
            );
      }
      expect(options.method).toBe("DELETE");
      expect(url).toBe(VERYFI_ENDPOINT + "/123");
      return deletion ? deletion(call) : new Response("{}", { status: 200 });
    },
  };
  return {
    directory,
    calls,
    options,
    reader: createVeryfiReader(options),
    controller: new AbortController(),
  };
}

describe("persistent document allowance", () => {
  it("reserves a finite cap atomically across independent instances and restart", async () => {
    const directory = await folder();
    const options = {
      directory,
      account: "synthetic-account",
      grant: "offline-grant-1",
      limit: 3,
    };
    const attempts = await Promise.allSettled(
      Array.from({ length: 12 }, (_, i) =>
        createDocumentAllowance(options).reserve("synthetic-request-" + i),
      ),
    );
    const reserved = attempts.filter((r) => r.status === "fulfilled");
    expect(reserved).toHaveLength(3);
    for (const entry of reserved)
      if (entry.status === "fulfilled")
        await entry.value.finish("failed", "unknown");
    expect(await createDocumentAllowance(options).remaining()).toBe(0);
    await expect(
      createDocumentAllowance(options).reserve("another-synthetic-request"),
    ).rejects.toThrow("exhausted");
  });
  it("defaults disabled and rejects an invalid or unbounded grant", async () => {
    for (const limit of [0, -1, 101, 1.5, NaN]) {
      const allowance = createDocumentAllowance({
        directory: await folder(),
        account: "a",
        grant: "valid-grant",
        limit,
      });
      expect(allowance.configured).toBe(false);
      expect(await allowance.remaining()).toBe(0);
    }
    expect(createVeryfiReader({ clientId, bearerKey }).configured).toBe(false);
  });
});

describe("ordered receipt ZIP and prepared JPEG guards", () => {
  it("round-trips standard deflate entries, generic order and the canonical CRC vector", () => {
    const files = [Buffer.from("123456789"), Buffer.from("second section")];
    const archive = zipReceiptSections(files);
    let offset = 0;
    for (const [index, data] of files.entries()) {
      expect(archive.readUInt32LE(offset)).toBe(0x04034b50);
      const nameLength = archive.readUInt16LE(offset + 26),
        compressedSize = archive.readUInt32LE(offset + 18);
      expect(
        archive.subarray(offset + 30, offset + 30 + nameLength).toString(),
      ).toBe(`section-${String(index + 1).padStart(4, "0")}.jpg`);
      expect(
        inflateRawSync(
          archive.subarray(
            offset + 30 + nameLength,
            offset + 30 + nameLength + compressedSize,
          ),
        ),
      ).toEqual(data);
      if (index === 0)
        expect(archive.readUInt32LE(offset + 14)).toBe(0xcbf43926);
      offset += 30 + nameLength + compressedSize;
    }
    expect(archive.readUInt32LE(offset)).toBe(0x02014b50);
    expect(archive.readUInt32LE(archive.length - 22)).toBe(0x06054b50);
    expect(archive.readUInt16LE(archive.length - 12)).toBe(2);
  });
  it("rejects huge dimensions, incomplete headers, wrong formats and too many entries", () => {
    expect(() => validatePreparedJpeg(jpeg())).not.toThrow();
    for (const bytes of [
      jpeg(4000, 4000),
      jpeg().subarray(0, 100),
      Buffer.from("<svg>not pixels</svg>"),
    ])
      expect(() => validatePreparedJpeg(bytes)).toThrow();
    expect(() =>
      zipReceiptSections(Array.from({ length: 16 }, () => jpeg())),
    ).toThrow();
  });
});

describe("optional Veryfi text transport without any live provider call", () => {
  it("returns only literal text/status and deletes only the matching new record once", async () => {
    const s = await setup();
    expect((await s.reader.getStatus()).remaining).toBe(1);
    const result = await s.reader.extract(panels(), {
      signal: s.controller.signal,
    });
    expect(result.text).toBe(text);
    expect(result.cleanup).toBe("provider-reported-success");
    expect(s.calls.map((c) => c.options.method)).toEqual(["POST", "DELETE"]);
    expect(result.remaining).toBe(0);
    const account = (await readdir(s.directory))[0];
    const stored = await readFile(
      join(s.directory, account, "offline-grant-1", "1.json"),
      "utf8",
    );
    for (const value of [text, clientId, bearerKey, panels()[0].data])
      expect(stored).not.toContain(value);
    await expect(
      createVeryfiReader(s.options).extract(panels(), {
        signal: s.controller.signal,
      }),
    ).rejects.toThrow("allowance has been used");
    expect(s.calls).toHaveLength(2);
  });
  it("rejects malformed input before consuming allowance or contacting a provider", async () => {
    const s = await setup();
    await expect(
      s.reader.extract([{ photo: 1, part: 1, data: "/9j/4AA=" }], {
        signal: s.controller.signal,
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(s.calls).toHaveLength(0);
    expect((await s.reader.getStatus()).remaining).toBe(1);
  });
  it("never retries a provider error and keeps that attempt consumed", async () => {
    const s = await setup({
      post: () => new Response("busy", { status: 503 }),
    });
    await expect(
      s.reader.extract(panels(), { signal: s.controller.signal }),
    ).rejects.toMatchObject({ status: 502, cleanup: "unknown" });
    expect(s.calls).toHaveLength(1);
    expect((await s.reader.getStatus()).remaining).toBe(0);
  });
  it.each([
    "wrong-owner",
    "duplicate",
    "fractional-id",
    "duplicate-key",
    "invalid-utf8",
  ])("does not delete an unproven document (%s)", async (kind) => {
    const s = await setup({
      post: (body) => {
        const record = {
          id: 123,
          external_id: body.external_id,
          ocr_text: text,
          ...(kind === "wrong-owner" ? { external_id: "other-request" } : {}),
          ...(kind === "duplicate" ? { duplicate_of: 10 } : {}),
          ...(kind === "fractional-id" ? { id: 123.5 } : {}),
        };
        const raw =
          kind === "invalid-utf8"
            ? Buffer.from([255])
            : kind === "duplicate-key"
              ? JSON.stringify(record).replace('"id":123', '"id":999,"id":123')
              : JSON.stringify(record);
        return new Response(raw, {
          status: 201,
          headers: { "content-type": "application/json" },
        });
      },
    });
    await expect(
      s.reader.extract(panels(), { signal: s.controller.signal }),
    ).rejects.toMatchObject({ cleanup: "unknown" });
    expect(s.calls).toHaveLength(1);
  });
  it("still cleans up a proven new document when its text is missing", async () => {
    const s = await setup({
      post: (body) =>
        new Response(
          JSON.stringify({
            id: 123,
            external_id: body.external_id,
            ocr_text: null,
          }),
          { status: 201, headers: { "content-type": "application/json" } },
        ),
    });
    await expect(
      s.reader.extract(panels(), { signal: s.controller.signal }),
    ).rejects.toMatchObject({ cleanup: "provider-reported-success" });
    expect(s.calls).toHaveLength(2);
  });
  it("reports uncertain cleanup without retrying or inventing a successful deletion", async () => {
    const s = await setup({
      deletion: () => new Response("failed", { status: 503 }),
    });
    const result = await s.reader.extract(panels(), {
      signal: s.controller.signal,
    });
    expect(result.text).toBe(text);
    expect(result.cleanup).toBe("unknown");
    expect(s.calls).toHaveLength(2);
  });
  it("cancellation after creation uses an independent cleanup signal and rejects the draft", async () => {
    let controller: AbortController;
    const s = await setup({
      post: (body) => {
        controller.abort();
        return new Response(
          JSON.stringify({
            id: 123,
            external_id: body.external_id,
            ocr_text: text,
          }),
          { status: 201, headers: { "content-type": "application/json" } },
        );
      },
      deletion: (call) => {
        expect((call.options.signal as AbortSignal).aborted).toBe(false);
        return new Response("{}", { status: 200 });
      },
    });
    controller = s.controller;
    await expect(
      s.reader.extract(panels(), { signal: controller.signal }),
    ).rejects.toMatchObject({
      status: 504,
      cleanup: "provider-reported-success",
    });
    expect(s.calls).toHaveLength(2);
  });
});
