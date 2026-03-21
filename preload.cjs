const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onToggle: (callback) => ipcRenderer.on('toggle', (_event, data) => callback(data)),
  hideWindow: () => ipcRenderer.send('hide-window'),
  recordingDone: () => ipcRenderer.send('recording-done'),
  pasteText: (text) => ipcRenderer.send('paste-text', text)
});
