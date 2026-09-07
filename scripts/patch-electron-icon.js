/**
 * OPCIONAL — só para dev local.
 * Modifica electron.exe; alguns antivírus podem alertar.
 * Para distribuir: use npm run build (ícone embutido no Recreate.exe, sem patch).
 */
const path = require('path');
const fs = require('fs');

async function patchElectronIcon() {
  if (process.platform !== 'win32') return;

  const electronExe = path.join(__dirname, '..', 'node_modules', 'electron', 'dist', 'electron.exe');
  const iconPath = path.join(__dirname, '..', 'assets', 'icon.ico');

  if (!fs.existsSync(electronExe)) {
    console.warn('[patch-electron-icon] electron.exe não encontrado — rode npm install');
    return;
  }
  if (!fs.existsSync(iconPath)) {
    console.warn('[patch-electron-icon] assets/icon.ico não encontrado — rode npm run icons');
    return;
  }

  console.warn('[patch-electron-icon] AVISO: isso altera o electron.exe local.');
  console.warn('  Para usuários finais, prefira: npm run build');

  try {
    const rcedit = require('rcedit');
    await rcedit(electronExe, {
      icon: iconPath,
      'product-name': 'Recreate',
      'file-description': 'Recreate Launcher',
    });
    console.log('[patch-electron-icon] Ícone aplicado (dev apenas)');
  } catch (err) {
    console.warn('[patch-electron-icon] Falha:', err.message);
  }
}

if (require.main === module) {
  patchElectronIcon();
}

module.exports = { patchElectronIcon };
