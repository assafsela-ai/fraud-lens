import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ANALYSIS_MODELS, AnalysisError, analyzeScreenshot } from '../analysis/openai.mjs';

const fixture = {
  riskLevel: 'caution',
  summary: 'The message requests an urgent payment.',
  findings: [{ title: 'Urgency', evidence: 'Pay today', explanation: 'The sender sets a short deadline.' }],
  nextSteps: ['Verify the request through an official channel.'],
  limitations: ['The sender’s identity is unknown.']
};
const sample = { apiKey: 'sk-test-only', imageDataUrl: 'data:image/png;base64,c2FtcGxl' };

function responseWith(type, value) {
  return Response.json({
    status: 'completed',
    output: [{ type: 'message', content: [{ type, ...value }] }]
  });
}

test('sends the selected vision model and strict schema only to OpenAI', async () => {
  for (const { id: model } of ANALYSIS_MODELS) {
    const analysis = await analyzeScreenshot({ ...sample, model }, (url, options) => {
      assert.equal(url, 'https://api.openai.com/v1/responses');
      assert.equal(options.headers.Authorization, 'Bearer sk-test-only');
      assert.equal(options.redirect, 'error');
      const body = JSON.parse(options.body);
      assert.equal(body.model, model);
      assert.equal(body.store, false);
      assert.equal(body.text.format.strict, true);
      assert.equal(body.tools, undefined);
      assert.equal(body.input[1].content[1].image_url, sample.imageDataUrl);
      assert.doesNotMatch(options.body, /sk-test-only/);
      return responseWith('output_text', { text: JSON.stringify(fixture) });
    });
    assert.deepEqual(analysis, fixture);
  }
});

test('rejects unknown models and remote image URLs before calling OpenAI', async () => {
  const unexpectedFetch = () => assert.fail('OpenAI should not be called');
  await assert.rejects(analyzeScreenshot({ ...sample, model: 'example-model' }, unexpectedFetch), { code: 'unsupported_model' });
  await assert.rejects(analyzeScreenshot({ ...sample, imageDataUrl: 'https://example.invalid/image.png' }, unexpectedFetch), { code: 'invalid_image' });
});

test('omits raw provider errors and handles model refusals', async () => {
  const rateLimit = () => Response.json({
    error: { code: 'insufficient_quota', message: 'PRIVATE PROVIDER DATA' }
  }, { status: 429 });
  await assert.rejects(analyzeScreenshot(sample, rateLimit), error => {
    assert.ok(error instanceof AnalysisError);
    assert.equal(error.code, 'insufficient_quota');
    assert.doesNotMatch(error.message, /PRIVATE PROVIDER DATA/);
    return true;
  });
  await assert.rejects(
    analyzeScreenshot(sample, () => responseWith('refusal', { refusal: 'Private provider text' })),
    { code: 'analysis_refused' }
  );
  await assert.rejects(
    analyzeScreenshot(sample, () => responseWith('output_text', { text: '{}' })),
    { code: 'invalid_analysis' }
  );
});
