import fs from 'fs';
import path from 'path';
import os from 'os';
import { settingsStore } from './settings-store.js';

const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
const LOG_DIR = path.join(appData, 'Bolo', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'bolo.log');

function redactSensitive(msg) {
  if (typeof msg !== 'string') return msg;
  // Redact typical API keys: Groq (gsk_...), Google (AIza...), Gnani/Hex keys, auth headers
  return msg
    .replace(/gsk_[a-zA-Z0-9]{20,}/g, 'gsk_[REDACTED]')
    .replace(/AIza[0-9A-Za-z-_]{35}/g, 'AIza[REDACTED]')
    .replace(/(?:key|token|auth|secret|bearer)\s*[:=]\s*['"]?([a-zA-Z0-9_\-]{16,})['"]?/gi, '$1=[REDACTED]')
    .replace(/X-API-Key-ID:\s*[a-zA-Z0-9_\-]+/gi, 'X-API-Key-ID: [REDACTED]');
}

class Logger {
  constructor() {
    try {
      if (!fs.existsSync(LOG_DIR)) {
        fs.mkdirSync(LOG_DIR, { recursive: true });
      }
    } catch (_) {}
  }

  _write(level, msg) {
    const ts = new Date().toISOString();
    const cleanMsg = redactSensitive(typeof msg === 'string' ? msg : JSON.stringify(msg));
    const line = `[${ts}] [${level}] ${cleanMsg}\n`;
    process.stdout.write(line);
    try {
      fs.appendFileSync(LOG_FILE, line, 'utf-8');
    } catch (_) {}
  }

  debug(msg) {
    if (process.env.DEBUG === 'true' || settingsStore.get('debug')) {
      this._write('DEBUG', msg);
    }
  }

  info(msg) {
    this._write('INFO', msg);
  }

  warn(msg) {
    this._write('WARN', msg);
  }

  error(msg) {
    this._write('ERROR', msg);
  }

  latency(stage, ms, totalMs) {
    const formatted = `[PERF] ${stage}: ${ms.toFixed(0)} ms${totalMs !== undefined ? ` (Total: ${totalMs.toFixed(0)} ms)` : ''}`;
    this.info(formatted);
  }

  getLogDir() {
    return LOG_DIR;
  }
}

export const logger = new Logger();
