import electronPkg from 'electron/main';
const { app, BrowserWindow, globalShortcut, ipcMain, screen, clipboard } = electronPkg;
import { spawn, execFile } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import ffmpegPath from 'ffmpeg-static';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PILL_WIDTH = 480;
const PILL_HEIGHT = 96;
const MARGIN_BOTTOM = 30;
const ASR_PORT = 7777;
const SHORTCUT = 'Shift+X';

let mainWindow = null;
let pythonProcess = null;
let isRecording = false;

function startPythonServer() {
  const venvPython = path.join(__dirname, '.venv', 'bin', 'python3');
  const serverScript = path.join(__dirname, 'asr_server.py');
  const pythonBin = fs.existsSync(venvPython) ? venvPython : 'python3';

  console.log('[Main] Starting Python ASR server with: ' + pythonBin);

  pythonProcess = spawn(pythonBin, [serverScript], {
    cwd: __dirname,
    env: { ...process.env, ASR_PORT: String(ASR_PORT), FFMPEG_PATH: ffmpegPath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  pythonProcess.stdout.on('data', (data) => process.stdout.write('[Python] ' + data));
  pythonProcess.stderr.on('data', (data) => process.stderr.write('[Python] ' + data));
  pythonProcess.on('close', (code) => console.log('[Main] Python exited with code ' + code));
  pythonProcess.on('error', (err) => console.error('[Main] Python failed: ' + err.message));
}

function createPillWindow() {
  const { width: screenW, height: screenH } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
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
    focusable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile('index.html');

  mainWindow.webContents.on('render-process-gone', (event, details) => {
    console.error('[Main] Renderer Process Gone!', details.reason, details.exitCode);
  });
  
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
  mainWindow.setAlwaysOnTop(true, 'screen-saver');
}

function registerShortcut() {
  const ok = globalShortcut.register(SHORTCUT, () => {
    if (!mainWindow) return;

    if (!mainWindow.isVisible()) {
      mainWindow.show();
    }

    if (isRecording) {
      isRecording = false;
      mainWindow.webContents.send('toggle', { recording: false });
    } else {
      isRecording = true;
      mainWindow.webContents.send('toggle', { recording: true });
    }
  });

  if (!ok) {
    console.error('[Main] Failed to register shortcut ' + SHORTCUT);
  } else {
    console.log('[Main] Shortcut ' + SHORTCUT + ' registered.');
  }
}

// IPC handlers
ipcMain.on('hide-window', () => { if (mainWindow) mainWindow.hide(); });
ipcMain.on('recording-done', () => { isRecording = false; });
ipcMain.on('paste-text', (event, text) => {
  if (text) {
    clipboard.writeText(text);
    console.log('[Main] Text written to clipboard, length:', text.length);
  }

  // Small delay so the clipboard write lands before we trigger Cmd+V
  setTimeout(() => {
    execFile('osascript', ['-e', 'tell application "System Events" to keystroke "v" using command down'], (err, stdout, stderr) => {
      if (err) {
        console.error('[Main] Paste script failed:', err.message, stderr);
      } else {
        console.log('[Main] Paste triggered successfully');
      }
    });
  }, 150);
});

// App lifecycle
app.whenReady().then(() => {
  if (process.platform === 'darwin' && app.dock) {
    app.dock.hide();
  }
  startPythonServer();
  createPillWindow();
  registerShortcut();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (pythonProcess) pythonProcess.kill('SIGTERM');
});

// Keep app alive — overlay/pill app, never quit on window close
app.on('window-all-closed', () => {});
