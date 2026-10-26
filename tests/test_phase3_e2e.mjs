import { spawn, execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { GraftSpeechClient } from '../src/main/graft/graft-speech-client.js';
import { GraftTextClient } from '../src/main/graft/graft-text-client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

const PYTHON_BIN = path.join(PROJECT_ROOT, '.venv', 'Scripts', 'python.exe');
const ASR_SCRIPT = path.join(PROJECT_ROOT, 'legacy-rest', 'asr_server_rest.py');
const GG_EXE = path.join(PROJECT_ROOT, 'gg.exe');
const SPEECH_MODULE = path.join(PROJECT_ROOT, 'services', 'speech_gateway', 'index.js');
const TEXT_MODULE = path.join(PROJECT_ROOT, 'services', 'text_gateway', 'index.js');

async function main() {
  console.log('[Phase 3 E2E] Starting Python speech worker (7777)...');
  const pythonProc = spawn(PYTHON_BIN, [ASR_SCRIPT], {
    cwd: PROJECT_ROOT,
    env: { ...process.env, ASR_PORT: '7777', PYTHONUNBUFFERED: '1' },
    windowsHide: true,
  });

  console.log('[Phase 3 E2E] Starting Graftcode Gateway A on port 8085...');
  const gatewayAProc = spawn(
    GG_EXE,
    ['--runtime', 'nodejs', '--modules', SPEECH_MODULE, '--port', '8085', '--httpPort', '8086'],
    { cwd: PROJECT_ROOT, windowsHide: true }
  );

  console.log('[Phase 3 E2E] Starting Graftcode Gateway B on port 8095...');
  const gatewayBProc = spawn(
    GG_EXE,
    ['--runtime', 'nodejs', '--modules', TEXT_MODULE, '--port', '8095', '--httpPort', '8096'],
    { cwd: PROJECT_ROOT, windowsHide: true }
  );

  try {
    console.log('[Phase 3 E2E] Waiting for gateways to become ready...');
    const speechClient = new GraftSpeechClient();
    const textClient = new GraftTextClient();

    let gatewaysReady = false;
    for (let i = 0; i < 35; i++) {
      try {
        const healthA = await speechClient.isReady();
        const healthB = await textClient.health();
        if (healthA && healthA.ready && healthB && healthB.ready) {
          gatewaysReady = true;
          console.log('[Phase 3 E2E] Both Gateway A and Gateway B are ready over Graftcode RPC!');
          break;
        }
      } catch (_) {}
      await new Promise((r) => setTimeout(r, 1000));
    }

    if (!gatewaysReady) {
      throw new Error('Gateways did not become ready in time.');
    }

    // 1. Test Gateway B Text Pipeline via Graftcode RPC
    console.log('[Phase 3 E2E] Testing Text Pipeline over Graftcode RPC...');
    const rawTranscript =
      'um uh hello comma please charge my card 4532 0151 1283 0366 period send receipt to :email exclamation mark';
    const cleanResult = await textClient.process(rawTranscript, {
      snippets: { ':email': 'user@example.com' },
    });

    console.log(`[Phase 3 E2E] Input : "${rawTranscript}"`);
    console.log(`[Phase 3 E2E] Output: "${cleanResult}"`);

    if (!cleanResult.includes('[CARD-MASKED]')) {
      throw new Error('Expected credit card to be masked by Gateway B');
    }
    if (!cleanResult.includes('user@example.com')) {
      throw new Error('Expected snippet :email to be expanded by Gateway B');
    }
    if (cleanResult.includes('um') || cleanResult.includes('uh')) {
      throw new Error('Expected filler words to be removed by Gateway B');
    }

    // 2. Test MCP CleanTextJson static method over Graftcode
    console.log('[Phase 3 E2E] Testing MCP CleanTextJson static method...');
    const mcpClean = await textClient.cleanTextJson('um I need to buy milk period');
    console.log(`[Phase 3 E2E] MCP Clean Result: "${mcpClean}"`);
    if (mcpClean !== 'I need to buy milk.') {
      throw new Error(`Expected "I need to buy milk.", got "${mcpClean}"`);
    }

    console.log('[Phase 3 E2E] ALL PHASE 3 PIPELINE & GRAFTCODE TESTS PASSED! \u2713');
  } finally {
    console.log('[Phase 3 E2E] Cleaning up background processes...');
    try { execSync(`taskkill /pid ${gatewayBProc.pid} /T /F`, { stdio: 'ignore' }); } catch (_) {}
    try { execSync(`taskkill /pid ${gatewayAProc.pid} /T /F`, { stdio: 'ignore' }); } catch (_) {}
    try { execSync(`taskkill /pid ${pythonProc.pid} /T /F`, { stdio: 'ignore' }); } catch (_) {}
  }
}

main().catch((err) => {
  console.error('[Phase 3 E2E Failed]', err);
  process.exit(1);
});
