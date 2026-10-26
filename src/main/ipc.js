import { ipcMain } from 'electron';
import { getSpeechClient } from './speech-client.js';
import { getTextClient } from './text-client.js';
import { pasteTextToActiveWindow } from './paste.js';
import { settingsStore } from './settings-store.js';
import { logger } from './logger.js';

export function registerIpcHandlers({ getPillWindow, openSettingsWindow }) {
  // Check backend health
  ipcMain.handle('speech:health', async () => {
    try {
      const client = getSpeechClient();
      return await client.isReady();
    } catch (err) {
      return { ready: false, error: err.message };
    }
  });

  // Audio transcription flow
  ipcMain.handle('speech:transcribe', async (_event, audioData) => {
    try {
      const buffer = Buffer.isBuffer(audioData) ? audioData : Buffer.from(audioData);
      logger.info(`Received audio data for transcription (${buffer.length} bytes).`);

      const speechClient = getSpeechClient();
      const rawResult = await speechClient.transcribe(buffer);
      logger.info(`Raw speech transcription complete: "${rawResult.text || ''}"`);

      // Run through text pipeline
      const textClient = getTextClient();
      const cleanText = await textClient.process(rawResult.text);
      logger.logTranscript(cleanText);

      // Auto paste into active window
      if (cleanText) {
        pasteTextToActiveWindow(cleanText);
      }

      return {
        success: true,
        text: cleanText,
        rawText: rawResult.text,
        duration: rawResult.duration,
        words: rawResult.words,
      };
    } catch (err) {
      logger.error(`Transcription pipeline error: ${err.message}`);
      return {
        success: false,
        error: err.message,
      };
    }
  });

  // Manual paste request
  ipcMain.on('pill:paste', (_event, text) => {
    pasteTextToActiveWindow(text);
  });

  // Window visibility
  ipcMain.on('pill:hide', () => {
    const win = getPillWindow();
    if (win) win.hide();
  });

  // Open settings
  ipcMain.on('pill:open-settings', () => {
    if (openSettingsWindow) openSettingsWindow();
  });

  // Settings get/set
  ipcMain.handle('settings:get-all', () => {
    return settingsStore.getAll();
  });

  ipcMain.handle('settings:save', (_event, newSettings) => {
    for (const [k, v] of Object.entries(newSettings)) {
      settingsStore.set(k, v);
    }
    return settingsStore.getAll();
  });
}
