import fs from 'fs';
import path from 'path';
import os from 'os';

const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
const SETTINGS_DIR = path.join(appData, 'LocalPill');
const SETTINGS_FILE = path.join(SETTINGS_DIR, 'settings.json');

const DEFAULT_SETTINGS = {
  hotkey: 'CommandOrControl+Shift+Space',
  engine: 'whisper-base',
  transport: process.env.TRANSPORT || 'rest', // 'rest' for baseline, 'graft' for graftcode
  groqApiKey: process.env.GROQ_API_KEY || '',
  logTranscripts: false,
  textPipeline: {
    fillerRemoval: true,
    spokenPunctuation: true,
    casing: true,
    maskSensitiveData: true,
    maskCard: true,
    maskAadhaar: true,
    maskPan: true,
    maskApiKey: true,
    maskEmail: false,
    maskPhone: false
  },
  snippets: {
    ':email': 'my.email@example.com',
    ':shrug': '¯\\_(ツ)_/¯'
  }
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
      if (fs.existsSync(SETTINGS_FILE)) {
        const raw = fs.readFileSync(SETTINGS_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        this.settings = {
          ...DEFAULT_SETTINGS,
          ...parsed,
          textPipeline: {
            ...DEFAULT_SETTINGS.textPipeline,
            ...(parsed.textPipeline || {})
          },
          snippets: {
            ...DEFAULT_SETTINGS.snippets,
            ...(parsed.snippets || {})
          }
        };
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
