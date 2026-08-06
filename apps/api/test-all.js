const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else {
      if (file.endsWith('.js') && !file.includes('fix.js')) results.push(file);
    }
  });
  return results;
}

const files = walk('./dist');
console.log('Total files:', files.length);

for (const file of files) {
  console.log('Loading', file);
  try {
    require('./' + file);
  } catch (e) {
    console.log('Error in', file, e.message);
  }
}
console.log('DONE');
