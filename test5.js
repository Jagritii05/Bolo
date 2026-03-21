console.log('process.versions.electron:', process.versions.electron);
// Try using a native require that doesn't go through Node's module resolution
// In Electron, there's often an internal require
var grequire = global.require;
console.log('global.require:', typeof grequire);
if (grequire) {
  try {
    var e = grequire('electron');
    console.log('global.require(electron):', typeof e);
    console.log('keys:', e ? Object.keys(e).slice(0,5).join(',') : 'none');
    console.log('app:', typeof (e && e.app));
    console.log('ipcMain:', typeof (e && e.ipcMain));
    console.log('BrowserWindow:', typeof (e && e.BrowserWindow));
  } catch(er) {
    console.log('error:', er.message);
  }
}
process.exit(0);
