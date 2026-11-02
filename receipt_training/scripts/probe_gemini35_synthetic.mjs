// One non-private availability probe. Never retries or reads real receipt inputs.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { extractWithGemini } from '../../server/receipt-api.mjs';

const OUT = 'qa-artifacts/advanced-ocr/gemini35-synthetic-v1';
const IMAGE = 'qa-artifacts/advanced-ocr/synthetic-smoke.jpg';
const IMAGE_SHA = 'aada1cd4b8523365d0c9e16514697575fee53c5b29edbd272d49db4c346290d9';
const MODEL = 'gemini-3.5-flash-lite';
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const sha = value => createHash('sha256').update(value).digest('hex');
const write = (name, value) => writeFile(`${OUT}/${name}`, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
const image = await readFile(IMAGE);
assert.equal(sha(image), IMAGE_SHA);
const paths = ['receipt_training/scripts/probe_gemini35_synthetic.mjs'];
for (const directory of ['server', 'src/lib'])
  for (const file of (await readdir(directory)).filter(file => file.endsWith('.mjs')).sort()) paths.push(`${directory}/${file}`);
const sources = Object.fromEntries(await Promise.all(paths.map(async path => [path, sha(await readFile(path))])));

if (process.argv[2] === '--prepare') {
  await mkdir(OUT);
  for (const path of paths) {
    const target = `${OUT}/source/${path}`;
    await mkdir(target.slice(0, target.lastIndexOf('/')), { recursive: true });
    await writeFile(target, await readFile(path), { flag: 'wx' });
  }
  await write('plan.json', {
    prepared_at: new Date().toISOString(), model: MODEL, endpoint: ENDPOINT,
    input: IMAGE, image_sha256: IMAGE_SHA, source_sha256: sources,
    scope: 'One previously inspected non-private, generated two-purchase fixture. Model availability/transport only, not real-receipt accuracy.',
    limits: { generation_posts: 1, retries: 0, timeout_ms: 90000, maximum_response_bytes: 1048576, private_uploads: 0, billing_activation: false },
    free_tier_basis: 'Existing user-confirmed Free project; official 3.5 Flash-Lite standard input/output are free. Account billing not independently inspected.',
    documentation: ['https://aistudio.google.com/docs/models/gemini-3.5-flash-lite', 'https://aistudio.google.com/docs/pricing#gemini-3.5-flash-lite', 'https://aistudio.google.com/docs/interactions-overview'],
  });
  console.log(JSON.stringify({ prepared: true, generation_posts: 0, private_uploads: 0 }));
} else if (process.argv[2] === '--execute-nonprivate-smoke') {
  const plan = JSON.parse(await readFile(`${OUT}/plan.json`));
  assert.deepEqual(plan.source_sha256, sources);
  assert.equal(plan.image_sha256, IMAGE_SHA);
  assert.equal(plan.model, MODEL);
  // An interrupted attempt consumes the probe; creating this file is exclusive.
  await write('attempt.json', { started_at: new Date().toISOString(), model: MODEL, private_uploads: 0 });
  const { loadEnv } = await import('vite');
  const { GEMINI_API_KEY: key } = loadEnv('development', process.cwd(), '');
  assert(key, 'No configured server-held key');
  const safe = text => String(text).replaceAll(key, '[redacted]');
  const result = { model: MODEL, requests: 0, private_uploads: 0, retries: 0, billing_activated: false, actual_billing_inspected: false };
  const started = performance.now();
  try {
    const receipt = await extractWithGemini([{ photo: 1, part: 1, data: image.toString('base64') }], {
      apiKey: key, model: MODEL, signal: AbortSignal.timeout(90000),
      fetcher: async (url, options) => {
        assert.equal(url, ENDPOINT);
        assert.equal(options.method, 'POST');
        assert.equal(result.requests, 0, 'No second request');
        const body = JSON.parse(options.body);
        assert.equal(body.model, MODEL);
        assert.equal(body.store, false);
        assert(!body.tools && !body.previous_interaction_id);
        const images = body.input.filter(part => part.type === 'image');
        assert.equal(images.length, 1);
        assert.equal(sha(Buffer.from(images[0].data, 'base64')), IMAGE_SHA);
        await writeFile(`${OUT}/request.json`, options.body + '\n', { flag: 'wx' });
        await write('network-attempt.json', { time: new Date().toISOString(), request_sha256: sha(options.body) });
        result.requests++;
        const response = await fetch(url, { ...options, redirect: 'error' });
        result.http_status = response.status;
        const chunks = []; let size = 0;
        for await (const chunk of response.body) {
          size += chunk.length;
          assert(size <= 1048576, 'Response over bound');
          chunks.push(chunk);
        }
        const text = safe(Buffer.concat(chunks).toString('utf8'));
        await writeFile(`${OUT}/response.json`, text, { flag: 'wx' });
        return new Response(text, { status: response.status, headers: { 'content-type': 'application/json' } });
      },
    });
    await write('receipt.json', receipt);
    result.strict_schema = true;
    result.checks = {
      two_items: receipt.items.length === 2,
      names: receipt.items.map(item => item.description.trim().toUpperCase()).join('|') === 'MILK|BREAD',
      quantities: receipt.items.length === 2 && receipt.items.every(item => Number(item.quantity) === 1),
      unit_prices: receipt.items.length === 2 && receipt.items.every((item, i) => Number(item.unitPrice) === [2, 1.5][i]),
      line_prices: receipt.items.length === 2 && receipt.items.every((item, i) => Number(item.lineTotal) === [2, 1.5][i]),
      currency: receipt.currency === 'GBP', subtotal: Number(receipt.subtotal) === 3.5,
      total: Number(receipt.printedTotal) === 3.5, tax: receipt.printedTax !== '' && Number(receipt.printedTax) === 0,
      tax_basis: receipt.pricesIncludeTax === true, merchant: receipt.merchant === 'TEST SHOP', date: receipt.date === '2026-10-29',
    };
  } catch (error) {
    result.error = safe(error.message).slice(0, 600);
  }
  result.elapsed_ms = performance.now() - started;
  result.source_unchanged = (await Promise.all(paths.map(async path => sha(await readFile(path)) === sources[path]))).every(Boolean);
  await write('result.json', result);
  console.log(JSON.stringify(result));
} else throw Error('Use --prepare or --execute-nonprivate-smoke');
