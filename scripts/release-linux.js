/**
 * Build Linux (AppImage + .deb) e publica no GitHub Releases.
 * Deve rodar em Linux (CI) — no Windows use o workflow build-linux.yml
 * Uso: npm run release:linux
 */
const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

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
  if (process.platform === 'win32') {
    console.error('Build Linux não roda no Windows nativo.');
    console.error('Use: gh workflow run build-linux.yml');
    console.error('Ou rode este script numa máquina/CI Ubuntu.');
    process.exit(1);
  }

  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const version = pkg.version;
  console.log(`Publicando Recreate Linux v${version} → github.com/${FULL}`);

  const token = runCapture('gh auth token');
  if (token.code !== 0 || !token.out) {
    throw new Error('gh auth token falhou — rode: gh auth login');
  }
  process.env.GH_TOKEN = token.out.trim();
  process.env.GITHUB_TOKEN = process.env.GH_TOKEN;

  run('node scripts/fetch-changelog.js');
  run('npx electron-builder --linux AppImage deb --x64 --publish always');

  const appImage = path.join(ROOT, 'dist', `Recreate-${version}.AppImage`);
  const deb = path.join(ROOT, 'dist', `Recreate-Setup-${version}.deb`);
  console.log('\nArtefatos:');
  if (fs.existsSync(appImage)) console.log(`  AppImage: ${appImage}`);
  if (fs.existsSync(deb)) console.log(`  Setup .deb: ${deb}`);
  console.log(`\nRelease: https://github.com/${FULL}/releases/tag/v${version}`);
}

main();
