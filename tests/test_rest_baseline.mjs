import { spawn, execSync } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

const PORT = 7788;
const PYTHON_PATH = path.join(PROJECT_ROOT, '.venv', 'Scripts', 'python.exe');
const SERVER_SCRIPT = path.join(PROJECT_ROOT, 'legacy-rest', 'asr_server_rest.py');

// Create a synthetic 1-second WAV buffer in memory
function createSineWavBuffer(durationSec = 1.0, sampleRate = 16000) {
  const numSamples = Math.floor(durationSec * sampleRate);
  const dataSize = numSamples * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);

  // fmt subchunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // subchunk1 size
  buffer.writeUInt16LE(1, 20);  // PCM format
  buffer.writeUInt16LE(1, 22);  // mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28); // byte rate
  buffer.writeUInt16LE(2, 32);  // block align
  buffer.writeUInt16LE(16, 34); // bits per sample

  // data subchunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < numSamples; i++) {
    const val = Math.floor(32767 * 0.4 * Math.sin(2 * Math.PI * 440 * i / sampleRate));
    buffer.writeInt16LE(val, 44 + i * 2);
  }

  return buffer;
}

async function request(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function main() {
  console.log(`[Test] Starting legacy-rest/asr_server_rest.py on port ${PORT}...`);
  const serverProc = spawn(PYTHON_PATH, [SERVER_SCRIPT], {
    cwd: PROJECT_ROOT,
    env: { ...process.env, ASR_PORT: String(PORT), PYTHONUNBUFFERED: '1' },
    windowsHide: true,
  });

  serverProc.stdout.on('data', (d) => process.stdout.write(`[Server stdout] ${d}`));
  serverProc.stderr.on('data', (d) => process.stderr.write(`[Server stderr] ${d}`));

  try {
    // 1. Poll /health
    console.log('[Test] Polling /health...');
    let ready = false;
    for (let i = 0; i < 30; i++) {
      try {
        const res = await request({ host: '127.0.0.1', port: PORT, path: '/health', method: 'GET' });
        if (res.status === 200 && res.data.ready) {
          ready = true;
          console.log('[Test] Server is ready!', res.data);
          break;
        }
      } catch (_) {}
      await new Promise((r) => setTimeout(r, 1000));
    }

    if (!ready) {
      throw new Error('Server did not become ready within 30 seconds.');
    }

    // 2. Query /engines
    console.log('[Test] Querying /engines...');
    const enginesRes = await request({ host: '127.0.0.1', port: PORT, path: '/engines', method: 'GET' });
    console.log('[Test] Engines:', enginesRes.data);
    if (enginesRes.status !== 200 || !Array.isArray(enginesRes.data.engines)) {
      throw new Error('/engines endpoint failed');
    }

    // 3. Post audio to /transcribe
    console.log('[Test] Posting synthetic audio to /transcribe...');
    const audioBuf = createSineWavBuffer(1.5, 16000);
    const transcribeRes = await request(
      {
        host: '127.0.0.1',
        port: PORT,
        path: '/transcribe',
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Length': audioBuf.length,
        },
      },
      audioBuf
    );

    console.log('[Test] Transcribe response:', transcribeRes);
    if (transcribeRes.status !== 200) {
      throw new Error(`Transcribe failed with status ${transcribeRes.status}: ${JSON.stringify(transcribeRes)}`);
    }

    console.log('[Test] ALL REST BASELINE TESTS PASSED! \u2713');
  } finally {
    console.log('[Test] Killing server process...');
    try {
      execSync(`taskkill /pid ${serverProc.pid} /T /F`, { stdio: 'ignore' });
    } catch (_) {
      try { serverProc.kill('SIGKILL'); } catch (_) {}
    }
  }
}

main().catch((err) => {
  console.error('[Test Failed]', err);
  process.exit(1);
});
