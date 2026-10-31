import assert from 'assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { translateError, ERROR_MAPPINGS } from '../src/main/graft/adapter.js';
import { ProcessSupervisor } from '../src/main/supervisor.js';
import { cleanOrphanedTempAudio } from '../src/main/temp-cleaner.js';

let totalTests = 0;
let passedTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`[PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`[FAIL] ${name}: ${err.message}`);
    throw err;
  }
}

async function asyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`[PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`[FAIL] ${name}: ${err.message}`);
    throw err;
  }
}

console.log('====================================================');
console.log(' LocalPill Phase 4 Reliability & Error UX Tests');
console.log('====================================================\n');

// 1. Error Mapping Table
// ─────────────────────────────────────────────────────────────
console.log('--- Testing Error Mapping Table ---');

test('Row 1: Gateway not up yet maps to GATEWAY_NOT_READY', () => {
  const err1 = new Error('connect ECONNREFUSED 127.0.0.1:8085');
  const res1 = translateError(err1);
  assert.equal(res1.kind, 'GATEWAY_NOT_READY');
  assert.equal(res1.retryable, true);
  assert.equal(res1.message, 'Starting services…');

  const err2 = new Error('WebSocket is not open: readyState 0 (CONNECTING)');
  const res2 = translateError(err2);
  assert.equal(res2.kind, 'GATEWAY_NOT_READY');
});

test('Row 2: ModelNotReadyException maps to MODEL_LOADING', () => {
  const err = new Error('ModelNotReadyException: WhisperModel still warming up (state: LOADING)');
  const res = translateError(err);
  assert.equal(res.kind, 'MODEL_LOADING');
  assert.equal(res.retryable, true);
  assert.equal(res.message, 'Loading speech model…');
});

test('Row 3: InvalidAudioException / blob under 1 KB maps to INVALID_AUDIO', () => {
  const err1 = new Error('InvalidAudioException: Audio blob under 1 KB');
  const res1 = translateError(err1);
  assert.equal(res1.kind, 'INVALID_AUDIO');
  assert.equal(res1.retryable, false);
  assert.equal(res1.message, "Didn't catch any audio. Try again.");

  const err2 = new Error("Didn't catch any audio. Try again.");
  const res2 = translateError(err2);
  assert.equal(res2.kind, 'INVALID_AUDIO');
});

test('Row 4: AudioTooLongException maps to AUDIO_TOO_LONG', () => {
  const err = new Error('AudioTooLongException: Duration exceeds maximum allowed (max 10 min)');
  const res = translateError(err);
  assert.equal(res.kind, 'AUDIO_TOO_LONG');
  assert.equal(res.retryable, false);
  assert.equal(res.message, 'Recording too long (max 10 min).');
});

test('Row 5: EngineUnavailableException maps to ENGINE_UNAVAILABLE with fallback', () => {
  const err = new Error('EngineUnavailableException: CUDA not found on device');
  const res = translateError(err);
  assert.equal(res.kind, 'ENGINE_UNAVAILABLE');
  assert.equal(res.retryable, true);
  assert.ok(res.message.includes('CUDA not found'));
  assert.ok(res.message.includes('whisper-base'));
  assert.equal(res.fallback, 'whisper-base');
});

test('Row 6: TranscriptionFailedException maps to TRANSCRIPTION_FAILED', () => {
  const err = new Error('TranscriptionFailedException: PyAV decode error 0x80004005');
  const res = translateError(err);
  assert.equal(res.kind, 'TRANSCRIPTION_FAILED');
  assert.equal(res.retryable, true);
  assert.equal(res.message, 'Transcription failed. Details in log.');
});

test('Row 7: Gateway died mid-call maps to GATEWAY_DIED', () => {
  const err1 = new Error('read ECONNRESET');
  const res1 = translateError(err1);
  assert.equal(res1.kind, 'GATEWAY_DIED');
  assert.equal(res1.retryable, true);
  assert.equal(res1.message, 'Service restarted, please retry.');

  const err2 = new Error('socket hang up');
  const res2 = translateError(err2);
  assert.equal(res2.kind, 'GATEWAY_DIED');
});

test('Row 8: Elevated admin window maps to ELEVATED_WINDOW', () => {
  const err = new Error('Target is an elevated admin window');
  const res = translateError(err);
  assert.equal(res.kind, 'ELEVATED_WINDOW');
  assert.equal(res.retryable, false);
  assert.equal(res.message, "Copied. Couldn't paste into an admin window.");
});

test('Row 9: Microphone permission denied maps to MIC_PERMISSION_DENIED', () => {
  const err = new Error('NotAllowedError: Permission denied by system');
  const res = translateError(err);
  assert.equal(res.kind, 'MIC_PERMISSION_DENIED');
  assert.equal(res.retryable, false);
  assert.equal(res.message, 'Allow microphone access in Windows Settings > Privacy.');
});

test('Row 10: PathNotAllowedException maps to PATH_NOT_ALLOWED', () => {
  const err = new Error("PathNotAllowedException: Access denied: Path 'C:\\secret.wav' outside allowed directory");
  const res = translateError(err);
  assert.equal(res.kind, 'PATH_NOT_ALLOWED');
  assert.equal(res.retryable, false);
  assert.equal(res.message, 'Path not allowed outside designated recordings folder.');
});

// ─────────────────────────────────────────────────────────────
// 2. Supervisor Backoff Logic Unit Tests
// ─────────────────────────────────────────────────────────────
console.log('\n--- Testing Supervisor Backoff Logic ---');

test('Supervisor backoff schedule follows [1000, 2000, 5000, 10000]', () => {
  const sup = new ProcessSupervisor();
  assert.deepEqual(sup.backoffSchedule, [1000, 2000, 5000, 10000]);
});

test('Supervisor increments attempt count on crash and respects backoff', () => {
  const sup = new ProcessSupervisor();
  let restartEvent = null;
  sup.on('process-restart', (evt) => { restartEvent = evt; });

  // Simulate process start
  const state = sup.getState('test-proc');
  state.lastStartTime = Date.now();

  // Simulate process exit 1
  sup._handleProcessExit('test-proc', 1, () => {});
  assert.equal(state.attempts, 1);
  assert.equal(restartEvent.delay, 1000);

  // Simulate process exit 2
  sup._handleProcessExit('test-proc', 1, () => {});
  assert.equal(state.attempts, 2);
  assert.equal(restartEvent.delay, 2000);

  // Simulate process exit 3
  sup._handleProcessExit('test-proc', 1, () => {});
  assert.equal(state.attempts, 3);
  assert.equal(restartEvent.delay, 5000);

  // Simulate process exit 4
  sup._handleProcessExit('test-proc', 1, () => {});
  assert.equal(state.attempts, 4);
  assert.equal(restartEvent.delay, 10000);

  // Simulate process exit 5 (max)
  let fatalEmitted = false;
  sup.on('process-fatal', () => { fatalEmitted = true; });
  sup._handleProcessExit('test-proc', 1, () => {});
  assert.equal(state.attempts, 5);
  // Next crash triggers fatal
  sup._handleProcessExit('test-proc', 1, () => {});
  assert.equal(fatalEmitted, true);

  if (state.restartTimer) clearTimeout(state.restartTimer);
});

test('Supervisor resets attempt counter if process ran for > 30s', () => {
  const sup = new ProcessSupervisor();
  const state = sup.getState('stable-proc');
  state.attempts = 3;
  // Simulating started 35s ago
  state.lastStartTime = Date.now() - 35000;

  sup._handleProcessExit('stable-proc', 1, () => {});
  // After > 30s, attempts should have reset to 0 then incremented to 1
  assert.equal(state.attempts, 1);
  if (state.restartTimer) clearTimeout(state.restartTimer);
});

test('Supervisor does not restart when process is stopped intentionally', () => {
  const sup = new ProcessSupervisor();
  const state = sup.getState('stopped-proc');
  state.isStopping = true;

  let restarted = false;
  sup.on('process-restart', () => { restarted = true; });

  sup._handleProcessExit('stopped-proc', 0, () => {});
  assert.equal(restarted, false);
});

// ─────────────────────────────────────────────────────────────
// 3. Temp File Cleaner Unit Tests
// ─────────────────────────────────────────────────────────────
console.log('\n--- Testing Temp File Cleaner ---');

test('Temp cleaner sweeps and deletes orphaned audio files while preserving others', () => {
  const tmpDir = os.tmpdir();
  const testWav1 = path.join(tmpDir, `lp_audio_test_${Date.now()}_1.webm`);
  const testWav2 = path.join(tmpDir, `localpill_test_${Date.now()}_2.wav`);
  const testKeep = path.join(tmpDir, `keep_me_safe_${Date.now()}.txt`);

  fs.writeFileSync(testWav1, 'test-audio-1');
  fs.writeFileSync(testWav2, 'test-audio-2');
  fs.writeFileSync(testKeep, 'keep-me');

  try {
    const cleaned = cleanOrphanedTempAudio(0); // 0 maxAge to clean immediately
    assert.ok(cleaned >= 2);
    assert.equal(fs.existsSync(testWav1), false);
    assert.equal(fs.existsSync(testWav2), false);
    assert.equal(fs.existsSync(testKeep), true);
  } finally {
    if (fs.existsSync(testKeep)) fs.unlinkSync(testKeep);
  }
});

// ─────────────────────────────────────────────────────────────
// 4. Live Gateway Recovery Integration Test
// ─────────────────────────────────────────────────────────────
console.log('\n--- Testing Live Gateway Death & Recovery ---');

await asyncTest('Supervisor starts Gateway B, survives termination, and recovers automatically', async () => {
  const sup = new ProcessSupervisor();
  sup.backoffSchedule = [500, 1000, 2000, 5000]; // Faster backoff for test

  let restartDetected = false;
  sup.on('process-restart', (evt) => {
    if (evt.name === 'gateway-b') restartDetected = true;
  });

  try {
    // 1. Start Gateway B
    const child1 = sup.startGatewayB(8095, 8096);
    assert.ok(child1.pid > 0);

    const ready1 = await sup.waitForReady('gateway-b', 25000);
    assert.equal(ready1, true, 'Gateway B should be ready on port 8095');

    // 2. Kill Gateway B child process to simulate crash / chaos
    console.log(`Simulating crash on Gateway B (PID: ${child1.pid})...`);
    child1.kill('SIGTERM');

    // 3. Wait for supervisor auto-restart
    await new Promise((r) => setTimeout(r, 1200));
    assert.equal(restartDetected, true, 'Supervisor should have detected crash and triggered restart');

    // 4. Wait for restarted Gateway B to be ready again
    const ready2 = await sup.waitForReady('gateway-b', 25000);
    assert.equal(ready2, true, 'Gateway B should have recovered and restarted');
  } finally {
    sup.stopProcess('gateway-b');
  }
});

console.log('\n====================================================');
console.log(` All Phase 4 Reliability Tests Passed! (${passedTests}/${totalTests})`);
console.log('====================================================\n');
