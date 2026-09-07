/**
 * Build + publica release no GitHub (VenomBrt/recreate-launcher).
 * Uso: npm run release
 * Requer: gh autenticado + repo público recreate-launcher
 */
const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const OWNER = 'VenomBrt';
const REPO = 'recreate-launcher';
const FULL = `${OWNER}/${REPO}`;

function run(cmd) {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { stdio: 'inherit', cwd: ROOT, shell: true });
}

function runCapture(cmd) {
  const r = spawnSync(cmd, { cwd: ROOT, shell: true, encoding: 'utf8' });
  return {
    code: r.status || 0,
    out: `${r.stdout || ''}${r.stderr || ''}`.trim(),
  };
}

function main() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const version = pkg.version;
  console.log(`Publicando Recreate v${version} → github.com/${FULL}`);

  const view = runCapture(`gh repo view ${FULL}`);
  if (view.code !== 0) {
    console.log(`Criando repo público ${FULL}...`);
    run(`gh repo create ${FULL} --public --description "Recreate Launcher - releases e auto-update" --confirm`);
  }

  const token = runCapture('gh auth token');
  if (token.code !== 0 || !token.out) {
    throw new Error('gh auth token falhou — rode: gh auth login');
  }
  process.env.GH_TOKEN = token.out.trim();
  process.env.GITHUB_TOKEN = process.env.GH_TOKEN;

  // Build com patch de ícone + NSIS, e publica no GitHub Releases
  run('node scripts/fetch-changelog.js');
  run('npx electron-builder --win dir');
  run('node scripts/patch-built-exe.js');
  run('npx electron-builder --win nsis --prepackaged dist/win-unpacked --publish always');

  const setup = path.join(ROOT, 'dist', `Recreate-Setup-${version}.exe`);
  if (fs.existsSync(setup)) {
    try {
      const desktop = path.join(os.homedir(), 'Desktop', `Recreate-Setup-${version}.exe`);
      fs.copyFileSync(setup, desktop);
      console.log(`\nDesktop: ${desktop}`);
    } catch (e) {
      console.warn('Não copiou pro Desktop:', e.message);
    }
  }

  console.log(`\nPronto! Release: https://github.com/${FULL}/releases/tag/v${version}`);
  console.log('Quem já tem o launcher com auto-update verá o botão Atualizar.');
}

main();
