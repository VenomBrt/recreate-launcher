const Store = require('./store');

function getTotalPlayMinutes() {
  return Store.get('totalPlayMinutes', 0) || 0;
}

function addPlayTime(minutes) {
  const add = Math.max(0, Math.floor(minutes));
  if (add <= 0) return getTotalPlayMinutes();
  const current = getTotalPlayMinutes();
  const next = current + add;
  Store.set('totalPlayMinutes', next);
  return next;
}

function formatPlayTimeLabel(totalMinutes) {
  if (!totalMinutes || totalMinutes <= 0) {
    return 'Você ainda não jogou';
  }

  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;

  if (hours === 0) {
    return mins === 1 ? '1 minuto jogado' : `${mins} minutos jogados`;
  }

  if (mins === 0) {
    return hours === 1 ? '1 hora jogada' : `${hours} horas jogadas`;
  }

  const hPart = hours === 1 ? '1h' : `${hours}h`;
  const mPart = `${mins}min`;
  return `${hPart} ${mPart} jogados`;
}

function getLevelInfo() {
  const totalMinutes = getTotalPlayMinutes();
  let level = 1;
  let xpNeeded = 60;
  let xpAccumulated = 0;

  while (xpAccumulated + xpNeeded <= totalMinutes) {
    xpAccumulated += xpNeeded;
    level++;
    xpNeeded = Math.floor(45 + level * 25);
  }

  const currentXp = totalMinutes - xpAccumulated;
  const progress = Math.min(100, Math.round((currentXp / xpNeeded) * 100));

  return {
    level,
    totalMinutes,
    currentXp,
    nextXp: xpNeeded,
    progress,
    totalHours: Math.floor(totalMinutes / 60),
    totalMins: totalMinutes % 60,
    neverPlayed: totalMinutes <= 0,
    playTimeLabel: formatPlayTimeLabel(totalMinutes),
  };
}

let sessionStart = null;
let pendingMs = 0;
let tracker = null;
let trackedPid = null;
let onSessionEnd = null;

function isPidAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function flushPending() {
  if (!sessionStart) return 0;
  const now = Date.now();
  pendingMs += now - sessionStart;
  sessionStart = now;

  const wholeMins = Math.floor(pendingMs / 60000);
  if (wholeMins > 0) {
    addPlayTime(wholeMins);
    pendingMs -= wholeMins * 60000;
  }
  return wholeMins;
}

function stopTracker() {
  if (tracker) {
    clearInterval(tracker);
    tracker = null;
  }
}

function notifyLevel() {
  try {
    const { BrowserWindow } = require('electron');
    const info = getLevelInfo();
    BrowserWindow.getAllWindows().forEach((w) => {
      try { w.webContents.send('level:updated', info); } catch {}
    });
  } catch {}
}

/**
 * Inicia contagem de tempo (estilo launcher).
 * Com PID, monitora o processo mesmo com detached.
 */
function startSession(pid = null, hooks = {}) {
  stopTracker();
  sessionStart = Date.now();
  pendingMs = 0;
  trackedPid = pid || null;
  onSessionEnd = typeof hooks.onEnd === 'function' ? hooks.onEnd : null;

  tracker = setInterval(() => {
    if (trackedPid && !isPidAlive(trackedPid)) {
      const minutes = endSession();
      if (onSessionEnd) onSessionEnd({ code: 0, minutes });
      return;
    }
    if (flushPending() > 0) notifyLevel();
  }, 20000);
}

function endSession() {
  stopTracker();
  if (!sessionStart && pendingMs <= 0) {
    trackedPid = null;
    return 0;
  }

  if (sessionStart) {
    pendingMs += Date.now() - sessionStart;
  }
  sessionStart = null;
  trackedPid = null;

  // Sessões curtas >= 20s contam 1 min (padrão de launcher)
  let minutes = Math.floor(pendingMs / 60000);
  if (minutes <= 0 && pendingMs >= 20000) minutes = 1;
  pendingMs = 0;

  if (minutes > 0) {
    addPlayTime(minutes);
    notifyLevel();
  }
  return minutes;
}

function isSessionActive() {
  return !!sessionStart || !!tracker;
}

module.exports = {
  getLevelInfo,
  addPlayTime,
  getTotalPlayMinutes,
  formatPlayTimeLabel,
  startSession,
  endSession,
  isSessionActive,
};
