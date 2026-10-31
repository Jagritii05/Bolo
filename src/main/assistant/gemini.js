import { settingsStore } from '../settings-store.js';

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const EMBED_MODELS = ['gemini-embedding-001', 'gemini-embedding-2-preview'];
const FALLBACK_GENERATE_MODELS = ['gemini-3-flash-preview', 'gemini-3.5-flash', 'gemini-flash-latest'];

function getApiKey() {
  const key = settingsStore.get('geminiApiKey') || process.env.GEMINI_API_KEY || '';
  if (!key) {
    throw new Error('Gemini API key missing. Add it in Settings > Assistant.');
  }
  return key;
}

async function post(path, body, timeoutMs = 45000) {
  const res = await fetch(`${BASE_URL}/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': getApiKey(),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || `HTTP ${res.status}`;
    const err = new Error(`Gemini error: ${msg}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

// Ask Gemini with text and optional images ({ mimeType, base64 })
export async function generate(prompt, images = [], { system } = {}) {
  const preferred = settingsStore.get('geminiModel');
  const candidateModels = [
    preferred && !preferred.includes('2.5') && !preferred.includes('2.0') && !preferred.includes('1.5')
      ? preferred
      : 'gemini-3-flash-preview',
    ...FALLBACK_GENERATE_MODELS,
  ];
  const models = [...new Set(candidateModels)];

  const parts = [{ text: prompt }];
  for (const img of images) {
    parts.push({ inline_data: { mime_type: img.mimeType, data: img.base64 } });
  }

  const body = { contents: [{ role: 'user', parts }] };
  if (system) {
    body.system_instruction = { parts: [{ text: system }] };
  }

  let lastErr = null;
  for (const model of models) {
    try {
      const data = await post(`models/${model}:generateContent`, body);
      const text = (data?.candidates?.[0]?.content?.parts || [])
        .map((p) => p.text || '')
        .join('')
        .trim();

      if (text) return text;
    } catch (err) {
      lastErr = err;
      if (err.status === 404 || err.status === 400 || err.status === 503) {
        continue;
      }
      throw err;
    }
  }

  throw lastErr || new Error('Gemini generation failed.');
}

// Turn text into a vector for similarity search
export async function embed(text) {
  let lastErr = null;
  for (const model of EMBED_MODELS) {
    try {
      const data = await post(`models/${model}:embedContent`, {
        model: `models/${model}`,
        content: { parts: [{ text }] },
      }, 20000);
      const values = data?.embedding?.values;
      if (Array.isArray(values) && values.length) return values;
    } catch (err) {
      lastErr = err;
      // Try the next model only if this one isn't available
      if (err.status !== 404 && err.status !== 400) throw err;
    }
  }
  throw lastErr || new Error('Embedding failed.');
}

export function hasApiKey() {
  return Boolean(settingsStore.get('geminiApiKey') || process.env.GEMINI_API_KEY);
}
