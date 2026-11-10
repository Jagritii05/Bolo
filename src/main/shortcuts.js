import { globalShortcut } from './electron-bridge.js';
import { logger } from './logger.js';
import { settingsStore } from './settings-store.js';

let currentHotkey = null;

export function registerGlobalShortcut(onTrigger, onCancel) {
  const hotkey = settingsStore.get('hotkey') || 'CommandOrControl+Shift+Space';

  if (currentHotkey) {
    try {
      globalShortcut.unregister(currentHotkey);
    } catch (_) {}
  }

  // Register main action hotkey
  const ok = globalShortcut.register(hotkey, () => {
    logger.info(`Global hotkey [${hotkey}] pressed.`);
    if (typeof onTrigger === 'function') {
      onTrigger();
    }
  });

  if (!ok) {
    logger.error(`Failed to register global hotkey [${hotkey}].`);
    currentHotkey = null;
  } else {
    currentHotkey = hotkey;
    logger.info(`Global hotkey [${hotkey}] successfully registered.`);
  }

  // Register Escape hotkey for clean cancellation
  try {
    globalShortcut.register('Escape', () => {
      if (typeof onCancel === 'function') {
        onCancel();
      }
    });
  } catch (_) {}

  return ok;
}

export function unregisterGlobalShortcut() {
  try {
    globalShortcut.unregisterAll();
  } catch (_) {}
  currentHotkey = null;
}
