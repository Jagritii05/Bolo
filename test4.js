console.log('process.versions.electron:', process.versions.electron);
var e = require('electron');
console.log('electron type:', typeof e);
console.log('app:', typeof e.app);
console.log('ipcMain:', typeof e.ipcMain);
console.log('BrowserWindow:', typeof e.BrowserWindow);
console.log('screen:', typeof e.screen);
console.log('globalShortcut:', typeof e.globalShortcut);
if (e.app) {
  e.app.on('ready', function() {
    console.log('APP IS READY!');
    e.app.quit();
  });
  console.log('Waiting for ready...');
} else {
  console.log('No app available');
  process.exit(1);
}
