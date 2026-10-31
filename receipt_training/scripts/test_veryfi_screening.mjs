import test from "node:test";
import assert from "node:assert/strict";
import { runScreeningBatch } from "./veryfi_screening_batch.mjs";
import { sha, SCREENING_OPTIONS } from "./veryfi_screening_transport.mjs";

function setup() {
  const cases = Array.from({ length: 6 }, (_, i) => {
    const archive = Buffer.alloc(300, i);
    archive.writeUInt32LE(0x04034b50);
    return { id: `case-0${i + 1}`, archive, archive_sha256: sha(archive) };
  });
  const calls = [],
    events = [];
  return {
    calls,
    events,
    options: {
      cases,
      credentials: {
        clientId: "synthetic-client",
        bearerKey: "synthetic-key-for-offline-tests-only",
      },
      authorization: {
        provider: "Veryfi",
        approved_by_user: true,
        free_quota_confirmed: true,
        max_processing_requests: 6,
        max_deletion_requests: 6,
        automatic_retries: 0,
        user_reply: "Synthetic approval, never live",
        plan_sha256: "synthetic-plan",
      },
      consumeBatch: async () => {
        events.push("batch-ledger");
      },
      consumeCase: async (id) => {
        events.push(id);
      },
      saveResponse: async () => {},
      saveMetadata: async () => {},
      fetcher: async (url, options) => {
        calls.push({ url, options });
        assert.equal(events[0], "batch-ledger");
        assert.ok(events.length >= 2);
        if (options.method === "DELETE")
          return new Response(null, { status: 204 });
        const body = JSON.parse(options.body);
        assert.equal(body.compute, false);
        assert.equal(body.bounding_boxes, true);
        assert.equal(body.confidence_details, true);
        assert.deepEqual(
          Object.keys(body).sort(),
          [
            "file_name",
            "file_data",
            "external_id",
            ...Object.keys(SCREENING_OPTIONS),
          ].sort(),
        );
        return new Response(
          JSON.stringify({
            id: 10000 + calls.length,
            external_id: body.external_id,
            line_items: [],
          }),
          { status: 201, headers: { "content-type": "application/json" } },
        );
      },
    },
  };
}

test("six distinct cases have one POST and at most one scoped DELETE each", async () => {
  const { options, calls } = setup();
  const result = await runScreeningBatch(options);
  assert.equal(result.length, 6);
  assert.equal(calls.filter((c) => c.options.method === "POST").length, 6);
  assert.equal(calls.filter((c) => c.options.method === "DELETE").length, 6);
  assert.equal(new Set(result.map((r) => r.external_id)).size, 6);
  assert.ok(
    result.every((r) => r.deletion_status === "provider-reported-success"),
  );
});
test("the consumed one-case authorization cannot authorize six uploads", async () => {
  const { options, calls } = setup();
  options.authorization.max_processing_requests = 1;
  await assert.rejects(runScreeningBatch(options));
  assert.equal(calls.length, 0);
});
test("quota, every archive and every credential are checked before consuming the batch", async () => {
  for (const change of [
    (o) => {
      o.authorization.free_quota_confirmed = false;
    },
    (o) => {
      o.cases[5].archive_sha256 = "wrong";
    },
    (o) => {
      o.credentials.bearerKey = "";
    },
    (o) => {
      o.cases[5].id = "case-01";
    },
  ]) {
    const { options, calls, events } = setup();
    change(options);
    await assert.rejects(runScreeningBatch(options));
    assert.equal(calls.length, 0);
    assert.equal(events.length, 0);
  }
});
test("an existing global consumption ledger prevents all network calls", async () => {
  const { options, calls } = setup();
  options.consumeBatch = async () => {
    throw new Error("EEXIST");
  };
  await assert.rejects(runScreeningBatch(options), /EEXIST/);
  assert.equal(calls.length, 0);
});
test("a provider failure is not retried; only the next distinct case is attempted", async () => {
  const { options, calls } = setup(),
    original = options.fetcher;
  let posts = 0;
  options.fetcher = async (url, request) => {
    if (request.method === "POST" && posts++ === 0) {
      calls.push({ url, options: request });
      return new Response("unavailable", { status: 503 });
    }
    return original(url, request);
  };
  const result = await runScreeningBatch(options);
  assert.equal(result[0].processing_http_status, 503);
  assert.equal(result[0].deletion_requests, 0);
  assert.equal(calls.filter((c) => c.options.method === "POST").length, 6);
  assert.equal(calls.filter((c) => c.options.method === "DELETE").length, 5);
});
test("local recording failure stops the batch without restarting any upload", async () => {
  const { options, calls } = setup();
  options.saveMetadata = async () => {
    throw new Error("disk failure");
  };
  await assert.rejects(runScreeningBatch(options), /disk failure/);
  assert.equal(calls.filter((c) => c.options.method === "POST").length, 1);
});
