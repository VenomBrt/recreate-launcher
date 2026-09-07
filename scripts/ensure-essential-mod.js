/**
 * Garante assets/mods/recreate_essencial-*.jar antes do build.
 * No CI baixa do release "mods" do recreate-launcher.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const MODS_DIR = path.join(ROOT, 'assets', 'mods');
const ESSENTIAL = 'recreate_essencial-1.0.9.jar';
const OWNER = 'VenomBrt';
const REPO = 'recreate-launcher';

function main() {
  fs.mkdirSync(MODS_DIR, { recursive: true });
  const dest = path.join(MODS_DIR, ESSENTIAL);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) {
    console.log(`[mods] OK: ${ESSENTIAL}`);
    return;
  }

  console.log(`[mods] Baixando ${ESSENTIAL} do release "mods"...`);
  try {
    execSync(
      `gh release download mods --repo ${OWNER}/${REPO} --pattern "${ESSENTIAL}" --dir "${MODS_DIR}" --clobber`,
      { stdio: 'inherit', shell: true },
    );
  } catch (err) {
    console.error('[mods] Falha ao baixar o jar essencial.');
    console.error('Suba o arquivo com:');
    console.error(`  gh release create mods "assets/mods/${ESSENTIAL}" --repo ${OWNER}/${REPO} --title "Mods" --notes "Mod essencial"`);
    process.exit(1);
  }

  if (!fs.existsSync(dest)) {
    console.error(`[mods] Ainda sem ${dest}`);
    process.exit(1);
  }
  console.log(`[mods] Baixado: ${ESSENTIAL} (${(fs.statSync(dest).size / 1e6).toFixed(1)} MB)`);
}

main();
