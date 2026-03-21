// Test what's available without requiring 'electron' npm package
console.log('process.type:', process.type);
console.log('process.versions.electron:', process.versions.electron);

// The electron module built-in should be accessible differently
// In Electron main process, electron module IS available as a built-in
// but only if we avoid the local node_modules/electron resolution

// Check if we can load it from Electron's internal path  
var Module = require('module');
var orig = Module._resolveFilename;

// Try to load from built-in
try {
  // Force built-in resolution by deleting local cache
  delete require.cache[require.resolve('electron')];
  var e = require('electron');
  console.log('typeof electron after cache clear:', typeof e);
  console.log('electron.app:', typeof e.app);
} catch(err) {
  console.log('Error:', err.message);
}

process.exit(0);
