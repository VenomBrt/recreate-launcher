const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'assets');

function fetchRaw(file, outName) {
  const out = path.join(root, outName);
  try {
    const buf = execFileSync(
      'gh',
      ['api', `repos/VenomBrt/recreate-essencial-sync/contents/${file}`, '-H', 'Accept: application/vnd.github.raw'],
      { encoding: 'buffer' },
    );
    fs.writeFileSync(out, buf);
    console.log('saved', out, buf.length);
    return true;
  } catch (err) {
    console.warn(`fetch ${file}:`, err.message);
    return false;
  }
}

fetchRaw('log.txt', 'log.txt');
fetchRaw('launcher.txt', 'launcher.txt');
