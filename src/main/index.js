import electronPkg from 'electron';
const { app, BrowserWindow, screen } = electronPkg;
import path from 'path';
import { fileURLToPath } from 'url';
import { supervisor } from './supervisor.js';
import { registerGlobalShortcut, unregisterGlobalShortcut } from './shortcuts.js';
import { setupTray, destroyTray } from './tray.js';
import { registerIpcHandlers } from './ipc.js';
import { logger } from './logger.js';
import { settingsStore } from './settings-store.js';
import { startScreenshotWatcher, stopScreenshotWatcher } from './assistant/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

const PILL_WIDTH = 380;
const PILL_HEIGHT = 68;
const MARGIN_BOTTOM = 25;

let pillWindow = null;
let settingsWindow = null;
let isRecording = false;

function createPillWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenW, height: screenH } = primaryDisplay.workAreaSize;

  pillWindow = new BrowserWindow({
    width: PILL_WIDTH,
    height: PILL_HEIGHT,
    x: Math.round((screenW - PILL_WIDTH) / 2),
    y: screenH - PILL_HEIGHT - MARGIN_BOTTOM,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    movable: true,
    skipTaskbar: true,
    hasShadow: false,
    focusable: false,
    webPreferences: {
      preload: path.join(PROJECT_ROOT, 'src', 'preload', 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  pillWindow.loadFile(path.join(PROJECT_ROOT, 'src', 'renderer', 'pill', 'index.html'));

  pillWindow.on('closed', () => {
    pillWindow = null;
  });

  pillWindow.setAlwaysOnTop(true, 'screen-saver');
}

function createSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 600,
    height: 650,
    title: 'LocalPill Settings',
    resizable: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(PROJECT_ROOT, 'src', 'preload', 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  settingsWindow.loadFile(path.join(PROJECT_ROOT, 'src', 'renderer', 'settings', 'index.html'));

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

let lastToggleTime = 0;

function toggleRecording() {
  const now = Date.now();
  if (now - lastToggleTime < 350) {
    logger.info(`Ignored shortcut bounce (${now - lastToggleTime}ms since last toggle)`);
    return;
  }
  lastToggleTime = now;

  if (!pillWindow) {
    createPillWindow();
  }

  if (!pillWindow.isVisible()) {
    pillWindow.show();
  }

  isRecording = !isRecording;
  logger.info(`Shortcut toggled recording: ${isRecording}`);
  pillWindow.webContents.send('pill:toggle-recording', { recording: isRecording });
}

import os from 'os';
import fs from 'fs';
import { cleanOrphanedTempAudio } from './temp-cleaner.js';

// App lifecycle
app.whenReady().then(() => {
  logger.info('LocalPill starting up...');

  // 0. Clean any orphaned temporary audio files from prior sessions
  cleanOrphanedTempAudio();

  // Ensure MCP allowed directory exists
  const userProfile = process.env.USERPROFILE || os.homedir();
  const mcpAllowedDir = process.env.MCP_ALLOWED_DIR || path.join(userProfile, 'LocalPillRecordings');
  if (!fs.existsSync(mcpAllowedDir)) {
    try {
      fs.mkdirSync(mcpAllowedDir, { recursive: true });
    } catch (_) {}
  }

  // 1. Start Graftcode Gateways (Gateway A hosts Python SpeechService directly; Gateway B hosts Node.js TextPipelineService)
  supervisor.startGatewayA(8085, 8086);
  supervisor.startGatewayB(8095, 8096);

  // 3. Setup IPC
  registerIpcHandlers({
    getPillWindow: () => pillWindow,
    openSettingsWindow: createSettingsWindow,
  });

  // 4. Create Pill UI
  createPillWindow();

  // 5. Setup Tray
  setupTray({
    onTogglePill: () => {
      if (!pillWindow) {
        createPillWindow();
      } else if (pillWindow.isVisible()) {
        pillWindow.hide();
      } else {
        pillWindow.show();
      }
    },
    onOpenSettings: createSettingsWindow,
    onEngineChange: (engineId) => {
      logger.info(`Active engine changed via tray to: ${engineId}`);
      if (pillWindow) {
        pillWindow.webContents.send('engine:changed', engineId);
      }
    },
  });

  // 6. Register Global Shortcut
  registerGlobalShortcut(() => {
    toggleRecording();
  });

  // 7. Background readiness check & warm-up
  (async () => {
    try {
      const ready = await supervisor.waitForAllReady('graft', 25000);
      if (ready) {
        logger.info('All services reported ready. Initiating startup warm-up...');
        const { getSpeechClient } = await import('./speech-client.js');
        await supervisor.warmUp(getSpeechClient());
      }
    } catch (err) {
      logger.warn(`Startup warm-up non-fatal warning: ${err.message}`);
    }
  })();

  // 8. Start Screenshot Memory Watcher (if enabled)
  try {
    startScreenshotWatcher();
  } catch (memErr) {
    logger.warn(`Screenshot memory watcher failed to start: ${memErr.message}`);
  }

  logger.info('LocalPill initialization complete.');

  if (process.env.TEST_SMOKE === '1') {
    logger.info('TEST_SMOKE detected. Scheduled graceful exit in 2 seconds.');
    setTimeout(() => {
      app.quit();
    }, 2000);
  }
});

app.on('will-quit', () => {
  logger.info('LocalPill shutting down...');
  try {
    stopScreenshotWatcher();
  } catch (_) {}
  unregisterGlobalShortcut();
  destroyTray();
  supervisor.stopAll();
  cleanOrphanedTempAudio();
});

// Windows/Tray app: keep running when all windows are closed
app.on('window-all-closed', () => {});
