import { Tray, Menu, nativeImage, shell, app } from 'electron';
import path from 'path';
import { logger } from './logger.js';
import { settingsStore } from './settings-store.js';

let tray = null;

function createDefaultTrayIcon() {
  // 16x16 RGBA pill icon buffer (purple/blue gradient circle)
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
        // Antialiased border
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

export function setupTray({ onTogglePill, onOpenSettings, onEngineChange }) {
  const icon = createDefaultTrayIcon();
  tray = new Tray(icon);
  tray.setToolTip('LocalPill - Voice Layer for Windows');

  function updateMenu() {
    const currentEngine = settingsStore.get('engine');
    const currentTransport = settingsStore.get('transport');

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
        label: 'Speech Engine',
        submenu: [
          {
            label: 'Local Whisper (base)',
            type: 'radio',
            checked: currentEngine === 'whisper-base',
            click: () => {
              settingsStore.set('engine', 'whisper-base');
              onEngineChange && onEngineChange('whisper-base');
              updateMenu();
            }
          },
          {
            label: 'Local Whisper (tiny - fast)',
            type: 'radio',
            checked: currentEngine === 'whisper-tiny',
            click: () => {
              settingsStore.set('engine', 'whisper-tiny');
              onEngineChange && onEngineChange('whisper-tiny');
              updateMenu();
            }
          },
          {
            label: 'Local Whisper (small - accurate)',
            type: 'radio',
            checked: currentEngine === 'whisper-small',
            click: () => {
              settingsStore.set('engine', 'whisper-small');
              onEngineChange && onEngineChange('whisper-small');
              updateMenu();
            }
          },
          {
            label: 'Groq Whisper (Cloud)',
            type: 'radio',
            checked: currentEngine === 'groq-whisper',
            click: () => {
              settingsStore.set('engine', 'groq-whisper');
              onEngineChange && onEngineChange('groq-whisper');
              updateMenu();
            }
          }
        ]
      },
      {
        label: 'IPC Transport',
        submenu: [
          {
            label: 'Graftcode (Default)',
            type: 'radio',
            checked: currentTransport === 'graft',
            click: () => {
              settingsStore.set('transport', 'graft');
              updateMenu();
            }
          },
          {
            label: 'Legacy REST Baseline',
            type: 'radio',
            checked: currentTransport === 'rest',
            click: () => {
              settingsStore.set('transport', 'rest');
              updateMenu();
            }
          }
        ]
      },
      { type: 'separator' },
      {
        label: 'Open Logs Folder',
        click: () => shell.openPath(logger.getLogDir())
      },
      {
        label: 'Open Settings File',
        click: () => shell.openPath(settingsStore.getSettingsPath())
      },
      { type: 'separator' },
      {
        label: 'Quit LocalPill',
        click: () => app.quit()
      }
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
