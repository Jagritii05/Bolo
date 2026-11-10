import { settingsStore } from '../../main/settings-store.js';
import { logger } from '../../main/logger.js';

const EXTRACTION_PROMPT =
  'Extract and transcribe all visible text, interactive elements, form labels, input fields, dropdowns, dialogs, error messages, and buttons visible on this screen. Preserve the structure and labels in plain text so the user can be guided accurately.';

const CANDIDATE_VISION_MODELS = [
  'gemini-3-flash-preview',
  'gemini-3.5-flash-lite',
  'gemini-3.5-flash',
  'gemini-flash-lite-latest',
];

let currentScreenSession = null;

function getApiKey() {
  const key = settingsStore.get('geminiApiKey') || process.env.GEMINI_API_KEY || '';
  if (!key) {
    throw new Error('Gemini API key missing. Please set GEMINI_API_KEY in .env or Settings.');
  }
  return key;
}

// Extract visible text and structure from screenshot
export async function extractScreenText(imageInput, options = {}) {
  const { bypassCache = false } = options;

  if (!bypassCache && isScreenSessionValid()) {
    logger.info('[Vision] Using cached screen extraction from current session.');
    return currentScreenSession.text;
  }

  const apiKey = getApiKey();
  const mimeType = imageInput.mimeType || 'image/jpeg';
  const base64Data = typeof imageInput === 'string' ? imageInput : imageInput.base64;

  if (!base64Data) {
    throw new Error('No image data provided for screen extraction.');
  }

  const preferredModel = settingsStore.get('geminiModel') || 'gemini-3-flash-preview';
  const models = [...new Set([preferredModel, ...CANDIDATE_VISION_MODELS])];

  const body = {
    contents: [
      {
        role: 'user',
        parts: [
          { text: EXTRACTION_PROMPT },
          { inline_data: { mime_type: mimeType, data: base64Data } },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1, // Low temperature for high OCR accuracy
      maxOutputTokens: 2048,
      thinkingConfig: {
        thinkingBudget: 0,
      },
    },
  };

  let lastErr = null;
  for (const model of models) {
    try {
      logger.info(`[Vision] Calling Gemini model ${model} for screen OCR...`);
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20000),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        const msg = errJson?.error?.message || `HTTP ${res.status}`;
        lastErr = new Error(`Gemini vision error (${model}): ${msg}`);
        logger.warn(`[Vision] Model ${model} returned ${res.status} (${msg}). Trying next fallback...`);
        continue; // Try next model fallback
      }

      const data = await res.json();
      const extractedText = (data?.candidates?.[0]?.content?.parts || [])
        .map((p) => p.text || '')
        .join('')
        .trim();

      if (!extractedText) {
        logger.warn(`[Vision] Model ${model} returned empty extraction. Trying next fallback...`);
        continue;
      }

      // Cache extracted text in memory
      currentScreenSession = {
        text: extractedText,
        timestamp: Date.now(),
      };

      logger.info(`[Vision] Screen text extracted successfully (${extractedText.length} characters) via ${model}: "${extractedText.slice(0, 100).replace(/\n/g, ' ')}..."`);
      return extractedText;
    } catch (err) {
      lastErr = err;
      logger.warn(`[Vision] Model ${model} failed (${err.message}). Trying next fallback...`);
      continue;
    }
  }

  throw lastErr || new Error('All vision extraction attempts failed.');
}

export function getCachedScreenText(timeoutMs = 60000) {
  if (isScreenSessionValid(timeoutMs)) {
    return currentScreenSession.text;
  }
  return null;
}

export function isScreenSessionValid(timeoutMs = 60000) {
  if (!currentScreenSession || !currentScreenSession.text) return false;
  return Date.now() - currentScreenSession.timestamp < timeoutMs;
}

export function clearScreenSession() {
  currentScreenSession = null;
  logger.debug('[Vision] Screen session cache cleared.');
}

