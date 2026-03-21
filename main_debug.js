var electron = require('electron');
console.log('process.type:', process.type);
console.log('typeof electron:', typeof electron);
console.log('electron keys:', Object.keys(electron || {}).join(', '));
console.log('ipcMain direct:', typeof electron.ipcMain);
var app2 = electron.app;
console.log('app2:', typeof app2);
if (app2) {
  app2.on('ready', function() { app2.quit(); });
} else {
  console.log('No app, exiting');
  process.exit(1);
}
