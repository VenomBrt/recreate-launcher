const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSync } = require('child_process');

function getDesktopPath() {
  try {
    const result = execSync(
      'powershell -NoProfile -Command "[Environment]::GetFolderPath(\'Desktop\')"',
      { encoding: 'utf8' }
    ).trim();
    if (result && fs.existsSync(result)) return result;
  } catch {}
  return path.join(os.homedir(), 'Desktop');
}

function ensureDesktopShortcut() {
  if (process.platform !== 'win32') return;
  try {
    const { createShortcut } = require('../scripts/create-shortcut');
    createShortcut();
  } catch (err) {
    console.warn('Não foi possível criar atalho na área de trabalho:', err.message);
  }
}

module.exports = { ensureDesktopShortcut };
