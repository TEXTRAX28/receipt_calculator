// One-shot research runner. Preparation and protocol tests never load credentials.
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { extractWithGemini } from '../../server/receipt-api.mjs';
import { validatePreparedJpeg } from '../../server/receipt-zip.mjs';

export const ROOT = 'qa-artifacts/provider-review/gemini38-screen-v1';
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';
const write = (path, value) => writeFile(path, json(value), { flag: 'wx' });
export const redact = (text, key) => String(text).replaceAll(key, '[redacted]');

export async function preflight(root = ROOT) {
  const planBytes = await readFile(root + '/plan.json');
  const plan = JSON.parse(planBytes);
  if (plan.model !== 'gemini-3.8-flash' || plan.endpoint !== ENDPOINT || plan.store !== false ||
      plan.cases.length !== 6 || plan.limits.generation_posts !== 6 || plan.limits.retries !== 0 ||
      plan.limits.timeout_ms !== 90000 || plan.limits.minimum_start_interval_ms !== 31000 ||
      plan.limits.billing_activation !== false) throw Error('Screening scope changed');
  const ids = new Set();
  const images = [];
  for (const [i, entry] of plan.cases.entries()) {
    if (entry.case !== `case-0${i + 1}` || ids.has(entry.receipt_id) ||
        entry.image !== `${root}/${entry.case}.jpg`) throw Error('Unexpected case or image');
    ids.add(entry.receipt_id);
    const bytes = await readFile(entry.image);
    const source = await readFile(entry.source_png);
    const dimensions = validatePreparedJpeg(bytes);
    if (sha256(bytes) !== entry.sha256 || sha256(source) !== entry.source_png_sha256 ||
        dimensions.width !== entry.width || dimensions.height !== entry.height) throw Error('Crop binding changed');
    images.push(bytes);
  }
  const source_sha256 = {};
  for (const directory of ['server', 'src/lib']) {
    for (const filename of (await readdir(directory)).filter(name => name.endsWith('.mjs')).sort()) {
      const path = `${directory}/${filename}`;
      source_sha256[path] = sha256(await readFile(path));
    }
  }
  source_sha256['receipt_training/scripts/gemini38_screening.mjs'] = sha256(await readFile('receipt_training/scripts/gemini38_screening.mjs'));
  return { plan, images, proof: { plan_sha256: sha256(planBytes), source_sha256 } };
}

export function guardRequest(url, options, entry, key) {
  if (url !== ENDPOINT || options.method !== 'POST' || options.headers['x-goog-api-key'] !== key)
    throw Error('Alternate endpoint or transport rejected');
  const body = JSON.parse(options.body);
  const images = body.input.filter(part => part.type === 'image');
  if (body.model !== 'gemini-3.8-flash' || body.store !== false || body.previous_interaction_id ||
      body.tools || images.length !== 1 || images[0].mime_type !== 'image/jpeg' ||
      sha256(Buffer.from(images[0].data, 'base64')) !== entry.sha256)
    throw Error('Request is outside approved scope');
}

export async function runScreening({ root = ROOT, approvedPlanSha, apiKey, fetcher = globalThis.fetch,
  wait = ms => new Promise(done => setTimeout(done, ms)), now = Date.now, output = root + '/run' }) {
  const { plan, images, proof } = await preflight(root);
  const prepared = JSON.parse(await readFile(root + '/prepared.json'));
  if (!approvedPlanSha || approvedPlanSha !== proof.plan_sha256 ||
      JSON.stringify(proof) !== JSON.stringify(prepared.proof)) throw Error('Prepared scope or source changed');
  if (!apiKey) throw Error('Server-held Gemini key is not configured');
  // Existing directory, including an interrupted attempt, consumes this run. Never resume/retry it.
  await mkdir(output);
  const record = { started_at: new Date(now()).toISOString(), proof, model: plan.model,
    private_generation_requests: 0, retries: 0, billing_activated: false, actual_billing_inspected: false,
    store: false, cases: [], source_png_encoding_difference: true };
  await write(output + '/scope.json', { ...record, limits: plan.limits });
  let previousStart = null, stop = false;
  for (const [index, entry] of plan.cases.entries()) {
    const result = { case: entry.case, receipt_id: entry.receipt_id, image_sha256: entry.sha256 };
    record.cases.push(result);
    if (stop) { result.status = 'not-attempted-after-auth-or-quota-failure'; continue; }
    if (previousStart !== null) await wait(Math.max(0, previousStart + 31000 - now()));
    let calls = 0;
    result.started_at = new Date(now()).toISOString();
    previousStart = now();
    const signal = AbortSignal.timeout(90000);
    try {
      const receipt = await extractWithGemini([{ photo: 1, part: 1, data: images[index].toString('base64') }], {
        apiKey, model: plan.model, signal,
        fetcher: async (url, options) => {
          if (calls++ || record.private_generation_requests >= 6) throw Error('No retry or seventh upload permitted');
          guardRequest(url, options, entry, apiKey);
          await writeFile(`${output}/${entry.case}-request.json`, options.body + '\n', { flag: 'wx' });
          record.private_generation_requests++;
          // Persist attempt before network I/O; lost responses cannot be retried.
          await writeFile(`${output}/${entry.case}-attempt.json`, json({ started_at: result.started_at, request_sha256: sha256(options.body) }), { flag: 'wx' });
          const response = await fetcher(url, options);
          result.http_status = response.status;
          if ([401, 403, 429].includes(response.status)) stop = true;
          const chunks = []; let length = 0;
          for await (const chunk of response.body) {
            length += chunk.length;
            if (length > 1048576) throw Error('Response exceeds 1 MiB bound');
            chunks.push(chunk);
          }
          const safe = redact(Buffer.concat(chunks).toString('utf8'), apiKey);
          await writeFile(`${output}/${entry.case}-response.json`, safe, { flag: 'wx' });
          result.response_sha256 = sha256(safe);
          return new Response(safe, { status: response.status, headers: { 'content-type': 'application/json' } });
        },
      });
      await write(`${output}/${entry.case}-receipt.json`, receipt);
      result.status = 'strict-schema-passed';
    } catch (error) {
      result.status = 'failed-no-retry';
      result.error = redact(error.message, apiKey).slice(0, 600);
    }
    result.elapsed_ms = now() - previousStart;
    await write(`${output}/${entry.case}-result.json`, result);
    console.log(JSON.stringify({ case: result.case, status: result.status, http_status: result.http_status }));
  }
  record.completed_at = new Date(now()).toISOString();
  await write(output + '/metadata.json', record);
  return record;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const command = process.argv[2];
  if (command === '--prepare') {
    const { proof } = await preflight();
    await write(ROOT + '/prepared.json', { prepared_at: new Date().toISOString(), proof,
      policy: 'Requires explicit Phase 6 private-upload approval for this exact plan before --execute-approved. Stops after authentication/quota failure; never resumes an interrupted run.' });
    console.log(JSON.stringify({ prepared: true, plan_sha256: proof.plan_sha256, uploads: 0 }));
  } else if (command === '--execute-approved' && /^[a-f0-9]{64}$/.test(process.argv[3] || '')) {
    const { loadEnv } = await import('vite');
    const { GEMINI_API_KEY: apiKey } = loadEnv('development', process.cwd(), '');
    await runScreening({ approvedPlanSha: process.argv[3], apiKey });
  } else throw Error('Use --prepare, or --execute-approved <exact-plan-sha256> only after user approval');
}
