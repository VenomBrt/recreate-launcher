const { getChangelog } = require('./changelog');
const { getLauncherStatus } = require('./launcher-status');

const POLL_MS = 20_000;

let timer = null;
let mainWindowRef = null;
let lastChangelogKey = '';
let lastStatusKey = '';
let syncing = false;
let lastForceAt = 0;

function fingerprint(obj) {
  try {
    return JSON.stringify(obj);
  } catch {
    return String(Date.now());
  }
}

function changelogKey(data) {
  if (!data) return '';
  return fingerprint({
    latest: data.latest,
    source: data.source,
    entries: (data.entries || []).map((e) => ({
      v: e.version,
      i: e.items,
    })),
  });
}

function statusKey(data) {
  if (!data) return '';
  return fingerprint({
    status: data.status,
    label: data.label,
    message: data.message,
    allowPlay: data.allowPlay,
    whitelistEnabled: data.whitelistEnabled,
    whitelistOriginal: data.whitelistOriginal,
    whitelistPirata: data.whitelistPirata,
    source: data.source,
  });
}

function send(payload) {
  const win = mainWindowRef;
  if (!win || win.isDestroyed()) return;
  try {
    win.webContents.send('remote:sync', payload);
  } catch {}
}

async function pollRemote(force = false) {
  if (syncing) return;
  if (force) {
    const now = Date.now();
    if (now - lastForceAt < 4000) return;
    lastForceAt = now;
  }
  syncing = true;
  try {
    const [changelog, launcherStatus] = await Promise.all([
      getChangelog().catch(() => null),
      getLauncherStatus().catch(() => null),
    ]);

    const payload = {};
    let changed = false;

    if (changelog) {
      const key = changelogKey(changelog);
      if (force || key !== lastChangelogKey) {
        lastChangelogKey = key;
        payload.changelog = changelog;
        changed = true;
      }
    }

    if (launcherStatus) {
      const key = statusKey(launcherStatus);
      if (force || key !== lastStatusKey) {
        lastStatusKey = key;
        payload.launcherStatus = launcherStatus;
        changed = true;
      }
    }

    if (changed || force) send(payload);
  } finally {
    syncing = false;
  }
}

function startRemoteSync(getMainWindow) {
  mainWindowRef = typeof getMainWindow === 'function' ? getMainWindow() : getMainWindow;
  stopRemoteSync();

  const tick = () => {
    mainWindowRef = typeof getMainWindow === 'function' ? getMainWindow() : getMainWindow;
    pollRemote(false);
  };

  // Primeira busca um pouco depois do boot (evita competir com splash)
  setTimeout(tick, 2500);
  timer = setInterval(tick, POLL_MS);
}

function stopRemoteSync() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

function refreshRemoteNow() {
  return pollRemote(true);
}

module.exports = {
  startRemoteSync,
  stopRemoteSync,
  refreshRemoteNow,
  POLL_MS,
};
