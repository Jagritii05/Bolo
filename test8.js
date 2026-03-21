console.log('electron version:', process.versions.electron);
// _linkedBinding is the way to access Electron C++ bindings
['ElectronBrowserApp', 'electron_browser_app', 'app', 'electron', 
 'ElectronBrowserIpc', 'ipc', 'ipcMain',
 'ElectronBrowserWindow', 'BrowserWindow',
 'ElectronBrowserGlobalShortcut', 'global_shortcut',
 'ElectronBrowserScreen', 'screen',
 'electron_common_features', 'features'
].forEach(function(name) {
  try {
    var b = process._linkedBinding(name);
    console.log(name + ':', typeof b, b ? Object.keys(b).slice(0,3).join(',') : '');
  } catch(e) {
    // not found
  }
});
process.exit(0);
