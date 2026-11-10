// Smoke test suite for Gnani STT/TTS, LLM, and Gemini vision
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadEnv } from '../src/main/settings-store.js';
loadEnv();

import { synthesizeSpeech } from '../src/services/gnani/tts.js';
import { transcribeAudio } from '../src/services/gnani/stt.js';
import { explain } from '../src/services/llm/index.js';
import { extractScreenText } from '../src/services/vision/screenToText.js';
import { GNANI_CONFIG } from '../src/services/gnani/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const TMP_DIR = path.join(PROJECT_ROOT, 'tmp');

if (!fs.existsSync(TMP_DIR)) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

// Generate a valid 16kHz Mono 16-bit PCM WAV in memory
function generateSampleWav(durationSec = 1.0, sampleRate = 16000) {
  const numSamples = Math.floor(sampleRate * durationSec);
  const buffer = Buffer.alloc(44 + numSamples * 2);

  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + numSamples * 2, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // subchunk size
  buffer.writeUInt16LE(1, 20);  // PCM
  buffer.writeUInt16LE(1, 22);  // Mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28); // byte rate
  buffer.writeUInt16LE(2, 32);  // block align
  buffer.writeUInt16LE(16, 34); // bits per sample
  buffer.write('data', 36);
  buffer.writeUInt32LE(numSamples * 2, 40);

  // Generate 440 Hz tone
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const sample = Math.sin(2 * Math.PI * 440 * t) * 0.3;
    const intSample = Math.max(-32768, Math.min(32767, Math.floor(sample * 32767)));
    buffer.writeInt16LE(intSample, 44 + i * 2);
  }

  return buffer;
}

// 1x1 base64 transparent PNG for vision testing
const SAMPLE_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

async function runSmokeTests() {
  console.log('====================================================');
  console.log(' Bolo Service Isolation Smoke Test');
  console.log('====================================================\n');

  const gnaniKey = process.env.GNANI_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;

  console.log('Configured API Keys:');
  console.log(`- GNANI_API_KEY:  ${gnaniKey ? 'Present [OK]' : 'Missing (TTS/STT tests will fail)'}`);
  console.log(`- GEMINI_API_KEY: ${geminiKey ? 'Present [OK]' : 'Missing (Vision test will fail)'}`);
  console.log(`- GROQ_API_KEY:   ${groqKey ? 'Present [OK]' : 'Missing (Fallback test will use Gemini)'}`);
  console.log(`- LLM_PROVIDER:   ${process.env.LLM_PROVIDER || 'groq'}\n`);

  const results = [];

  // ── TEST 1: Gnani Timbre TTS in 3 Languages ─────────────────────────────
  console.log('--- [1/4] Testing Gnani Timbre TTS ---');
  const ttsCases = [
    { lang: 'hi-IN', text: 'Screen par red error box dikh raha hai. Form submit karne se pehle PAN card upload karna hoga.' },
    { lang: 'ta-IN', text: 'Screen-la red error box irukku. Form submit panrathukku munnadi PAN card upload pannunga.' },
    { lang: 'bn-IN', text: 'Screen-e ekta red error box ache. Form submit korar aage PAN card upload korte hobe.' },
  ];

  for (const { lang, text } of ttsCases) {
    const start = Date.now();
    try {
      if (!gnaniKey) throw new Error('GNANI_API_KEY missing');
      const res = await synthesizeSpeech(text, lang);
      const latency = Date.now() - start;
      const outPath = path.join(TMP_DIR, `smoke_tts_${lang}.wav`);
      fs.writeFileSync(outPath, res.audioBuffer);
      console.log(`  [PASS] TTS (${lang}): ${latency} ms -> Saved ${res.audioBuffer.length} bytes to ./tmp/smoke_tts_${lang}.wav`);
      results.push({ name: `TTS (${lang})`, status: 'PASS', latency: `${latency}ms`, details: `Saved ${res.audioBuffer.length} B` });
    } catch (err) {
      const latency = Date.now() - start;
      console.log(`  [FAIL] TTS (${lang}): ${latency} ms -> ${err.message}`);
      results.push({ name: `TTS (${lang})`, status: 'FAIL', latency: `${latency}ms`, details: err.message });
    }
  }

  // ── TEST 2: Gnani Prisma STT in 3 Languages ─────────────────────────────
  console.log('\n--- [2/4] Testing Gnani Prisma STT ---');
  const sampleWav = generateSampleWav(1.5);
  const sttCases = ['hi-IN', 'ta-IN', 'bn-IN'];

  for (const lang of sttCases) {
    const start = Date.now();
    try {
      if (!gnaniKey) throw new Error('GNANI_API_KEY missing');
      const res = await transcribeAudio(sampleWav, lang);
      const latency = Date.now() - start;
      console.log(`  [PASS] STT (${lang}): ${latency} ms -> Transcript: "${res.text || '(empty/tone audio)'}"`);
      results.push({ name: `STT (${lang})`, status: 'PASS', latency: `${latency}ms`, details: res.text || '(empty)' });
    } catch (err) {
      const latency = Date.now() - start;
      console.log(`  [FAIL] STT (${lang}): ${latency} ms -> ${err.message}`);
      results.push({ name: `STT (${lang})`, status: 'FAIL', latency: `${latency}ms`, details: err.message });
    }
  }

  // ── TEST 3: LLM Explainer ────────────────────────────────────────────────
  console.log('\n--- [3/4] Testing LLM Screen Explainer ---');
  const sampleScreenText = `
Apex National Bank - Customer Re-KYC Portal
Validation Error: Your Aadhaar-PAN linking is pending in the central registry. Please upload a clear photo of your physical PAN Card before submitting this form.
Field: Full Name = Aarav Sharma
Field: PAN = ABCDE1234F [Needs re-verification]
Button: Submit KYC Verification
`;

  const llmStart = Date.now();
  try {
    const res = await explain({
      screenText: sampleScreenText,
      question: 'ye PAN wala box kya maangta hai?',
      language: 'hi-IN',
    });
    const latency = Date.now() - llmStart;
    console.log(`  [PASS] LLM: ${latency} ms`);
    console.log(`         Answered by: ${res.provider} (${res.model})`);
    console.log(`         Answer: "${res.text}"`);
    results.push({ name: 'LLM Explainer', status: 'PASS', latency: `${latency}ms`, details: `${res.provider} (${res.model})` });
  } catch (err) {
    const latency = Date.now() - llmStart;
    console.log(`  [FAIL] LLM: ${latency} ms -> ${err.message}`);
    results.push({ name: 'LLM Explainer', status: 'FAIL', latency: `${latency}ms`, details: err.message });
  }

  // ── TEST 4: Gemini Vision Screen Extraction ──────────────────────────────
  console.log('\n--- [4/4] Testing Gemini Vision OCR Screen Extraction ---');
  const visionStart = Date.now();
  try {
    if (!geminiKey) throw new Error('GEMINI_API_KEY missing');
    const extracted = await extractScreenText({ mimeType: 'image/png', base64: SAMPLE_PNG_BASE64 }, { bypassCache: true });
    const latency = Date.now() - visionStart;
    console.log(`  [PASS] Vision OCR: ${latency} ms -> Extracted: "${extracted || '(blank image)'}"`);
    results.push({ name: 'Vision OCR', status: 'PASS', latency: `${latency}ms`, details: `${extracted.length} chars` });
  } catch (err) {
    const latency = Date.now() - visionStart;
    console.log(`  [FAIL] Vision OCR: ${latency} ms -> ${err.message}`);
    results.push({ name: 'Vision OCR', status: 'FAIL', latency: `${latency}ms`, details: err.message });
  }

  // ── SUMMARY ──────────────────────────────────────────────────────────────
  console.log('\n====================================================');
  console.log(' Smoke Test Summary Results');
  console.log('====================================================');
  console.table(results);
}

runSmokeTests().catch((e) => {
  console.error('Smoke harness fatal:', e);
  process.exit(1);
});

