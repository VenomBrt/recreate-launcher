const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { app } = require('electron');
const { getLocalAppData } = require('./mods-manager');

const REPO = 'VenomBrt/recreate-essencial-sync';
const FILE_PATH = 'launcher.txt';

const STATUS_META = {
  online: {
    tone: 'online',
    defaultLabel: 'Servidor aberto',
    defaultMessage: 'Servidor online — pode jogar!',
  },
  development: {
    tone: 'dev',
    defaultLabel: 'Em desenvolvimento',
    defaultMessage: 'Servidor em desenvolvimento.',
  },
  demo: {
    tone: 'demo',
    defaultLabel: 'Modo Demo',
    defaultMessage: 'Servidor em modo demo — acesso limitado.',
  },
  maintenance: {
    tone: 'warn',
    defaultLabel: 'Manutenção',
    defaultMessage: 'Servidor em manutenção. Volte em breve.',
  },
  offline: {
    tone: 'offline',
    defaultLabel: 'Servidor fechado',
    defaultMessage: 'Servidor offline no momento.',
  },
};

function getCachePath() {
  const dir = path.join(getLocalAppData(), 'Recreate', 'cache');
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'launcher-status.txt');
}

function getBundledPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'launcher.txt');
  }
  return path.join(__dirname, '..', 'assets', 'launcher.txt');
}

function decodeBuffer(buf) {
  if (!buf || !buf.length) return null;
  if (buf[0] === 0xff && buf[1] === 0xfe) return buf.slice(2).toString('utf16le');
  if (buf.length >= 4 && buf[1] === 0x00 && buf[3] === 0x00 && buf[0] !== 0x00) {
    return buf.toString('utf16le');
  }
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return buf.slice(3).toString('utf8');
  }
  return buf.toString('utf8');
}

function readTextSafe(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return decodeBuffer(fs.readFileSync(filePath));
  } catch {
    return null;
  }
}

function fetchViaGh() {
  try {
    const buf = execFileSync(
      'gh',
      ['api', `repos/${REPO}/contents/${FILE_PATH}`, '-H', 'Accept: application/vnd.github.raw'],
      { encoding: 'buffer', timeout: 20000, windowsHide: true },
    );
    return decodeBuffer(buf);
  } catch {
    return null;
  }
}

async function fetchViaApi() {
  const fetch = require('node-fetch');
  let token = null;
  try {
    token = execFileSync('gh', ['auth', 'token'], {
      encoding: 'utf8',
      timeout: 8000,
      windowsHide: true,
    }).trim();
  } catch {}

  const headers = {
    Accept: 'application/vnd.github.raw',
    'User-Agent': 'Recreate-Launcher',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await Promise.race([
    fetch(`https://api.github.com/repos/${REPO}/contents/${FILE_PATH}?ref=master&_=${Date.now()}`, {
      headers,
    }),
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 15000)),
  ]);

  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  return res.text();
}

function parseNameList(value) {
  if (!value) return [];
  return String(value)
    .split(/[,;\n]+/)
    .map((n) => n.trim())
    .filter(Boolean);
}

function normalizeNick(nick) {
  return String(nick || '').trim().toLowerCase();
}

function parseBool(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') return defaultValue;
  const v = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'on', 'sim', 'aberta', 'aberto'].includes(v)) return true;
  if (['false', '0', 'no', 'off', 'nao', 'não', 'fechada', 'fechado'].includes(v)) return false;
  return defaultValue;
}

/**
 * Formato do launcher.txt:
 *
 * status=demo
 * whitelist=true
 * whitelist_original=VenomBrt, zlargo1
 * whitelist_pirata=AmigoOffline
 * admins=VenomBrt, zlargo1
 *
 * Ou blocos:
 * [original]
 * VenomBrt
 * [pirata]
 * AmigoOffline
 * [admins]
 * VenomBrt
 */
function parseLauncherStatus(raw) {
  const text = String(raw || '').replace(/^\uFEFF/, '');
  const map = {};
  const sectionLists = {
    original: [],
    pirata: [],
    admins: [],
  };
  let section = null;

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const sectionMatch = trimmed.match(/^\[(original|pirata|whitelist_original|whitelist_pirata|premium|cracked|admins|admin|conexa_admins)\]$/i);
    if (sectionMatch) {
      const name = sectionMatch[1].toLowerCase();
      if (name.includes('pirata') || name === 'cracked') section = 'pirata';
      else if (name.includes('admin')) section = 'admins';
      else section = 'original';
      continue;
    }

    if (section && !trimmed.includes('=')) {
      sectionLists[section].push(trimmed);
      continue;
    }

    section = null;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim().toLowerCase();
    const value = trimmed.slice(eq + 1).trim();
    map[key] = value;
  }

  let status = String(map.status || 'online').toLowerCase();
  if (!STATUS_META[status]) status = 'online';
  const meta = STATUS_META[status];

  const allowPlayRaw = map.allow_play;
  let allowPlay = parseBool(allowPlayRaw, true);
  if ((status === 'offline' || status === 'maintenance') && (allowPlayRaw === undefined || allowPlayRaw === '')) {
    allowPlay = false;
  }

  const whitelistEnabled = parseBool(
    map.whitelist ?? map.whitelist_open ?? map.whitelist_aberta,
    false,
  );

  const whitelistOriginal = [
    ...parseNameList(map.whitelist_original || map.original || map.premium),
    ...sectionLists.original,
  ].map(normalizeNick).filter(Boolean);

  const whitelistPirata = [
    ...parseNameList(map.whitelist_pirata || map.pirata || map.cracked || map.offline),
    ...sectionLists.pirata,
  ].map(normalizeNick).filter(Boolean);

  const admins = [
    ...parseNameList(map.admins || map.admin || map.conexa_admins),
    ...sectionLists.admins,
  ].map(normalizeNick).filter(Boolean);

  // unique
  const uniq = (arr) => [...new Set(arr)];

  return {
    status,
    tone: meta.tone,
    label: map.label || meta.defaultLabel,
    message: map.message || meta.defaultMessage,
    allowPlay,
    whitelistEnabled,
    whitelistOriginal: uniq(whitelistOriginal),
    whitelistPirata: uniq(whitelistPirata),
    admins: uniq(admins),
    raw: text,
  };
}

function checkWhitelistAccess(statusInfo, { username, accountType }) {
  if (!statusInfo?.whitelistEnabled) {
    return { allowed: true };
  }

  const nick = normalizeNick(username);
  if (!nick) {
    return { allowed: false, error: 'Nickname inválido para a whitelist.' };
  }

  const type = accountType === 'premium' ? 'premium' : 'cracked';

  if (type === 'premium') {
    if (!statusInfo.whitelistOriginal.includes(nick)) {
      return {
        allowed: false,
        error: 'Sua conta original não está na whitelist. Peça acesso ao staff.',
      };
    }
    return { allowed: true, list: 'original' };
  }

  // pirata
  if (!statusInfo.whitelistPirata.includes(nick)) {
    return {
      allowed: false,
      error: 'Seu nick pirata não está na whitelist. Peça acesso ao staff.',
    };
  }
  return { allowed: true, list: 'pirata' };
}

async function getLauncherStatus() {
  let raw = null;
  let source = 'bundle';

  raw = fetchViaGh();
  if (raw) source = 'github-gh';

  if (!raw) {
    try {
      raw = await fetchViaApi();
      source = 'github-api';
    } catch {}
  }

  if (raw) {
    try {
      fs.writeFileSync(getCachePath(), raw, 'utf8');
    } catch {}
  }

  if (!raw) {
    raw = readTextSafe(getCachePath());
    if (raw) source = 'cache';
  }

  if (!raw) {
    raw = readTextSafe(getBundledPath());
    source = 'bundle';
  }

  if (!raw) {
    return {
      status: 'online',
      tone: 'online',
      label: 'Servidor',
      message: 'Status indisponível.',
      allowPlay: true,
      whitelistEnabled: false,
      whitelistOriginal: [],
      whitelistPirata: [],
      source: 'empty',
    };
  }

  return { ...parseLauncherStatus(raw), source };
}

module.exports = {
  getLauncherStatus,
  parseLauncherStatus,
  checkWhitelistAccess,
  REPO,
  FILE_PATH,
};
