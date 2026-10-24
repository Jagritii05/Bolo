import { execFileSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';

const ASR_PORT = process.env.ASR_PORT || '7777';
const ASR_BASE = `http://127.0.0.1:${ASR_PORT}`;

export class SpeechService {
  static healthJson() {
    try {
      const out = execFileSync('curl.exe', ['-s', `${ASR_BASE}/health`], {
        encoding: 'utf-8',
        timeout: 5000,
        windowsHide: true,
      });
      return out;
    } catch (err) {
      return JSON.stringify({ ready: false, error: err.message });
    }
  }

  static listEnginesJson() {
    try {
      const out = execFileSync('curl.exe', ['-s', `${ASR_BASE}/engines`], {
        encoding: 'utf-8',
        timeout: 5000,
        windowsHide: true,
      });
      return out;
    } catch (err) {
      return JSON.stringify([]);
    }
  }

  static switchEngine(engineId) {
    try {
      const body = JSON.stringify({ engine_id: engineId });
      execFileSync(
        'curl.exe',
        ['-s', '-X', 'POST', `${ASR_BASE}/engine`, '-H', 'Content-Type: application/json', '-d', body],
        { timeout: 10000, windowsHide: true }
      );
      return true;
    } catch (_) {
      return false;
    }
  }

  static transcribeFileJson(filePath, prompt = '') {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Audio file not found: ${filePath}`);
    }
    const out = execFileSync(
      'curl.exe',
      ['-s', '-X', 'POST', `${ASR_BASE}/transcribe`, '--data-binary', `@${filePath}`],
      { encoding: 'utf-8', timeout: 60000, windowsHide: true }
    );
    return out;
  }

  static transcribeBytesJson(audioBase64, prompt = '') {
    const buffer = Buffer.from(audioBase64, 'base64');
    const tmpPath = path.join(os.tmpdir(), `lp_audio_${Date.now()}.webm`);
    try {
      fs.writeFileSync(tmpPath, buffer);
      return SpeechService.transcribeFileJson(tmpPath, prompt);
    } finally {
      if (fs.existsSync(tmpPath)) {
        try {
          fs.unlinkSync(tmpPath);
        } catch (_) {}
      }
    }
  }

  static TranscribeFileJson(filePath, prompt = '') {
    const userProfile = process.env.USERPROFILE || os.homedir();
    const allowedDir = process.env.MCP_ALLOWED_DIR || path.join(userProfile, 'LocalPillRecordings');
    const normPath = path.normalize(filePath);
    const normAllowed = path.normalize(allowedDir);

    if (!normPath.startsWith(normAllowed)) {
      throw new Error(`PathNotAllowedException: Access denied: Path '${filePath}' is outside allowed directory '${allowedDir}'`);
    }

    return SpeechService.transcribeFileJson(normPath, prompt);
  }
}
