// Granite Pill - Electron Main Process
const { app, BrowserWindow, globalShortcut, screen } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const PILL_WIDTH = 480;
const PILL_HEIGHT = 96;
const MARGIN_BOTTOM = 30;
const ASR_PORT = 7777;
const SHORTCUT = 'Shift+X';

let mainWindow = null;
let pythonProcess = null;
let isRecording = false;

function startPythonServer() {
  const scriptDir = __dirname;
  const venvPython = path.join(scriptDir, '.venv', 'bin', 'python3');
  const serverScript = path.join(scriptDir, 'asr_server.py');
  const pythonBin = fs.existsSync(venvPython) ? venvPython : 'python3';

  console.log('[Main] Starting Python ASR server with: ' + pythonBin);

  pythonProcess = spawn(pythonBin, [serverScript], {
    cwd: scriptDir,
    env: Object.assign({}, process.env, { ASR_PORT: String(ASR_PORT) }),
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  pythonProcess.stdout.on('data', function(data) {
    process.stdout.write('[Python] ' + data);
  });

  pythonProcess.stderr.on('data', function(data) {
    process.stderr.write('[Python] ' + data);
  });

  pythonProcess.on('close', function(code) {
    console.log('[Main] Python process exited with code ' + code);
  });

  pythonProcess.on('error', function(err) {
    console.error('[Main] Failed to start Python process: ' + err.message);
  });
}

function createPillWindow(ipcMain) {
  var display = screen.getPrimaryDisplay();
  var screenW = display.workAreaSize.width;
  var screenH = display.workAreaSize.height;

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
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile('index.html');
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
  mainWindow.setAlwaysOnTop(true, 'screen-saver');

  // Register IPC handlers here, after window is created
  ipcMain.on('hide-window', function() {
    if (mainWindow) mainWindow.hide();
  });

  ipcMain.on('recording-done', function() {
    isRecording = false;
  });
}

function registerShortcut(globalShortcut) {
  var ok = globalShortcut.register(SHORTCUT, function() {
    if (!mainWindow) return;

    if (!mainWindow.isVisible()) {
      mainWindow.show();
      isRecording = true;
      mainWindow.webContents.send('toggle', { recording: true });
    } else {
      if (isRecording) {
        isRecording = false;
        mainWindow.webContents.send('toggle', { recording: false });
      } else {
        mainWindow.webContents.send('toggle', { recording: false, hide: true });
        setTimeout(function() { if (mainWindow) mainWindow.hide(); }, 300);
      }
    }
  });

  if (!ok) {
    console.error('[Main] Failed to register shortcut ' + SHORTCUT);
  } else {
    console.log('[Main] Shortcut ' + SHORTCUT + ' registered.');
  }
}

app.whenReady().then(function() {
  // Re-require electron inside .then() to ensure we're in main process context
  var electronModule = require('electron');
  var ipcMain = electronModule.ipcMain;
  var globalShortcutRef = electronModule.globalShortcut || globalShortcut;

  console.log('[Main] process.type:', process.type);
  console.log('[Main] ipcMain available:', typeof ipcMain);

  if (process.platform === 'darwin' && app.dock) {
    app.dock.hide();
  }

  startPythonServer();
  createPillWindow(ipcMain);
  registerShortcut(globalShortcutRef);
});

app.on('will-quit', function() {
  globalShortcut.unregisterAll();
  if (pythonProcess) {
    pythonProcess.kill('SIGTERM');
  }
});

app.on('window-all-closed', function() {
  // Keep app alive - overlay app
});
