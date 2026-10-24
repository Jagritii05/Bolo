import { globalShortcut } from 'electron';
import { logger } from './logger.js';
import { settingsStore } from './settings-store.js';

let currentHotkey = null;

export function registerGlobalShortcut(onTrigger) {
  const hotkey = settingsStore.get('hotkey') || 'CommandOrControl+Shift+Space';

  if (currentHotkey) {
    try {
      globalShortcut.unregister(currentHotkey);
    } catch (_) {}
  }

  const ok = globalShortcut.register(hotkey, () => {
    logger.info(`Global hotkey [${hotkey}] pressed.`);
    if (typeof onTrigger === 'function') {
      onTrigger();
    }
  });

  if (!ok) {
    logger.error(`Failed to register global hotkey [${hotkey}]. It might be registered by another app.`);
    currentHotkey = null;
    return false;
  }

  currentHotkey = hotkey;
  logger.info(`Global hotkey [${hotkey}] successfully registered.`);
  return true;
}

export function unregisterGlobalShortcut() {
  if (currentHotkey) {
    try {
      globalShortcut.unregister(currentHotkey);
    } catch (_) {}
    currentHotkey = null;
  }
}
