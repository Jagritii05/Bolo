console.log('process.versions.electron:', process.versions.electron);
try {
  var em = require('electron/main');
  console.log('electron/main keys:', Object.keys(em).join(', '));
  console.log('app:', typeof em.app);
} catch(e) {
  console.log('electron/main error:', e.message);
}
process.exit(0);
