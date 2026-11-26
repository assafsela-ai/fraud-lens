const byId = id => document.getElementById(id);
const form = byId('analysis-form');
const screenshot = byId('screenshot');
const keyInput = byId('api-key');
const modelSelect = byId('model');
const preview = byId('analysis-preview');
const previewEmpty = byId('preview-empty');
const resultPanel = byId('analysis-result');
const analyzeButton = byId('analyze-button');
const cancelButton = byId('cancel-button');
const statusMessage = byId('analysis-status');
const errorMessage = byId('analysis-error');
const maxFileSize = 10 * 1024 * 1024;
const supportedImages = new Set(['image/png', 'image/jpeg', 'image/webp']);
const riskLabels = new Map([
  ['high_risk', 'High risk'],
  ['caution', 'Use caution'],
  ['no_clear_signals', 'No clear warning signs'],
  ['insufficient_evidence', 'Insufficient evidence']
]);
const requestErrors = new Map([
  [400, 'Check the selected image and model, then try again.'],
  [401, 'OpenAI rejected this API key. Enter a valid key and try again.'],
  [403, 'Your OpenAI project does not have access to this request. Check the key or try another model.'],
  [404, 'This model may not be available to your OpenAI project. Choose another model.'],
  [413, 'The image is too large. Choose a screenshot up to 10 MB.'],
  [415, 'Choose a valid PNG, JPEG, or WebP screenshot.'],
  [422, 'OpenAI could not review this image. Try a different or clearer screenshot.'],
  [429, 'OpenAI reached a rate or quota limit. Check your project usage, then try again.'],
  [503, 'OpenAI is temporarily unavailable. Try again later.'],
  [504, 'The analysis timed out. Try a smaller screenshot or a different model.']
]);
let previewUrl;
let activeRequest;

async function initialize() {
  if (location.protocol === 'file:' || location.hostname.endsWith('.github.io')) return;
  byId('analysis-loading').hidden = false;
  byId('analysis-setup').hidden = true;
  try {
    const response = await fetch('./api/models', { cache: 'no-store', signal: AbortSignal.timeout(4000) });
    if (!response.ok) return;
    const { models, defaultModel } = await response.json();
    for (const model of models) {
      modelSelect.add(new Option(model.label, model.id, false, model.id === defaultModel));
    }
    if (modelSelect.options.length) byId('analysis-workspace').hidden = false;
  } catch {
    // Static builds and unavailable local servers use the setup view.
  } finally {
    byId('analysis-loading').hidden = true;
    byId('analysis-setup').hidden = !byId('analysis-workspace').hidden;
  }
}

function validateFile(file) {
  if (!file) return 'Choose a screenshot.';
  if (!supportedImages.has(file.type) || file.size === 0) return 'Choose a valid PNG, JPEG, or WebP screenshot.';
  if (file.size > maxFileSize) return 'Choose a screenshot no larger than 10 MB.';
  return '';
}

function clearPreview() {
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = undefined;
  preview.removeAttribute('src');
  preview.hidden = true;
  previewEmpty.hidden = false;
}

screenshot.addEventListener('change', () => {
  clearPreview();
  resultPanel.hidden = true;
  statusMessage.textContent = '';
  const file = screenshot.files[0];
  const problem = file ? validateFile(file) : '';
  screenshot.setCustomValidity(problem);
  if (problem) screenshot.setAttribute('aria-invalid', 'true');
  else screenshot.removeAttribute('aria-invalid');
  errorMessage.textContent = problem;
  if (!file || problem) return;
  previewUrl = URL.createObjectURL(file);
  preview.src = previewUrl;
  preview.hidden = false;
  previewEmpty.hidden = true;
});

preview.addEventListener('error', () => {
  clearPreview();
  const message = 'This image could not be opened. Choose a different screenshot.';
  screenshot.setCustomValidity(message);
  screenshot.setAttribute('aria-invalid', 'true');
  errorMessage.textContent = message;
});

function readImage(file, signal) {
  return new Promise((resolve, reject) => {
    const worker = new Worker('./image-worker.js');
    const finish = () => {
      worker.terminate();
      signal.removeEventListener('abort', cancel);
    };
    const cancel = () => {
      finish();
      reject(signal.reason);
    };
    worker.addEventListener('message', ({ data }) => {
      finish();
      if (data.error) reject(new Error(data.error));
      else resolve(data.dataUrl);
    }, { once: true });
    worker.addEventListener('error', () => {
      finish();
      reject(new Error('The screenshot could not be prepared. Reload the page and try again.'));
    }, { once: true });
    signal.addEventListener('abort', cancel, { once: true });
    worker.postMessage(file);
  });
}

function node(tag, text) {
  const element = document.createElement(tag);
  element.textContent = text;
  return element;
}

function renderList(sectionId, listId, values) {
  byId(sectionId).hidden = values.length === 0;
  byId(listId).replaceChildren(...values.map(value => node('li', value)));
}

function showResult({ riskLevel, summary, findings, nextSteps, limitations }) {
  const badge = byId('risk-level');
  badge.dataset.risk = riskLevel;
  badge.textContent = riskLabels.get(riskLevel) ?? 'Review needed';
  byId('analysis-summary').textContent = summary;
  byId('findings-section').hidden = findings.length === 0;
  byId('analysis-findings').replaceChildren(...findings.map(finding => {
    const item = document.createElement('li');
    item.append(node('strong', finding.title), node('blockquote', finding.evidence), node('p', finding.explanation));
    return item;
  }));
  renderList('next-section', 'analysis-next', nextSteps);
  renderList('limitations-section', 'analysis-limitations', limitations);
  resultPanel.hidden = false;
  byId('result-title').focus();
}

function setBusy(busy) {
  screenshot.disabled = busy;
  keyInput.disabled = busy;
  modelSelect.disabled = busy;
  analyzeButton.disabled = busy;
  cancelButton.hidden = !busy;
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (activeRequest) return;
  const file = screenshot.files[0];
  const problem = validateFile(file);
  const key = keyInput.value.trim();
  if (problem || !key) {
    const invalidField = problem ? screenshot : keyInput;
    errorMessage.textContent = problem || 'Enter your OpenAI API key.';
    invalidField.setAttribute('aria-invalid', 'true');
    invalidField.focus();
    return;
  }

  keyInput.value = '';
  const controller = new AbortController();
  activeRequest = controller;
  const model = modelSelect.value;
  const focused = document.activeElement;
  setBusy(true);
  if (form.contains(focused)) cancelButton.focus();
  resultPanel.hidden = true;
  errorMessage.textContent = '';
  statusMessage.textContent = 'Preparing your screenshot…';
  try {
    const imageDataUrl = await readImage(file, controller.signal);
    statusMessage.textContent = 'Waiting for OpenAI…';
    const response = await fetch('./api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, imageDataUrl }),
      signal: controller.signal
    });
    if (!response.ok) {
      if (response.status === 401) keyInput.setAttribute('aria-invalid', 'true');
      throw new Error(requestErrors.get(response.status) ?? 'OpenAI could not complete the analysis. Try again.');
    }
    const result = await response.json();
    controller.signal.throwIfAborted();
    showResult(result);
    statusMessage.textContent = 'Analysis complete.';
  } catch (error) {
    statusMessage.textContent = controller.signal.aborted ? 'Analysis canceled.' : '';
    if (!controller.signal.aborted) {
      const networkError = error instanceof TypeError || error instanceof SyntaxError;
      errorMessage.textContent = networkError ? 'Could not complete the request. Check the local server and try again.' : error.message;
    }
  } finally {
    activeRequest = undefined;
    const restoreFocus = document.activeElement === cancelButton;
    setBusy(false);
    if (restoreFocus) {
      if (keyInput.getAttribute('aria-invalid') === 'true') keyInput.focus();
      else analyzeButton.focus();
    }
  }
});

keyInput.addEventListener('input', () => keyInput.removeAttribute('aria-invalid'));
cancelButton.addEventListener('click', () => activeRequest?.abort());
window.addEventListener('pagehide', () => {
  keyInput.value = '';
  activeRequest?.abort();
});
initialize();
