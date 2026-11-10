import { GNANI_CONFIG, getLanguageConfig } from './config.js';
import { gnaniQueue, GnaniAuthError, GnaniRateLimitError, GnaniServerError, GnaniError } from './queue.js';
import { settingsStore } from '../../main/settings-store.js';
import { logger } from '../../main/logger.js';
import fs from 'fs';

function getGnaniApiKey() {
  const key = settingsStore.get('gnaniApiKey') || process.env.GNANI_API_KEY || '';
  if (!key) {
    throw new GnaniAuthError('Gnani API Key is missing. Please set GNANI_API_KEY in .env or Settings.');
  }
  return key;
}

// Transcribe WAV audio using Gnani Prisma STT
export async function transcribeAudio(audioInput, langCode = 'hi-IN') {
  const apiKey = getGnaniApiKey();
  const langConf = getLanguageConfig(langCode);

  let buffer;
  if (typeof audioInput === 'string') {
    buffer = fs.readFileSync(audioInput);
  } else if (Buffer.isBuffer(audioInput)) {
    buffer = audioInput;
  } else if (audioInput instanceof Uint8Array) {
    buffer = Buffer.from(audioInput);
  } else {
    throw new GnaniError('Invalid audio input provided to STT.', 400);
  }

  if (!buffer || buffer.length < 500) {
    logger.warn('[Gnani STT] Audio buffer too short or empty, returning empty transcript.');
    return { text: '', language: langConf.sttCode, raw: {} };
  }

  return gnaniQueue.enqueue(async () => {
    const formData = new FormData();
    const blob = new Blob([buffer], { type: 'audio/wav' });
    formData.append('audio_file', blob, 'audio.wav');
    formData.append('language_code', langConf.sttCode);
    formData.append('model', 'prisma-v3.0');

    logger.debug(`[Gnani STT] Sending ${buffer.length} bytes for language ${langConf.sttCode}...`);

    let response;
    try {
      response = await fetch(GNANI_CONFIG.sttEndpoint, {
        method: 'POST',
        headers: {
          'X-API-Key-ID': apiKey,
        },
        body: formData,
        signal: AbortSignal.timeout(GNANI_CONFIG.timeoutMs.stt),
      });
    } catch (netErr) {
      if (netErr.name === 'TimeoutError') {
        throw new GnaniError('Gnani STT request timed out (20s). Check your connection.', 408);
      }
      throw new GnaniError(`Gnani STT network error: ${netErr.message}`, 503);
    }

    if (response.status === 401 || response.status === 403) {
      throw new GnaniAuthError(`Gnani STT Unauthorized (${response.status}). Verify your GNANI_API_KEY.`);
    }
    if (response.status === 429) {
      throw new GnaniRateLimitError('Gnani STT Rate Limit (429).');
    }
    if (response.status >= 500) {
      throw new GnaniServerError(`Gnani STT server error (HTTP ${response.status}).`, response.status);
    }
    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new GnaniError(`Gnani STT error (HTTP ${response.status}): ${errText}`, response.status);
    }

    const data = await response.json().catch(() => ({}));
    const transcript = (data.transcript || data.text || '').trim();

    logger.info(`[Gnani STT] Transcribed successfully (${langConf.sttCode}): "${transcript}"`);
    return {
      text: transcript,
      language: data.detected_language_code || langConf.sttCode,
      raw: data,
    };
  });
}

