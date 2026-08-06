try {
  require('@qanoai/config');
  console.log("Config loaded ok!");
} catch (e) {
  require('fs').writeFileSync('config-err.txt', String(e.stack));
}
