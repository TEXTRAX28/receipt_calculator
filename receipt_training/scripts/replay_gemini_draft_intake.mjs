// Six saved response bodies through the real adapter; mocked transport only.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'vite';

const out = 'qa-artifacts/gemini-draft-intake-v1';
const run = out + '/replay';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const inputs = {}, sources = {}, loaded = {}, frozen = new Map();
const write = (name, value) => writeFile(`${run}/${name}`, JSON.stringify(value, (_, v) => typeof v === 'bigint' ? String(v) : v, 2) + '\n', { flag: 'wx' });
async function read(path) { const bytes = await readFile(path); inputs[path] = sha(bytes); return bytes; }
await mkdir(run);
await mkdir(run + '/source');
for (const folder of ['src/lib', 'server']) {
  for (const name of (await readdir(folder)).sort()) {
    if (!/\.(mjs|ts)$/.test(name)) continue;
    const path = folder + '/' + name, bytes = await readFile(path);
    sources[path] = sha(bytes);
    frozen.set(resolve(path).replaceAll('\\', '/'), { path, text:bytes.toString('utf8') });
    await mkdir(`${run}/source/${folder}`, { recursive:true });
    await writeFile(`${run}/source/${path}`, bytes, { flag:'wx' });
  }
}
const control = JSON.parse(await read('qa-artifacts/provider-review/gemini35-screen-v1/run/metadata.json'));
const fixture = await read('tests/fixtures/prepared-section.jpg');
const previousFetch = globalThis.fetch;
globalThis.fetch = async () => { throw Error('Offline replay forbids network'); };
const server = await createServer({ configFile:false, envDir:false, appType:'custom', logLevel:'error',
  optimizeDeps:{ noDiscovery:true }, server:{ middlewareMode:true, hmr:false, watch:null },
  plugins:[{ name:'frozen-gemini-intake', enforce:'pre', load(id) {
    const file = frozen.get(id.split('?')[0].replaceAll('\\','/'));
    if (!file) return null;
    loaded[file.path] = sources[file.path]; return file.text;
  } }],
});
const results = [];
let mockCalls = 0;
try {
  const { extractWithGemini } = await server.ssrLoadModule('/server/receipt-api.mjs');
  const { aiReceiptSchema, aiReceiptJsonSchema } = await server.ssrLoadModule('/src/lib/extraction-schema.mjs');
  const { receiptFromAi } = await server.ssrLoadModule('/src/lib/gemini.ts');
  const { newState, receiptStamp } = await server.ssrLoadModule('/src/lib/model.ts');
  const { calculateReceipt, calculateSplit } = await server.ssrLoadModule('/src/lib/engine.ts');
  const { confirmReviewCheck, reviewKey } = await server.ssrLoadModule('/src/lib/review-checks.ts');
  assert.equal(JSON.stringify(aiReceiptJsonSchema), (await read(out + '/provider-schema-before.json')).toString('utf8'));
  for (const entry of control.cases) {
    const path = `qa-artifacts/provider-review/gemini35-screen-v1/run/${entry.case}-response.json`;
    const bytes = await read(path);
    assert.equal(sha(bytes), entry.response_sha256);
    const response = JSON.parse(bytes);
    const text = response.steps.filter(s => s.type === 'model_output').flatMap(s => s.content || []).filter(p => p.type === 'text').map(p => p.text).join('');
    const raw = JSON.parse(text);
    const decoded = await extractWithGemini([{ photo:1, part:1, data:fixture.toString('base64') }], {
      apiKey:'offline-fake-key', model:'gemini-3.5-flash-lite', fetcher:async () => { mockCalls++; return new Response(bytes, { status:200 }); },
    });
    assert.deepEqual(decoded, raw);
    const receipt = receiptFromAi(decoded);
    const calculation = calculateReceipt(receipt);
    const formatChecks = receipt.reviewChecks.filter(check => check.other.includes('number separators'));
    assert(formatChecks.every(check => check.confirmedValue === ''));
    let cannotFinalizeAfterChecking = null;
    if (formatChecks.length) {
      const state = newState(); state.receipt = structuredClone(receipt);
      state.people = [{ id:'one', name:'One' }];
      state.receipt.items.forEach(item => { item.assignment.participants = ['one']; });
      for (const check of state.receipt.reviewChecks) state.receipt = confirmReviewCheck(state.receipt, reviewKey(check));
      // Resolve only currency to ensure invalid money, not just missing currency, blocks sharing.
      state.receipt.currency = 'IDR'; state.receipt.currencyUnresolved = false;
      state.reviewedStamp = receiptStamp(state.receipt);
      cannotFinalizeAfterChecking = !calculateSplit(state).canFinalize;
      assert(cannotFinalizeAfterChecking);
    }
    results.push({ case:entry.case, receipt_id:entry.receipt_id, prior_status:entry.status,
      canonical_schema_valid:aiReceiptSchema.safeParse(raw).success, decoded, receipt, calculation,
      pending_format_checks:formatChecks.length, cannot_finalize_after_checking:cannotFinalizeAfterChecking });
  }
} finally { await server.close(); globalThis.fetch = previousFetch; }
assert.equal(mockCalls,6);
assert.equal(results.filter(r => r.canonical_schema_valid).length,4);
assert.equal(results.filter(r => r.pending_format_checks > 0).length,2);
for (const [name,digest] of Object.entries(sources)) assert.equal(sha(await readFile(name)),digest);
for (const name of ['server/receipt-api.mjs','src/lib/extraction-schema.mjs','src/lib/gemini.ts','src/lib/engine.ts']) assert.equal(loaded[name],sources[name]);
await write('predictions.json',results);
const runner = await readFile('receipt_training/scripts/replay_gemini_draft_intake.mjs');
await writeFile(run + '/runner.mjs',runner,{flag:'wx'});
await write('metadata.json',{ input_sha256:inputs, source_sha256:sources, loaded_frozen_source_sha256:loaded,
  predictions_sha256:sha(await readFile(run+'/predictions.json')), runner_sha256:sha(runner),
  editable_drafts:6, canonical_drafts:4, unparsed_drafts:2, mock_transport_calls:6,
  new_model_calls:0, external_requests:0, source_unchanged:true, literal_output_unchanged:true,
  provider_request_schema_unchanged:true, unparsed_money_blocks_finalization:true,
  scope:'Saved real responses through actual Gemini decoder; synthetic transport JPEG, fake key, no inference. Canonical benchmark unchanged; literal grouped values remain invalid money.' });
console.log(JSON.stringify({ editable_drafts:6, unparsed_drafts:2, external_requests:0, literal_output_unchanged:true }));
