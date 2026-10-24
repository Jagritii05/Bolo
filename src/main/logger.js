import fs from 'fs';
import path from 'path';
import os from 'os';
import { settingsStore } from './settings-store.js';

const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
const LOG_DIR = path.join(appData, 'LocalPill', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'localpill.log');

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
    const line = `[${ts}] [${level}] ${msg}\n`;
    process.stdout.write(line);
    try {
      fs.appendFileSync(LOG_FILE, line, 'utf-8');
    } catch (_) {}
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

  logTranscript(text) {
    if (settingsStore.get('logTranscripts')) {
      this.info(`Transcript: "${text}"`);
    } else {
      const charCount = (text || '').length;
      this.info(`Transcript redacted for privacy (${charCount} characters).`);
    }
  }

  getLogDir() {
    return LOG_DIR;
  }
}

export const logger = new Logger();
