import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const electron = require('electron');

export const {
  app,
  BrowserWindow,
  screen,
  globalShortcut,
  Tray,
  Menu,
  nativeImage,
  clipboard,
  shell,
  ipcMain,
  desktopCapturer,
  session,
} = electron;

export default electron;

