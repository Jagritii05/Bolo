console.log('electron version:', process.versions.electron);
var e = require('electron');
console.log('electron type:', typeof e);
console.log('electron keys if object:', typeof e === 'object' ? Object.keys(e).slice(0,10).join(',') : 'N/A');
process.exit(0);
