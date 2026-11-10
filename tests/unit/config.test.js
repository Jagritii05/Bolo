import test from 'node:test';
import assert from 'node:assert/strict';
import { GNANI_CONFIG, getLanguageConfig } from '../../src/services/gnani/config.js';

test('GnaniConfig: Verifies official endpoints and model identifiers', () => {
  assert.equal(GNANI_CONFIG.sttEndpoint, 'https://api.vachana.ai/stt/v3');
  assert.equal(GNANI_CONFIG.ttsEndpoint, 'https://api.vachana.ai/api/v1/tts/inference');
  assert.equal(GNANI_CONFIG.maxRecordingSec, 30);
  assert.equal(GNANI_CONFIG.maxTtsCharLimit, 300);
});

test('GnaniConfig: Supports required languages with exact voice and code mappings', () => {
  const hindi = getLanguageConfig('hi-IN');
  assert.equal(hindi.code, 'hi-IN');
  assert.equal(hindi.sttCode, 'hi-IN');
  assert.equal(hindi.ttsCode, 'hi-en');
  assert.equal(hindi.ttsVoice, 'Poorvi');
  assert.ok(hindi.defaultQuestion.length > 0);

  const tamil = getLanguageConfig('ta-IN');
  assert.equal(tamil.code, 'ta-IN');
  assert.equal(tamil.sttCode, 'ta-IN');
  assert.equal(tamil.ttsCode, 'ta-IN');
  assert.equal(tamil.ttsVoice, 'Trisha');
  assert.ok(tamil.defaultQuestion.length > 0);

  const bengali = getLanguageConfig('bn-IN');
  assert.equal(bengali.code, 'bn-IN');
  assert.equal(bengali.sttCode, 'bn-IN');
  assert.equal(bengali.ttsCode, 'bn-IN');
  assert.equal(bengali.ttsVoice, 'Kirra');
  assert.ok(bengali.defaultQuestion.length > 0);
});

test('GnaniConfig: Gracefully handles case-insensitive lookup and defaults to Hindi', () => {
  const conf1 = getLanguageConfig('TAMIL');
  assert.equal(conf1.code, 'ta-IN');

  const conf2 = getLanguageConfig('unknown-lang');
  assert.equal(conf2.code, 'hi-IN');
});

