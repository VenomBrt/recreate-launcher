const { app, BrowserWindow } = require('electron');

/** @type {import('electron-updater').AppUpdater | null} */
let autoUpdater = null;
let started = false;
let installWhenReady = false;
let lastStatus = {
  status: 'idle',
  currentVersion: app.getVersion(),
  availableVersion: null,
  percent: 0,
  message: '',
  error: null,
};

function send(payload) {
  lastStatus = { ...lastStatus, ...payload, currentVersion: app.getVersion() };
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      win.webContents.send('updater:status', lastStatus);
    } catch {}
  }
}

function getUpdater() {
  if (autoUpdater) return autoUpdater;
  if (!app.isPackaged) return null;
  try {
    ({ autoUpdater } = require('electron-updater'));
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowPrerelease = false;
    autoUpdater.logger = null;
    return autoUpdater;
  } catch (err) {
    console.warn('[updater]', err.message);
    return null;
  }
}

function wireEvents(updater) {
  if (updater.__recreateWired) return;
  updater.__recreateWired = true;

  updater.on('checking-for-update', () => {
    send({ status: 'checking', message: 'Procurando atualização...', error: null });
  });

  updater.on('update-available', (info) => {
    send({
      status: 'available',
      availableVersion: info?.version || null,
      message: `Nova versão ${info?.version || ''} disponível`,
      error: null,
    });
  });

  updater.on('update-not-available', () => {
    send({
      status: 'up-to-date',
      availableVersion: null,
      message: 'Não há atualização',
      error: null,
    });
  });

  updater.on('download-progress', (p) => {
    const percent = Math.max(0, Math.min(100, Math.round(p?.percent || 0)));
    send({
      status: 'downloading',
      percent,
      message: `Baixando atualização... ${percent}%`,
      error: null,
    });
  });

  updater.on('update-downloaded', (info) => {
    send({
      status: 'ready',
      availableVersion: info?.version || lastStatus.availableVersion,
      percent: 100,
      message: 'Atualização baixada — reiniciando...',
      error: null,
    });
    if (installWhenReady) {
      installWhenReady = false;
      setTimeout(() => {
        try {
          updater.quitAndInstall(false, true);
        } catch (err) {
          send({ status: 'error', message: 'Não deu pra instalar a atualização', error: err.message });
        }
      }, 600);
    }
  });

  updater.on('error', (err) => {
    const raw = err?.message || String(err || '');
    // Nunca manda texto técnico pro UI
    if (/ENOENT|latest\.yml|404|HttpError: 404|electron-updater|missing/i.test(raw)) {
      send({
        status: 'up-to-date',
        availableVersion: null,
        message: 'Não há atualização',
        error: null,
      });
      return;
    }
    send({
      status: 'error',
      message: 'Não foi possível verificar atualização',
      error: null,
    });
  });
}

function startAutoUpdater() {
  if (started) return lastStatus;
  started = true;

  lastStatus.currentVersion = app.getVersion();
  if (!app.isPackaged) {
    send({ status: 'idle', message: '', error: null });
    return lastStatus;
  }

  const updater = getUpdater();
  if (!updater) {
    send({ status: 'idle', message: '', error: null });
    return lastStatus;
  }

  wireEvents(updater);

  setTimeout(() => {
    checkForUpdates().catch(() => {});
  }, 4000);

  setInterval(() => {
    if (['downloading', 'ready'].includes(lastStatus.status)) return;
    checkForUpdates().catch(() => {});
  }, 30 * 60 * 1000);

  return lastStatus;
}

async function checkForUpdates() {
  lastStatus.currentVersion = app.getVersion();
  if (!app.isPackaged) {
    send({
      status: 'up-to-date',
      message: 'Não há atualização',
      error: null,
    });
    return lastStatus;
  }
  const updater = getUpdater();
  if (!updater) {
    send({
      status: 'up-to-date',
      message: 'Não há atualização',
      error: null,
    });
    return lastStatus;
  }
  wireEvents(updater);
  try {
    await updater.checkForUpdates();
  } catch (err) {
    const raw = err?.message || '';
    if (/ENOENT|latest\.yml|404|HttpError: 404/i.test(raw)) {
      send({
        status: 'up-to-date',
        message: 'Não há atualização',
        error: null,
      });
    } else {
      send({
        status: 'error',
        message: 'Não foi possível verificar atualização',
        error: null,
      });
    }
  }
  return lastStatus;
}

async function downloadUpdate() {
  if (!app.isPackaged) {
    return { success: false, error: 'Só no Setup instalado' };
  }
  const updater = getUpdater();
  if (!updater) {
    send({ status: 'error', message: 'Não foi possível baixar a atualização', error: null });
    return { success: false };
  }
  try {
    send({ status: 'downloading', percent: 0, message: 'Baixando atualização...', error: null });
    await updater.downloadUpdate();
    return { success: true };
  } catch (err) {
    send({ status: 'error', message: 'Falha no download da atualização', error: null });
    return { success: false, error: err.message };
  }
}

async function downloadAndInstall() {
  installWhenReady = true;
  if (lastStatus.status === 'ready') {
    return installUpdate();
  }
  if (lastStatus.status !== 'available' && lastStatus.status !== 'downloading') {
    const st = await checkForUpdates();
    if (st.status === 'up-to-date') {
      installWhenReady = false;
      return { success: false, upToDate: true };
    }
    if (st.status !== 'available' && st.status !== 'ready') {
      installWhenReady = false;
      return { success: false };
    }
    if (st.status === 'ready') return installUpdate();
  }
  return downloadUpdate();
}

function installUpdate() {
  if (!app.isPackaged) return { success: false, error: 'Só no Setup instalado' };
  const updater = getUpdater();
  if (!updater) {
    send({ status: 'error', message: 'Não foi possível instalar a atualização', error: null });
    return { success: false };
  }
  try {
    updater.quitAndInstall(false, true);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function getUpdateStatus() {
  return { ...lastStatus, currentVersion: app.getVersion() };
}

module.exports = {
  startAutoUpdater,
  checkForUpdates,
  downloadUpdate,
  downloadAndInstall,
  installUpdate,
  getUpdateStatus,
};
