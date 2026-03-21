// Electron's main process APIs are accessible via process.atomBinding in older versions
// or via @electron/main internal bindings
console.log('electron version:', process.versions.electron);
console.log('process keys:', Object.keys(process).filter(function(k) {
  return k.indexOf('atom') !== -1 || k.indexOf('electron') !== -1 || k.indexOf('Binding') !== -1;
}).join(', '));

// Check internal bindings
['atomBinding', 'electronBinding', '_linkedBinding', 'internalBinding'].forEach(function(name) {
  console.log(name + ':', typeof process[name]);
});

// Try electronBinding 
if (process.electronBinding) {
  try {
    var e = process.electronBinding('app');
    console.log('electronBinding(app):', typeof e);
    console.log('app.getAppPath:', typeof e.getAppPath);
  } catch(err) {
    console.log('electronBinding(app) error:', err.message);
  }
}
process.exit(0);
