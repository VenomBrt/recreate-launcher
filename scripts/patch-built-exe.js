/**
 * Após o electron-builder, força ícone/nome Recreate no .exe empacotado.
 */
const path = require('path');
const fs = require('fs');

async function patchBuiltExe() {
  if (process.platform !== 'win32') return;

  const targets = [
    path.join(__dirname, '..', 'dist', 'win-unpacked', 'Recreate.exe'),
  ];
  const iconPath = path.join(__dirname, '..', 'assets', 'icon.ico');
  if (!fs.existsSync(iconPath)) {
    console.warn('[patch-built-exe] icon.ico ausente');
    return;
  }

  const rcedit = require('rcedit');
  const opts = {
    icon: iconPath,
    'product-name': 'Recreate',
    'file-description': 'Recreate — Launcher Multiversal',
    'company-name': 'Recreate Studios',
    'internal-name': 'Recreate',
    'original-filename': 'Recreate.exe',
    'version-string': {
      ProductName: 'Recreate',
      FileDescription: 'Recreate — Launcher Multiversal',
      CompanyName: 'Recreate Studios',
      InternalName: 'Recreate',
      OriginalFilename: 'Recreate.exe',
      LegalCopyright: 'Copyright © Recreate Studios',
      ProductVersion: '1.0.0',
      FileVersion: '1.0.0',
    },
  };

  for (const exe of targets) {
    if (!fs.existsSync(exe)) continue;
    await rcedit(exe, opts);
    console.log('[patch-built-exe] OK', exe);
  }
}

if (require.main === module) {
  patchBuiltExe().catch((e) => {
    console.warn(e.message);
    process.exit(1);
  });
}

module.exports = { patchBuiltExe };
