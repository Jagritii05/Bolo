const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('localPill', {
  // Event listeners
  onToggleRecording: (callback) => {
    ipcRenderer.on('pill:toggle-recording', (_event, data) => callback(data));
  },
  onEngineChanged: (callback) => {
    ipcRenderer.on('engine:changed', (_event, engineId) => callback(engineId));
  },

  // Actions
  checkHealth: () => ipcRenderer.invoke('speech:health'),
  transcribeAudio: (audioBuffer) => ipcRenderer.invoke('speech:transcribe', audioBuffer),
  hidePill: () => ipcRenderer.send('pill:hide'),
  openSettings: () => ipcRenderer.send('pill:open-settings'),
  openMicSettings: () => ipcRenderer.send('pill:open-mic-settings'),
  pasteText: (text) => ipcRenderer.send('pill:paste', text),

  listEngines: () => ipcRenderer.invoke('speech:list-engines'),
  setEngine: (id) => ipcRenderer.invoke('speech:set-engine', id),

  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get-all'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),

  // MCP Integration
  getMcpInfo: () => ipcRenderer.invoke('mcp:get-info'),
  openMcpAllowedDir: () => ipcRenderer.invoke('mcp:open-allowed-dir'),
});

// Legacy backward-compatibility adapter
contextBridge.exposeInMainWorld('electronAPI', {
  onToggle: (callback) => {
    ipcRenderer.on('pill:toggle-recording', (_event, data) => callback(data));
  },
  hideWindow: () => ipcRenderer.send('pill:hide'),
  recordingDone: () => {},
  pasteText: (text) => ipcRenderer.send('pill:paste', text),
});
