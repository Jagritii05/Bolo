import { spawn, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import net from 'net';
import http from 'http';
import { EventEmitter } from 'events';
import { fileURLToPath } from 'url';
import { logger } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

export class ProcessSupervisor extends EventEmitter {
  constructor() {
    super();
    this.processes = new Map();
    this.procState = new Map(); // name -> { attempts, lastStartTime, isStopping, restartTimer }
    this.backoffSchedule = [1000, 2000, 5000, 10000];
    this.maxAttempts = 5;
  }

  getState(name) {
    if (!this.procState.has(name)) {
      this.procState.set(name, {
        attempts: 0,
        lastStartTime: 0,
        isStopping: false,
        restartTimer: null,
      });
    }
    return this.procState.get(name);
  }

  getPythonExecutable() {
    const venvPythonWin = path.join(PROJECT_ROOT, '.venv', 'Scripts', 'python.exe');
    const venvPythonPosix = path.join(PROJECT_ROOT, '.venv', 'bin', 'python3');

    if (process.platform === 'win32' && fs.existsSync(venvPythonWin)) {
      return venvPythonWin;
    }
    if (fs.existsSync(venvPythonPosix)) {
      return venvPythonPosix;
    }
    return process.platform === 'win32' ? 'python.exe' : 'python3';
  }

  _handleProcessExit(name, code, restartFn) {
    const state = this.getState(name);
    this.processes.delete(name);

    if (state.isStopping) {
      logger.info(`[Supervisor] Process '${name}' stopped intentionally.`);
      return;
    }

    const uptime = Date.now() - state.lastStartTime;
    // If process was healthy for > 30s, reset attempt counter
    if (uptime > 30000) {
      state.attempts = 0;
    }

    if (state.attempts >= this.maxAttempts) {
      logger.error(`[Supervisor] Process '${name}' exceeded max restart attempts (${this.maxAttempts}). Giving up.`);
      this.emit('process-fatal', { name, attempts: state.attempts, code });
      return;
    }

    const delay = this.backoffSchedule[Math.min(state.attempts, this.backoffSchedule.length - 1)];
    state.attempts += 1;

    logger.warn(`[Supervisor] Process '${name}' exited (code: ${code}). Restarting in ${delay}ms (attempt ${state.attempts}/${this.maxAttempts})...`);
    this.emit('process-restart', { name, attempt: state.attempts, delay, code });

    state.restartTimer = setTimeout(() => {
      state.restartTimer = null;
      if (!state.isStopping) {
        restartFn();
      }
    }, delay);
  }

  startRestServer(port = 7777) {
    if (this.processes.has('rest-server')) {
      logger.info('REST server already running.');
      return this.processes.get('rest-server');
    }

    const state = this.getState('rest-server');
    state.isStopping = false;
    state.lastStartTime = Date.now();

    const pythonBin = this.getPythonExecutable();
    const serverScript = path.join(PROJECT_ROOT, 'legacy-rest', 'asr_server_rest.py');

    logger.info(`Starting Python STT / REST server with ${pythonBin} on port ${port}...`);

    const child = spawn(pythonBin, [serverScript], {
      cwd: PROJECT_ROOT,
      env: {
        ...process.env,
        ASR_PORT: String(port),
        PYTHONUNBUFFERED: '1',
      },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout.on('data', (data) => {
      logger.info(`[STT Server] ${data.toString().trim()}`);
    });

    child.stderr.on('data', (data) => {
      logger.error(`[STT Server] ${data.toString().trim()}`);
    });

    child.on('close', (code) => {
      this._handleProcessExit('rest-server', code, () => this.startRestServer(port));
    });

    child.on('error', (err) => {
      logger.error(`STT server process error: ${err.message}`);
    });

    this.processes.set('rest-server', child);
    return child;
  }

  startGatewayA(wsPort = 8085, httpPort = 8086) {
    if (this.processes.has('gateway-a')) {
      logger.info('Gateway A already running.');
      return this.processes.get('gateway-a');
    }

    const state = this.getState('gateway-a');
    state.isStopping = false;
    state.lastStartTime = Date.now();

    const ggExe = path.join(PROJECT_ROOT, 'gg.exe');
    const modulePath = path.join(PROJECT_ROOT, 'services', 'speech_gateway', 'index.js');

    logger.info(`Starting Graftcode Gateway A on ws:${wsPort} http:${httpPort}...`);

    const child = spawn(ggExe, [
      '--runtime', 'nodejs',
      '--modules', modulePath,
      '--port', String(wsPort),
      '--httpPort', String(httpPort)
    ], {
      cwd: PROJECT_ROOT,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    child.stdout.on('data', (data) => {
      logger.info(`[Gateway A] ${data.toString().trim()}`);
    });

    child.stderr.on('data', (data) => {
      logger.error(`[Gateway A] ${data.toString().trim()}`);
    });

    child.on('close', (code) => {
      this._handleProcessExit('gateway-a', code, () => this.startGatewayA(wsPort, httpPort));
    });

    child.on('error', (err) => {
      logger.error(`Gateway A process error: ${err.message}`);
    });

    this.processes.set('gateway-a', child);
    return child;
  }

  startGatewayB(wsPort = 8095, httpPort = 8096) {
    if (this.processes.has('gateway-b')) {
      logger.info('Gateway B already running.');
      return this.processes.get('gateway-b');
    }

    const state = this.getState('gateway-b');
    state.isStopping = false;
    state.lastStartTime = Date.now();

    const ggExe = path.join(PROJECT_ROOT, 'gg.exe');
    const modulePath = path.join(PROJECT_ROOT, 'services', 'text_gateway', 'index.js');

    logger.info(`Starting Graftcode Gateway B on ws:${wsPort} http:${httpPort}...`);

    const child = spawn(ggExe, [
      '--runtime', 'nodejs',
      '--modules', modulePath,
      '--port', String(wsPort),
      '--httpPort', String(httpPort)
    ], {
      cwd: PROJECT_ROOT,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    child.stdout.on('data', (data) => {
      logger.info(`[Gateway B] ${data.toString().trim()}`);
    });

    child.stderr.on('data', (data) => {
      logger.error(`[Gateway B] ${data.toString().trim()}`);
    });

    child.on('close', (code) => {
      this._handleProcessExit('gateway-b', code, () => this.startGatewayB(wsPort, httpPort));
    });

    child.on('error', (err) => {
      logger.error(`Gateway B process error: ${err.message}`);
    });

    this.processes.set('gateway-b', child);
    return child;
  }

  stopProcess(name) {
    const state = this.getState(name);
    state.isStopping = true;
    if (state.restartTimer) {
      clearTimeout(state.restartTimer);
      state.restartTimer = null;
    }

    const child = this.processes.get(name);
    if (!child || !child.pid) return;

    logger.info(`Stopping process '${name}' (PID: ${child.pid})...`);

    if (process.platform === 'win32') {
      try {
        execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: 'ignore' });
      } catch (_) {
        try { child.kill('SIGKILL'); } catch (_) {}
      }
    } else {
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch (_) {
        try { child.kill('SIGTERM'); } catch (_) {}
      }
    }

    this.processes.delete(name);
  }

  stopAll() {
    for (const name of Array.from(this.processes.keys())) {
      this.stopProcess(name);
    }
  }

  /**
   * Fast TCP probe to check if a port is listening
   */
  async checkPortListening(port, host = '127.0.0.1', timeoutMs = 800) {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(timeoutMs);

      socket.once('connect', () => {
        socket.destroy();
        resolve(true);
      });

      socket.once('timeout', () => {
        socket.destroy();
        resolve(false);
      });

      socket.once('error', () => {
        socket.destroy();
        resolve(false);
      });

      socket.connect(port, host);
    });
  }

  /**
   * Poll a port until listening or timeout
   */
  async waitForPort(port, host = '127.0.0.1', timeoutMs = 15000, intervalMs = 250) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (await this.checkPortListening(port, host, 400)) {
        return true;
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    return false;
  }

  /**
   * Check HTTP endpoint readiness
   */
  async checkHttpReady(url, timeoutMs = 15000, intervalMs = 300) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const ok = await new Promise((resolve) => {
          const req = http.get(url, { timeout: 1000 }, (res) => {
            let body = '';
            res.on('data', (c) => body += c);
            res.on('end', () => {
              if (res.statusCode >= 200 && res.statusCode < 400) {
                try {
                  const data = JSON.parse(body);
                  resolve(data.ready !== false);
                } catch (_) {
                  resolve(true);
                }
              } else {
                resolve(false);
              }
            });
          });
          req.on('error', () => resolve(false));
          req.on('timeout', () => { req.destroy(); resolve(false); });
        });

        if (ok) return true;
      } catch (_) {}
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    return false;
  }

  /**
   * Wait for a specific service to become ready
   */
  async waitForReady(name, timeoutMs = 20000) {
    if (name === 'gateway-a') {
      return this.waitForPort(8085, '127.0.0.1', timeoutMs);
    }
    if (name === 'gateway-b') {
      return this.waitForPort(8095, '127.0.0.1', timeoutMs);
    }
    if (name === 'rest-server') {
      return this.checkHttpReady('http://127.0.0.1:7777/health', timeoutMs);
    }
    return false;
  }

  /**
   * Wait for all required services
   */
  async waitForAllReady(transport = 'graft', timeoutMs = 25000) {
    const start = Date.now();
    logger.info(`[Supervisor] Waiting for all services to become ready (transport: ${transport})...`);

    // STT Python server is needed in both modes
    const sttReady = await this.waitForReady('rest-server', timeoutMs);
    if (!sttReady) {
      logger.warn('[Supervisor] STT server failed to report ready within timeout.');
    }

    if (transport === 'graft') {
      const remainingMs = Math.max(1000, timeoutMs - (Date.now() - start));
      const [gwA, gwB] = await Promise.all([
        this.waitForReady('gateway-a', remainingMs),
        this.waitForReady('gateway-b', remainingMs),
      ]);
      return gwA && gwB && sttReady;
    }

    return sttReady;
  }

  /**
   * Startup warm-up: eliminates first-call latency
   */
  async warmUp(speechClient) {
    if (!speechClient || typeof speechClient.warmUp !== 'function') return;
    try {
      logger.info('[Supervisor] Initiating startup warm-up on speech service...');
      const start = Date.now();
      await speechClient.warmUp();
      logger.info(`[Supervisor] Startup warm-up complete in ${Date.now() - start}ms.`);
    } catch (err) {
      logger.warn(`[Supervisor] Warm-up non-fatal warning: ${err.message}`);
    }
  }
}

export const supervisor = new ProcessSupervisor();
