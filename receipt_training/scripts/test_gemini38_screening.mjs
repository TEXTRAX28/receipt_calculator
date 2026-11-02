import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT, preflight, runScreening, guardRequest, redact } from './gemini38_screening.mjs';

const key = 'test-key-never-real';
const endpoint = 'https://generativelanguage.googleapis.com/v1beta/interactions';
test('prepared images and requests bind exactly to six approved crops', async () => {
  const { plan, images, proof } = await preflight();
  assert.equal(images.length, 6);
  const body = { model: plan.model, store: false, input: [{ type: 'image', mime_type: 'image/jpeg', data: images[0].toString('base64') }] };
  const options = { method: 'POST', headers: { 'x-goog-api-key': key }, body: JSON.stringify(body) };
  guardRequest(endpoint, options, plan.cases[0], key);
  assert.throws(() => guardRequest(endpoint + '/extra', options, plan.cases[0], key));
  assert.throws(() => guardRequest(endpoint, options, plan.cases[1], key));
  body.store = true; options.body = JSON.stringify(body);
  assert.throws(() => guardRequest(endpoint, options, plan.cases[0], key));
  assert.equal(proof.plan_sha256.length, 64);
  assert.equal(redact('prefix ' + key + ' suffix', key), 'prefix [redacted] suffix');
});
test('no execution without exact prepared approval', async () => {
  await assert.rejects(runScreening({ approvedPlanSha: '0'.repeat(64), apiKey: key,
    fetcher: () => { throw Error('MUST NEVER FETCH'); } }), /scope or source changed/);
});
test('six fake successes use actual strict adapter, bounded requests, spacing and one-shot output', async () => {
  const { proof } = await preflight();
  const output = join(await mkdtemp(join(tmpdir(), 'gemini-screen-protocol-')), 'run');
  const receipt = JSON.parse(await readFile('qa-artifacts/gemini-38-synthetic-availability-v1/synthetic-receipt.json'));
  let calls = 0, time = 0; const starts = [];
  const options = { approvedPlanSha: proof.plan_sha256, apiKey: key, output, now: () => time,
    wait: async ms => { time += ms; },
    fetcher: async () => { calls++; starts.push(time); return new Response(JSON.stringify({ status: 'completed',
      steps: [{ type: 'model_output', content: [{ type: 'text', text: JSON.stringify(receipt) }] }] })); } };
  const result = await runScreening(options);
  assert.equal(calls, 6); assert.equal(result.private_generation_requests, 6);
  assert.ok(result.cases.every(c => c.status === 'strict-schema-passed'));
  assert.deepEqual(starts, [0,31000,62000,93000,124000,155000]);
  for (const file of await readdir(output)) assert.ok(!(await readFile(join(output, file), 'utf8')).includes(key));
  await assert.rejects(runScreening(options), /EEXIST/);
  assert.equal(calls, 6);
});
test('quota failure stops later uploads and redacts saved provider output', async () => {
  const { proof } = await preflight();
  const output = join(await mkdtemp(join(tmpdir(), 'gemini-screen-quota-')), 'run');
  let calls = 0;
  const result = await runScreening({ approvedPlanSha: proof.plan_sha256, apiKey: key, output,
    fetcher: async () => { calls++; return new Response(JSON.stringify({ error: key }), { status: 429 }); } });
  assert.equal(calls, 1); assert.equal(result.private_generation_requests, 1);
  assert.equal(result.cases[0].status, 'failed-no-retry');
  assert.ok(result.cases.slice(1).every(c => c.status === 'not-attempted-after-auth-or-quota-failure'));
  assert.ok(!(await readFile(output + '/case-01-response.json', 'utf8')).includes(key));
});
