const { app, BrowserWindow, ipcMain, nativeImage } = require('electron');
const path = require('path');

// SFX da splash sem precisar clicar (Web Audio)
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

/** Tempo da splash — deve bater com src/js/splash.js */
const SPLASH_DURATION_MS = 4500;
const { launchGame, installForge, getLaunchStatus, getJavaStatus, isGameRunning, isLaunchBusy, stopGame, prefetchForge } = require('./minecraft');
const { setupHiddenMods, syncMods } = require('./mods-manager');
const {
  loginMicrosoft, getAccountInfo, saveAccountType, clearMsAuth, logoutMicrosoft,
  getSavedAuth,
} = require('./auth');
const {
  importSkin, selectSkin, applySkin, getSkinPreview, getSkinDataUrl,
  getAvatarUrl, getSkinTextureUrl, listSkins, syncPremiumSkin, resolveSkinPreview,
  deleteSkin, importSkinFromPath, ensureOfficialBackup,
} = require('./skins');
const { ensureDesktopShortcut } = require('./shortcut');
const { getServerStatus, SERVER_ADDRESS, SERVER_HOST, SERVER_PORT } = require('./server');
const { getChangelog } = require('./changelog');
const { getLauncherStatus, checkWhitelistAccess } = require('./launcher-status');
const {
  getFriends, sendRequest, acceptRequest, declineRequest, cancelRequest,
  removeFriend, getFriendsStatus, getMessages, getMessagesAsync, sendMessage, clearHistory,
  getHistoryInfo, createGroup, leaveGroup, getGroupMessages, getGroupMessagesAsync,
  sendGroupMessage, clearGroupHistory, getGroupHistoryInfo, markChatRead,
  getPresence, setPresence, heartbeatPresence,
} = require('./friends');
const FriendsCloud = require('./friends-cloud');
const { hideToTray, showMainWindow, destroyTray, setQuitting, isQuitting } = require('./tray');
const { getLevelInfo } = require('./level');
const { startRemoteSync, stopRemoteSync, refreshRemoteNow } = require('./remote-sync');
const {
  startAutoUpdater,
  checkForUpdates,
  downloadUpdate,
  downloadAndInstall,
  installUpdate,
  getUpdateStatus,
} = require('./updater');
const Store = require('./store');

const { IconGlitch } = require('./icon-glitch');

let splashWindow = null;
let mainWindow = null;
let iconGlitch = null;
let splashFinished = false;
let mainReadyToShow = false;

const isDev = !app.isPackaged;

function getIconPath() {
  const ico = path.join(__dirname, '..', 'assets', 'icon.ico');
  const png = path.join(__dirname, '..', 'assets', 'icon.png');
  const logo = path.join(__dirname, '..', 'assets', 'logo.jpg');
  const fs = require('fs');
  if (fs.existsSync(ico)) return ico;
  if (fs.existsSync(png)) return png;
  return logo;
}

function getModsPath() {
  return isDev
    ? path.join(__dirname, '..', 'assets', 'mods')
    : path.join(process.resourcesPath, 'mods');
}

function getAppIcon() {
  const pathStr = getIconPath();
  const img = nativeImage.createFromPath(pathStr);
  if (img.isEmpty()) return null;
  const { width, height } = img.getSize();
  if (width !== 256 || height !== 256) {
    return img.resize({ width: 256, height: 256, quality: 'best' });
  }
  return img;
}

function createSplashWindow() {
  const appIcon = getAppIcon();
  splashWindow = new BrowserWindow({
    width: 900,
    height: 550,
    frame: false,
    transparent: false,
    backgroundColor: '#08000f',
    resizable: false,
    center: true,
    icon: appIcon || getIconPath(),
    show: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: true,
      autoplayPolicy: 'no-user-gesture-required',
    },
  });

  splashWindow.loadFile(path.join(__dirname, '..', 'src', 'splash.html'));
  splashWindow.webContents.setAudioMuted(false);
  iconGlitch?.attach(splashWindow);
  splashWindow.on('closed', () => {
    iconGlitch?.detach(splashWindow);
    splashWindow = null;
  });
}

function revealMainWindow() {
  if (!splashFinished || !mainWindow || mainWindow.isDestroyed()) return;
  if (!mainReadyToShow && !mainWindow.isVisible()) {
    // Ainda carregando — ready-to-show chama de novo
    return;
  }
  try {
    if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
  } catch {}
  splashWindow = null;
  iconGlitch?.attach(mainWindow);
  const appIcon = getAppIcon();
  if (appIcon) mainWindow.setIcon(appIcon);
  if (!mainWindow.isVisible()) mainWindow.show();
  mainWindow.focus();
  startAutoUpdater();
}

function createMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) return;

  const appIcon = getAppIcon();
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1100,
    minHeight: 720,
    frame: false,
    transparent: false,
    backgroundColor: '#08000f',
    show: false,
    title: 'Recreate',
    icon: appIcon || getIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: true,
      spellcheck: false,
      autoplayPolicy: 'no-user-gesture-required',
    },
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'src', 'index.html'));
  mainWindow.webContents.setAudioMuted(false);

  mainWindow.once('ready-to-show', () => {
    mainReadyToShow = true;
    // Só revela se a splash já terminou — senão espera splash:done
    revealMainWindow();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    mainReadyToShow = false;
  });

  // Se o Windows minimizar a janela (ex.: Win+Seta), manda pra bandeja
  mainWindow.on('minimize', () => {
    hideToTray(mainWindow);
  });

  mainWindow.on('hide', () => {
    try {
      mainWindow.webContents.setAudioMuted(true);
      mainWindow.webContents.send('window:active', false);
    } catch {}
  });

  mainWindow.on('show', () => {
    try {
      mainWindow.webContents.setAudioMuted(false);
      mainWindow.webContents.send('window:active', true);
    } catch {}
    refreshRemoteNow();
  });

  // Ao voltar pra tela, busca GitHub de novo (log.txt / launcher.txt)
  mainWindow.on('focus', () => {
    try {
      mainWindow.webContents.setAudioMuted(false);
      mainWindow.webContents.send('window:active', true);
    } catch {}
    refreshRemoteNow();
  });

  mainWindow.on('blur', () => {
    // Só silencia SFX ambient se a janela não estiver visível (bandeja)
    if (!mainWindow.isVisible()) {
      try {
        mainWindow.webContents.setAudioMuted(true);
        mainWindow.webContents.send('window:active', false);
      } catch {}
    }
  });
}

function finishSplashAndOpen() {
  splashFinished = true;
  if (!mainWindow || mainWindow.isDestroyed()) createMainWindow();
  revealMainWindow();
}

app.whenReady().then(async () => {
  try { app.setName('Recreate'); } catch {}
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.recreate.launcher');
  }

  iconGlitch = new IconGlitch(getIconPath());
  iconGlitch.setIntensityFn(() => 0);

  createSplashWindow();
  // Main carrega em background durante a splash (skin/perfil/Conexa) — só revela depois
  createMainWindow();
  setupHiddenMods();
  // Prefetch imediato (Forge + jar essencial)
  prefetchForge();
  syncMods(getModsPath()).catch((err) => console.warn('[prefetch mods]', err.message));

  // Fallback só se splash:done falhar
  setTimeout(() => {
    if (!splashFinished) {
      console.warn('[splash] fallback — abrindo main');
      finishSplashAndOpen();
    }
  }, SPLASH_DURATION_MS + 2000);

  startRemoteSync(() => mainWindow);
});

ipcMain.handle('splash:done', () => {
  finishSplashAndOpen();
  return true;
});

app.on('before-quit', () => {
  setQuitting(true);
  // Fecha o Minecraft se ainda estiver rodando
  try { stopGame(); } catch {}
  stopRemoteSync();
  destroyTray();
});

app.on('window-all-closed', () => {
  if (isQuitting() || process.platform !== 'darwin') {
    try { stopGame(); } catch {}
    if (process.platform !== 'darwin') app.quit();
  }
});

ipcMain.handle('window:minimize', () => {
  // Minimizar = bandeja (ícone perto do relógio)
  if (mainWindow) hideToTray(mainWindow);
  return true;
});
ipcMain.handle('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.handle('window:close', () => {
  setQuitting(true);
  try { stopGame(); } catch {}
  app.quit();
  return true;
});
ipcMain.handle('app:quit', () => {
  setQuitting(true);
  try { stopGame(); } catch {}
  app.quit();
  return true;
});

ipcMain.handle('settings:get', () => ({
  minimizeToTrayOnPlay: Store.get('minimizeToTrayOnPlay', true),
  tabGlitchEnabled: Store.get('tabGlitchEnabled', true),
  titleGlitchEnabled: Store.get('titleGlitchEnabled', true),
  glitchSoundsEnabled: Store.get('glitchSoundsEnabled', true),
}));

ipcMain.handle('settings:set', (_, patch = {}) => {
  if (typeof patch.minimizeToTrayOnPlay === 'boolean') {
    Store.set('minimizeToTrayOnPlay', patch.minimizeToTrayOnPlay);
  }
  if (typeof patch.tabGlitchEnabled === 'boolean') {
    Store.set('tabGlitchEnabled', patch.tabGlitchEnabled);
  }
  if (typeof patch.titleGlitchEnabled === 'boolean') {
    Store.set('titleGlitchEnabled', patch.titleGlitchEnabled);
  }
  if (typeof patch.glitchSoundsEnabled === 'boolean') {
    Store.set('glitchSoundsEnabled', patch.glitchSoundsEnabled);
  }
  return {
    minimizeToTrayOnPlay: Store.get('minimizeToTrayOnPlay', true),
    tabGlitchEnabled: Store.get('tabGlitchEnabled', true),
    titleGlitchEnabled: Store.get('titleGlitchEnabled', true),
    glitchSoundsEnabled: Store.get('glitchSoundsEnabled', true),
  };
});

ipcMain.handle('window:hide-to-tray', () => {
  if (mainWindow) hideToTray(mainWindow);
  return true;
});

ipcMain.handle('window:show-from-tray', () => {
  showMainWindow();
  return true;
});

ipcMain.handle('glitch:icon-pulse', (_, intensity = 0.5, mode = 'normal') => {
  if (iconGlitch) iconGlitch.handlePulse(intensity, mode);
  return true;
});

ipcMain.handle('glitch:icon-stop', () => {
  iconGlitch?.stopStorm();
  return true;
});

ipcMain.handle('glitch:set-intensity', (_, intensity = 0) => {
  if (iconGlitch) {
    const i = Math.max(0, Math.min(1, intensity));
    iconGlitch.setIntensityFn(() => i);
  }
  return true;
});

ipcMain.handle('launcher:get-status', () => ({
  ...getLaunchStatus(),
  java: getJavaStatus(),
  gameRunning: isLaunchBusy(),
}));

ipcMain.handle('launcher:get-java', () => getJavaStatus());

ipcMain.handle('launcher:install', async (_, opts) => {
  try {
    setupHiddenMods();
    await syncMods(getModsPath(), (progress) => {
      mainWindow?.webContents.send('launcher:progress', progress);
      splashWindow?.webContents.send('launcher:progress', progress);
    });
    await installForge((progress) => {
      mainWindow?.webContents.send('launcher:progress', progress);
      splashWindow?.webContents.send('launcher:progress', progress);
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

const sendProgress = (progress) => {
  mainWindow?.webContents.send('launcher:progress', progress);
};

function yieldMain() {
  return new Promise((resolve) => setImmediate(resolve));
}

/** Trava o IPC de play (clique duplo enquanto sincroniza mods) */
let playIpcBusy = false;

ipcMain.handle('launcher:play', async (_, opts) => {
  if (isLaunchBusy() || playIpcBusy) {
    return { success: false, error: 'O Minecraft já está em execução.' };
  }
  playIpcBusy = true;
  try {
    const statusInfo = await getLauncherStatus();
    if (statusInfo.allowPlay === false) {
      return { success: false, error: statusInfo.message || 'Servidor indisponível no momento.' };
    }

    if (isLaunchBusy()) {
      return { success: false, error: 'O Minecraft já está em execução.' };
    }

    const access = checkWhitelistAccess(statusInfo, {
      username: opts?.username,
      accountType: opts?.accountType,
    });
    if (!access.allowed) {
      return { success: false, error: access.error || 'Você não está na whitelist.' };
    }

    sendProgress({ stage: 'init', message: 'Preparando arquivos...', percent: 2 });
    await yieldMain();

    setupHiddenMods();
    await yieldMain();

    try {
      await syncMods(getModsPath(), ({ message, percent }) => {
        const mapped = 2 + Math.floor((percent / 100) * 26);
        sendProgress({ stage: 'mods', message, percent: mapped });
      });
    } catch (err) {
      console.warn('[sync]', err.message);
      return { success: false, error: err.message || 'Falha ao preparar o pacote essencial.' };
    }

    if (isLaunchBusy()) {
      return { success: false, error: 'O Minecraft já está em execução.' };
    }

    sendProgress({ stage: 'ready', message: 'Iniciando cliente...', percent: 30 });
    await yieldMain();

    const result = await launchGame(opts, (progress) => {
      const pct = progress?.percent;
      if (typeof pct === 'number') {
        sendProgress({
          ...progress,
          percent: 30 + Math.floor((Math.min(100, pct) / 100) * 70),
        });
      } else {
        sendProgress(progress);
      }
    });

    if (Store.get('minimizeToTrayOnPlay', true) && mainWindow) {
      hideToTray(mainWindow);
    }

    return { success: true, ...result };
  } catch (err) {
    console.error('[play]', err);
    return { success: false, error: err.message || String(err) };
  } finally {
    playIpcBusy = false;
  }
});

ipcMain.handle('launcher:stop', async () => {
  try {
    return stopGame();
  } catch (err) {
    return { success: false, error: err.message || String(err) };
  }
});

ipcMain.handle('launcher:get-username', () => {
  const Store = require('./store');
  return Store.get('username', '');
});

ipcMain.handle('launcher:save-username', (_, username) => {
  const Store = require('./store');
  Store.set('username', username);
  return true;
});

ipcMain.handle('launcher:get-ram', () => {
  const Store = require('./store');
  return Store.get('ram', 4);
});

ipcMain.handle('launcher:save-ram', (_, ram) => {
  const Store = require('./store');
  Store.set('ram', ram);
  return true;
});

ipcMain.handle('auth:login-microsoft', async () => {
  try {
    const result = await loginMicrosoft();
    const token = result.auth?.access_token;
    const skin = await syncPremiumSkin(result.username, {
      accessToken: token,
      uuid: result.uuid,
      force: true,
    });
    return { success: true, ...result, skin };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('auth:logout', () => {
  logoutMicrosoft();
  return { success: true };
});

ipcMain.handle('auth:get-account', () => getAccountInfo());

ipcMain.handle('auth:set-type', (_, type) => {
  saveAccountType(type);
  return { success: true };
});

ipcMain.handle('skin:import', async (_, username) => {
  try {
    const result = await importSkin(username);
    if (!result) return { success: false, canceled: true };
    return { success: true, skin: result };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('skin:import-path', async (_, { filePath, username }) => {
  try {
    const result = await importSkinFromPath(filePath, username);
    return { success: true, skin: result };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('skin:delete', async (_, { skinId, username, accountType }) => {
  try {
    await deleteSkin(skinId, username, accountType);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('skin:get-preview', async (_, { username, uuid, accountType, sync } = {}) => {
  if (!username) return null;

  const saved = getSavedAuth();
  const token = saved?.mclc?.access_token || null;
  const type = accountType || require('./auth').getAccountType();

  return resolveSkinPreview(username, {
    uuid: uuid || saved?.uuid || saved?.mclc?.uuid,
    accountType: type,
    accessToken: type === 'premium' ? token : null,
    sync: !!sync,
  });
});

ipcMain.handle('skin:sync-premium', async () => {
  try {
    const info = getAccountInfo();
    if (info.type !== 'premium' || !info.loggedIn) {
      return { success: false, error: 'Conta Microsoft não conectada.' };
    }
    const saved = getSavedAuth();
    const result = await syncPremiumSkin(info.username, {
      accessToken: saved?.mclc?.access_token,
      uuid: info.uuid,
      force: true,
    });
    return result;
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('skin:get-active-id', () => {
  const Store = require('./store');
  return Store.get('activeSkin', null);
});

ipcMain.handle('skin:list', (_, { username, accountType } = {}) => {
  ensureOfficialBackup(username);
  return listSkins(username, accountType);
});

ipcMain.handle('skin:apply', async (_, { username, accountType, uuid }) => {
  try {
    const result = await applySkin(username, accountType, uuid);
    return { success: true, ...result };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('skin:select', async (_, { skinId, username }) => {
  try {
    await selectSkin(skinId, username);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('skin:get-data', async (_, filePath) => {
  if (!filePath) return null;
  try {
    const data = await require('fs').promises.readFile(filePath);
    return `data:image/png;base64,${data.toString('base64')}`;
  } catch {
    return null;
  }
});

ipcMain.handle('skin:get-avatar', (_, username) => {
  if (!username) return null;
  const localPath = getSkinPreview(username);
  if (localPath) return getSkinDataUrl(localPath);
  return getAvatarUrl(username);
});

ipcMain.handle('server:status', async () => {
  const status = await getServerStatus();
  return {
    ...status,
    address: SERVER_ADDRESS,
    host: SERVER_HOST,
    port: SERVER_PORT,
  };
});

ipcMain.handle('level:info', () => getLevelInfo());

ipcMain.handle('changelog:get', async () => {
  try {
    return await getChangelog();
  } catch (err) {
    return {
      latest: 'v0.3.10',
      entries: [],
      source: 'error',
      error: err.message,
    };
  }
});

ipcMain.handle('launcher-status:get', async () => {
  try {
    return await getLauncherStatus();
  } catch (err) {
    return {
      status: 'online',
      tone: 'online',
      label: 'Servidor',
      message: err.message || 'Status indisponível.',
      allowPlay: true,
      source: 'error',
    };
  }
});

ipcMain.handle('remote:refresh', async () => {
  await refreshRemoteNow();
  return true;
});

ipcMain.handle('friends:list', (_, me) => getFriends(me));

ipcMain.handle('friends:send-request', (_, fromNick, toNick) => {
  try {
    return { success: true, ...sendRequest(fromNick, toNick) };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('friends:accept', (_, me, from) => {
  try {
    acceptRequest(me, from);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('friends:decline', (_, me, from) => {
  try {
    declineRequest(me, from);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('friends:cancel-request', (_, me, to) => {
  try {
    cancelRequest(me, to);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('friends:remove', (_, me, username) => {
  try {
    return { success: true, friends: removeFriend(me, username) };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('friends:status', (_, me) => getFriendsStatus(me));

ipcMain.handle('friends:messages', async (_, me, friendNick) => {
  try {
    const messages = await getMessagesAsync(me, friendNick);
    return { success: true, messages };
  } catch (err) {
    return { success: false, error: err.message, messages: [] };
  }
});

ipcMain.handle('friends:send-message', (_, me, friendNick, text) => {
  try {
    const msg = sendMessage(me, friendNick, text);
    return { success: true, message: msg };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('friends:history-info', (_, me, friendNick) => {
  try {
    return { success: true, ...getHistoryInfo(me, friendNick) };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('friends:clear-history', (_, me, friendNick) => {
  try {
    return { success: true, ...clearHistory(me, friendNick) };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('friends:create-group', (_, me, opts) => {
  try {
    return { success: true, group: createGroup(me, opts || {}) };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('friends:leave-group', (_, me, groupId) => {
  try {
    leaveGroup(me, groupId);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('friends:group-messages', async (_, me, groupId) => {
  try {
    const messages = await getGroupMessagesAsync(me, groupId);
    return { success: true, messages };
  } catch (err) {
    return { success: false, error: err.message, messages: [] };
  }
});

ipcMain.handle('friends:send-group-message', (_, me, groupId, text) => {
  try {
    return { success: true, message: sendGroupMessage(me, groupId, text) };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('friends:group-history-info', (_, me, groupId) => {
  try {
    return { success: true, ...getGroupHistoryInfo(me, groupId) };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('friends:clear-group-history', (_, me, groupId) => {
  try {
    return { success: true, ...clearGroupHistory(me, groupId) };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('friends:mark-read', (_, me, kind, id) => {
  try {
    markChatRead(me, kind, id);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('friends:get-presence', (_, me) => {
  try {
    return { success: true, presence: getPresence(me) };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('friends:set-presence', (_, me, status, extras) => {
  try {
    return { success: true, presence: setPresence(me, status, extras || {}) };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('friends:heartbeat-presence', (_, me, extras) => {
  try {
    return { success: true, presence: heartbeatPresence(me, extras || {}) };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('friends:cloud-status', () => FriendsCloud.status());

const Conexa = require('./conexa');
const ConexaCommunities = require('./conexa-communities');
ipcMain.handle('conexa:status', (_, me) => Conexa.status(me));
ipcMain.handle('conexa:feed', (_, me, opts) => Conexa.listFeed(me, opts || {}));
ipcMain.handle('conexa:profile', (_, nick) => Conexa.getProfile(nick));
ipcMain.handle('conexa:update-bio', (_, me, bio) => Conexa.updateBio(me, bio));
ipcMain.handle('conexa:update-banner', (_, me, banner) => Conexa.updateBanner(me, banner));
ipcMain.handle('conexa:create-post', (_, me, payload) => Conexa.createPost(me, payload || {}));
ipcMain.handle('conexa:like', (_, me, postId) => Conexa.toggleLike(me, postId));
ipcMain.handle('conexa:delete-post', (_, me, postId) => Conexa.deletePost(me, postId));

ipcMain.handle('conexa:communities-list', (_, me) => ConexaCommunities.listCommunities(me));
ipcMain.handle('conexa:community-create', (_, me, payload) => ConexaCommunities.createCommunity(me, payload || {}));
ipcMain.handle('conexa:community-join', (_, me, payload) => ConexaCommunities.joinCommunity(me, payload || {}));
ipcMain.handle('conexa:community-leave', (_, me, id) => ConexaCommunities.leaveCommunity(me, id));
ipcMain.handle('conexa:community-delete', (_, me, id) => ConexaCommunities.deleteCommunity(me, id));
ipcMain.handle('conexa:community-view', (_, me, id) => ConexaCommunities.getCommunityView(me, id));
ipcMain.handle('conexa:community-banner', (_, me, id, banner) => ConexaCommunities.updateCommunityBanner(me, id, banner));
ipcMain.handle('conexa:community-create-channel', (_, me, id, payload) => ConexaCommunities.createChannel(me, id, payload || {}));
ipcMain.handle('conexa:community-delete-channel', (_, me, id, channelId) => ConexaCommunities.deleteChannel(me, id, channelId));
ipcMain.handle('conexa:community-create-role', (_, me, id, payload) => ConexaCommunities.createRole(me, id, payload || {}));
ipcMain.handle('conexa:community-delete-role', (_, me, id, roleId) => ConexaCommunities.deleteRole(me, id, roleId));
ipcMain.handle('conexa:community-set-role', (_, me, id, nick, roleId, assign) => ConexaCommunities.setMemberRole(me, id, nick, roleId, assign !== false));
ipcMain.handle('conexa:community-messages', (_, me, id, channelId) => ConexaCommunities.listMessages(me, id, channelId));
ipcMain.handle('conexa:community-send', (_, me, id, channelId, text) => ConexaCommunities.sendMessage(me, id, channelId, text));
ipcMain.handle('conexa:community-delete-msg', (_, me, id, channelId, msgId) => ConexaCommunities.deleteMessage(me, id, channelId, msgId));

ipcMain.handle('updater:status', () => getUpdateStatus());
ipcMain.handle('updater:check', () => checkForUpdates());
ipcMain.handle('updater:download', () => downloadUpdate());
ipcMain.handle('updater:download-install', () => downloadAndInstall());
ipcMain.handle('updater:install', () => installUpdate());
