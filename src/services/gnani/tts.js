import { GNANI_CONFIG, getLanguageConfig } from './config.js';
import { gnaniQueue, GnaniAuthError, GnaniRateLimitError, GnaniServerError, GnaniError } from './queue.js';
import { normalizeForSpeech } from './normalizer.js';
import { settingsStore } from '../../main/settings-store.js';
import { logger } from '../../main/logger.js';

function getGnaniApiKey() {
  const key = settingsStore.get('gnaniApiKey') || process.env.GNANI_API_KEY || '';
  if (!key) {
    throw new GnaniAuthError('Gnani API Key is missing. Please set GNANI_API_KEY in .env or Settings.');
  }
  return key;
}

// Synthesize speech from text using Gnani Timbre TTS
export async function synthesizeSpeech(text, langCode = 'hi-IN') {
  const apiKey = getGnaniApiKey();
  const langConf = getLanguageConfig(langCode);

  let normalizedText = normalizeForSpeech(text, langCode, GNANI_CONFIG.maxTtsCharLimit);
  if (!normalizedText || !normalizedText.trim()) {
    logger.warn('[Gnani TTS] Empty text after normalization; skipping speech synthesis.');
    return null;
  }

  logger.debug(`[Gnani TTS] Synthesizing speech (${langConf.ttsVoice}, ${langConf.ttsCode}): "${normalizedText}"`);

  const callTtsApi = async (textToSpeak) => {
    const payload = {
      text: textToSpeak,
      voice: langConf.ttsVoice,
      model: GNANI_CONFIG.ttsModel,
      language: langConf.ttsCode,
      speed: 1.0,
      audio_config: {
        sample_rate: 24000,
        encoding: 'linear_pcm',
        container: 'wav',
      },
    };

    let response;
    try {
      response = await fetch(GNANI_CONFIG.ttsEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key-ID': apiKey,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(GNANI_CONFIG.timeoutMs.tts),
      });
    } catch (netErr) {
      if (netErr.name === 'TimeoutError') {
        throw new GnaniError('Gnani TTS request timed out (20s). Check your connection.', 408);
      }
      throw new GnaniError(`Gnani TTS network error: ${netErr.message}`, 503);
    }

    if (response.status === 401 || response.status === 403) {
      throw new GnaniAuthError(`Gnani TTS Unauthorized (${response.status}). Verify your GNANI_API_KEY.`);
    }
    if (response.status === 429) {
      throw new GnaniRateLimitError('Gnani TTS Rate Limit (429).');
    }
    if (response.status >= 500) {
      throw new GnaniServerError(`Gnani TTS server error (HTTP ${response.status}).`, response.status);
    }
    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new GnaniError(`Gnani TTS error (HTTP ${response.status}): ${errText}`, response.status);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  };

  return gnaniQueue.enqueue(async () => {
    let audioBuffer;
    try {
      audioBuffer = await callTtsApi(normalizedText);
    } catch (err) {
      // On 500 error, retry once with shorter text
      if (err.status >= 500 && normalizedText.length > 120) {
        logger.warn('[Gnani TTS] 500 error encountered. Retrying once with truncated text...');
        const shortened = normalizeForSpeech(normalizedText, langCode, 150);
        audioBuffer = await callTtsApi(shortened);
        normalizedText = shortened;
      } else {
        throw err;
      }
    }

    const base64 = audioBuffer.toString('base64');
    const dataUri = `data:audio/wav;base64,${base64}`;

    logger.info(`[Gnani TTS] Synthesis complete (${audioBuffer.length} bytes, voice: ${langConf.ttsVoice})`);

    return {
      audioBuffer,
      base64,
      dataUri,
      normalizedText,
      language: langConf.ttsCode,
      voice: langConf.ttsVoice,
    };
  });
}

