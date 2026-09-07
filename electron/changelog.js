const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { app } = require('electron');
const { getLocalAppData } = require('./mods-manager');

const REPO = 'VenomBrt/recreate-essencial-sync';
const LOG_PATH = 'log.txt';

function getCachePath() {
  const dir = path.join(getLocalAppData(), 'Recreate', 'cache');
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'changelog.txt');
}

function getBundledPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'log.txt');
  }
  return path.join(__dirname, '..', 'assets', 'log.txt');
}

function decodeBuffer(buf) {
  if (!buf || !buf.length) return null;
  // UTF-16 LE with or without BOM (common Windows mishap)
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
      ['api', `repos/${REPO}/contents/${LOG_PATH}`, '-H', 'Accept: application/vnd.github.raw'],
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
    fetch(`https://api.github.com/repos/${REPO}/contents/${LOG_PATH}?ref=master&_=${Date.now()}`, {
      headers,
    }),
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 15000)),
  ]);

  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  return res.text();
}

function parseChangelog(raw) {
  const text = String(raw || '').replace(/^\uFEFF/, '').trim();
  const lines = text.split(/\r?\n/);
  const entries = [];
  let current = null;

  for (const line of lines) {
    const ver = line.match(/^v?\d+\.\d+(\.\d+)?\b/i);
    if (ver && !line.trim().startsWith('-') && !line.trim().startsWith('#')) {
      current = {
        version: line.trim().replace(/^v/i, 'v').replace(/^(\d)/, 'v$1'),
        items: [],
      };
      if (!current.version.startsWith('v')) current.version = `v${current.version}`;
      // normalize v0.3.10 style
      const m = line.trim().match(/^v?(\d+\.\d+(?:\.\d+)?)/i);
      if (m) current.version = `v${m[1]}`;
      entries.push(current);
      continue;
    }

    const bullet = line.match(/^\s*[-•*]\s*(.+)\s*$/);
    if (bullet && current) {
      current.items.push(bullet[1].trim());
    }
  }

  const latest = entries[0]?.version || 'v0.3.10';
  return { latest, entries, raw: text };
}

async function getChangelog() {
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
      latest: 'v0.3.10',
      entries: [],
      source: 'empty',
      error: 'Log de atualizações indisponível.',
    };
  }

  const parsed = parseChangelog(raw);
  return { ...parsed, source };
}

module.exports = {
  getChangelog,
  parseChangelog,
  REPO,
};
