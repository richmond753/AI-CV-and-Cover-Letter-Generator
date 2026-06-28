/**
 * controllers/gemini.js
 * Compatibility wrapper for @google/generative-ai that supports both CommonJS (require)
 * and ESM (dynamic import). Normalises the response to a plain string and exposes
 * helpers for extracting/parsing JSON returned by the model.
 *
 * The model is configurable via the GEMINI_MODEL env var so the app keeps working as
 * Google retires older model aliases (e.g. gemini-1.5-flash).
 */

const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

let _genAIClient = null;

function extractTextCandidates(value) {
  const candidates = [];

  if (typeof value === 'string') candidates.push(value);
  if (value && typeof value.text === 'string') candidates.push(value.text);
  if (value && typeof value.outputText === 'string') candidates.push(value.outputText);
  if (value && value.response) {
    if (typeof value.response.text === 'string') candidates.push(value.response.text);
    if (typeof value.response.text === 'function') {
      candidates.push(value.response.text());
    }
  }

  return candidates;
}

async function resolvePromptResult(result) {
  const candidates = [];

  for (const candidate of extractTextCandidates(result)) {
    candidates.push(await candidate);
  }

  if (result && result.response && Array.isArray(result.response.candidates)) {
    for (const candidate of result.response.candidates) {
      const parts = candidate?.content?.parts || [];
      for (const part of parts) {
        if (typeof part?.text === 'string') candidates.push(part.text);
      }
    }
  }

  return candidates.find(text => typeof text === 'string' && text.trim()) || '';
}

function extractJsonString(text) {
  if (!text) return '';

  const cleaned = String(text).replace(/```json|```/g, '').trim();
  const firstBrace = cleaned.indexOf('{');
  const firstBracket = cleaned.indexOf('[');
  const startIndex = [firstBrace, firstBracket].filter(index => index >= 0).sort((a, b) => a - b)[0];

  if (startIndex === undefined) return cleaned;

  const slice = cleaned.slice(startIndex);
  const lastBrace = Math.max(slice.lastIndexOf('}'), slice.lastIndexOf(']'));
  if (lastBrace < 0) return slice;

  return slice.slice(0, lastBrace + 1);
}

async function _loadGenAI() {
  if (_genAIClient) return _genAIClient;

  if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your_gemini_api_key_here') {
    throw new Error('GEMINI_API_KEY is not configured. Add a valid key to your .env file.');
  }

  let mod;
  try {
    // Try CommonJS require first
    mod = require('@google/generative-ai');
  } catch (cjsErr) {
    // Fallback to dynamic import (for ESM-only packages)
    try {
      mod = await import('@google/generative-ai');
    } catch (importErr) {
      const err = new Error('Failed to load @google/generative-ai via require() and import()');
      err.cjsError = cjsErr;
      err.importError = importErr;
      throw err;
    }
  }

  const GoogleGenerativeAI = mod?.GoogleGenerativeAI || mod?.default?.GoogleGenerativeAI || mod?.default || mod;
  if (!GoogleGenerativeAI) throw new Error('@google/generative-ai did not export GoogleGenerativeAI');

  _genAIClient = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  return _genAIClient;
}

/**
 * Send a prompt to Gemini and return the model's text response.
 * @param {string} prompt
 * @param {object} [options]
 * @param {string} [options.model] Override the configured model.
 * @param {object} [options.generationConfig] e.g. { temperature, responseMimeType }
 */
async function callGemini(prompt, options = {}) {
  if (!prompt || !String(prompt).trim()) {
    throw new Error('callGemini requires a non-empty prompt.');
  }

  const genAI = await _loadGenAI();
  const modelName = options.model || DEFAULT_MODEL;

  // getGenerativeModel may be present in client; otherwise assume genAI is already model-like
  const model = typeof genAI.getGenerativeModel === 'function'
    ? genAI.getGenerativeModel({ model: modelName, generationConfig: options.generationConfig })
    : genAI;

  const exec = model.generateContent || model.generate || model.create || null;
  if (!exec) throw new Error('Generative model does not expose a known generation method');

  const result = await (typeof exec === 'function' ? exec.call(model, prompt) : exec);
  const text = await resolvePromptResult(result);
  if (text) return text;

  try { return JSON.stringify(result); } catch { return String(result); }
}

function parseJsonResponse(text) {
  const jsonText = extractJsonString(text);
  return JSON.parse(jsonText);
}

module.exports = { callGemini, extractJsonString, parseJsonResponse, DEFAULT_MODEL };
