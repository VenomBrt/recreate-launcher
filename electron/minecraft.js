const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { app } = require('electron');
const { Client } = require('minecraft-launcher-core');
const { getGameDir, getLocalAppData } = require('./mods-manager');
const { getAuthForLaunch } = require('./auth');
const { applySkin } = require('./skins');
const { startSession, endSession } = require('./level');

const MC_VERSION = '1.20.1';
const FORGE_VERSION = '47.4.20';
const FORGE_ID = `${MC_VERSION}-forge-${FORGE_VERSION}`;
const FORGE_INSTALLER_URL =
  `https://maven.minecraftforge.net/net/minecraftforge/forge/${MC_VERSION}-${FORGE_VERSION}/forge-${MC_VERSION}-${FORGE_VERSION}-installer.jar`;

let installState = { installing: false, ready: false };
let activeProcess = null;
let launchClient = null;
let prefetchPromise = null;

/** Usa .minecraft para libs/assets (reaproveita o que já existe no PC) */
function getMinecraftRoot() {
  const dir = path.join(app.getPath('appData'), '.minecraft');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getLaunchLogPath() {
  return path.join(getLocalAppData(), 'Recreate', 'launch.log');
}

function appendLaunchLog(line) {
  try {
    const p = getLaunchLogPath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.appendFileSync(p, `[${new Date().toISOString()}] ${line}\n`);
  } catch {}
}

function getCacheDir() {
  const dir = path.join(getLocalAppData(), 'Recreate', 'cache');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getForgeInstallerPath() {
  return path.join(getCacheDir(), `forge-${MC_VERSION}-${FORGE_VERSION}-installer.jar`);
}

function emitProgress(onProgress, stage, message, percent) {
  if (onProgress) {
    onProgress({ stage, message, percent: Math.min(100, Math.max(0, percent)) });
  }
}

function withTimeout(promise, ms, message) {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    }),
  ]);
}

async function downloadFile(url, dest, onProgress, label = 'Download') {
  const fetch = require('node-fetch');
  emitProgress(onProgress, 'download', `${label}...`, 12);

  const res = await withTimeout(
    fetch(url, { timeout: 60000 }),
    90000,
    `Tempo esgotado ao baixar: ${label}`,
  );
  if (!res.ok) throw new Error(`Download falhou (${res.status}): ${label}`);

  const total = Number(res.headers.get('content-length') || 0);
  const chunks = [];
  let received = 0;

  await new Promise((resolve, reject) => {
    res.body.on('data', (chunk) => {
      chunks.push(chunk);
      received += chunk.length;
      if (total > 0) {
        const pct = 12 + Math.floor((received / total) * 30);
        emitProgress(onProgress, 'download', `${label} ${Math.floor((received / total) * 100)}%`, pct);
      }
    });
    res.body.on('end', resolve);
    res.body.on('error', reject);
  });

  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const tmp = `${dest}.part`;
  fs.writeFileSync(tmp, Buffer.concat(chunks));
  fs.renameSync(tmp, dest);
  return dest;
}

async function ensureForgeInstaller(onProgress) {
  const installerPath = getForgeInstallerPath();
  if (fs.existsSync(installerPath) && fs.statSync(installerPath).size > 1_000_000) {
    return installerPath;
  }

  emitProgress(onProgress, 'forge', 'Baixando cliente Forge...', 10);
  await downloadFile(FORGE_INSTALLER_URL, installerPath, onProgress, 'Forge');
  emitProgress(onProgress, 'forge', 'Forge pronto', 42);
  return installerPath;
}

/** Pré-baixa Forge em background ao abrir o launcher */
function prefetchForge() {
  if (prefetchPromise) return prefetchPromise;
  prefetchPromise = ensureForgeInstaller(null).catch((err) => {
    console.warn('[prefetch forge]', err.message);
    prefetchPromise = null;
  });
  return prefetchPromise;
}

async function installForge(onProgress) {
  if (installState.installing) return;
  installState.installing = true;
  try {
    validateJava();
    await ensureForgeInstaller(onProgress);
    emitProgress(onProgress, 'done', 'Pronto para jogar!', 100);
    installState.ready = true;
  } finally {
    installState.installing = false;
  }
}

function findJava() {
  if (process.platform === 'win32') {
    const candidates = [
      process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin', 'java.exe') : null,
      'C:\\Program Files\\Java\\jdk-17\\bin\\java.exe',
      'C:\\Program Files\\Eclipse Adoptium\\jdk-17.0.13.11-hotspot\\bin\\java.exe',
      'C:\\Program Files\\Eclipse Adoptium\\jdk-17.0.14.7-hotspot\\bin\\java.exe',
      'C:\\Program Files\\Eclipse Adoptium\\jdk-21.0.6.7-hotspot\\bin\\java.exe',
      'C:\\Program Files\\Zulu\\zulu-17\\bin\\java.exe',
      'C:\\Program Files\\Microsoft\\jdk-17.0.13.11-hotspot\\bin\\java.exe',
      'C:\\Program Files\\Amazon Corretto\\jdk17.0.13_11\\bin\\java.exe',
    ].filter(Boolean);

    for (const java of candidates) {
      if (fs.existsSync(java)) return java;
    }

    try {
      const result = execSync('where java', { encoding: 'utf8' }).trim().split(/\r?\n/)[0];
      if (result && fs.existsSync(result.trim())) return result.trim();
    } catch {}

    return 'java';
  }

  // Linux / macOS
  const candidates = [
    process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin', 'java') : null,
    '/usr/lib/jvm/java-17-openjdk-amd64/bin/java',
    '/usr/lib/jvm/java-17-openjdk/bin/java',
    '/usr/lib/jvm/temurin-17-jdk-amd64/bin/java',
    '/usr/lib/jvm/jdk-17/bin/java',
    '/usr/lib/jvm/java-21-openjdk-amd64/bin/java',
    '/opt/homebrew/opt/openjdk@17/bin/java',
    '/usr/local/opt/openjdk@17/bin/java',
    '/usr/bin/java',
  ].filter(Boolean);

  for (const java of candidates) {
    if (fs.existsSync(java)) return java;
  }

  try {
    const result = execSync('which java', { encoding: 'utf8' }).trim().split(/\r?\n/)[0];
    if (result && fs.existsSync(result.trim())) return result.trim();
  } catch {}

  return 'java';
}

function validateJava() {
  const javaPath = findJava();

  if (javaPath !== 'java' && !fs.existsSync(javaPath)) {
    throw new Error('Java 17+ não encontrado. Instale o Temurin JDK 17 e tente novamente.');
  }

  try {
    const output = execSync(`"${javaPath}" -version 2>&1`, { encoding: 'utf8' });
    const major = parseJavaMajor(output);
    if (major && major < 17) {
      throw new Error(`Java ${major} detectado. O Recreate precisa do Java 17+.`);
    }
  } catch (err) {
    if (err.message?.includes('Java')) throw err;
    throw new Error('Java 17+ não encontrado: https://adoptium.net/temurin/releases/?version=17');
  }

  return javaPath;
}

function parseJavaMajor(versionOutput) {
  const match = versionOutput.match(/version "(\d+)/);
  if (!match) return null;
  const n = parseInt(match[1], 10);
  return n === 1 ? parseInt(versionOutput.match(/version "1\.(\d+)/)?.[1] || '0', 10) : n;
}

function getJavaStatus() {
  try {
    const pathStr = validateJava();
    const ver = execSync(`"${pathStr}" -version 2>&1`, { encoding: 'utf8' }).split('\n')[0];
    return { ok: true, path: pathStr, version: ver.trim() };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function isGameRunning() {
  if (!activeProcess) return false;
  try {
    if (activeProcess.killed) return false;
    // processo detachado: valida PID
    if (activeProcess.pid) {
      try {
        process.kill(activeProcess.pid, 0);
        return true;
      } catch {
        activeProcess = null;
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

/** true se já tem mine aberto OU lançamento em andamento (evita dois cliques) */
let launchInFlight = false;

function isLaunchBusy() {
  return launchInFlight || isGameRunning();
}

function stopGame() {
  launchInFlight = false;
  if (!isGameRunning()) {
    activeProcess = null;
    return { success: true, alreadyStopped: true };
  }

  const proc = activeProcess;
  const pid = proc?.pid;
  appendLaunchLog(`stopGame pid=${pid || '?'}`);

  try {
    if (process.platform === 'win32' && pid) {
      try {
        execSync(`taskkill /PID ${pid} /T /F`, { windowsHide: true, stdio: 'ignore' });
      } catch {
        try { proc.kill(); } catch {}
      }
    } else if (proc) {
      try { proc.kill('SIGTERM'); } catch {}
    }
  } catch (err) {
    appendLaunchLog(`stopGame error: ${err.message}`);
  }

  activeProcess = null;
  const minutes = endSession();
  appendLaunchLog(`stopped +${minutes}min`);

  try {
    const { BrowserWindow } = require('electron');
    BrowserWindow.getAllWindows().forEach((w) => {
      w.webContents.send('launcher:game-closed', { code: 0, minutes, stoppedByUser: true });
    });
  } catch {}

  return { success: true, minutes };
}

function getLaunchStatus() {
  const installer = getForgeInstallerPath();
  const forgeReady = fs.existsSync(installer) && fs.statSync(installer).size > 1_000_000;
  return {
    gameDir: getGameDir(),
    forgeInstalled: forgeReady,
    ready: forgeReady,
  };
}

async function launchGame({ username, ram = 4, accountType }, onProgress) {
  if (isLaunchBusy()) {
    throw new Error('O Minecraft já está em execução.');
  }
  launchInFlight = true;

  try {
    fs.writeFileSync(getLaunchLogPath(), '');
  } catch {}
  appendLaunchLog(`launch start user=${username} type=${accountType} ram=${ram}`);

  try {
  const javaPath = validateJava();
  appendLaunchLog(`java=${javaPath}`);
  emitProgress(onProgress, 'java', 'Verificando Java...', 8);

  // Forge + auth em paralelo = bem mais rápido
  emitProgress(onProgress, 'boot', 'Preparando Forge e conta...', 15);
  const [forgeInstaller, authResult] = await Promise.all([
    ensureForgeInstaller((p) => {
      if (!p) return;
      emitProgress(
        onProgress,
        p.stage || 'forge',
        p.message || 'Forge...',
        Math.min(40, 15 + (p.percent || 0) * 0.25),
      );
    }),
    withTimeout(
      getAuthForLaunch(username, accountType),
      60000,
      'Autenticação demorou demais. Tente novamente ou entre de novo na aba Conta.',
    ),
  ]);

  const { auth, username: playerName, uuid, type } = authResult;
  appendLaunchLog(`forgeInstaller=${forgeInstaller}`);
  appendLaunchLog(`auth ok name=${playerName} type=${type}`);

  if (!auth || !auth.access_token) {
    throw new Error('Autenticação inválida. Entre na conta novamente.');
  }

  try {
    const accessToken = type === 'premium' ? auth.access_token : null;
    await applySkin(playerName, type, uuid, accessToken, { skipNetwork: true });
  } catch (err) {
    appendLaunchLog(`skin warn: ${err.message}`);
  }

  emitProgress(onProgress, 'launch', 'Baixando libs / iniciando...', 45);

  const gameDir = getGameDir();
  const root = getMinecraftRoot();
  fs.mkdirSync(gameDir, { recursive: true });
  appendLaunchLog(`root=${root}`);
  appendLaunchLog(`gameDir=${gameDir}`);

  if (launchClient) {
    try { launchClient.removeAllListeners(); } catch {}
  }

  const client = new Client();
  launchClient = client;

  const LAUNCH_TIMEOUT_MS = 25 * 60 * 1000;
  let lastProgressAt = Date.now();
  let lastProgressPct = 45;

  const opts = {
    authorization: auth,
    root,
    javaPath,
    version: {
      number: MC_VERSION,
      type: 'release',
    },
    forge: forgeInstaller,
    memory: {
      max: `${ram}G`,
      min: `${Math.max(1, Math.floor(ram / 2))}G`,
    },
    timeout: 120000,
    overrides: {
      gameDirectory: gameDir,
      detached: true,
      maxSockets: 8,
    },
  };

  const notifyClosed = (code, minutes) => {
    try {
      const { BrowserWindow } = require('electron');
      BrowserWindow.getAllWindows().forEach((w) => {
        w.webContents.send('launcher:game-closed', { code, minutes });
      });
    } catch {}
  };

  return await new Promise((resolve, reject) => {
    let launched = false;
    let settled = false;

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(launchTimeout);
      clearInterval(stallTimer);
      if (!launched) launchInFlight = false;
      fn(value);
    };

    const launchTimeout = setTimeout(() => {
      appendLaunchLog('timeout');
      finish(reject, new Error('Tempo esgotado ao iniciar. Verifique a internet e tente de novo.'));
    }, LAUNCH_TIMEOUT_MS);

    const stallTimer = setInterval(() => {
      if (launched) return;
      if (Date.now() - lastProgressAt > 5 * 60 * 1000) {
        appendLaunchLog('stall');
        finish(reject, new Error('Download travou. Verifique conexão/firewall e tente novamente.'));
      }
    }, 20000);

    const reportProgress = (stage, message, percent) => {
      lastProgressAt = Date.now();
      lastProgressPct = percent;
      emitProgress(onProgress, stage, message, percent);
    };

    client.on('progress', (e) => {
      const typeName = e?.type || 'arquivos';
      let pct = lastProgressPct;
      if (e?.task !== undefined && e?.total) {
        pct = 45 + ((e.task || 0) / Math.max(1, e.total)) * 50;
      } else {
        pct = Math.min(94, lastProgressPct + 0.5);
      }
      reportProgress('download', `Baixando ${typeName}...`, pct);
    });

    client.on('download-status', (e) => {
      if (!e) return;
      const name = e.name || e.type || 'arquivo';
      let pct = lastProgressPct;
      if (e.current != null && e.total) {
        pct = 45 + (e.current / Math.max(1, e.total)) * 50;
      }
      reportProgress('download', `Baixando ${name}...`, pct);
    });

    client.on('debug', (line) => {
      if (line) {
        console.log('[MCLC]', line);
        appendLaunchLog(String(line));
      }
    });

    client.on('data', (line) => {
      const text = String(line || '');
      appendLaunchLog(`MC: ${text.slice(0, 300)}`);
      if (
        text.includes('Setting user')
        || text.includes('ModLauncher')
        || text.includes('OpenGL')
        || text.includes('LWJGL')
      ) {
        reportProgress('running', 'Minecraft iniciado!', 100);
      }
    });

    client.on('close', (code) => {
      activeProcess = null;
      launchInFlight = false;
      const minutes = endSession();
      appendLaunchLog(`close code=${code} +${minutes}min`);
      notifyClosed(code, minutes);
    });

    client.launch(opts).then((proc) => {
      if (!proc) {
        appendLaunchLog('launch returned null process');
        finish(reject, new Error('Falha ao criar o processo do Minecraft.'));
        return;
      }
      launched = true;
      activeProcess = proc;
      launchInFlight = false;
      startSession(proc.pid, {
        onEnd: ({ code, minutes }) => {
          activeProcess = null;
          launchInFlight = false;
          appendLaunchLog(`pid-end code=${code} +${minutes}min`);
          notifyClosed(code, minutes);
        },
      });
      appendLaunchLog(`spawned pid=${proc.pid}`);
      reportProgress('running', 'Minecraft em execução!', 100);
      finish(resolve, { pid: proc.pid, username: playerName });
    }).catch((err) => {
      activeProcess = null;
      launchInFlight = false;
      const msg = err?.message || String(err);
      appendLaunchLog(`launch error: ${msg}`);
      console.error('[launch]', msg);
      if (!launched) {
        if (/java/i.test(msg)) {
          finish(reject, new Error('Erro de Java. Instale o JDK 17+ e tente novamente.'));
        } else if (/auth|token|microsoft|sessão|sessao/i.test(msg)) {
          finish(reject, new Error(msg.includes('Autenticação') ? msg : 'Falha na autenticação. Entre de novo na aba Conta.'));
        } else {
          finish(reject, new Error(msg || 'Falha ao iniciar o Minecraft.'));
        }
      }
    });
  });
  } catch (err) {
    launchInFlight = false;
    throw err;
  }
}

module.exports = {
  installForge,
  launchGame,
  getLaunchStatus,
  getJavaStatus,
  isGameRunning,
  isLaunchBusy,
  stopGame,
  findJava,
  validateJava,
  ensureForgeInstaller,
  prefetchForge,
  getForgeInstallerPath,
  getMinecraftRoot,
  MC_VERSION,
  FORGE_VERSION,
  FORGE_ID,
};
