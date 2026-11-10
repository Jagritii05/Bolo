import { Tray, Menu, nativeImage, shell, app } from './electron-bridge.js';
import { logger } from './logger.js';
import { settingsStore } from './settings-store.js';

let tray = null;

function createDefaultTrayIcon() {
  const size = 16;
  const buffer = Buffer.alloc(size * size * 4);
  const radius = 6;
  const center = 7.5;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const dist = Math.sqrt((x - center) ** 2 + (y - center) ** 2);
      if (dist <= radius) {
        buffer[idx] = 99;     // R (indigo #6366f1)
        buffer[idx + 1] = 102; // G
        buffer[idx + 2] = 241; // B
        buffer[idx + 3] = 255; // A
      } else if (dist <= radius + 1) {
        const alpha = Math.max(0, Math.min(255, Math.round((1 - (dist - radius)) * 255)));
        buffer[idx] = 99;
        buffer[idx + 1] = 102;
        buffer[idx + 2] = 241;
        buffer[idx + 3] = alpha;
      } else {
        buffer[idx + 3] = 0;   // Transparent
      }
    }
  }

  return nativeImage.createFromBuffer(buffer, { width: size, height: size });
}

export function setupTray({ onTogglePill, onOpenSettings, onLanguageChange }) {
  const icon = createDefaultTrayIcon();
  tray = new Tray(icon);
  tray.setToolTip('Bolo - Multilingual Screen Explainer (Gnani AI)');

  function updateMenu() {
    const currentLang = settingsStore.get('language') || 'hi-IN';

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Show / Hide Pill',
        click: () => onTogglePill && onTogglePill(),
      },
      {
        label: 'Settings...',
        click: () => onOpenSettings && onOpenSettings(),
      },
      { type: 'separator' },
      {
        label: 'Language',
        submenu: [
          {
            label: 'Hindi / Hinglish (हिन्दी)',
            type: 'radio',
            checked: currentLang === 'hi-IN',
            click: () => {
              settingsStore.set('language', 'hi-IN');
              onLanguageChange && onLanguageChange('hi-IN');
              updateMenu();
            },
          },
          {
            label: 'Tamil (தமிழ்)',
            type: 'radio',
            checked: currentLang === 'ta-IN',
            click: () => {
              settingsStore.set('language', 'ta-IN');
              onLanguageChange && onLanguageChange('ta-IN');
              updateMenu();
            },
          },
          {
            label: 'Bengali (বাংলা)',
            type: 'radio',
            checked: currentLang === 'bn-IN',
            click: () => {
              settingsStore.set('language', 'bn-IN');
              onLanguageChange && onLanguageChange('bn-IN');
              updateMenu();
            },
          },
        ],
      },
      { type: 'separator' },
      {
        label: 'Open Logs Folder',
        click: () => shell.openPath(logger.getLogDir()),
      },
      {
        label: 'Open Settings File',
        click: () => shell.openPath(settingsStore.getSettingsPath()),
      },
      { type: 'separator' },
      {
        label: 'Quit Bolo',
        click: () => app.quit(),
      },
    ]);

    tray.setContextMenu(contextMenu);
  }

  tray.on('click', () => {
    if (onTogglePill) onTogglePill();
  });

  updateMenu();
  return tray;
}

export function destroyTray() {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}
