import { spawn, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { logger } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

class ProcessSupervisor {
  constructor() {
    this.processes = new Map();
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

  startRestServer(port = 7777) {
    if (this.processes.has('rest-server')) {
      logger.info('REST server already running.');
      return;
    }

    const pythonBin = this.getPythonExecutable();
    const serverScript = path.join(PROJECT_ROOT, 'legacy-rest', 'asr_server_rest.py');

    logger.info(`Starting Legacy REST server with ${pythonBin} on port ${port}...`);

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
      logger.info(`[REST Server] ${data.toString().trim()}`);
    });

    child.stderr.on('data', (data) => {
      logger.error(`[REST Server] ${data.toString().trim()}`);
    });

    child.on('close', (code) => {
      logger.warn(`REST server exited with code ${code}`);
      this.processes.delete('rest-server');
    });

    child.on('error', (err) => {
      logger.error(`REST server process error: ${err.message}`);
    });

    this.processes.set('rest-server', child);
    return child;
  }

  startGatewayA(wsPort = 8085, httpPort = 8086) {
    if (this.processes.has('gateway-a')) {
      logger.info('Gateway A already running.');
      return;
    }

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
      logger.warn(`Gateway A exited with code ${code}`);
      this.processes.delete('gateway-a');
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
      return;
    }

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
      logger.warn(`Gateway B exited with code ${code}`);
      this.processes.delete('gateway-b');
    });

    child.on('error', (err) => {
      logger.error(`Gateway B process error: ${err.message}`);
    });

    this.processes.set('gateway-b', child);
    return child;
  }

  stopProcess(name) {
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
}

export const supervisor = new ProcessSupervisor();
