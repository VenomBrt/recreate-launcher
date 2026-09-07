const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { pipeline } = require('stream/promises');
const { Transform } = require('stream');
const { app } = require('electron');

const ESSENTIAL_MOD = 'recreate_essencial-1.0.9.jar';

/** Pasta oculta (não óbvia) — não usar Recreate/game/mods */
const HIDDEN_ROOT_SEGMENTS = ['.xdata', 'a7f3c91e2b', 'content'];

function getLocalAppData() {
  if (process.platform === 'win32') {
    return process.env.LOCALAPPDATA || path.join(require('os').homedir(), 'AppData', 'Local');
  }
  // Linux / macOS — XDG data dir
  if (process.env.XDG_DATA_HOME) return process.env.XDG_DATA_HOME;
  return path.join(require('os').homedir(), '.local', 'share');
}

function getRecreateRoot() {
  return path.join(getLocalAppData(), 'Recreate');
}

/** Diretório real do jogo (escondido) */
function getGameDir() {
  return path.join(getRecreateRoot(), ...HIDDEN_ROOT_SEGMENTS);
}

function getModsDir() {
  return path.join(getGameDir(), 'mods');
}

function getLegacyGameDir() {
  return path.join(getRecreateRoot(), 'game');
}

function getHiddenModsDir() {
  return path.join(getRecreateRoot(), '.packages');
}

function hidePath(targetPath) {
  if (process.platform !== 'win32') return;
  try {
    execSync(`attrib +h +s "${targetPath}"`, { stdio: 'ignore', windowsHide: true });
  } catch {}
}

function ensureGameDirs() {
  const dirs = [
    getGameDir(),
    getModsDir(),
    path.join(getGameDir(), 'config'),
    path.join(getGameDir(), 'resourcepacks'),
    path.join(getGameDir(), 'shaderpacks'),
    path.join(getGameDir(), 'saves'),
  ];
  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/** Remove pasta mods antiga visível (evita alguém achar fácil) */
function scrubLegacyModsFolder() {
  const legacyMods = path.join(getLegacyGameDir(), 'mods');
  try {
    if (!fs.existsSync(legacyMods)) return;
    // Se ainda tem jar, tenta migrar essencial antes de apagar
    const legacyEssential = path.join(legacyMods, ESSENTIAL_MOD);
    const destEssential = path.join(getModsDir(), ESSENTIAL_MOD);
    if (fs.existsSync(legacyEssential) && !fs.existsSync(destEssential)) {
      fs.mkdirSync(getModsDir(), { recursive: true });
      fs.copyFileSync(legacyEssential, destEssential);
    }
    fs.rmSync(legacyMods, { recursive: true, force: true });
  } catch (err) {
    console.warn('[mods] scrub legacy:', err.message);
  }

  // Deixa um isca vazia/travada? melhor não criar "mods" de novo.
  // Esconde a pasta game antiga se ainda existir
  try {
    if (fs.existsSync(getLegacyGameDir())) hidePath(getLegacyGameDir());
  } catch {}
}

function hideGameTree() {
  const recreate = getRecreateRoot();
  const xdata = path.join(recreate, '.xdata');
  const mid = path.join(xdata, 'a7f3c91e2b');
  const content = getGameDir();
  const mods = getModsDir();

  hidePath(xdata);
  hidePath(mid);
  hidePath(content);
  hidePath(mods);
}

function setupHiddenMods() {
  ensureGameDirs();
  scrubLegacyModsFolder();
  hideGameTree();

  const hiddenDir = getHiddenModsDir();
  fs.mkdirSync(hiddenDir, { recursive: true });
  hidePath(hiddenDir);
}

function needsEssentialCopy(src, dest) {
  if (!fs.existsSync(src)) {
    throw new Error(`Mod essencial não encontrado: ${ESSENTIAL_MOD}`);
  }
  if (!fs.existsSync(dest)) return true;
  return fs.statSync(src).size !== fs.statSync(dest).size;
}

async function copyFileWithProgress(src, dest, onProgress) {
  const total = fs.statSync(src).size;
  let done = 0;
  let lastEmit = 0;
  const tmp = `${dest}.part`;

  try {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  } catch {}

  const progressTap = new Transform({
    transform(chunk, _enc, cb) {
      done += chunk.length;
      const now = Date.now();
      if (onProgress && (now - lastEmit > 120 || done >= total)) {
        lastEmit = now;
        onProgress(done, total);
      }
      cb(null, chunk);
    },
  });

  await pipeline(
    fs.createReadStream(src, { highWaterMark: 1024 * 1024 }),
    progressTap,
    fs.createWriteStream(tmp),
  );

  try {
    if (fs.existsSync(dest)) fs.unlinkSync(dest);
  } catch {}
  fs.renameSync(tmp, dest);
}

/**
 * Copia o jar essencial para a pasta mods OCULTA.
 */
async function syncMods(bundledModsDir, onProgress) {
  ensureGameDirs();
  scrubLegacyModsFolder();

  const modsDir = getModsDir();
  const essentialSrc = path.join(bundledModsDir, ESSENTIAL_MOD);
  const essentialDst = path.join(modsDir, ESSENTIAL_MOD);

  if (!needsEssentialCopy(essentialSrc, essentialDst)) {
    if (onProgress) {
      onProgress({ stage: 'mods', message: 'Pacote essencial pronto', percent: 100 });
    }
    hideGameTree();
    return { gameDir: getGameDir(), modsDir, copied: false };
  }

  const totalMb = Math.max(1, Math.round(fs.statSync(essentialSrc).size / (1024 * 1024)));
  if (onProgress) {
    onProgress({
      stage: 'mods',
      message: `Preparando pacote (0/${totalMb} MB)...`,
      percent: 0,
    });
  }

  await copyFileWithProgress(essentialSrc, essentialDst, (done, total) => {
    if (!onProgress) return;
    const pct = Math.min(99, Math.floor((done / total) * 100));
    const doneMb = Math.floor(done / (1024 * 1024));
    onProgress({
      stage: 'mods',
      message: `Preparando pacote (${doneMb}/${totalMb} MB)...`,
      percent: pct,
    });
  });

  if (onProgress) {
    onProgress({ stage: 'mods', message: 'Pacote essencial pronto', percent: 100 });
  }

  hideGameTree();
  return { gameDir: getGameDir(), modsDir, copied: true };
}

function getLaunchStatus() {
  const gameDir = getGameDir();
  const essentialPath = path.join(getModsDir(), ESSENTIAL_MOD);
  const forgeInstaller = path.join(
    getLocalAppData(),
    'Recreate',
    'cache',
    'forge-1.20.1-47.4.20-installer.jar',
  );
  const forgeWrapperJson = path.join(
    app.getPath('appData'),
    '.minecraft',
    'forge',
    '1.20.1',
    'version.json',
  );
  const forgeVersionFolder = path.join(
    app.getPath('appData'),
    '.minecraft',
    'versions',
    '1.20.1-forge-47.4.20',
  );

  const forgeReady =
    (fs.existsSync(forgeInstaller) && fs.statSync(forgeInstaller).size > 100000)
    || fs.existsSync(forgeWrapperJson)
    || fs.existsSync(forgeVersionFolder);

  return {
    gameDir,
    essentialInstalled: fs.existsSync(essentialPath),
    forgeInstalled: forgeReady,
    ready: fs.existsSync(essentialPath) && forgeReady,
  };
}

module.exports = {
  getGameDir,
  getModsDir,
  getLocalAppData,
  setupHiddenMods,
  syncMods,
  getLaunchStatus,
  ESSENTIAL_MOD,
  needsEssentialCopy,
  scrubLegacyModsFolder,
  hideGameTree,
};
