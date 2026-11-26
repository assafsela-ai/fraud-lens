import { readFile } from 'node:fs/promises';
import { createServer as createHttpServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { ANALYSIS_MODELS, DEFAULT_ANALYSIS_MODEL, AnalysisError, analyzeScreenshot } from './openai.mjs';

const APP_ROOT = new URL('../', import.meta.url);
const DEFAULT_PORT = 8787;
const IMAGE_LIMIT = 10 * 1024 * 1024;
const BODY_LIMIT = Math.ceil(IMAGE_LIMIT / 3) * 4 + 1_024;
const UPLOAD_TIMEOUT = 20_000;
const ANALYSIS_TIMEOUT = 80_000;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const STATIC_FILES = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/analyze.html', ['analyze.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/analysis.css', ['analysis.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/case-data.js', ['case-data.js', 'text/javascript; charset=utf-8']],
  ['/analysis-ui.js', ['analysis-ui.js', 'text/javascript; charset=utf-8']],
  ['/analysis/openai.mjs', ['analysis/openai.mjs', 'text/javascript; charset=utf-8']],
  ['/image-worker.js', ['image-worker.js', 'text/javascript; charset=utf-8']],
  ['/assets/favicon.png', ['assets/favicon.png', 'image/png']],
  ['/assets/heebo.ttf', ['assets/heebo.ttf', 'font/ttf']],
  ['/docs/preview.webp', ['docs/preview.webp', 'image/webp']]
]);

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'", "base-uri 'none'", "form-action 'self'",
  "frame-ancestors 'none'", "object-src 'none'", "img-src 'self' blob: data:"
].join('; ');

class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function setSecurityHeaders(res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY);
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

function send(res, status, contentType, content, headOnly = false) {
  if (res.destroyed) return;
  res.writeHead(status, {
    'Content-Type': contentType,
    'Content-Length': Buffer.byteLength(content)
  });
  res.end(headOnly ? undefined : content);
}

function sendJson(res, status, payload, headOnly = false) {
  send(res, status, 'application/json; charset=utf-8', JSON.stringify(payload), headOnly);
}

function localOrigin(req) {
  const port = req.socket.localPort;
  const host = req.headers.host?.toLowerCase();
  const names = ['127.0.0.1', 'localhost', '[::1]'];
  if (!names.some(name => host === `${name}:${port}` || (port === 80 && host === name))) {
    throw new RequestError(403, 'Open Fraud Lens using its local address.');
  }
  return `http://${host}`;
}

function validateOrigin(req, origin) {
  if ((req.headers.origin || req.method === 'POST') && req.headers.origin !== origin) {
    throw new RequestError(403, 'Start the analysis from the local Fraud Lens page.');
  }
}

function readJson(req, signal) {
  if (Number(req.headers['content-length']) > BODY_LIMIT) {
    req.resume();
    return Promise.reject(new RequestError(413, 'The image is too large. Use an image up to 10 MB.'));
  }

  return new Promise((resolve, reject) => {
    const chunks = [];
    let length = 0;

    function cleanup() {
      req.off('data', read);
      req.off('end', complete);
      req.off('error', broken);
      signal.removeEventListener('abort', timedOut);
    }

    function fail(error) {
      cleanup();
      req.resume();
      reject(error);
    }

    function read(chunk) {
      length += chunk.length;
      if (length > BODY_LIMIT) {
        fail(new RequestError(413, 'The image is too large. Use an image up to 10 MB.'));
        return;
      }
      chunks.push(chunk);
    }

    function complete() {
      cleanup();
      try {
        resolve(JSON.parse(Buffer.concat(chunks, length).toString('utf8')));
      } catch {
        reject(new RequestError(400, 'The analysis request is not valid JSON.'));
      }
    }

    function broken() {
      fail(new RequestError(400, 'The upload did not finish.'));
    }

    function timedOut() {
      fail(new RequestError(408, 'The upload took too long. Try again with a smaller image.'));
    }

    if (signal.aborted) {
      timedOut();
      return;
    }
    req.on('data', read);
    req.once('end', complete);
    req.once('error', broken);
    signal.addEventListener('abort', timedOut, { once: true });
  });
}

function imageMatchesType(buffer, type) {
  if (type === 'image/png') {
    return buffer.length >= 33 && buffer.subarray(0, 8).equals(PNG_SIGNATURE)
      && buffer.toString('ascii', 12, 16) === 'IHDR';
  }
  if (type === 'image/jpeg') {
    return buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  return buffer.length >= 16 && buffer.toString('ascii', 0, 4) === 'RIFF'
    && buffer.toString('ascii', 8, 12) === 'WEBP'
    && ['VP8 ', 'VP8L', 'VP8X'].includes(buffer.toString('ascii', 12, 16));
}

function validateAnalysis(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new RequestError(400, 'The analysis request must be a JSON object.');
  }
  const { model, imageDataUrl } = payload;
  if (!ANALYSIS_MODELS.some(option => option.id === model)) {
    throw new RequestError(400, 'Select one of the available OpenAI models.');
  }
  const match = typeof imageDataUrl === 'string'
    && /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(imageDataUrl);
  if (!match || match[0] !== imageDataUrl || match[2].length % 4 !== 0) {
    throw new RequestError(400, 'Choose a valid PNG, JPEG, or WebP screenshot.');
  }
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length > IMAGE_LIMIT) {
    throw new RequestError(413, 'The image is too large. Use an image up to 10 MB.');
  }
  if (!imageMatchesType(buffer, match[1])) {
    throw new RequestError(400, 'The selected file does not match its image format.');
  }
  return { model, imageDataUrl };
}

async function handleAnalysis(req, res, analyze, disconnected) {
  const auth = /^Bearer (sk-[A-Za-z0-9_-]+)$/i.exec(req.headers.authorization ?? '');
  if (!auth) throw new RequestError(401, 'Enter a valid OpenAI API key to analyze an image.');
  const contentType = req.headers['content-type']?.split(';')[0].trim().toLowerCase();
  if (contentType !== 'application/json') {
    throw new RequestError(415, 'Send the analysis request as application/json.');
  }
  const uploadSignal = AbortSignal.any([disconnected, AbortSignal.timeout(UPLOAD_TIMEOUT)]);
  const payload = await readJson(req, uploadSignal);
  const input = validateAnalysis(payload);

  const timeout = AbortSignal.timeout(ANALYSIS_TIMEOUT);
  const signal = AbortSignal.any([disconnected, timeout]);
  try {
    const result = await analyze({ ...input, apiKey: auth[1], signal });
    sendJson(res, 200, result);
  } catch (error) {
    if (timeout.aborted) throw new RequestError(504, 'OpenAI took too long to respond. Try again.');
    throw error;
  }
}

async function sendStatic(req, res, route) {
  const file = STATIC_FILES.get(route);
  if (!file) throw new RequestError(404, 'This page was not found.');
  const [path, contentType] = file;
  let content = await readFile(new URL(path, APP_ROOT));
  if (route === '/analyze.html') {
    content = content.toString('utf8').replace(
      'name="fraud-lens-transport" content="browser"',
      'name="fraud-lens-transport" content="local"'
    );
  }
  send(res, 200, contentType, content, req.method === 'HEAD');
}

export function createServer({ analyze = analyzeScreenshot } = {}) {
  return createHttpServer({ headersTimeout: 10_000, requestTimeout: 30_000 }, async (req, res) => {
    const disconnected = new AbortController();
    const abort = () => disconnected.abort();
    res.once('close', abort);
    // An interrupted upload can close the stream after we have sent an error response.
    req.on('error', () => {});
    setSecurityHeaders(res);
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      // Close rejected requests with unread upload bytes instead of reusing the connection.
      res.setHeader('Connection', 'close');
    }
    try {
      validateOrigin(req, localOrigin(req));
      const route = req.url?.split('?', 1)[0];
      if (route === '/api/analyze' && req.method === 'POST') {
        await handleAnalysis(req, res, analyze, disconnected.signal);
      } else if (req.method !== 'GET' && req.method !== 'HEAD') {
        throw new RequestError(405, 'This method is not allowed.');
      } else if (route === '/api/models') {
        sendJson(res, 200, { models: ANALYSIS_MODELS, defaultModel: DEFAULT_ANALYSIS_MODEL }, req.method === 'HEAD');
      } else if (route === '/api/analyze') {
        throw new RequestError(405, 'Send the analysis request using POST.');
      } else {
        await sendStatic(req, res, route);
      }
    } catch (error) {
      if (res.destroyed) return;
      if (error instanceof RequestError || error instanceof AnalysisError) {
        sendJson(res, error.status, { error: error.message }, req.method === 'HEAD');
      } else {
        sendJson(res, 500, { error: 'Fraud Lens could not complete the request.' }, req.method === 'HEAD');
      }
    } finally {
      res.off('close', abort);
    }
  });
}

function start() {
  const port = Number(process.env.FRAUD_LENS_PORT ?? DEFAULT_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    console.error('FRAUD_LENS_PORT must be an integer from 1 to 65535.');
    process.exitCode = 1;
    return;
  }
  const server = createServer();
  server.on('error', error => {
    console.error(`Could not start Fraud Lens on port ${port} (${error.code ?? 'unknown error'}).`);
    process.exitCode = 1;
  });
  server.listen(port, '127.0.0.1', () => {
    console.log(`Fraud Lens: http://127.0.0.1:${port}/`);
  });
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) start();
