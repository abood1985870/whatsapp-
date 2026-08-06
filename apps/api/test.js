try {
  require('./dist/main.js');
} catch (e) {
  require('fs').writeFileSync('error.log', String(e.stack));
}
