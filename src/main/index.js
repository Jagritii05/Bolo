import { app, BrowserWindow, screen, session } from './electron-bridge.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { registerGlobalShortcut, unregisterGlobalShortcut } from './shortcuts.js';
import { setupTray, destroyTray } from './tray.js';
import { registerIpcHandlers } from './ipc.js';
import { logger } from './logger.js';
import { sessionCoordinator } from '../core/session.js';
import { cleanOrphanedTempAudio } from './temp-cleaner.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

const PILL_WIDTH = 340;
const PILL_HEIGHT = 50;
const MARGIN_BOTTOM = 25;

let pillWindow = null;
let settingsWindow = null;

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
    focusable: true,
    webPreferences: {
      preload: path.join(PROJECT_ROOT, 'src', 'preload', 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  pillWindow.loadFile(path.join(PROJECT_ROOT, 'src', 'renderer', 'pill', 'index.html'));

  pillWindow.webContents.on('render-process-gone', (_event, details) => {
    logger.error(`[Pill] Render process gone: ${details.reason} (exitCode: ${details.exitCode})`);
    if (details.reason !== 'clean-exit') {
      setTimeout(() => {
        if (!pillWindow || pillWindow.isDestroyed()) {
          createPillWindow();
        }
      }, 500);
    }
  });

  pillWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (level >= 2) {
      logger.warn(`[Pill Renderer] ${message} (${path.basename(sourceId || '')}:${line})`);
    }
  });

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
    title: 'Bolo Settings - Gnani AI Edition',
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

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  logger.warn('Another instance of Bolo is already running. Quitting duplicate.');
  app.quit();
} else {
  app.on('second-instance', () => {
    if (pillWindow) {
      if (!pillWindow.isVisible()) pillWindow.show();
      pillWindow.focus();
    }
  });
}

// App lifecycle
app.whenReady().then(() => {
  logger.info('Bolo (Gnani AI Screen Explainer) starting up...');

  cleanOrphanedTempAudio();

  // Auto-approve mic permissions
  if (session && session.defaultSession) {
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
      if (permission === 'media') {
        callback(true);
      } else {
        callback(false);
      }
    });

    session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
      return permission === 'media';
    });
  }

  registerIpcHandlers({
    getPillWindow: () => pillWindow,
    openSettingsWindow: createSettingsWindow,
  });

  createPillWindow();

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
    onLanguageChange: (lang) => {
      logger.info(`Active language changed via tray to: ${lang}`);
      try {
        if (pillWindow && !pillWindow.isDestroyed() && pillWindow.webContents && !pillWindow.webContents.isDestroyed()) {
          pillWindow.webContents.send('session:state-changed', {
            state: sessionCoordinator.getState(),
            languageChanged: lang,
          });
        }
      } catch (err) {
        logger.warn(`Failed to notify pill window of language change: ${err.message}`);
      }
    },
  });

  registerGlobalShortcut(
    () => {
      if (!pillWindow || pillWindow.isDestroyed()) {
        createPillWindow();
      } else if (!pillWindow.isVisible()) {
        pillWindow.show();
      }
      sessionCoordinator.handleHotkey();
    },
    () => {
      sessionCoordinator.cancel();
    }
  );

  logger.info('Bolo ready.');

  if (process.env.TEST_SMOKE === '1') {
    logger.info('TEST_SMOKE detected. Scheduled graceful exit in 2 seconds.');
    setTimeout(() => {
      app.quit();
    }, 2000);
  }
});

app.on('will-quit', () => {
  logger.info('Bolo shutting down...');
  unregisterGlobalShortcut();
  destroyTray();
  cleanOrphanedTempAudio();
});

app.on('window-all-closed', () => {});
