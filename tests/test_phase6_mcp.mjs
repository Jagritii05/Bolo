import { spawn, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import http from 'http';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

const PYTHON_BIN = path.join(PROJECT_ROOT, '.venv', 'Scripts', 'python.exe');
const ASR_SCRIPT = path.join(PROJECT_ROOT, 'legacy-rest', 'asr_server_rest.py');
const GG_EXE = path.join(PROJECT_ROOT, 'gg.exe');
const SPEECH_GATEWAY_MODULE = path.join(PROJECT_ROOT, 'services', 'speech_gateway', 'index.js');
const TEXT_GATEWAY_MODULE = path.join(PROJECT_ROOT, 'services', 'text_gateway', 'index.js');

const TEST_RECORDINGS_DIR = path.join(PROJECT_ROOT, 'tests', 'fixtures', 'mcp_allowed');
const TEST_OUTSIDE_DIR = path.join(PROJECT_ROOT, 'tests', 'fixtures', 'mcp_outside');

function createSineWavFile(filePath, durationSec = 1.0, sampleRate = 16000) {
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

  fs.writeFileSync(filePath, buffer);
}

function sendHttpRequest(port, path, method = 'POST', headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        timeout: 10000,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: data,
          });
        });
      }
    );

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });

    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function waitForHttp(port, path = '/status', maxRetries = 25) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await sendHttpRequest(port, path, 'GET');
      if (res.statusCode < 500) return true;
    } catch (_) {}
    await new Promise((r) => setTimeout(r, 600));
  }
  return false;
}

function killTree(pid) {
  try {
    execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'ignore' });
  } catch (_) {}
}

async function main() {
  console.log('=== [PHASE 6: MCP VERIFICATION SUITE] ===');

  // 1. Prepare test directories
  if (!fs.existsSync(TEST_RECORDINGS_DIR)) {
    fs.mkdirSync(TEST_RECORDINGS_DIR, { recursive: true });
  }
  if (!fs.existsSync(TEST_OUTSIDE_DIR)) {
    fs.mkdirSync(TEST_OUTSIDE_DIR, { recursive: true });
  }

  process.env.MCP_ALLOWED_DIR = TEST_RECORDINGS_DIR;

  // 2. Start Python speech worker
  console.log('[Test] Starting Python speech worker on 127.0.0.1:7777...');
  const pythonProc = spawn(PYTHON_BIN, [ASR_SCRIPT], {
    cwd: PROJECT_ROOT,
    env: { ...process.env, ASR_PORT: '7777', PYTHONUNBUFFERED: '1' },
    windowsHide: true,
  });

  // 3. Start Gateway A (Speech) on 8085 / 8086
  console.log('[Test] Starting Gateway A (Speech) on port 8085...');
  const gatewayA = spawn(
    GG_EXE,
    ['--runtime', 'nodejs', '--modules', SPEECH_GATEWAY_MODULE, '--port', '8085', '--httpPort', '8086'],
    {
      cwd: PROJECT_ROOT,
      env: { ...process.env, MCP_ALLOWED_DIR: TEST_RECORDINGS_DIR },
      windowsHide: true,
    }
  );

  // 4. Start Gateway B (Text) on 8095 / 8096
  console.log('[Test] Starting Gateway B (Text) on port 8095...');
  const gatewayB = spawn(
    GG_EXE,
    ['--runtime', 'nodejs', '--modules', TEXT_GATEWAY_MODULE, '--port', '8095', '--httpPort', '8096'],
    {
      cwd: PROJECT_ROOT,
      windowsHide: true,
    }
  );

  const cleanup = () => {
    console.log('[Test] Cleaning up processes...');
    if (pythonProc && pythonProc.pid) killTree(pythonProc.pid);
    if (gatewayA && gatewayA.pid) killTree(gatewayA.pid);
    if (gatewayB && gatewayB.pid) killTree(gatewayB.pid);

    // Remove any test files
    try {
      if (fs.existsSync(TEST_RECORDINGS_DIR)) {
        fs.rmSync(TEST_RECORDINGS_DIR, { recursive: true, force: true });
      }
      if (fs.existsSync(TEST_OUTSIDE_DIR)) {
        fs.rmSync(TEST_OUTSIDE_DIR, { recursive: true, force: true });
      }
    } catch (_) {}
  };

  process.on('SIGINT', () => {
    cleanup();
    process.exit(1);
  });
  process.on('SIGTERM', () => {
    cleanup();
    process.exit(1);
  });

  try {
    // Wait for services
    console.log('[Test] Awaiting gateway readiness...');
    const aReady = await waitForHttp(8085, '/status');
    const bReady = await waitForHttp(8095, '/status');
    const pyReady = await waitForHttp(7777, '/health');

    if (!aReady || !bReady || !pyReady) {
      throw new Error(`Services failed to start. GatewayA=${aReady}, GatewayB=${bReady}, Py=${pyReady}`);
    }
    console.log('[Test] All services ready [OK]');

    // -------------------------------------------------------------
    // TEST 1: MCP Protocol & tools/list on Gateway B (Text)
    // -------------------------------------------------------------
    console.log('\n--- TEST 1: Gateway B MCP Protocol & CleanTextJson ---');
    const initResB = await sendHttpRequest(8095, '/mcp', 'POST', {}, {
      jsonrpc: '2.0',
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'mcp-test-client', version: '1.0' },
      },
      id: 1,
    });

    const sessionIdB = initResB.headers['mcp-session-id'];
    if (!sessionIdB) {
      throw new Error(`Expected Mcp-Session-Id header from /mcp initialize. Got: ${JSON.stringify(initResB.headers)}`);
    }
    console.log(`[Test 1] Gateway B session initialized: ${sessionIdB} [OK]`);

    // notifications/initialized
    await sendHttpRequest(8095, '/mcp', 'POST', { 'Mcp-Session-Id': sessionIdB }, {
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    });

    // tools/list
    const listResB = await sendHttpRequest(8095, '/mcp', 'POST', { 'Mcp-Session-Id': sessionIdB }, {
      jsonrpc: '2.0',
      method: 'tools/list',
      params: {},
      id: 2,
    });

    const listParsedB = JSON.parse(listResB.body);
    const toolsB = listParsedB.result?.tools || [];
    const hasCleanTool = toolsB.some((t) => t.name.toLowerCase().includes('cleantext'));
    if (!hasCleanTool) {
      throw new Error(`CleanTextJson not found in Gateway B tools list: ${JSON.stringify(toolsB)}`);
    }
    console.log(`[Test 1] Gateway B tools/list exposed CleanTextJson (${toolsB.length} tools total) [OK]`);

    // Call CleanTextJson over MCP
    const cleanToolName = toolsB.find((t) => t.name.toLowerCase().includes('cleantext')).name;
    const callResB = await sendHttpRequest(8095, '/mcp', 'POST', { 'Mcp-Session-Id': sessionIdB }, {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: cleanToolName,
        arguments: {
          text: 'my card is 4242 4242 4242 4242 um period',
          styleOrOptionsJson: 'FORMAL',
        },
      },
      id: 3,
    });

    const callParsedB = JSON.parse(callResB.body);
    const cleanResultText = callParsedB.result?.content?.[0]?.text || '';
    console.log(`[Test 1] CleanTextJson result: "${cleanResultText}"`);
    if (!cleanResultText.includes('[CARD-MASKED]') || !cleanResultText.includes('.')) {
      throw new Error(`CleanTextJson MCP call did not mask card or punctuate correctly: ${cleanResultText}`);
    }
    console.log('[Test 1] CleanTextJson MCP tool call succeeded with card masking [OK]');

    // -------------------------------------------------------------
    // TEST 2: MCP Protocol & tools/list on Gateway A (Speech)
    // -------------------------------------------------------------
    console.log('\n--- TEST 2: Gateway A MCP Protocol & TranscribeFileJson ---');
    const initResA = await sendHttpRequest(8085, '/mcp', 'POST', {}, {
      jsonrpc: '2.0',
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'mcp-test-client', version: '1.0' },
      },
      id: 10,
    });

    const sessionIdA = initResA.headers['mcp-session-id'];
    if (!sessionIdA) {
      throw new Error(`Expected Mcp-Session-Id header from Gateway A. Got: ${JSON.stringify(initResA.headers)}`);
    }
    console.log(`[Test 2] Gateway A session initialized: ${sessionIdA} [OK]`);

    // notifications/initialized
    await sendHttpRequest(8085, '/mcp', 'POST', { 'Mcp-Session-Id': sessionIdA }, {
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    });

    // tools/list
    const listResA = await sendHttpRequest(8085, '/mcp', 'POST', { 'Mcp-Session-Id': sessionIdA }, {
      jsonrpc: '2.0',
      method: 'tools/list',
      params: {},
      id: 11,
    });

    const listParsedA = JSON.parse(listResA.body);
    const toolsA = listParsedA.result?.tools || [];
    console.log('[Test 2] Gateway A exposed tools:', toolsA.map((t) => t.name).join(', '));
    const transcribeTool = toolsA.find((t) => t.name === 'TranscribeFileJson' || t.name.endsWith('.TranscribeFileJson')) || toolsA.find((t) => t.name.toLowerCase().includes('transcribefile'));
    if (!transcribeTool) {
      throw new Error(`TranscribeFileJson not found in Gateway A tools list: ${JSON.stringify(toolsA)}`);
    }
    console.log(`[Test 2] Gateway A selected tool: ${transcribeTool.name} [OK]`);

    function extractError(parsed) {
      if (!parsed) return '';
      if (parsed.error?.message) return parsed.error.message;
      if (parsed.result?.content?.[0]?.text) {
        const text = parsed.result.content[0].text;
        try {
          const p = JSON.parse(text);
          if (typeof p === 'string') {
            try {
              const p2 = JSON.parse(p);
              if (p2.error) return p2.error;
            } catch (_) {}
            return p;
          }
          if (p.error) return p.error;
        } catch (_) {}
        return text;
      }
      return JSON.stringify(parsed);
    }

    // -------------------------------------------------------------
    // TEST 3: Security Boundary & Path Restriction
    // -------------------------------------------------------------
    console.log('\n--- TEST 3: Security Boundary & Exception Assertions ---');

    // 3A: Disallowed extension
    const txtPath = path.join(TEST_RECORDINGS_DIR, 'standup.txt');
    fs.writeFileSync(txtPath, 'Not audio data');
    const resDisallowedExt = await sendHttpRequest(8085, '/mcp', 'POST', { 'Mcp-Session-Id': sessionIdA }, {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: transcribeTool.name,
        arguments: { filePath: txtPath, prompt: '' },
      },
      id: 20,
    });
    const parsedExt = JSON.parse(resDisallowedExt.body);
    const extErr = extractError(parsedExt);
    console.log(`[Test 3A] Blocked invalid extension response: "${extErr}"`);
    if (!extErr.toLowerCase().includes('invalidaudioexception') && !extErr.toLowerCase().includes('unsupported file format')) {
      throw new Error(`Expected InvalidAudioException on .txt, got: ${JSON.stringify(parsedExt)}`);
    }
    console.log('[Test 3A] Blocked invalid extension (.txt) [OK]');

    // 3B: Empty 0-byte audio file
    const emptyWav = path.join(TEST_RECORDINGS_DIR, 'empty.wav');
    fs.writeFileSync(emptyWav, Buffer.alloc(0));
    const resEmpty = await sendHttpRequest(8085, '/mcp', 'POST', { 'Mcp-Session-Id': sessionIdA }, {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: transcribeTool.name,
        arguments: { filePath: emptyWav, prompt: '' },
      },
      id: 21,
    });
    const parsedEmpty = JSON.parse(resEmpty.body);
    const emptyErr = extractError(parsedEmpty);
    console.log(`[Test 3B] Blocked empty file response: "${emptyErr}"`);
    if (!emptyErr.toLowerCase().includes('invalidaudioexception') && !emptyErr.toLowerCase().includes('empty')) {
      throw new Error(`Expected InvalidAudioException on 0-byte file, got: ${JSON.stringify(parsedEmpty)}`);
    }
    console.log('[Test 3B] Blocked empty 0-byte file [OK]');

    // 3C: Absolute path outside allowed directory
    const winIniPath = 'C:\\Windows\\win.ini';
    const resOutside = await sendHttpRequest(8085, '/mcp', 'POST', { 'Mcp-Session-Id': sessionIdA }, {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: transcribeTool.name,
        arguments: { filePath: winIniPath, prompt: '' },
      },
      id: 22,
    });
    const parsedOutside = JSON.parse(resOutside.body);
    const outsideErr = extractError(parsedOutside);
    console.log(`[Test 3C] Blocked outside path response: "${outsideErr}"`);
    if (!outsideErr.toLowerCase().includes('pathnotallowedexception') && !outsideErr.toLowerCase().includes('invalidaudioexception')) {
      throw new Error(`Expected access rejection on C:\\Windows\\win.ini, got: ${JSON.stringify(parsedOutside)}`);
    }
    console.log('[Test 3C] Blocked absolute path outside allowed directory [OK]');

    // 3D: Relative path traversal escape (..\..\)
    const outsideWav = path.join(TEST_OUTSIDE_DIR, 'secret.wav');
    createSineWavFile(outsideWav, 0.5);

    const relativeTraversal = path.join(TEST_RECORDINGS_DIR, '..', 'mcp_outside', 'secret.wav');
    const resTraversal = await sendHttpRequest(8085, '/mcp', 'POST', { 'Mcp-Session-Id': sessionIdA }, {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: transcribeTool.name,
        arguments: { filePath: relativeTraversal, prompt: '' },
      },
      id: 23,
    });
    const parsedTraversal = JSON.parse(resTraversal.body);
    const travErr = extractError(parsedTraversal);
    console.log(`[Test 3D] Blocked traversal response: "${travErr}"`);
    if (!travErr.toLowerCase().includes('pathnotallowedexception')) {
      throw new Error(`Expected PathNotAllowedException on relative traversal, got: ${JSON.stringify(parsedTraversal)}`);
    }
    console.log('[Test 3D] Blocked relative traversal escape (PathNotAllowedException) [OK]');

    // 3E: Windows Directory Junction Escape
    const junctionPath = path.join(TEST_RECORDINGS_DIR, 'evil_junction');
    try {
      fs.symlinkSync(TEST_OUTSIDE_DIR, junctionPath, 'junction');
      console.log(`[Test 3E] Created directory junction: ${junctionPath} -> ${TEST_OUTSIDE_DIR}`);

      const junctionEscapeTarget = path.join(junctionPath, 'secret.wav');
      const resJunction = await sendHttpRequest(8085, '/mcp', 'POST', { 'Mcp-Session-Id': sessionIdA }, {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: transcribeTool.name,
          arguments: { filePath: junctionEscapeTarget, prompt: '' },
        },
        id: 24,
      });

      const parsedJunction = JSON.parse(resJunction.body);
      const junctionErr = extractError(parsedJunction);
      console.log(`[Test 3E] Blocked junction response: "${junctionErr}"`);
      if (!junctionErr.toLowerCase().includes('pathnotallowedexception')) {
        throw new Error(`Expected PathNotAllowedException on directory junction escape, got: ${JSON.stringify(parsedJunction)}`);
      }
      console.log('[Test 3E] Blocked directory junction escape (PathNotAllowedException) [OK]');
    } finally {
      try {
        if (fs.existsSync(junctionPath)) {
          fs.rmdirSync(junctionPath);
        }
      } catch (_) {}
    }

    // -------------------------------------------------------------
    // TEST 4: Valid Audio Transcription via MCP Tool Call
    // -------------------------------------------------------------
    console.log('\n--- TEST 4: Valid Audio Transcription via MCP Tool Call ---');
    const validAudioPath = path.join(TEST_RECORDINGS_DIR, 'standup.wav');
    createSineWavFile(validAudioPath, 1.0);

    let parsedValid = null;
    let validOutput = '';
    let transcriptionObj = null;

    for (let attempt = 0; attempt < 15; attempt++) {
      const resValid = await sendHttpRequest(8085, '/mcp', 'POST', { 'Mcp-Session-Id': sessionIdA }, {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: transcribeTool.name,
          arguments: { filePath: validAudioPath, prompt: 'meeting notes' },
        },
        id: 25 + attempt,
      });

      parsedValid = JSON.parse(resValid.body);
      validOutput = parsedValid.result?.content?.[0]?.text || '';
      try {
        let p = JSON.parse(validOutput);
        if (typeof p === 'string') p = JSON.parse(p);
        if (p && typeof p.duration === 'number') {
          transcriptionObj = p;
          break;
        }
      } catch (_) {}

      await new Promise((r) => setTimeout(r, 1000));
    }
    console.log(`[Test 4] TranscribeFileJson MCP output: ${validOutput}`);

    if (!transcriptionObj || typeof transcriptionObj.duration !== 'number') {
      throw new Error(`Expected valid transcription JSON result, got: ${JSON.stringify(parsedValid)}`);
    }
    console.log(`[Test 4] Transcribed 1.0s valid audio via MCP tool: duration=${transcriptionObj.duration}s [OK]`);

    console.log('\n=== ALL PHASE 6 MCP TESTS PASSED [5/5] ===\n');
  } finally {
    cleanup();
  }
}

main().catch((err) => {
  console.error('\n[FATAL] Test failed:', err);
  process.exit(1);
});
