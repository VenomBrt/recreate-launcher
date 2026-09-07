const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const projectRoot = path.resolve(__dirname, '..');
const recreateExe = path.join(projectRoot, 'node_modules', 'electron', 'dist', 'Recreate.exe');
const electronExe = path.join(projectRoot, 'node_modules', 'electron', 'dist', 'electron.exe');
const launcherBat = path.join(projectRoot, 'Recreate.bat');
const iconPath = path.join(projectRoot, 'assets', 'icon.ico');

function getDesktopPath() {
  try {
    const result = execSync(
      'powershell -NoProfile -Command "[Environment]::GetFolderPath(\'Desktop\')"',
      { encoding: 'utf8' }
    ).trim();
    if (result && fs.existsSync(result)) return result;
  } catch {}

  const candidates = [
    path.join(os.homedir(), 'Desktop'),
    path.join(os.homedir(), 'OneDrive', 'Desktop'),
    path.join(os.homedir(), 'Área de Trabalho'),
  ];

  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir;
  }

  return path.join(os.homedir(), 'Desktop');
}

function ensureIcon() {
  if (fs.existsSync(iconPath)) return iconPath;
  const logo = path.join(projectRoot, 'assets', 'logo.jpg');
  if (fs.existsSync(logo)) {
    try {
      execSync(`node "${path.join(__dirname, 'generate-icons.js')}"`, {
        cwd: projectRoot,
        stdio: 'pipe',
      });
    } catch {}
  }
  return fs.existsSync(iconPath) ? iconPath : logo;
}

function createShortcut() {
  const desktop = getDesktopPath();
  const shortcutPath = path.join(desktop, 'Recreate.lnk');
  const icon = ensureIcon();

  // Preferir build local (sempre o código mais novo) > electron de desenvolvimento
  const unpackedExe = path.join(projectRoot, 'dist', 'win-unpacked', 'Recreate.exe');
  let target = unpackedExe;
  let args = '';
  let workDir = path.join(projectRoot, 'dist', 'win-unpacked');

  if (!fs.existsSync(target)) {
    target = recreateExe;
    args = '.';
    workDir = projectRoot;
  }
  if (!fs.existsSync(target)) {
    target = electronExe;
    args = '.';
    workDir = projectRoot;
  }
  if (!fs.existsSync(target) && fs.existsSync(launcherBat)) {
    target = launcherBat;
    args = '';
    workDir = projectRoot;
  }
  if (!fs.existsSync(target)) {
    console.error('Nenhum executável encontrado para o atalho.');
    process.exit(1);
  }

  const psScript = `
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut(${JSON.stringify(shortcutPath)})
$Shortcut.TargetPath = ${JSON.stringify(target)}
$Shortcut.Arguments = ${JSON.stringify(args)}
$Shortcut.WorkingDirectory = ${JSON.stringify(workDir)}
$Shortcut.IconLocation = ${JSON.stringify(`${icon},0`)}
$Shortcut.Description = 'Recreate'
$Shortcut.WindowStyle = 1
$Shortcut.Save()
Write-Output "OK"
`;

  const scriptFile = path.join(os.tmpdir(), `recreate-shortcut-${Date.now()}.ps1`);
  fs.writeFileSync(scriptFile, psScript, 'utf8');

  try {
    execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptFile}"`, {
      encoding: 'utf8',
    });
    console.log('Atalho:', shortcutPath);
    console.log('Alvo:', target, args);
    console.log('Ícone:', icon);
  } catch (err) {
    console.error('Erro ao criar atalho:', err.message);
    process.exit(1);
  } finally {
    try { fs.unlinkSync(scriptFile); } catch {}
  }
}

if (require.main === module) {
  createShortcut();
}

module.exports = { createShortcut, getDesktopPath };
