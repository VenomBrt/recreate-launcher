/**
 * Força Recreate.exe com nome + ícone corretos (Task Manager / atalho / barra).
 */
const path = require('path');
const fs = require('fs');

async function prepareRecreateExe() {
  if (process.platform !== 'win32') return;

  const distDir = path.join(__dirname, '..', 'node_modules', 'electron', 'dist');
  const pathTxt = path.join(__dirname, '..', 'node_modules', 'electron', 'path.txt');
  const electronExe = path.join(distDir, 'electron.exe');
  const recreateExe = path.join(distDir, 'Recreate.exe');
  const iconPath = path.join(__dirname, '..', 'assets', 'icon.ico');

  if (!fs.existsSync(electronExe)) {
    console.warn('[prepare-recreate-exe] electron.exe não encontrado — rode npm install');
    return;
  }

  if (!fs.existsSync(iconPath)) {
    try {
      require('child_process').execSync('node scripts/generate-icons.js', {
        cwd: path.join(__dirname, '..'),
        stdio: 'inherit',
      });
    } catch (err) {
      console.warn('[prepare-recreate-exe] ícone:', err.message);
    }
  }

  // Sempre recria a partir do electron.exe para garantir ícone limpo
  try {
    if (fs.existsSync(recreateExe)) {
      try { fs.unlinkSync(recreateExe); } catch {}
    }
    fs.copyFileSync(electronExe, recreateExe);
  } catch (err) {
    console.warn('[prepare-recreate-exe] cópia falhou (app aberto?):', err.message);
    if (!fs.existsSync(recreateExe)) return;
  }

  try {
    const rcedit = require('rcedit');
    await rcedit(recreateExe, {
      icon: iconPath,
      'product-name': 'Recreate',
      'file-description': 'Recreate — Launcher Multiversal',
      'company-name': 'Recreate Studios',
      'internal-name': 'Recreate',
      'original-filename': 'Recreate.exe',
      'requested-execution-level': 'asInvoker',
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
    });
    // Também marca o electron.exe (evita fallback mostrando Electron)
    await rcedit(electronExe, {
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
      },
    });
    console.log('[prepare-recreate-exe] Ícone e nome aplicados');
  } catch (err) {
    console.warn('[prepare-recreate-exe] rcedit:', err.message);
  }

  fs.writeFileSync(pathTxt, 'Recreate.exe', 'utf8');
}

if (require.main === module) {
  prepareRecreateExe().catch((e) => {
    console.warn(e.message);
    process.exit(0);
  });
}

module.exports = { prepareRecreateExe };
