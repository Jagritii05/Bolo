import { execFileSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';

const ASR_PORT = process.env.ASR_PORT || '7777';
const ASR_BASE = `http://127.0.0.1:${ASR_PORT}`;

function _executeTranscribePost(filePath, prompt) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Audio file not found: ${filePath}`);
  }
  const safePrompt = prompt || '';
  const args = ['-s', '-X', 'POST', `${ASR_BASE}/transcribe`, '--data-binary', `@${filePath}`];
  if (safePrompt) {
    args.push('-H', `X-Prompt: ${safePrompt}`);
  }
  const out = execFileSync('curl.exe', args, {
    encoding: 'utf-8',
    timeout: 60000,
    windowsHide: true,
  });
  return out;
}

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
        { timeout: 60000, windowsHide: true }
      );
      return true;
    } catch (_) {
      return false;
    }
  }

  static transcribeFileJson(filePath, prompt) {
    return SpeechService.TranscribeFileJson(filePath, prompt);
  }

  static transcribeBytesJson(audioBase64, prompt) {
    const safePrompt = prompt || '';
    const buffer = Buffer.from(audioBase64, 'base64');
    const tmpPath = path.join(os.tmpdir(), `lp_audio_${Date.now()}.webm`);
    try {
      fs.writeFileSync(tmpPath, buffer);
      return _executeTranscribePost(tmpPath, safePrompt);
    } finally {
      if (fs.existsSync(tmpPath)) {
        try {
          fs.unlinkSync(tmpPath);
        } catch (_) {}
      }
    }
  }

  // Transcribe audio file inside allowed directory
  static TranscribeFileJson(filePath, prompt) {
    const safePrompt = prompt || '';
    if (!filePath || typeof filePath !== 'string' || !filePath.trim()) {
      throw new Error('InvalidPathException: File path must be a non-empty string.');
    }

    const trimmedPath = filePath.trim();

    // 1. Allowed file extension validation
    const ext = path.extname(trimmedPath).toLowerCase();
    const allowedExts = ['.wav', '.mp3', '.m4a', '.webm', '.ogg', '.flac'];
    if (!allowedExts.includes(ext)) {
      throw new Error(`InvalidAudioException: Unsupported file format '${ext}'. Allowed formats: ${allowedExts.join(', ')}`);
    }

    // 2. Resolve allowed boundary directory
    const userProfile = process.env.USERPROFILE || os.homedir();
    const rawAllowed = path.resolve(process.env.MCP_ALLOWED_DIR || path.join(userProfile, 'LocalPillRecordings'));
    if (!fs.existsSync(rawAllowed)) {
      try {
        fs.mkdirSync(rawAllowed, { recursive: true });
      } catch (_) {}
    }
    const canonicalAllowed = fs.existsSync(rawAllowed) ? fs.realpathSync(rawAllowed) : rawAllowed;

    // 3. File existence verification
    const resolvedPath = path.resolve(trimmedPath);
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`FileNotFoundException: Audio file not found: ${trimmedPath}`);
    }

    // 4. Resolve canonical realpath (expands symlinks, junctions, and traversal)
    let canonicalFile;
    try {
      canonicalFile = fs.realpathSync(resolvedPath);
    } catch (err) {
      throw new Error(`InvalidPathException: Failed to resolve path '${trimmedPath}': ${err.message}`);
    }

    // 5. Path containment check
    const normFile = path.normalize(canonicalFile).toLowerCase();
    const normAllowed = path.normalize(canonicalAllowed).toLowerCase();
    const allowedPrefix = normAllowed.endsWith(path.sep) ? normAllowed : normAllowed + path.sep;

    if (!normFile.startsWith(allowedPrefix) && normFile !== normAllowed) {
      throw new Error(`PathNotAllowedException: Access denied: Path '${trimmedPath}' (resolves to '${canonicalFile}') is outside allowed directory '${rawAllowed}'`);
    }

    // 6. File size verification
    const stats = fs.statSync(canonicalFile);
    if (stats.size === 0) {
      throw new Error(`InvalidAudioException: Audio file is empty (0 bytes): ${trimmedPath}`);
    }
    const MAX_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB
    if (stats.size > MAX_SIZE_BYTES) {
      throw new Error(`AudioTooLongException: Audio file exceeds maximum allowed size of 50 MB: ${trimmedPath} (${stats.size} bytes)`);
    }

    return _executeTranscribePost(canonicalFile, safePrompt);
  }
}
