// Synthetic protocol/security tests only. Every request uses an injected fake.
import test from "node:test";
import assert from "node:assert/strict";
import {
  API_VERSION,
  MODEL,
  MAX_POLLS,
  azureEndpoint,
  runAzureProbe,
  sha,
} from "./azure_receipt_probe.mjs";
import { runAzureBatch } from "./azure_receipt_batch.mjs";

const endpoint = "https://synthetic-receipt.cognitiveservices.azure.com";
const id = "12345678-1234-1234-1234-123456789abc";
const operation = `${endpoint}/documentintelligence/documentModels/${MODEL}/analyzeResults/${id}?api-version=${API_VERSION}`;
const rawSuccess = `{"status":"succeeded","analyzeResult":{"apiVersion":"${API_VERSION}","modelId":"${MODEL}","pages":[{}],"documents":[{"fields":{"Total":{"valueCurrency":{"amount":1.230}}}}]}}`;
const json = (text) =>
  new Response(text, { headers: { "Content-Type": "application/json" } });

function fixture() {
  // Deliberately a header-only protocol fixture, never a decoded receipt claim.
  const image = Buffer.alloc(200);
  Buffer.from("89504e470d0a1a0a", "hex").copy(image);
  image.write("IHDR", 12, "ascii");
  image.writeUInt32BE(100, 16);
  image.writeUInt32BE(100, 20);
  const events = [],
    calls = [],
    saves = [],
    waits = [];
  const options = {
    image,
    credentials: { endpoint, key: "synthetic-offline-api-key-never-live" },
    permit: {
      provider: "Azure Document Intelligence",
      approved_by_user: true,
      free_f0_confirmed: true,
      unused_free_pages_confirmed: true,
      image_sha256: sha(image),
      endpoint_sha256: sha(endpoint),
      model: MODEL,
      api_version: API_VERSION,
      max_processing_requests: 1,
      max_deletion_requests: 1,
      max_poll_requests: MAX_POLLS,
      automatic_retries: 0,
    },
    consume: async () => events.push("consumed"),
    saveResponse: async (bytes) => saves.push(bytes),
    wait: async (ms) => waits.push(ms),
    fetcher: async (url, request) => {
      assert.deepEqual(events, ["consumed"]);
      calls.push({ url, request });
      if (request.method === "POST") {
        return new Response(null, {
          status: 202,
          headers: { "Operation-Location": operation },
        });
      }
      if (request.method === "DELETE")
        return new Response(null, { status: 204 });
      return json(rawSuccess);
    },
  };
  return { options, calls, saves, waits, events };
}

test("one exact image, pinned model/version, bounded polling and one matching deletion", async () => {
  const f = fixture(),
    meta = await runAzureProbe(f.options);
  assert.deepEqual(
    f.calls.map((row) => row.request.method),
    ["POST", "GET", "DELETE"],
  );
  const body = JSON.parse(f.calls[0].request.body);
  assert.deepEqual(Object.keys(body), ["base64Source"]);
  assert.deepEqual(Buffer.from(body.base64Source, "base64"), f.options.image);
  assert.match(
    f.calls[0].url,
    /prebuilt-receipt:analyze\?api-version=2024-11-30$/,
  );
  for (const row of f.calls) {
    assert.equal(row.request.redirect, "error");
    assert.equal(
      row.request.headers["Ocp-Apim-Subscription-Key"],
      f.options.credentials.key,
    );
    assert.ok(row.request.signal instanceof AbortSignal);
  }
  assert.equal(f.calls[1].url, operation);
  assert.equal(f.calls[2].url, operation);
  assert.equal(f.saves[0].toString(), rawSuccess);
  assert.deepEqual(f.waits, [2000, 1000]);
  assert.equal(meta.extraction_received, true);
  assert.equal(meta.deletion_status, "provider-reported-success");
  assert.equal(meta.automatic_retries, 0);
  assert(!JSON.stringify(meta).includes(f.options.credentials.key));
});

test("normal running-state polls never repeat the extraction upload", async () => {
  const f = fixture(),
    original = f.options.fetcher;
  let polls = 0;
  f.options.fetcher = async (url, request) => {
    if (request.method === "GET" && polls++ < 2) {
      f.calls.push({ url, request });
      return json('{"status":"running"}');
    }
    return original(url, request);
  };
  const meta = await runAzureProbe(f.options);
  assert.equal(meta.poll_requests, 3);
  assert.equal(
    f.calls.filter((row) => row.request.method === "POST").length,
    1,
  );
  assert.equal(meta.extraction_received, true);
});

test("missing approval, changed image or missing quota confirmation sends nothing", async () => {
  for (const mutate of [
    (f) => (f.options.permit.approved_by_user = false),
    (f) => (f.options.permit.free_f0_confirmed = false),
    (f) => (f.options.permit.unused_free_pages_confirmed = false),
    (f) => (f.options.permit.image_sha256 = "0".repeat(64)),
    (f) => (f.options.permit.max_poll_requests = 31),
    (f) => (f.options.permit.api_version = "future-version"),
    (f) => (f.options.credentials.key = ""),
    (f) => f.options.image.writeUInt32BE(10001, 16),
  ]) {
    const f = fixture();
    mutate(f);
    await assert.rejects(runAzureProbe(f.options));
    assert.equal(f.calls.length, 0);
    assert.equal(f.events.length, 0);
  }
});

test("persistent consumption failure precedes all network activity", async () => {
  const f = fixture();
  f.options.consume = async () => {
    throw new Error("existing-ledger");
  };
  await assert.rejects(runAzureProbe(f.options));
  assert.equal(f.calls.length, 0);
});

test("endpoint validation rejects non-Azure, credentials, extra paths and URLs", () => {
  for (const url of [
    "http://synthetic-receipt.cognitiveservices.azure.com",
    "https://attacker.invalid",
    endpoint + ".attacker.invalid",
    endpoint + "/arbitrary",
    endpoint + "?key=value",
    endpoint + "#fragment",
    "https://user:password@synthetic-receipt.cognitiveservices.azure.com",
    "https://synthetic-receipt.cognitiveservices.azure.com:444",
  ])
    assert.throws(() => azureEndpoint(url));
  assert.equal(azureEndpoint(endpoint + "/"), endpoint);
});

test("unproven operation locations never receive a key, GET or DELETE", async () => {
  for (const location of [
    operation.replace(endpoint, "https://attacker.invalid"),
    operation.replace("prebuilt-receipt", "prebuilt-invoice"),
    operation.replace(id, "old-record"),
    operation + "&extra=1",
    operation.replace(API_VERSION, "2023-07-31"),
  ]) {
    const f = fixture();
    f.options.fetcher = async (url, request) => {
      f.calls.push({ url, request });
      return new Response(null, {
        status: 202,
        headers: { "Operation-Location": location },
      });
    };
    const meta = await runAzureProbe(f.options);
    assert.equal(f.calls.length, 1);
    assert.equal(meta.extraction_received, false);
    assert.equal(meta.deletion_requests, 0);
  }
});

test("429 and network failure are not retried and cannot delete an unknown result", async () => {
  for (const failure of [429, "network"]) {
    const f = fixture();
    f.options.fetcher = async (url, request) => {
      f.calls.push({ url, request });
      if (failure === "network") throw new Error(f.options.credentials.key);
      return new Response(null, { status: failure });
    };
    const meta = await runAzureProbe(f.options);
    assert.equal(f.calls.length, 1);
    assert.equal(meta.processing_requests, 1);
    assert.equal(meta.deletion_requests, 0);
    assert(!JSON.stringify(meta).includes(f.options.credentials.key));
  }
});

test("failed analysis, malformed JSON and wrong result profile still clean only their new operation", async () => {
  for (const text of [
    '{"status":"failed"}',
    "{invalid",
    rawSuccess.replace(MODEL, "wrong-model"),
  ]) {
    const f = fixture(),
      original = f.options.fetcher;
    f.options.fetcher = async (url, request) => {
      if (request.method !== "GET") return original(url, request);
      f.calls.push({ url, request });
      return json(text);
    };
    const meta = await runAzureProbe(f.options);
    assert.equal(meta.extraction_received, false);
    assert.equal(meta.deletion_requests, 1);
    assert.equal(meta.deletion_status, "provider-reported-success");
    assert.equal(f.saves.length, 0);
  }
});

test("a bounded running job stops after thirty polls and reports one cleanup attempt", async () => {
  const f = fixture(),
    original = f.options.fetcher;
  f.options.fetcher = async (url, request) => {
    if (request.method !== "GET") return original(url, request);
    return json('{"status":"running"}');
  };
  const meta = await runAzureProbe(f.options);
  assert.equal(meta.poll_requests, MAX_POLLS);
  assert.equal(meta.error, "poll-bound");
  assert.equal(meta.deletion_requests, 1);
});

test("oversized or credential-echo responses are never stored", async () => {
  for (const mode of ["size", "echo"]) {
    const f = fixture(),
      original = f.options.fetcher;
    f.options.fetcher = async (url, request) => {
      if (request.method !== "GET") return original(url, request);
      return mode === "size"
        ? new Response("x", {
            headers: {
              "content-type": "application/json",
              "content-length": "2000001",
            },
          })
        : json(
            JSON.stringify({
              status: "succeeded",
              echo: f.options.credentials.key,
            }),
          );
    };
    const meta = await runAzureProbe(f.options);
    assert.equal(f.saves.length, 0);
    assert.equal(meta.extraction_received, false);
    assert.equal(meta.deletion_requests, 1);
    assert(!JSON.stringify(meta).includes(f.options.credentials.key));
  }
});

test("local recording failure and ambiguous deletion never become successful cleanup claims", async () => {
  const f = fixture(),
    original = f.options.fetcher;
  f.options.saveResponse = async () => {
    throw new Error(f.options.credentials.key);
  };
  f.options.fetcher = async (url, request) =>
    request.method === "DELETE"
      ? new Response(null, { status: 202 })
      : original(url, request);
  const meta = await runAzureProbe(f.options);
  assert.equal(meta.extraction_received, false);
  assert.equal(meta.deletion_requests, 1);
  assert.equal(meta.deletion_status, "failed-or-unconfirmed");
  assert(!JSON.stringify(meta).includes(f.options.credentials.key));
});

function batchFixture() {
  const one = fixture(),
    calls = [],
    events = [],
    saved = [];
  const cases = Array.from({ length: 6 }, (_, index) => {
    const image = Buffer.from(one.options.image);
    image[image.length - 1] = index;
    return { id: `case-0${index + 1}`, image };
  });
  return {
    calls,
    events,
    saved,
    options: {
      cases,
      credentials: one.options.credentials,
      planSha256: "synthetic-plan",
      authorization: {
        provider: "Azure Document Intelligence",
        approved_by_user: true,
        free_f0_confirmed: true,
        unused_free_pages_confirmed: true,
        resource_region: "uksouth",
        max_processing_requests: 6,
        max_deletion_requests: 6,
        max_poll_requests: 180,
        automatic_retries: 0,
        plan_sha256: "synthetic-plan",
        endpoint_sha256: sha(endpoint),
        images: Object.fromEntries(
          cases.map((row) => [row.id, sha(row.image)]),
        ),
      },
      consumeBatch: async () => events.push("batch-ledger"),
      consumeCase: async (id) => events.push(id),
      saveResponse: async (id, raw) => saved.push({ id, raw }),
      saveMetadata: async () => {},
      wait: async () => {},
      fetcher: async (url, request) => {
        assert.equal(events[0], "batch-ledger");
        assert.ok(events.length >= 2);
        calls.push({ url, request });
        if (request.method === "POST") {
          const suffix = String(
            calls.filter((row) => row.request.method === "POST").length,
          ).padStart(12, "0");
          return new Response(null, {
            status: 202,
            headers: {
              "Operation-Location": operation.replace(
                id,
                `12345678-1234-1234-1234-${suffix}`,
              ),
            },
          });
        }
        if (request.method === "DELETE")
          return new Response(null, { status: 204 });
        return json(rawSuccess);
      },
    },
  };
}

test("six-case batch persists scope first and never exceeds six uploads or deletions", async () => {
  const f = batchFixture(),
    results = await runAzureBatch(f.options);
  assert.equal(results.length, 6);
  for (const method of ["POST", "GET", "DELETE"])
    assert.equal(
      f.calls.filter((row) => row.request.method === method).length,
      6,
    );
  assert.equal(f.saved.length, 6);
  assert.deepEqual(f.events, [
    "batch-ledger",
    ...f.options.cases.map((row) => row.id),
  ]);
});

test("old Veryfi approval or a changed sixth crop cannot consume or upload any Azure case", async () => {
  for (const mutate of [
    (f) => (f.options.authorization.provider = "Veryfi"),
    (f) => (f.options.authorization.images["case-06"] = "wrong-hash"),
    (f) => (f.options.authorization.resource_region = ""),
  ]) {
    const f = batchFixture();
    mutate(f);
    await assert.rejects(runAzureBatch(f.options));
    assert.equal(f.calls.length, 0);
    assert.equal(f.events.length, 0);
  }
});

test("batch marker collision cannot repeat a previously consumed comparison", async () => {
  const f = batchFixture();
  f.options.consumeBatch = async () => {
    throw new Error("EEXIST");
  };
  await assert.rejects(runAzureBatch(f.options));
  assert.equal(f.calls.length, 0);
});

test("batch stops after its first failed analysis and leaves later cases unattempted", async () => {
  const f = batchFixture(),
    original = f.options.fetcher;
  f.options.fetcher = async (url, request) =>
    request.method === "GET"
      ? json('{"status":"failed"}')
      : original(url, request);
  const result = await runAzureBatch(f.options);
  assert.equal(result.length, 1);
  assert.equal(result[0].extraction_received, false);
  assert.equal(
    f.calls.filter((row) => row.request.method === "POST").length,
    1,
  );
  assert.equal(
    f.calls.filter((row) => row.request.method === "DELETE").length,
    1,
  );
  assert.deepEqual(f.events, ["batch-ledger", "case-01"]);
});

test("a repeated operation ID in a batch is neither read nor deleted a second time", async () => {
  const f = batchFixture(),
    original = f.options.fetcher;
  f.options.fetcher = async (url, request) => {
    if (request.method !== "POST") return original(url, request);
    f.calls.push({ url, request });
    return new Response(null, {
      status: 202,
      headers: { "Operation-Location": operation },
    });
  };
  const results = await runAzureBatch(f.options);
  assert.equal(results.length, 2);
  assert.equal(results[1].error, "unproven-operation");
  assert.equal(results[1].deletion_requests, 0);
  assert.equal(f.calls.filter((row) => row.request.method === "GET").length, 1);
  assert.equal(
    f.calls.filter((row) => row.request.method === "DELETE").length,
    1,
  );
});
