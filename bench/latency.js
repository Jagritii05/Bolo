import { spawn, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import http from 'http';
import { fileURLToPath } from 'url';
import { RestSpeechClient } from '../src/main/rest/rest-speech-client.js';
import { GraftSpeechClient } from '../src/main/graft/graft-speech-client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

const PYTHON_BIN = path.join(PROJECT_ROOT, '.venv', 'Scripts', 'python.exe');
const ASR_SCRIPT = path.join(PROJECT_ROOT, 'legacy-rest', 'asr_server_rest.py');
const GG_EXE = path.join(PROJECT_ROOT, 'gg.exe');
const SPEECH_GATEWAY_MODULE = path.join(PROJECT_ROOT, 'services', 'speech_gateway', 'index.js');
const RESULTS_DIR = path.join(PROJECT_ROOT, 'bench', 'results');

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

function calculatePercentiles(latencies) {
  const sorted = [...latencies].sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return { min: 0, p50: 0, p90: 0, p95: 0, p99: 0, max: 0, avg: 0 };

  const getP = (p) => {
    const idx = Math.min(Math.floor((p / 100) * n), n - 1);
    return Math.round(sorted[idx] * 100) / 100;
  };

  const sum = sorted.reduce((a, b) => a + b, 0);
  const avg = Math.round((sum / n) * 100) / 100;

  return {
    min: Math.round(sorted[0] * 100) / 100,
    p50: getP(50),
    p90: getP(90),
    p95: getP(95),
    p99: getP(99),
    max: Math.round(sorted[n - 1] * 100) / 100,
    avg,
    count: n,
  };
}

function checkPort(port) {
  return new Promise((resolve) => {
    const req = http.request({ hostname: '127.0.0.1', port, path: '/status', method: 'GET', timeout: 500 }, (res) => {
      resolve(res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.end();
  });
}

function killTree(pid) {
  try {
    execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'ignore' });
  } catch (_) {}
}

async function main() {
  console.log('=== [LOCALPILL LATENCY BENCHMARK] ===');

  if (!fs.existsSync(RESULTS_DIR)) {
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
  }

  let spawnedPython = null;
  let spawnedGateway = null;

  const pyRunning = await checkPort(7777);
  if (!pyRunning) {
    console.log('[Bench] Launching Python ASR server on 7777...');
    spawnedPython = spawn(PYTHON_BIN, [ASR_SCRIPT], {
      cwd: PROJECT_ROOT,
      env: { ...process.env, ASR_PORT: '7777', PYTHONUNBUFFERED: '1' },
      windowsHide: true,
    });
  }

  const gwRunning = await checkPort(8085);
  if (!gwRunning) {
    console.log('[Bench] Launching Graftcode Gateway A on 8085...');
    spawnedGateway = spawn(
      GG_EXE,
      ['--runtime', 'nodejs', '--modules', SPEECH_GATEWAY_MODULE, '--port', '8085', '--httpPort', '8086'],
      { cwd: PROJECT_ROOT, windowsHide: true }
    );
  }

  // Await ready
  let ready = false;
  for (let i = 0; i < 25; i++) {
    const p1 = await checkPort(7777);
    const p2 = await checkPort(8085);
    if (p1 && p2) {
      ready = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 600));
  }

  if (!ready) {
    console.error('[FATAL] Backend services failed to start.');
    if (spawnedPython) killTree(spawnedPython.pid);
    if (spawnedGateway) killTree(spawnedGateway.pid);
    process.exit(1);
  }

  const restClient = new RestSpeechClient(7777);
  const graftClient = new GraftSpeechClient();

  const cpus = os.cpus();
  const machineSpecs = {
    os: `${os.type()} ${os.release()} (${os.arch()})`,
    cpuModel: cpus[0]?.model || 'Unknown',
    cores: cpus.length,
    ramGb: Math.round((os.totalmem() / (1024 ** 3)) * 10) / 10,
    nodeVersion: process.version,
    date: new Date().toISOString(),
  };

  console.log(`[Bench] Machine: ${machineSpecs.cpuModel} (${machineSpecs.cores} cores), ${machineSpecs.ramGb} GB RAM`);

  // -------------------------------------------------------------
  // BENCHMARK 1: Health / Status Check (N=200, 20 warm-ups)
  // -------------------------------------------------------------
  const HEALTH_WARMUP = 20;
  const HEALTH_N = 200;

  console.log(`\n[Bench 1] Health Check Latency (Warmup=${HEALTH_WARMUP}, N=${HEALTH_N})...`);

  // Warmup REST
  for (let i = 0; i < HEALTH_WARMUP; i++) await restClient.isReady();
  const restHealthLatencies = [];
  for (let i = 0; i < HEALTH_N; i++) {
    const t0 = performance.now();
    await restClient.isReady();
    restHealthLatencies.push(performance.now() - t0);
  }

  // Warmup Graft
  for (let i = 0; i < HEALTH_WARMUP; i++) await graftClient.isReady();
  const graftHealthLatencies = [];
  for (let i = 0; i < HEALTH_N; i++) {
    const t0 = performance.now();
    await graftClient.isReady();
    graftHealthLatencies.push(performance.now() - t0);
  }

  const restHealthStats = calculatePercentiles(restHealthLatencies);
  const graftHealthStats = calculatePercentiles(graftHealthLatencies);

  console.log('REST Health Check (ms):      ', restHealthStats);
  console.log('Graftcode Health Check (ms): ', graftHealthStats);

  // -------------------------------------------------------------
  // BENCHMARK 2: Audio Transcription Latency (1.0s audio, N=20, 3 warm-ups)
  // -------------------------------------------------------------
  const wavBuffer = createSineWavBuffer(1.0);
  const TRANSCRIBE_WARMUP = 3;
  const TRANSCRIBE_N = 20;

  console.log(`\n[Bench 2] 1.0s Audio Transcription Latency (Warmup=${TRANSCRIBE_WARMUP}, N=${TRANSCRIBE_N})...`);

  // Warmup
  for (let i = 0; i < TRANSCRIBE_WARMUP; i++) {
    await restClient.transcribe(wavBuffer);
    await graftClient.transcribe(wavBuffer);
  }

  const restTranscribeLatencies = [];
  for (let i = 0; i < TRANSCRIBE_N; i++) {
    const t0 = performance.now();
    await restClient.transcribe(wavBuffer);
    restTranscribeLatencies.push(performance.now() - t0);
  }

  const graftTranscribeLatencies = [];
  for (let i = 0; i < TRANSCRIBE_N; i++) {
    const t0 = performance.now();
    await graftClient.transcribe(wavBuffer);
    graftTranscribeLatencies.push(performance.now() - t0);
  }

  const restTranscribeStats = calculatePercentiles(restTranscribeLatencies);
  const graftTranscribeStats = calculatePercentiles(graftTranscribeLatencies);

  console.log('REST Transcribe 1.0s (ms):      ', restTranscribeStats);
  console.log('Graftcode Transcribe 1.0s (ms): ', graftTranscribeStats);

  const results = {
    machine: machineSpecs,
    healthCheck: {
      warmup: HEALTH_WARMUP,
      iterations: HEALTH_N,
      rest: restHealthStats,
      graftcode: graftHealthStats,
    },
    transcription: {
      audioDurationSec: 1.0,
      warmup: TRANSCRIBE_WARMUP,
      iterations: TRANSCRIBE_N,
      rest: restTranscribeStats,
      graftcode: graftTranscribeStats,
    },
  };

  const resultsPath = path.join(RESULTS_DIR, 'latency.json');
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log(`\n[Bench] Saved raw latency data to: ${resultsPath}`);

  if (spawnedPython) killTree(spawnedPython.pid);
  if (spawnedGateway) killTree(spawnedGateway.pid);

  console.log('=== [LATENCY BENCHMARK COMPLETE] ===\n');
}

main().catch((err) => {
  console.error('[Bench Error]', err);
  process.exit(1);
});
