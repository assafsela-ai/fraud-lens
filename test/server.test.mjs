import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { request } from 'node:http';
import test from 'node:test';
import { ANALYSIS_MODELS, DEFAULT_ANALYSIS_MODEL, AnalysisError } from '../analysis/openai.mjs';
import { createServer } from '../analysis/server.mjs';

const image = await readFile(new URL('../assets/favicon.png', import.meta.url));
const imageDataUrl = `data:image/png;base64,${image.toString('base64')}`;
const apiKey = 'sk-fraud-lens-test';
const body = { model: DEFAULT_ANALYSIS_MODEL, imageDataUrl };

async function runLocally(t, analyze) {
  const server = createServer({ analyze });
  server.listen(0, '127.0.0.1');
  t.after(() => {
    server.closeAllConnections();
    return new Promise(resolve => server.close(resolve));
  });
  await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}`;
  return {
    url,
    post: (input = body, headers = {}, signal) => fetch(url + '/api/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        Origin: url,
        ...headers
      },
      body: JSON.stringify(input),
      signal
    })
  };
}

function requestStatus(url, options) {
  return new Promise((resolve, reject) => {
    const req = request(url, options, res => {
      res.resume();
      resolve(res.statusCode);
    });
    req.on('error', reject);
    req.end();
  });
}

test('serves the demo and advertises model choices without authentication', async t => {
  const { url } = await runLocally(t);
  const demo = await fetch(url);
  assert.equal(demo.status, 200);
  assert.match(await demo.text(), /Open the case/);
  assert.match(demo.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal(demo.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(demo.headers.get('x-content-type-options'), 'nosniff');
  assert.equal((await fetch(url + '/analysis/server.mjs')).status, 404);
  const choices = await fetch(url + '/api/models');
  assert.equal(choices.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await choices.json(), { models: ANALYSIS_MODELS, defaultModel: DEFAULT_ANALYSIS_MODEL });
});

test('rejects a foreign Host, a foreign Origin, and missing credentials before analysis', async t => {
  const analyze = t.mock.fn();
  const { url, post } = await runLocally(t, analyze);
  assert.equal(await requestStatus(url, { headers: { Host: 'untrusted.example' } }), 403);
  const foreign = await post(body, { Origin: 'https://untrusted.example' });
  assert.equal(foreign.status, 403);
  assert.equal(foreign.headers.get('access-control-allow-origin'), null);
  assert.equal((await post(body, { Origin: '' })).status, 403);
  assert.equal((await post(body, { Authorization: '' })).status, 401);
  assert.equal(analyze.mock.callCount(), 0);
});

test('rejects unsupported models, invalid image signatures, and oversized uploads', async t => {
  const analyze = t.mock.fn();
  const { url, post } = await runLocally(t, analyze);
  assert.equal((await post({ ...body, model: 'unknown-model' })).status, 400);
  assert.equal((await post({ ...body, imageDataUrl: 'data:image/png;base64,aGVsbG8=' })).status, 400);
  assert.equal((await post(body, { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal(await requestStatus(url + '/api/analyze', {
    method: 'POST',
    headers: {
      Origin: url,
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Content-Length': 14 * 1024 * 1024
    }
  }), 413);
  assert.equal(analyze.mock.callCount(), 0);
});

test('passes the selected model, image and key to the analyzer for one request', async t => {
  const result = {
    riskLevel: 'caution',
    summary: 'Verify the payment request.',
    findings: [],
    nextSteps: ['Contact the provider through its official website.'],
    limitations: ['The screenshot cannot establish sender identity.']
  };
  const analyze = t.mock.fn(async () => result);
  const { post } = await runLocally(t, analyze);
  const model = ANALYSIS_MODELS[1].id;
  const response = await post({ ...body, model });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('set-cookie'), null);
  assert.deepEqual(await response.json(), result);
  assert.equal(analyze.mock.callCount(), 1);
  const [input] = analyze.mock.calls[0].arguments;
  assert.equal(input.apiKey, apiKey);
  assert.equal(input.imageDataUrl, imageDataUrl);
  assert.equal(input.model, model);
  assert.equal((await post(body, { Authorization: '' })).status, 401);
  assert.equal(analyze.mock.callCount(), 1);
});

test('returns approved provider messages and hides unexpected errors', async t => {
  const { post } = await runLocally(t, async ({ apiKey: submittedKey }) => {
    if (submittedKey === apiKey) throw new AnalysisError(429, 'rate_limited', 'Try again later.');
    throw new Error(`Unexpected error involving ${submittedKey}`);
  });
  const known = await post();
  assert.equal(known.status, 429);
  assert.deepEqual(await known.json(), { error: 'Try again later.' });
  const unknown = await post(body, { Authorization: 'Bearer sk-private-test-value' });
  assert.equal(unknown.status, 500);
  assert.deepEqual(await unknown.json(), { error: 'Fraud Lens could not complete the request.' });
});

test('aborts the analyzer when the browser cancels the request', { timeout: 5_000 }, async t => {
  const started = Promise.withResolvers();
  const canceled = Promise.withResolvers();
  const { post } = await runLocally(t, async ({ signal }) => {
    started.resolve();
    await once(signal, 'abort');
    canceled.resolve();
    throw signal.reason;
  });
  const controller = new AbortController();
  const pending = post(body, {}, controller.signal);
  await started.promise;
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  await canceled.promise;
});
