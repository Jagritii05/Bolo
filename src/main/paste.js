import { clipboard } from 'electron';
import { execFile } from 'child_process';
import { logger } from './logger.js';

/**
 * Injects text into the currently active window by:
 * 1. Copying text to the system clipboard
 * 2. Simulating Ctrl+V keystroke (or Cmd+V on macOS)
 */
export function pasteTextToActiveWindow(text) {
  if (!text || typeof text !== 'string') return;

  try {
    clipboard.writeText(text);
    logger.info(`Text copied to clipboard (${text.length} chars). Triggering paste keystroke...`);

    // Give the clipboard 100ms to register across OS processes
    setTimeout(() => {
      if (process.platform === 'win32') {
        // Windows SendKeys via WScript.Shell (fast, reliable, zero native compilation required)
        const psScript = '$ws = New-Object -ComObject WScript.Shell; $ws.SendKeys("^v")';
        execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', psScript], { windowsHide: true }, (err) => {
          if (err) {
            logger.error(`Windows SendKeys paste failed: ${err.message}`);
          } else {
            logger.info('Windows paste keystroke sent successfully.');
          }
        });
      } else if (process.platform === 'darwin') {
        execFile('osascript', ['-e', 'tell application "System Events" to keystroke "v" using command down'], (err) => {
          if (err) {
            logger.error(`macOS osascript paste failed: ${err.message}`);
          } else {
            logger.info('macOS paste keystroke sent successfully.');
          }
        });
      } else {
        // Linux xdotool fallback
        execFile('xdotool', ['key', 'ctrl+v'], (err) => {
          if (err) logger.error(`Linux paste failed: ${err.message}`);
        });
      }
    }, 120);
  } catch (err) {
    logger.error(`Error in pasteTextToActiveWindow: ${err.message}`);
  }
}
