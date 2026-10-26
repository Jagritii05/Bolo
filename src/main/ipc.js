import { ipcMain, shell } from 'electron';
import { getSpeechClient } from './speech-client.js';
import { getTextClient } from './text-client.js';
import { pasteTextToActiveWindow } from './paste.js';
import { settingsStore } from './settings-store.js';
import { logger } from './logger.js';
import { translateError } from './graft/adapter.js';

export function registerIpcHandlers({ getPillWindow, openSettingsWindow }) {
  // Check backend health
  ipcMain.handle('speech:health', async () => {
    try {
      const client = getSpeechClient();
      return await client.isReady();
    } catch (err) {
      const trans = translateError(err);
      return { ready: false, error: trans.message, kind: trans.kind };
    }
  });

  // Audio transcription flow with auto-retry and Section 6.5 error mapping
  ipcMain.handle('speech:transcribe', async (_event, audioData) => {
    try {
      if (!audioData || audioData.length < 800) {
        return {
          success: false,
          error: "Didn't catch any audio. Try again.",
          kind: 'INVALID_AUDIO',
        };
      }

      const buffer = Buffer.isBuffer(audioData) ? audioData : Buffer.from(audioData);
      logger.info(`Received audio data for transcription (${buffer.length} bytes).`);

      const speechClient = getSpeechClient();
      let rawResult = null;

      try {
        rawResult = await speechClient.transcribe(buffer);
      } catch (err) {
        const trans = translateError(err);
        logger.warn(`Speech transcription failed (Attempt 1): [${trans.kind}] ${trans.message}`);

        // One auto-retry on Gateway death or socket drop
        if (trans.kind === 'GATEWAY_DIED' || trans.kind === 'GATEWAY_NOT_READY') {
          logger.info('[Supervisor] Gateway died or restarting. Waiting 1.5s for auto-restart retry...');
          await new Promise((r) => setTimeout(r, 1500));
          try {
            rawResult = await speechClient.transcribe(buffer);
            logger.info('[Supervisor] Auto-retry succeeded after gateway restart!');
          } catch (retryErr) {
            const retryTrans = translateError(retryErr);
            return {
              success: false,
              error: 'Service restarted, please retry.',
              kind: 'GATEWAY_DIED',
            };
          }
        } else if (trans.kind === 'ENGINE_UNAVAILABLE') {
          const fallback = trans.fallback || 'whisper-base';
          logger.info(`[Supervisor] Engine unavailable. Attempting auto-fallback to ${fallback}...`);
          try {
            await speechClient.setEngine(fallback);
            rawResult = await speechClient.transcribe(buffer);
          } catch (fbErr) {
            return {
              success: false,
              error: trans.message,
              kind: trans.kind,
            };
          }
        } else {
          return {
            success: false,
            error: trans.message,
            kind: trans.kind,
          };
        }
      }

      logger.info(`Raw speech transcription complete: "${rawResult?.text || ''}"`);

      if (!rawResult || !rawResult.text || !rawResult.text.trim()) {
        return {
          success: true,
          text: '',
          rawText: '',
          message: "Didn't catch any audio. Try again.",
          duration: rawResult?.duration || 0,
          words: [],
          maskedCount: 0,
        };
      }

      // Run through text pipeline
      let cleanText = rawResult.text;
      try {
        const textClient = getTextClient();
        cleanText = await textClient.process(rawResult.text);
      } catch (pipeErr) {
        const trans = translateError(pipeErr);
        logger.warn(`Text pipeline failed: [${trans.kind}] ${trans.message}`);
        cleanText = rawResult.text;
      }

      logger.logTranscript(cleanText);

      // Count masked items
      const maskMatches = cleanText.match(/\[[A-Z0-9_-]+-MASKED\]/g);
      const maskedCount = maskMatches ? maskMatches.length : 0;

      // Auto paste into active window
      let pasteResult = { success: true, pasted: true };
      if (cleanText) {
        pasteResult = await pasteTextToActiveWindow(cleanText);
      }

      return {
        success: true,
        text: cleanText,
        rawText: rawResult.text,
        duration: rawResult.duration,
        words: rawResult.words,
        pasted: pasteResult.pasted,
        warning: pasteResult.reason === 'ELEVATED_WINDOW' ? pasteResult.message : null,
        maskedCount,
      };
    } catch (err) {
      const trans = translateError(err);
      logger.error(`Transcription pipeline unexpected error: [${trans.kind}] ${trans.message}`);
      return {
        success: false,
        error: trans.message,
        kind: trans.kind,
      };
    }
  });

  // Manual paste request
  ipcMain.on('pill:paste', async (_event, text) => {
    await pasteTextToActiveWindow(text);
  });

  // Open Windows microphone privacy settings
  ipcMain.on('pill:open-mic-settings', () => {
    shell.openExternal('ms-settings:privacy-microphone').catch(() => {});
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
