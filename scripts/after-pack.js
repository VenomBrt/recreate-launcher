const path = require('path');
const fs = require('fs');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;

  const exe = path.join(context.appOutDir, 'Recreate.exe');
  const iconPath = path.join(__dirname, '..', 'assets', 'icon.ico');
  if (!fs.existsSync(exe) || !fs.existsSync(iconPath)) {
    console.warn('[afterPack] Recreate.exe ou icon.ico não encontrado');
    return;
  }

  const rcedit = require('rcedit');
  await rcedit(exe, {
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
      ProductVersion: context.packager.appInfo.version || '1.0.0',
      FileVersion: context.packager.appInfo.version || '1.0.0',
    },
  });
  console.log('[afterPack] Ícone/nome Recreate Studios aplicados em', exe);
};
