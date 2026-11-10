import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

// Load .env file if present
export function loadEnv() {
  const envPath = path.join(PROJECT_ROOT, '.env');
  if (fs.existsSync(envPath)) {
    try {
      const content = fs.readFileSync(envPath, 'utf-8');
      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx !== -1) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (key && !process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    } catch (_) {}
  }
}
loadEnv();

const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
const SETTINGS_DIR = path.join(appData, 'Bolo');
const SETTINGS_FILE = path.join(SETTINGS_DIR, 'settings.json');
const LEGACY_SETTINGS_FILE = path.join(appData, 'LocalPill', 'settings.json');

const DEFAULT_SETTINGS = {
  hotkey: 'CommandOrControl+Shift+Space',
  language: process.env.DEFAULT_LANGUAGE || 'hi-IN',
  mode: 'explain',
  llmProvider: process.env.LLM_PROVIDER || 'groq',
  gnaniApiKey: process.env.GNANI_API_KEY || '',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  groqApiKey: process.env.GROQ_API_KEY || '',
  geminiModel: 'gemini-3-flash-preview',
  followUpTimeoutSec: 30,
  isMuted: false,
  debug: process.env.DEBUG === 'true' || false,
};

class SettingsStore {
  constructor() {
    this.settings = { ...DEFAULT_SETTINGS };
    this.load();
  }

  load() {
    try {
      if (!fs.existsSync(SETTINGS_DIR)) {
        fs.mkdirSync(SETTINGS_DIR, { recursive: true });
      }

      // Check primary Bolo settings, or fallback to legacy LocalPill settings
      let targetFile = SETTINGS_FILE;
      if (!fs.existsSync(targetFile) && fs.existsSync(LEGACY_SETTINGS_FILE)) {
        targetFile = LEGACY_SETTINGS_FILE;
      }

      if (fs.existsSync(targetFile)) {
        const raw = fs.readFileSync(targetFile, 'utf-8');
        const parsed = JSON.parse(raw);
        this.settings = {
          ...DEFAULT_SETTINGS,
          ...parsed,
        };
        // Fallback to environment variables if not configured in settings.json
        if (!this.settings.gnaniApiKey && process.env.GNANI_API_KEY) {
          this.settings.gnaniApiKey = process.env.GNANI_API_KEY;
        }
        if (!this.settings.geminiApiKey && process.env.GEMINI_API_KEY) {
          this.settings.geminiApiKey = process.env.GEMINI_API_KEY;
        }
        if (!this.settings.groqApiKey && process.env.GROQ_API_KEY) {
          this.settings.groqApiKey = process.env.GROQ_API_KEY;
        }
        this.save();
      } else {
        this.save();
      }
    } catch (err) {
      console.error('[Settings] Error loading settings:', err.message);
      this.settings = { ...DEFAULT_SETTINGS };
    }
  }

  save() {
    try {
      if (!fs.existsSync(SETTINGS_DIR)) {
        fs.mkdirSync(SETTINGS_DIR, { recursive: true });
      }
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(this.settings, null, 2), 'utf-8');
    } catch (err) {
      console.error('[Settings] Error saving settings:', err.message);
    }
  }

  get(key) {
    return this.settings[key];
  }

  set(key, value) {
    this.settings[key] = value;
    this.save();
  }

  getAll() {
    return { ...this.settings };
  }

  getSettingsPath() {
    return SETTINGS_FILE;
  }
}

export const settingsStore = new SettingsStore();
