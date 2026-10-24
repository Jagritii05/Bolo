import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

console.log('[Smoke] Testing Electron startup...');

const electronBin = path.join(PROJECT_ROOT, 'node_modules', '.bin', 'electron.cmd');

// Launch Electron with TEST_SMOKE=1 so it auto-exits after verifying initialization
const proc = spawn(`"${electronBin}"`, ['src/main/index.js'], {
  cwd: PROJECT_ROOT,
  shell: true,
  env: {
    ...process.env,
    TEST_SMOKE: '1',
    TRANSPORT: 'graft',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let output = '';
proc.stdout.on('data', (d) => {
  const str = d.toString();
  output += str;
  process.stdout.write(`[Electron] ${str}`);
});

proc.stderr.on('data', (d) => {
  const str = d.toString();
  output += str;
  process.stderr.write(`[Electron ERR] ${str}`);
});

// Let it run for 6 seconds, then signal exit
const timer = setTimeout(() => {
  console.log('[Smoke] Smoke test timeout reached. Terminating process...');
  proc.kill('SIGTERM');
}, 6000);

proc.on('close', (code) => {
  clearTimeout(timer);
  console.log(`[Smoke] Electron exited with code ${code}`);
  if (output.includes('Error:') || output.includes('Uncaught Exception')) {
    console.error('[Smoke Failed] Detected error in output');
    process.exit(1);
  }
  console.log('[Smoke] Electron smoke test passed!');
  process.exit(0);
});
