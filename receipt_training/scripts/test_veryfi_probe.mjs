import test from "node:test";
import assert from "node:assert/strict";
import { ENDPOINT, runVeryfiProbe, sha } from "./veryfi_probe_transport.mjs";

// Entirely synthetic bytes and fake credentials; every request uses an injected stub.
const archive = Buffer.alloc(300, 0);
archive.writeUInt32LE(0x04034b50);
const credentials = {
  clientId: "test-client-12345",
  bearerKey: "fake_key_012345678901234567890",
};
function permit() {
  return {
    provider: "Veryfi",
    approved_by_user: true,
    free_quota_confirmed: true,
    archive_sha256: sha(archive),
    max_processing_requests: 1,
    max_deletion_requests: 1,
    automatic_retries: 0,
  };
}
function fixture(fetcher, overrides = {}) {
  const events = [],
    saved = [];
  return {
    events,
    saved,
    options: {
      archive,
      permit: permit(),
      credentials,
      consume: async (value) => {
        events.push({ kind: "consume", value });
      },
      saveResponse: async (raw) => {
        saved.push(raw);
        events.push({ kind: "save" });
      },
      fetcher: async (url, options) => {
        events.push({ kind: options.method, url, options });
        return fetcher(url, options);
      },
      ...overrides,
    },
  };
}
const json = (data, status = 201) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });

test("consumes before one POST, preserves exact decimal wire bytes, then deletes only the bound test record", async () => {
  const f = fixture(async (url, options) => {
    assert.equal(options.redirect, "error");
    if (options.method === "DELETE") {
      assert.equal(url, ENDPOINT + "/45");
      return new Response(null, { status: 204 });
    }
    const body = JSON.parse(options.body);
    assert.equal(url, ENDPOINT);
    assert.equal(body.file_name, "receipt.zip");
    assert.deepEqual(Buffer.from(body.file_data, "base64"), archive);
    assert.equal(
      options.headers.Authorization,
      "Bearer " + credentials.bearerKey,
    );
    return new Response(
      `{"id":45,"external_id":"${body.external_id}","line_items":[{"total":123456789012.123456}],"duplicate_of":null}`,
      { status: 201, headers: { "Content-Type": "application/json" } },
    );
  });
  const result = await runVeryfiProbe(f.options);
  assert.deepEqual(
    f.events.map((e) => e.kind),
    ["consume", "POST", "save", "DELETE"],
  );
  assert.match(f.saved[0].toString(), /123456789012\.123456/);
  assert.equal(result.deletion_status, "provider-reported-success");
  assert.equal(result.processing_requests, 1);
  assert.equal(result.deletion_requests, 1);
});

test("missing approval, wrong archive, paid/unconfirmed quota and malformed credentials prevent even consumption", async () => {
  for (const change of [
    { approved_by_user: false },
    { archive_sha256: "0".repeat(64) },
    { free_quota_confirmed: false },
    { max_processing_requests: 2 },
    { max_deletion_requests: 0 },
    { automatic_retries: 1 },
  ]) {
    const f = fixture(
      () => {
        throw new Error("must not fetch");
      },
      { permit: { ...permit(), ...change } },
    );
    await assert.rejects(runVeryfiProbe(f.options), /approval-required/);
    assert.equal(f.events.length, 0);
  }
  const f = fixture(() => {}, {
    credentials: { ...credentials, bearerKey: "bad\r\nheader" },
  });
  await assert.rejects(runVeryfiProbe(f.options), /credentials-unavailable/);
  assert.equal(f.events.length, 0);
});

test("cleanup keeps a large provider ID exact instead of rounding it through a float", async () => {
  const f = fixture(async (url, options) => {
    if (options.method === "DELETE") {
      assert.equal(url, ENDPOINT + "/9007199254740993");
      return new Response(null, { status: 204 });
    }
    return new Response(
      `{"id":9007199254740993,"external_id":"${JSON.parse(options.body).external_id}"}`,
      { status: 201, headers: { "Content-Type": "application/json" } },
    );
  });
  assert.equal(
    (await runVeryfiProbe(f.options)).test_document_id,
    "9007199254740993",
  );
});

test("an existing consumption ledger prevents all network I/O", async () => {
  const f = fixture(
    () => {
      throw new Error("must not fetch");
    },
    {
      consume: async () => {
        throw new Error("EEXIST");
      },
    },
  );
  await assert.rejects(runVeryfiProbe(f.options), /EEXIST/);
  assert.equal(f.events.length, 0);
});

test("unavailable provider or network failure consumes once without fallback or retry", async () => {
  for (const response of [
    () => json({}, 503),
    () => {
      throw new Error("untrusted failure " + credentials.bearerKey);
    },
  ]) {
    const f = fixture(response),
      result = await runVeryfiProbe(f.options);
    assert.deepEqual(
      f.events.map((e) => e.kind),
      ["consume", "POST"],
    );
    assert.equal(result.processing_requests, 1);
    assert.equal(result.deletion_requests, 0);
    assert.equal(JSON.stringify(result).includes(credentials.bearerKey), false);
  }
});

test("unbound, duplicate, non-created and unsafe-ID records never trigger deletion", async () => {
  for (const change of [
    { external_id: "another-record" },
    { duplicate_of: 10 },
    { is_duplicate: true },
    { id: 1e100 },
    { id: 45.1 },
    { is_duplicate: "true" },
    { id: "45/other" },
  ]) {
    const f = fixture(async (_, options) =>
      json({
        id: 45,
        external_id: JSON.parse(options.body).external_id,
        ...change,
      }),
    );
    const result = await runVeryfiProbe(f.options);
    assert.equal(result.deletion_requests, 0);
    assert.equal(result.deletion_status, "not-attempted-unproven-test-record");
  }
});

test("invalid, oversized and credential-echoing bodies are rejected without persisting raw content", async () => {
  for (const response of [
    () =>
      new Response("not JSON", {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    () =>
      new Response("x".repeat(2_000_001), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    (_, options) =>
      json({
        id: 45,
        external_id: JSON.parse(options.body).external_id,
        echoed: credentials.bearerKey,
      }),
  ]) {
    const f = fixture(async (url, options) =>
      options.method === "DELETE"
        ? new Response(null, { status: 204 })
        : response(url, options),
    );
    const result = await runVeryfiProbe(f.options);
    assert.equal(result.extraction_received, false);
    assert.equal(f.saved.length, 0);
  }
});

test("local write failure still requests scoped cleanup; cleanup failure is reported without retry", async () => {
  const f = fixture(
    async (_, options) =>
      options.method === "DELETE"
        ? new Response(null, { status: 503 })
        : json({ id: 45, external_id: JSON.parse(options.body).external_id }),
    {
      saveResponse: async () => {
        throw new Error("disk unavailable");
      },
    },
  );
  const result = await runVeryfiProbe(f.options);
  assert.equal(result.extraction_received, false);
  assert.equal(result.deletion_requests, 1);
  assert.equal(result.deletion_status, "failed");
  assert.deepEqual(
    f.events.map((e) => e.kind),
    ["consume", "POST", "DELETE"],
  );
});

test("accepted asynchronous deletion does not claim that deletion finished", async () => {
  const f = fixture(async (_, options) =>
    options.method === "DELETE"
      ? new Response(null, { status: 202 })
      : json({ id: 45, external_id: JSON.parse(options.body).external_id }),
  );
  assert.equal(
    (await runVeryfiProbe(f.options)).deletion_status,
    "provider-accepted-pending",
  );
});
