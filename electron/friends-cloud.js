/**
 * Sync social (amigos/chat) via Firebase Realtime Database REST.
 * Config: assets/firebase.json  (copie de firebase.example.json)
 */
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

let cachedConfig = null;
let lastWarn = 0;

function configPaths() {
  const list = [];
  try {
    list.push(path.join(app.getAppPath(), 'assets', 'firebase.json'));
  } catch {}
  try {
    list.push(path.join(__dirname, '..', 'assets', 'firebase.json'));
  } catch {}
  if (process.resourcesPath) {
    list.push(path.join(process.resourcesPath, 'assets', 'firebase.json'));
    list.push(path.join(process.resourcesPath, 'firebase.json'));
  }
  return list;
}

function loadConfig() {
  if (cachedConfig !== null) return cachedConfig;
  for (const p of configPaths()) {
    try {
      if (!fs.existsSync(p)) continue;
      const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
      const apiKey = String(raw.apiKey || '').trim();
      const databaseURL = String(raw.databaseURL || '').replace(/\/$/, '').trim();
      if (!databaseURL || databaseURL.includes('SEU-PROJETO') || apiKey.includes('COLE_AQUI')) {
        continue;
      }
      cachedConfig = { apiKey, databaseURL, projectId: raw.projectId || '' };
      return cachedConfig;
    } catch {}
  }
  cachedConfig = false;
  return cachedConfig;
}

function isConfigured() {
  return !!loadConfig();
}

function warnOnce(msg) {
  const now = Date.now();
  if (now - lastWarn < 30000) return;
  lastWarn = now;
  console.warn('[firebase]', msg);
}

function nickKey(nick) {
  return String(nick || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .slice(0, 32);
}

function pairKey(a, b) {
  return [nickKey(a), nickKey(b)].sort().join('__');
}

async function fbFetch(method, pathStr, body) {
  const cfg = loadConfig();
  if (!cfg) return null;

  const clean = String(pathStr || '').replace(/^\/+|\/+$/g, '');
  const url = `${cfg.databaseURL}/${clean}.json`;
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Firebase ${res.status}: ${text.slice(0, 180)}`);
  }
  if (res.status === 204) return null;
  const text = await res.text();
  if (!text) return null;
  return JSON.parse(text);
}

async function fbGet(pathStr) {
  return fbFetch('GET', pathStr);
}

async function fbPut(pathStr, data) {
  return fbFetch('PUT', pathStr, data);
}

async function fbPatch(pathStr, data) {
  return fbFetch('PATCH', pathStr, data);
}

async function fbDelete(pathStr) {
  return fbFetch('DELETE', pathStr);
}

async function publishPresence(nick, presence) {
  if (!isConfigured()) return;
  const key = nickKey(nick);
  if (!key) return;
  await fbPut(`users/${key}`, {
    nick: String(nick).trim().slice(0, 16),
    status: presence.status || 'available',
    inGame: !!presence.inGame,
    display: presence.display || presence.status || 'available',
    updatedAt: Date.now(),
  });
}

async function fetchPresence(nick) {
  if (!isConfigured()) return null;
  return fbGet(`users/${nickKey(nick)}`);
}

async function publishRequest(from, to) {
  if (!isConfigured()) return;
  const payload = {
    from: String(from).trim().slice(0, 16),
    to: String(to).trim().slice(0, 16),
    at: Date.now(),
  };
  await fbPut(`requests/${nickKey(to)}/${nickKey(from)}`, payload);
}

async function deleteRequest(from, to) {
  if (!isConfigured()) return;
  await fbDelete(`requests/${nickKey(to)}/${nickKey(from)}`);
}

async function fetchIncomingRequests(me) {
  if (!isConfigured()) return [];
  const data = await fbGet(`requests/${nickKey(me)}`);
  if (!data || typeof data !== 'object') return [];
  return Object.values(data).filter((r) => r && r.from && r.to);
}

async function fetchOutgoingRequests(me) {
  if (!isConfigured()) return [];
  // RTDB não indexa por from sem query; varremos poucas pastas via shallow? 
  // Solução: espelho em requestsOut/{from}/{to}
  const data = await fbGet(`requestsOut/${nickKey(me)}`);
  if (!data || typeof data !== 'object') return [];
  return Object.values(data).filter((r) => r && r.from && r.to);
}

async function publishRequestMirror(from, to) {
  if (!isConfigured()) return;
  const payload = {
    from: String(from).trim().slice(0, 16),
    to: String(to).trim().slice(0, 16),
    at: Date.now(),
  };
  await fbPut(`requests/${nickKey(to)}/${nickKey(from)}`, payload);
  await fbPut(`requestsOut/${nickKey(from)}/${nickKey(to)}`, payload);
}

async function deleteRequestMirror(from, to) {
  if (!isConfigured()) return;
  await fbDelete(`requests/${nickKey(to)}/${nickKey(from)}`);
  await fbDelete(`requestsOut/${nickKey(from)}/${nickKey(to)}`);
}

async function publishFriendship(a, b, since = Date.now()) {
  if (!isConfigured()) return;
  const key = pairKey(a, b);
  await fbPut(`friendships/${key}`, {
    a: String(a).trim().slice(0, 16),
    b: String(b).trim().slice(0, 16),
    since,
  });
}

async function deleteFriendship(a, b) {
  if (!isConfigured()) return;
  await fbDelete(`friendships/${pairKey(a, b)}`);
}

async function fetchFriendshipsFor(me) {
  if (!isConfigured()) return [];
  const data = await fbGet('friendships');
  if (!data || typeof data !== 'object') return [];
  const meK = nickKey(me);
  const out = [];
  for (const f of Object.values(data)) {
    if (!f?.a || !f?.b) continue;
    if (nickKey(f.a) === meK || nickKey(f.b) === meK) out.push(f);
  }
  return out;
}

async function publishChatMessage(a, b, msg) {
  if (!isConfigured()) return;
  const key = pairKey(a, b);
  const id = msg.id || `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  await fbPut(`chats/${key}/${id}`, {
    id,
    from: msg.from,
    text: msg.text,
    at: msg.at || Date.now(),
  });
}

async function fetchChatMessages(a, b) {
  if (!isConfigured()) return [];
  const data = await fbGet(`chats/${pairKey(a, b)}`);
  if (!data || typeof data !== 'object') return [];
  return Object.values(data)
    .filter((m) => m && m.text)
    .sort((x, y) => (x.at || 0) - (y.at || 0));
}

async function clearChatMessages(a, b) {
  if (!isConfigured()) return;
  await fbDelete(`chats/${pairKey(a, b)}`);
}

async function publishGroup(group) {
  if (!isConfigured()) return;
  await fbPut(`groups/${group.id}`, {
    id: group.id,
    name: group.name,
    members: group.members,
    createdBy: group.createdBy,
    createdAt: group.createdAt || Date.now(),
  });
}

async function fetchGroupsFor(me) {
  if (!isConfigured()) return [];
  const data = await fbGet('groups');
  if (!data || typeof data !== 'object') return [];
  const meK = nickKey(me);
  return Object.values(data).filter(
    (g) => Array.isArray(g?.members) && g.members.some((m) => nickKey(m) === meK),
  );
}

async function deleteGroup(groupId) {
  if (!isConfigured()) return;
  await fbDelete(`groups/${groupId}`);
  await fbDelete(`groupChats/${groupId}`);
}

async function patchGroup(groupId, patch) {
  if (!isConfigured()) return;
  await fbPatch(`groups/${groupId}`, patch);
}

async function publishGroupMessage(groupId, msg) {
  if (!isConfigured()) return;
  const id = msg.id || `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  await fbPut(`groupChats/${groupId}/${id}`, {
    id,
    from: msg.from,
    text: msg.text,
    at: msg.at || Date.now(),
  });
}

async function fetchGroupMessages(groupId) {
  if (!isConfigured()) return [];
  const data = await fbGet(`groupChats/${groupId}`);
  if (!data || typeof data !== 'object') return [];
  return Object.values(data)
    .filter((m) => m && m.text)
    .sort((x, y) => (x.at || 0) - (y.at || 0));
}

async function clearGroupMessages(groupId) {
  if (!isConfigured()) return;
  await fbDelete(`groupChats/${groupId}`);
}

function status() {
  const cfg = loadConfig();
  if (!cfg) {
    warnOnce('firebase.json não configurado — amigos só locais neste PC.');
    return { ok: false, configured: false };
  }
  return { ok: true, configured: true, databaseURL: cfg.databaseURL };
}

module.exports = {
  isConfigured,
  status,
  loadConfig,
  nickKey,
  pairKey,
  fbGet,
  fbPut,
  fbPatch,
  fbDelete,
  publishPresence,
  fetchPresence,
  publishRequestMirror,
  deleteRequestMirror,
  fetchIncomingRequests,
  fetchOutgoingRequests,
  publishFriendship,
  deleteFriendship,
  fetchFriendshipsFor,
  publishChatMessage,
  fetchChatMessages,
  clearChatMessages,
  publishGroup,
  fetchGroupsFor,
  deleteGroup,
  patchGroup,
  publishGroupMessage,
  fetchGroupMessages,
  clearGroupMessages,
};
