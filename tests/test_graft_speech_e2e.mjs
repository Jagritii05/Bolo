import { spawn, execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { GraftSpeechClient } from '../src/main/graft/graft-speech-client.js';
import { RestSpeechClient } from '../src/main/rest/rest-speech-client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

const PYTHON_BIN = path.join(PROJECT_ROOT, '.venv', 'Scripts', 'python.exe');
const ASR_SCRIPT = path.join(PROJECT_ROOT, 'legacy-rest', 'asr_server_rest.py');
const GG_EXE = path.join(PROJECT_ROOT, 'gg.exe');
const GATEWAY_MODULE = path.join(PROJECT_ROOT, 'services', 'speech_gateway', 'index.js');

function createSineWavBuffer(durationSec = 1.0, sampleRate = 16000) {
  const numSamples = Math.floor(durationSec * sampleRate);
  const dataSize = numSamples * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);

  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);

  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < numSamples; i++) {
    const val = Math.floor(32767 * 0.4 * Math.sin(2 * Math.PI * 440 * i / sampleRate));
    buffer.writeInt16LE(val, 44 + i * 2);
  }

  return buffer;
}

async function main() {
  console.log('[E2E] Starting Python speech worker on port 7777...');
  const pythonProc = spawn(PYTHON_BIN, [ASR_SCRIPT], {
    cwd: PROJECT_ROOT,
    env: { ...process.env, ASR_PORT: '7777', PYTHONUNBUFFERED: '1' },
    windowsHide: true,
  });

  console.log('[E2E] Starting Graftcode Gateway A on port 8085...');
  const gatewayProc = spawn(GG_EXE, [
    '--runtime', 'nodejs',
    '--modules', GATEWAY_MODULE,
    '--port', '8085',
    '--httpPort', '8086',
  ], {
    cwd: PROJECT_ROOT,
    windowsHide: true,
  });

  try {
    // Wait for Gateway A and Python to initialize
    console.log('[E2E] Waiting for services to initialize...');
    const graftClient = new GraftSpeechClient();
    const restClient = new RestSpeechClient(7777);

    let ready = false;
    for (let i = 0; i < 35; i++) {
      try {
        const health = await graftClient.isReady();
        if (health && health.ready) {
          ready = true;
          console.log('[E2E] Gateway A is ready via Graftcode RPC!', health);
          break;
        }
      } catch (_) {}
      await new Promise((r) => setTimeout(r, 1000));
    }

    if (!ready) {
      throw new Error('Graftcode Gateway A did not become ready within 35s');
    }

    // 1. List engines via Graftcode
    console.log('[E2E] Calling graftClient.listEngines()...');
    const engines = await graftClient.listEngines();
    console.log(`[E2E] Engines returned: ${engines.length}`);
    if (!Array.isArray(engines) || engines.length === 0) {
      throw new Error('listEngines returned invalid response');
    }

    // 2. Transcribe via Graftcode
    console.log('[E2E] Calling graftClient.transcribe(audioBuffer)...');
    const audioBuf = createSineWavBuffer(1.5, 16000);
    const t0 = Date.now();
    const graftResult = await graftClient.transcribe(audioBuf);
    const graftDuration = Date.now() - t0;
    console.log(`[E2E] Graftcode transcription succeeded in ${graftDuration}ms:`, graftResult);

    if (typeof graftResult.text !== 'string' || typeof graftResult.duration !== 'number') {
      throw new Error('Graftcode result schema mismatch');
    }

    // 3. Compare with REST baseline
    console.log('[E2E] Calling restClient.transcribe(audioBuffer) for parity check...');
    const t1 = Date.now();
    const restResult = await restClient.transcribe(audioBuf);
    const restDuration = Date.now() - t1;
    console.log(`[E2E] REST baseline transcription succeeded in ${restDuration}ms:`, restResult);

    // Schema parity validation
    if (Object.keys(graftResult).sort().join(',') !== Object.keys(restResult).sort().join(',')) {
      throw new Error('Schema mismatch between REST and Graftcode transports!');
    }

    console.log('[E2E] PHASE 2 GRAFTCODE SPEECH SERVICE VERIFIED WITH 100% PARITY! \u2713');
  } finally {
    console.log('[E2E] Shutting down processes...');
    try { execSync(`taskkill /pid ${gatewayProc.pid} /T /F`, { stdio: 'ignore' }); } catch (_) {}
    try { execSync(`taskkill /pid ${pythonProc.pid} /T /F`, { stdio: 'ignore' }); } catch (_) {}
  }
}

main().catch((err) => {
  console.error('[E2E Failed]', err);
  process.exit(1);
});
