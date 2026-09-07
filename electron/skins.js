const fs = require('fs');
const path = require('path');
const { dialog } = require('electron');
const fetch = require('node-fetch');
const { getGameDir } = require('./mods-manager');
const Store = require('./store');

function getSkinsDir() {
  const dir = path.join(require('./mods-manager').getLocalAppData(), 'Recreate', 'skins');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function safeUsername(username) {
  return (username || '').replace(/[^a-zA-Z0-9_]/g, '_');
}

function getActiveSkinStoreKey(username) {
  return `activeSkin_${safeUsername(username)}`;
}

function getStoredActiveSkinId(username) {
  if (!username) return Store.get('activeSkin', null);
  return Store.get(getActiveSkinStoreKey(username), null)
    ?? Store.get('activeSkin', null);
}

function setStoredActiveSkinId(username, skinId) {
  if (username) Store.set(getActiveSkinStoreKey(username), skinId);
  Store.set('activeSkin', skinId);
}

function fetchWithTimeout(url, options = {}, ms = 8000) {
  return Promise.race([
    fetch(url, options),
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Tempo esgotado ao buscar skin.')), ms);
    }),
  ]);
}

function getActiveSkinPath(username) {
  return path.join(getSkinsDir(), `${safeUsername(username)}.png`);
}

const OFFICIAL_SKIN_ID = '__official__';

function getOfficialBackupPath(username) {
  return path.join(getSkinsDir(), `skin_official_${safeUsername(username)}.png`);
}

function formatSkinLabel(id) {
  if (id.startsWith('skin_')) {
    const ts = parseInt(id.replace('skin_', ''), 10);
    if (!Number.isNaN(ts) && ts > 1e12) {
      const d = new Date(ts);
      return `Skin ${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    }
  }
  return id.replace(/_/g, ' ');
}

function listSkins(username, accountType) {
  const dir = getSkinsDir();
  const activeId = getStoredActiveSkinId(username);
  const items = [];

  if (accountType === 'premium' && username) {
    const officialPath = getOfficialBackupPath(username);
    if (fs.existsSync(officialPath)) {
      const stat = fs.statSync(officialPath);
      items.push({
        id: OFFICIAL_SKIN_ID,
        name: 'Skin da conta',
        path: officialPath,
        type: 'official',
        canDelete: false,
        isActive: activeId === OFFICIAL_SKIN_ID,
        modified: stat.mtimeMs,
      });
    }
  }

  if (!fs.existsSync(dir)) return items;

  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.png') || !f.startsWith('skin_')) continue;
    if (f.startsWith('skin_official_')) continue;

    const full = path.join(dir, f);
    const id = f.replace('.png', '');
    const stat = fs.statSync(full);
    items.push({
      id,
      name: formatSkinLabel(id),
      path: full,
      type: 'custom',
      canDelete: true,
      isActive: activeId === id,
      modified: stat.mtimeMs,
    });
  }

  items.sort((a, b) => {
    if (a.type === 'official') return -1;
    if (b.type === 'official') return 1;
    return b.modified - a.modified;
  });

  if (!activeId && items.length) {
    items[0].isActive = true;
  }

  return items;
}

/** Skin oficial via token Microsoft (mais confiável) */
async function fetchSkinFromToken(accessToken) {
  const res = await fetchWithTimeout('https://api.minecraftservices.com/minecraft/profile', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) return null;
  const profile = await res.json();
  const active = profile.skins?.find((s) => s.state === 'ACTIVE') || profile.skins?.[0];
  return active?.url || null;
}

/** Skin via UUID no session server */
async function fetchSkinFromUuid(uuid) {
  if (!uuid) return null;
  try {
    const id = uuid.replace(/-/g, '');
    const res = await fetchWithTimeout(`https://sessionserver.mojang.com/session/minecraft/profile/${id}`);
    if (!res.ok) return null;
    const profile = await res.json();
    const prop = profile.properties?.find((p) => p.name === 'textures');
    if (!prop) return null;
    const textures = JSON.parse(Buffer.from(prop.value, 'base64').toString());
    return textures.textures?.SKIN?.url || null;
  } catch {
    return null;
  }
}

/** Skin via nickname (API pública Mojang) */
async function fetchSkinFromUsername(username) {
  try {
    const res = await fetchWithTimeout(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(username)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return fetchSkinFromUuid(data.id);
  } catch {
    return null;
  }
}

async function downloadSkin(url, dest) {
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error('Falha ao baixar skin');
  const buffer = await res.buffer();
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buffer);
  return dest;
}

/**
 * Baixa e salva a skin oficial da conta Microsoft.
 * Chamado no login e ao abrir o launcher.
 */
async function syncPremiumSkin(username, options = {}) {
  if (!username) return { success: false, error: 'Username inválido' };

  const { accessToken, uuid, force = false } = options;
  const activePath = getActiveSkinPath(username);

  if (!force && fs.existsSync(activePath)) {
    return {
      success: true,
      path: activePath,
      preview: getSkinDataUrl(activePath),
      cached: true,
    };
  }

  let url = null;
  if (accessToken) url = await fetchSkinFromToken(accessToken);
  if (!url && uuid) url = await fetchSkinFromUuid(uuid);
  if (!url) url = await fetchSkinFromUsername(username);

  if (!url) {
    return { success: false, error: 'Não foi possível obter sua skin da Microsoft.' };
  }

  await downloadSkin(url, activePath);

  const backup = getOfficialBackupPath(username);
  fs.copyFileSync(activePath, backup);
  setStoredActiveSkinId(username, OFFICIAL_SKIN_ID);

  setupCustomSkinLoader(username);

  return {
    success: true,
    path: activePath,
    preview: getSkinDataUrl(activePath),
    cached: false,
  };
}

function setupCustomSkinLoader(username) {
  const gameDir = getGameDir();
  const cslDir = path.join(gameDir, 'CustomSkinLoader');
  const localSkinDir = path.join(cslDir, 'LocalSkin', 'skins');
  fs.mkdirSync(localSkinDir, { recursive: true });

  const configPath = path.join(cslDir, 'CustomSkinLoader.json');
  const config = {
    version: '14.20',
    loadList: [
      { name: 'Mojang', type: 'MojangAPI', checkPNG: false },
      { name: 'Local', type: 'LegacyLocal', checkPNG: true },
    ],
    enableDynamicSkull: true,
    enableTransparentSkin: true,
    forceLoadAllTextures: true,
    enableCape: true,
    enableLog: false,
  };
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

  const activeSkin = getActiveSkinPath(username);
  const targetSkin = path.join(localSkinDir, `${username}.png`);

  if (fs.existsSync(activeSkin)) {
    fs.copyFileSync(activeSkin, targetSkin);
  }
}

async function applySkin(username, accountType, uuid, accessToken, options = {}) {
  const { skipNetwork = false } = options;
  const activePath = getActiveSkinPath(username);

  if (accountType === 'premium' && !skipNetwork) {
    await syncPremiumSkin(username, { accessToken, uuid, force: false });
  }

  setupCustomSkinLoader(username);

  return {
    active: fs.existsSync(activePath) ? activePath : null,
    preview: fs.existsSync(activePath) ? getSkinDataUrl(activePath) : null,
  };
}

/** Preview local rápido — sem rede por padrão (evita travar a UI) */
async function resolveSkinPreview(username, options = {}) {
  if (!username) return null;

  const { uuid, accountType, accessToken, sync = false } = options;
  const localPath = getActiveSkinPath(username);

  if (fs.existsSync(localPath)) {
    return getSkinDataUrl(localPath);
  }

  if (!sync) return null;

  if (accountType === 'premium') {
    try {
      const synced = await syncPremiumSkin(username, {
        accessToken,
        uuid,
        force: true,
      });
      if (synced.success && synced.preview) return synced.preview;
    } catch {}
  }

  if (uuid) {
    try {
      const url = await fetchSkinFromUuid(uuid);
      if (url) {
        await downloadSkin(url, localPath);
        return getSkinDataUrl(localPath);
      }
    } catch {}
  }

  return null;
}

async function importSkinFromPath(filePath, username) {
  if (!username) throw new Error('Configure sua conta primeiro.');
  if (!filePath || !fs.existsSync(filePath)) throw new Error('Arquivo não encontrado.');

  const id = `skin_${Date.now()}`;
  const dest = path.join(getSkinsDir(), `${id}.png`);
  fs.copyFileSync(filePath, dest);
  await selectSkin(id, username);
  return { id, path: dest, name: formatSkinLabel(id) };
}

async function importSkin(username) {
  const result = await dialog.showOpenDialog({
    title: 'Importar Skin',
    filters: [{ name: 'Skin PNG', extensions: ['png'] }],
    properties: ['openFile'],
  });

  if (result.canceled || !result.filePaths.length) return null;
  return importSkinFromPath(result.filePaths[0], username);
}

async function selectSkin(skinId, username) {
  if (!username) throw new Error('Username inválido');

  let src;
  if (skinId === OFFICIAL_SKIN_ID) {
    src = getOfficialBackupPath(username);
    if (!fs.existsSync(src)) throw new Error('Skin da conta não encontrada. Sincronize novamente.');
  } else {
    src = path.join(getSkinsDir(), `${skinId}.png`);
    if (!fs.existsSync(src)) throw new Error('Skin não encontrada');
  }

  const activeDest = getActiveSkinPath(username);
  fs.copyFileSync(src, activeDest);
  setStoredActiveSkinId(username, skinId);
  setupCustomSkinLoader(username);
  return { success: true, id: skinId };
}

async function deleteSkin(skinId, username, accountType) {
  if (!skinId || skinId === OFFICIAL_SKIN_ID) {
    throw new Error('A skin da conta Microsoft não pode ser excluída. Use Sincronizar para atualizá-la.');
  }

  const skinPath = path.join(getSkinsDir(), `${skinId}.png`);
  if (!fs.existsSync(skinPath)) throw new Error('Skin não encontrada');

  const wasActive = getStoredActiveSkinId(username) === skinId;
  fs.unlinkSync(skinPath);

  if (wasActive) {
    const remaining = listSkins(username, accountType).filter((s) => s.id !== skinId);
    if (remaining.length) {
      await selectSkin(remaining[0].id, username);
    } else {
      setStoredActiveSkinId(username, null);
      const activePath = getActiveSkinPath(username);
      if (fs.existsSync(activePath)) fs.unlinkSync(activePath);
    }
  }

  return { success: true };
}

function ensureOfficialBackup(username) {
  if (!username) return;
  const activePath = getActiveSkinPath(username);
  const backup = getOfficialBackupPath(username);
  if (fs.existsSync(activePath) && !fs.existsSync(backup)) {
    fs.copyFileSync(activePath, backup);
    if (!getStoredActiveSkinId(username)) setStoredActiveSkinId(username, OFFICIAL_SKIN_ID);
  }
}

function getSkinDataUrl(filePath) {
  try {
    const data = fs.readFileSync(filePath);
    return `data:image/png;base64,${data.toString('base64')}`;
  } catch {
    return null;
  }
}

function getSkinPreview(username) {
  const activePath = getActiveSkinPath(username);
  if (fs.existsSync(activePath)) {
    return activePath;
  }
  return null;
}

function getAvatarUrl(username) {
  return `https://mc-heads.net/avatar/${encodeURIComponent(username)}/64`;
}

function getSkinTextureUrl(username, uuid) {
  const localPath = getSkinPreview(username);
  if (localPath) {
    return getSkinDataUrl(localPath);
  }
  return null;
}

module.exports = {
  listSkins,
  importSkin,
  importSkinFromPath,
  selectSkin,
  deleteSkin,
  applySkin,
  syncPremiumSkin,
  resolveSkinPreview,
  ensureOfficialBackup,
  getSkinPreview,
  getSkinDataUrl,
  getAvatarUrl,
  getSkinTextureUrl,
  getActiveSkinPath,
  OFFICIAL_SKIN_ID,
};
