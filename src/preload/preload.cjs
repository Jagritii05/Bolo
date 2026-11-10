const { contextBridge, ipcRenderer } = require('electron');

const api = {
  // Session state updates
  onSessionStateChanged: (callback) => {
    ipcRenderer.on('session:state-changed', (_event, data) => callback(data));
  },

  // Actions
  triggerHotkey: () => ipcRenderer.invoke('session:trigger-hotkey'),
  submitAudio: (audioBuffer) => ipcRenderer.invoke('session:submit-audio', audioBuffer),
  cancelSession: () => ipcRenderer.send('session:cancel'),
  replayAudio: () => ipcRenderer.invoke('session:replay-audio'),
  copyText: (text) => ipcRenderer.send('session:copy-text', text),
  setLanguage: (lang) => ipcRenderer.invoke('pill:set-language', lang),
  setMode: (mode) => ipcRenderer.invoke('pill:set-mode', mode),
  pasteText: (text) => ipcRenderer.invoke('session:paste-text', text),
  toggleMute: () => ipcRenderer.invoke('pill:toggle-mute'),
  getState: () => ipcRenderer.invoke('session:get-state'),

  // Window management
  hidePill: () => ipcRenderer.send('pill:hide'),
  setPillHeight: (h) => ipcRenderer.send('pill:set-height', h),
  setPillSize: (w, h) => ipcRenderer.send('pill:set-size', { width: w, height: h }),
  openSettings: () => ipcRenderer.send('pill:open-settings'),

  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get-all'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
};

contextBridge.exposeInMainWorld('bolo', api);
contextBridge.exposeInMainWorld('localPill', api);
