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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

const PILL_WIDTH = 480;
const PILL_HEIGHT = 100;
const MARGIN_BOTTOM = 35;

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

function toggleRecording() {
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

// App lifecycle
app.whenReady().then(() => {
  logger.info('LocalPill starting up...');

  // 1. Start Python backend server
  supervisor.startRestServer(7777);

  // 2. Setup IPC
  registerIpcHandlers({
    getPillWindow: () => pillWindow,
    openSettingsWindow: createSettingsWindow,
  });

  // 3. Create Pill UI
  createPillWindow();

  // 4. Setup Tray
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

  // 5. Register Global Shortcut
  registerGlobalShortcut(() => {
    toggleRecording();
  });

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
  unregisterGlobalShortcut();
  destroyTray();
  supervisor.stopAll();
});

// Windows/Tray app: keep running when all windows are closed
app.on('window-all-closed', () => {});
