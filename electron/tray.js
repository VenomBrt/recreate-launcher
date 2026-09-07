const { Tray, Menu, nativeImage, app } = require('electron');
const path = require('path');

let tray = null;
let mainWindowRef = null;
let quitting = false;

function getTrayIcon() {
  const candidates = [
    path.join(__dirname, '..', 'assets', 'icon.ico'),
    path.join(__dirname, '..', 'assets', 'icon.png'),
    path.join(__dirname, '..', 'assets', 'steve-head.png'),
  ];
  for (const p of candidates) {
    const img = nativeImage.createFromPath(p);
    if (!img.isEmpty()) {
      return img.resize({ width: 16, height: 16, quality: 'best' });
    }
  }
  return nativeImage.createEmpty();
}

function buildMenu() {
  return Menu.buildFromTemplate([
    {
      label: 'Abrir Recreate',
      click: () => showMainWindow(),
    },
    { type: 'separator' },
    {
      label: 'Sair',
      click: () => {
        quitting = true;
        try {
          const { stopGame } = require('./minecraft');
          stopGame();
        } catch {}
        app.quit();
      },
    },
  ]);
}

function ensureTray(mainWindow) {
  mainWindowRef = mainWindow;
  if (tray) return tray;

  tray = new Tray(getTrayIcon());
  tray.setToolTip('Recreate');
  tray.setContextMenu(buildMenu());
  tray.on('click', () => showMainWindow());
  tray.on('double-click', () => showMainWindow());
  return tray;
}

function hideToTray(mainWindow) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  ensureTray(mainWindow);
  try {
    mainWindow.webContents.setAudioMuted(true);
    mainWindow.webContents.send('window:active', false);
  } catch {}
  mainWindow.hide();
}

function showMainWindow() {
  const win = mainWindowRef;
  if (!win || win.isDestroyed()) return;
  win.show();
  if (win.isMinimized()) win.restore();
  try {
    win.webContents.setAudioMuted(false);
    win.webContents.send('window:active', true);
  } catch {}
  win.focus();
}

function destroyTray() {
  if (tray) {
    try { tray.destroy(); } catch {}
    tray = null;
  }
}

function isQuitting() {
  return quitting;
}

function setQuitting(value) {
  quitting = !!value;
}

module.exports = {
  ensureTray,
  hideToTray,
  showMainWindow,
  destroyTray,
  isQuitting,
  setQuitting,
};
