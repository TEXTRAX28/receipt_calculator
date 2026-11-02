// Same saved crops, existing verifier, no model requests or financial repairs.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'vite';

const root = process.cwd();
const out = 'qa-artifacts/provider-review/azure-gemini35-replay-v1';
const azure = 'qa-artifacts/provider-review/azure-screening-v1';
const gemini = 'qa-artifacts/provider-review/gemini35-screen-v1';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const inputs = {}, sources = {}, loaded = {}, frozen = new Map();
const write = (name, data) => writeFile(`${out}/${name}`, JSON.stringify(data, (_, v) => typeof v === 'bigint' ? String(v) : v, 2) + '\n', { flag: 'wx' });
async function read(path, expected) {
  const bytes = await readFile(path); const digest = hash(bytes);
  if (expected) assert.equal(digest, expected, path);
  inputs[path] = digest; return bytes;
}
const json = async (path, expected) => JSON.parse(await read(path, expected));
const aPlan = await json(`${azure}/run/plan.json`);
const gPlan = await json(`${gemini}/plan.json`);
const gRun = await json(`${gemini}/run/metadata.json`);
const contextPlan = await json('qa-artifacts/provider-review/veryfi-screening-crops-v2/run/plan.json');
assert.equal(aPlan.cases.length, 6); assert.equal(gRun.private_generation_requests, 6);
const cases = [];
for (const item of aPlan.cases) {
  const other = gPlan.cases.find(c => c.case === item.id);
  const result = gRun.cases.find(c => c.case === item.id);
  assert.equal(other.receipt_id, item.receipt_id);
  assert.equal(other.source_png_sha256, item.image_sha256);
  assert.equal(other.width, item.width); assert.equal(other.height, item.height);
  await read(item.image, item.image_sha256); await read(other.image, other.sha256);
  const meta = await json(`${azure}/run/${item.id}/metadata.json`);
  const record = await json(`${azure}/run/${item.id}/response.json`, meta.response_sha256);
  const draft = result.status === 'strict-schema-passed' ? await json(`${gemini}/run/${item.id}-receipt.json`) : null;
  const context = contextPlan.cases.find(c => c.case === item.id);
  assert.equal(context.receipt_id, item.receipt_id);
  cases.push({ item, record, draft, result, currency: context.offline_context_currency });
}
await mkdir(out);
await mkdir(`${out}/source`);
for (const name of (await readdir('src/lib')).sort()) {
  if (!/\.(ts|mjs)$/.test(name)) continue;
  const path = `src/lib/${name}`, bytes = await readFile(path);
  sources[path] = hash(bytes);
  frozen.set(resolve(path).replaceAll('\\', '/'), { path, text: bytes.toString('utf8') });
  await writeFile(`${out}/source/${name}`, bytes, { flag: 'wx' });
}
const runner = await readFile('receipt_training/scripts/replay_azure_gemini35.mjs');
await writeFile(`${out}/runner.mjs`, runner, { flag: 'wx' });
await write('plan.json', {
  hypothesis: 'Existing word-backed verifier may combine Gemini names/quantities with Azure financial source evidence; compare against Azure words alone without tuning.',
  modes: ['automatic', 'known-currency'], cases: cases.map(({item,draft}) => ({case:item.id,receipt_id:item.receipt_id,gemini_valid:!!draft})),
  fallback: 'Azure word draft only when Gemini returned no schema-valid draft. No repair or normalization of rejected model amounts.',
  scope: 'Six familiar development crops, independently extracted PNG/JPEG versions with identical framing/dimensions but not identical pixel bytes. No live hybrid integration or combined latency claim.',
  input_sha256: inputs, source_sha256: sources, runner_sha256: hash(runner), new_model_calls: 0,
});
const previousFetch = globalThis.fetch;
globalThis.fetch = async () => { throw Error('Offline replay forbids network'); };
const predictions = [];
const server = await createServer({ root, configFile: false, appType: 'custom', logLevel: 'error', envDir: false,
  server: { middlewareMode: true, hmr: false, watch: null },
  plugins: [{ name: 'frozen-azure-gemini', enforce: 'pre', load(id) {
    const file = frozen.get(id.split('?')[0].replaceAll('\\', '/'));
    if (!file) return null;
    loaded[file.path] = sources[file.path]; return file.text;
  } }],
});
try {
  const { projectAzurePage, AZURE_ENGINE } = await server.ssrLoadModule('/src/lib/azure-layout.mjs');
  const { receiptFromAzureWords } = await server.ssrLoadModule('/src/lib/azure.ts');
  const { verifyIndependentReadings } = await server.ssrLoadModule('/src/lib/verify-readings.ts');
  const { calculateReceipt } = await server.ssrLoadModule('/src/lib/engine.ts');
  for (const { item, record, draft, result, currency } of cases) {
    const panel = projectAzurePage(record, { photo:1, part:1, width:item.width, height:item.height });
    const recognition = { engine: AZURE_ENGINE, panels:[panel] };
    const originals = JSON.stringify({ recognition, draft });
    for (const [mode, context] of [['automatic',undefined], ['known-currency',{currency}]]) {
      for (const method of ['azure-words', 'azure-gemini-with-fallback']) {
        const compared = method !== 'azure-words' && !!draft;
        const output = compared ? verifyIndependentReadings(draft, recognition, context) : receiptFromAzureWords(recognition, context);
        assert(output.receipt.reviewChecks.length > 0);
        assert(output.receipt.reviewChecks.every(check => check.confirmedValue === ''));
        const calculation = calculateReceipt(output.receipt);
        assert(calculation.issues.length > 0);
        predictions.push({ case:item.id, receipt_id:item.receipt_id, method, mode,
          gemini_status:result.status, compared, fallback:method !== 'azure-words' && !draft,
          receipt:output.receipt, calculation, sources:output.sources, fieldSources:output.fieldSources,
          taxBasisRecovery:output.taxBasisRecovery, financialRoleRecovery:output.financialRoleRecovery });
      }
    }
    assert.equal(JSON.stringify({ recognition, draft }), originals);
  }
  for (const path of ['src/lib/azure-layout.mjs','src/lib/azure.ts','src/lib/verify-readings.ts','src/lib/engine.ts']) assert.equal(loaded[path], sources[path]);
} finally {
  await server.close(); globalThis.fetch = previousFetch;
}
await write('predictions.json', predictions);
for (const [path,digest] of Object.entries(sources)) assert.equal(hash(await readFile(path)), digest);
await write('metadata.json', { input_sha256:inputs, source_sha256:sources, loaded_frozen_source_sha256:loaded,
  prediction_views:predictions.length, predictions_sha256:hash(await readFile(`${out}/predictions.json`)), source_unchanged:true,
  originals_unchanged:true, all_checks_unconfirmed:true, new_model_calls:0, external_requests:0 });
console.log(JSON.stringify({ prediction_views:predictions.length, new_model_calls:0, all_checks_unconfirmed:true }));
