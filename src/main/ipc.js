import { ipcMain, clipboard, screen } from './electron-bridge.js';
import { settingsStore } from './settings-store.js';
import { sessionCoordinator } from '../core/session.js';
import { pasteTextToActiveWindow } from './paste.js';
import { logger } from './logger.js';

export function registerIpcHandlers({ getPillWindow, openSettingsWindow }) {
  function safeSendToPill(channel, data) {
    try {
      const pill = getPillWindow();
      if (
        pill &&
        !pill.isDestroyed() &&
        pill.webContents &&
        !pill.webContents.isDestroyed() &&
        !pill.webContents.isCrashed()
      ) {
        pill.webContents.send(channel, data);
      }
    } catch (err) {
      logger.warn(`[IPC] Safe send to pill failed: ${err.message}`);
    }
  }

  // Wire up state transitions from session coordinator to Pill UI
  sessionCoordinator.onStateChange = (stateData) => {
    safeSendToPill('session:state-changed', stateData);
  };

  // Get current state
  ipcMain.handle('session:get-state', () => {
    return {
      state: sessionCoordinator.getState(),
      mode: sessionCoordinator.getMode(),
      language: settingsStore.get('language') || 'hi-IN',
      isMuted: settingsStore.get('isMuted') || false,
    };
  });

  // Hotkey trigger from UI mic button or tray
  ipcMain.handle('session:trigger-hotkey', async () => {
    await sessionCoordinator.handleHotkey();
    return { success: true };
  });

  // Audio submission from renderer recording
  ipcMain.handle('session:submit-audio', async (_event, audioData) => {
    try {
      const buffer = audioData ? (Buffer.isBuffer(audioData) ? audioData : Buffer.from(audioData)) : null;
      await sessionCoordinator.processAudioInput(buffer);
      return { success: true };
    } catch (err) {
      logger.error(`[IPC] submit-audio failed: ${err.message}`);
      return { success: false, error: err.message };
    }
  });

  // Cancel in-flight session (e.g. Esc pressed)
  ipcMain.on('session:cancel', () => {
    sessionCoordinator.cancel();
  });

  // Replay last audio
  ipcMain.handle('session:replay-audio', () => {
    return sessionCoordinator.lastAnswer?.audioDataUri || null;
  });

  // Copy text to clipboard
  ipcMain.on('session:copy-text', (_event, text) => {
    if (text) {
      clipboard.writeText(text);
      logger.info(`[IPC] Text copied to clipboard (${text.length} chars).`);
    }
  });

  // Manually trigger paste at active window
  ipcMain.handle('session:paste-text', async (_event, text) => {
    return await pasteTextToActiveWindow(text);
  });

  // Mode change from UI dropdown
  ipcMain.handle('pill:set-mode', (_event, mode) => {
    sessionCoordinator.setMode(mode);
    return { success: true, mode };
  });

  // Language change from UI dropdown
  ipcMain.handle('pill:set-language', (_event, langCode) => {
    settingsStore.set('language', langCode);
    logger.info(`[IPC] Selected language updated to: ${langCode}`);
    return { success: true, language: langCode };
  });

  // Mute toggle from UI
  ipcMain.handle('pill:toggle-mute', () => {
    const current = settingsStore.get('isMuted') || false;
    const updated = !current;
    settingsStore.set('isMuted', updated);
    logger.info(`[IPC] Mute toggled: ${updated}`);
    return { isMuted: updated };
  });

  // Pill size adjustment
  ipcMain.on('pill:set-size', (_event, size) => {
    const win = getPillWindow();
    if (win && !win.isDestroyed()) {
      const primaryDisplay = screen.getPrimaryDisplay();
      const { width: screenW, height: screenH } = primaryDisplay.workAreaSize;
      const targetW = size?.width || 340;
      const targetH = Math.max(48, Math.min(size?.height || 50, 540));
      const targetX = Math.round((screenW - targetW) / 2);
      const targetY = screenH - targetH - 25;
      win.setBounds({
        x: targetX,
        y: targetY,
        width: targetW,
        height: targetH,
      });
    }
  });

  // Pill height adjustment
  ipcMain.on('pill:set-height', (_event, height) => {
    const win = getPillWindow();
    if (win && !win.isDestroyed()) {
      const primaryDisplay = screen.getPrimaryDisplay();
      const { height: screenH } = primaryDisplay.workAreaSize;
      const targetH = Math.max(48, Math.min(height || 50, 540));
      const targetY = screenH - targetH - 25;
      const bounds = win.getBounds();
      win.setBounds({
        x: bounds.x,
        y: targetY,
        width: bounds.width,
        height: targetH,
      });
    }
  });

  // Pill window hide
  ipcMain.on('pill:hide', () => {
    const win = getPillWindow();
    if (win && !win.isDestroyed()) {
      win.hide();
    }
  });

  // Open settings
  ipcMain.on('pill:open-settings', () => {
    if (openSettingsWindow) openSettingsWindow();
  });

  // Settings get/set
  ipcMain.handle('settings:get-all', () => {
    return settingsStore.getAll();
  });

  ipcMain.handle('settings:save', async (_event, newSettings) => {
    for (const [k, v] of Object.entries(newSettings)) {
      settingsStore.set(k, v);
    }
    if (newSettings.mode) {
      sessionCoordinator.setMode(newSettings.mode);
    }
    safeSendToPill('session:state-changed', {
      mode: sessionCoordinator.getMode(),
      languageChanged: settingsStore.get('language'),
      isMuted: settingsStore.get('isMuted'),
    });
    return settingsStore.getAll();
  });
}
