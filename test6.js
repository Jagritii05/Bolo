// Find all available require-able modules in Electron binary
console.log('electron version:', process.versions.electron);
console.log('process.type:', process.type);

// Look at what's loaded
var knownElectronBuiltins = [
  'electron', 'electron/main', 
  'app', 'ipcMain', 'BrowserWindow',
  'electron:app', 'electron:ipcMain',
];

// Check builtin modules list
if (process.binding) {
  try {
    var binding = process.binding('config');
    console.log('config binding keys:', Object.keys(binding).slice(0,5).join(','));
  } catch(e) {}
}

// Look for native modules
if (Module && Module.builtinModules) {
  var builtins = require('module').builtinModules;
  var electronBuiltins = builtins.filter(function(m) { return m.indexOf('electron') !== -1; });
  console.log('electron builtins:', electronBuiltins.join(', '));
}
process.exit(0);
