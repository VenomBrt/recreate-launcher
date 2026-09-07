const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const Store = require('./store');
const { getServerStatus } = require('./server');
const Cloud = require('./friends-cloud');

const MAX_MESSAGES = 1000;
const MAX_TEXT = 2000;
const MAX_GROUP_MEMBERS = 10;
const MIN_GROUP_MEMBERS = 3;

function friendsDir() {
  return path.join(app.getPath('userData'), 'friends');
}

function socialPath() {
  return path.join(friendsDir(), 'social.json');
}

function readsPath() {
  return path.join(friendsDir(), 'reads.json');
}

function dmChatFile(nickA, nickB) {
  const key = pairKey(nickA, nickB);
  return path.join(friendsDir(), 'chats', `${key}.json`);
}

/** Compat: chats antigos eram chats/{amigo}.json */
function legacyDmChatFile(friendNick) {
  const key = normalizeNick(friendNick).replace(/[^a-z0-9_]/g, '_');
  return path.join(friendsDir(), 'chats', `${key}.json`);
}

function resolveDmFile(me, other) {
  const file = dmChatFile(me, other);
  if (fs.existsSync(file)) return file;
  const legacy = legacyDmChatFile(other);
  if (fs.existsSync(legacy)) return legacy;
  return file;
}

function groupChatFile(groupId) {
  const safe = String(groupId).replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(friendsDir(), 'groups', `${safe}.json`);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function normalizeNick(name) {
  return String(name || '').trim().toLowerCase();
}

function displayNick(name) {
  return String(name || '').trim().slice(0, 16);
}

function validateNick(name) {
  const n = displayNick(name);
  if (!/^[a-zA-Z0-9_]{1,16}$/.test(n)) throw new Error('Nickname inválido');
  return n;
}

function requireMe(me) {
  const nick = displayNick(me);
  if (!nick) throw new Error('Faça login ou defina um nickname na Conta');
  return validateNick(nick);
}

function pairKey(a, b) {
  return [normalizeNick(a), normalizeNick(b)].sort().join('__');
}

function sameNick(a, b) {
  return normalizeNick(a) === normalizeNick(b);
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function defaultSocial() {
  return { friendships: [], requests: [], groups: [], presence: {} };
}

function loadSocial() {
  try {
    if (fs.existsSync(socialPath())) {
      const data = JSON.parse(fs.readFileSync(socialPath(), 'utf8'));
      return {
        friendships: Array.isArray(data.friendships) ? data.friendships : [],
        requests: Array.isArray(data.requests) ? data.requests : [],
        groups: Array.isArray(data.groups) ? data.groups : [],
        presence: data.presence && typeof data.presence === 'object' ? data.presence : {},
      };
    }
  } catch {}
  return defaultSocial();
}

function saveSocial(data) {
  ensureDir(friendsDir());
  fs.writeFileSync(socialPath(), JSON.stringify(data, null, 2), 'utf8');
}

function loadReads() {
  try {
    if (fs.existsSync(readsPath())) {
      const data = JSON.parse(fs.readFileSync(readsPath(), 'utf8'));
      return data && typeof data === 'object' ? data : {};
    }
  } catch {}
  return {};
}

function saveReads(data) {
  ensureDir(friendsDir());
  fs.writeFileSync(readsPath(), JSON.stringify(data, null, 2), 'utf8');
}

function readKey(kind, id) {
  return `${kind}:${normalizeNick(id)}`;
}

function getLastRead(me, kind, id) {
  const all = loadReads();
  const mine = all[normalizeNick(me)] || {};
  return Number(mine[readKey(kind, id)] || 0);
}

function markChatRead(meNick, kind, id) {
  const me = requireMe(meNick);
  const all = loadReads();
  const key = normalizeNick(me);
  if (!all[key]) all[key] = {};
  all[key][readKey(kind, id)] = Date.now();
  saveReads(all);
  return true;
}

function countUnread(messages, me, lastRead) {
  if (!messages.length) return 0;
  let n = 0;
  for (const m of messages) {
    if (m.at <= lastRead) continue;
    if (sameNick(m.from, me)) continue;
    n += 1;
  }
  return n;
}

const PRESENCE_STATUSES = new Set(['available', 'away', 'dnd', 'invisible']);
const PRESENCE_STALE_MS = 2 * 60 * 1000;

function presenceLabel(display) {
  switch (display) {
    case 'available': return 'Disponível';
    case 'away': return 'Ausente';
    case 'dnd': return 'Não perturbar';
    case 'ingame': return 'No Jogo';
    case 'invisible': return 'Invisível';
    default: return 'Offline';
  }
}

function resolvePresence(entry, { forSelf = false } = {}) {
  if (!entry || typeof entry !== 'object') {
    return { status: 'available', display: forSelf ? 'available' : 'offline', label: forSelf ? 'Disponível' : 'Offline', inGame: false };
  }
  const status = PRESENCE_STATUSES.has(entry.status) ? entry.status : 'available';
  const updatedAt = Number(entry.updatedAt) || 0;
  const inGame = !!entry.inGame;
  const stale = Date.now() - updatedAt > PRESENCE_STALE_MS;

  if (!forSelf) {
    if (status === 'invisible' || stale) {
      return { status, display: 'offline', label: 'Offline', inGame: false };
    }
    if (status === 'available' && inGame) {
      return { status, display: 'ingame', label: 'No Jogo', inGame: true };
    }
    return { status, display: status, label: presenceLabel(status), inGame: false };
  }

  // Próprio perfil
  if (status === 'invisible') {
    return { status, display: 'invisible', label: 'Invisível', inGame: false };
  }
  if (status === 'available' && inGame) {
    return { status, display: 'ingame', label: 'No Jogo', inGame: true };
  }
  return { status, display: status, label: presenceLabel(status), inGame: false };
}

function getPresence(meNick) {
  const me = requireMe(meNick);
  const social = loadSocial();
  const entry = social.presence?.[normalizeNick(me)] || null;
  return resolvePresence(entry, { forSelf: true });
}

function setPresence(meNick, status, extras = {}) {
  const me = requireMe(meNick);
  const next = String(status || 'available').toLowerCase();
  if (next === 'ingame') throw new Error('No Jogo não pode ser selecionado');
  if (!PRESENCE_STATUSES.has(next)) throw new Error('Status inválido');

  const social = loadSocial();
  if (!social.presence) social.presence = {};
  const key = normalizeNick(me);
  const prev = social.presence[key] || {};
  const keepInGame = next === 'available' && (
    typeof extras.inGame === 'boolean' ? extras.inGame : !!prev.inGame
  );

  social.presence[key] = {
    nick: me,
    status: next,
    inGame: keepInGame,
    updatedAt: Date.now(),
  };
  saveSocial(social);
  const resolved = resolvePresence(social.presence[key], { forSelf: true });
  cloudSafe(() => Cloud.publishPresence(me, {
    status: social.presence[key].status,
    inGame: social.presence[key].inGame,
    display: resolved.display,
  }));
  return resolved;
}

function heartbeatPresence(meNick, { inGame } = {}) {
  const me = requireMe(meNick);
  const social = loadSocial();
  if (!social.presence) social.presence = {};
  const key = normalizeNick(me);
  const prev = social.presence[key] || { status: 'available' };
  const status = PRESENCE_STATUSES.has(prev.status) ? prev.status : 'available';
  social.presence[key] = {
    nick: me,
    status,
    inGame: status === 'available' ? !!inGame : false,
    updatedAt: Date.now(),
  };
  saveSocial(social);
  const resolved = resolvePresence(social.presence[key], { forSelf: true });
  cloudSafe(() => Cloud.publishPresence(me, {
    status: social.presence[key].status,
    inGame: social.presence[key].inGame,
    display: resolved.display,
  }));
  return resolved;
}

/** Migra lista antiga Store.friends → friendships com o nick atual. */
function migrateLegacyFriends(me) {
  const legacy = Store.get('friends', []);
  if (!Array.isArray(legacy) || !legacy.length) return;

  const social = loadSocial();
  let changed = false;
  for (const name of legacy) {
    try {
      const other = validateNick(name);
      if (sameNick(me, other)) continue;
      if (areFriends(social, me, other)) continue;
      social.friendships.push({ a: me, b: other, since: Date.now() });
      changed = true;
    } catch {}
  }
  if (changed) saveSocial(social);
  Store.set('friends', []);
}

function areFriends(social, a, b) {
  return social.friendships.some(
    (f) =>
      (sameNick(f.a, a) && sameNick(f.b, b)) ||
      (sameNick(f.a, b) && sameNick(f.b, a))
  );
}

function friendNamesFor(me) {
  migrateLegacyFriends(me);
  const social = loadSocial();
  const names = [];
  for (const f of social.friendships) {
    if (sameNick(f.a, me)) names.push(f.b);
    else if (sameNick(f.b, me)) names.push(f.a);
  }
  return names;
}

function cloudSafe(fn) {
  if (!Cloud.isConfigured()) return;
  Promise.resolve()
    .then(fn)
    .catch((err) => console.warn('[friends-cloud]', err.message || err));
}

function mergeMessagesLocal(file, remoteMsgs) {
  if (!Array.isArray(remoteMsgs) || !remoteMsgs.length) return;
  const local = loadMessages(file);
  const byId = new Map(local.map((m) => [m.id, m]));
  let changed = false;
  for (const m of remoteMsgs) {
    if (!m?.id || byId.has(m.id)) continue;
    byId.set(m.id, m);
    changed = true;
  }
  if (!changed) return;
  const merged = [...byId.values()].sort((a, b) => (a.at || 0) - (b.at || 0));
  while (merged.length > MAX_MESSAGES) merged.shift();
  saveMessages(file, merged);
}

async function pullCloud(me) {
  if (!Cloud.isConfigured()) return;
  try {
    const [incoming, outgoing, friendships, groups] = await Promise.all([
      Cloud.fetchIncomingRequests(me),
      Cloud.fetchOutgoingRequests(me),
      Cloud.fetchFriendshipsFor(me),
      Cloud.fetchGroupsFor(me),
    ]);

    let allUsers = {};
    try {
      const cfg = Cloud.loadConfig();
      if (cfg) {
        const res = await fetch(`${cfg.databaseURL}/users.json`);
        if (res.ok) allUsers = (await res.json()) || {};
      }
    } catch {}

    const social = loadSocial();
    const meK = Cloud.nickKey(me);

    const others = social.requests.filter(
      (r) => Cloud.nickKey(r.from) !== meK && Cloud.nickKey(r.to) !== meK,
    );
    social.requests = [
      ...others,
      ...(incoming || []),
      ...(outgoing || []),
    ];
    const seenReq = new Set();
    social.requests = social.requests.filter((r) => {
      const k = `${Cloud.nickKey(r.from)}>${Cloud.nickKey(r.to)}`;
      if (seenReq.has(k)) return false;
      seenReq.add(k);
      return true;
    });

    for (const f of friendships || []) {
      if (!areFriends(social, f.a, f.b)) {
        social.friendships.push({ a: f.a, b: f.b, since: f.since || Date.now() });
      }
    }

    if (!social.presence) social.presence = {};
    for (const [key, u] of Object.entries(allUsers || {})) {
      if (!u || typeof u !== 'object') continue;
      social.presence[key] = {
        nick: u.nick || key,
        status: u.status || 'available',
        inGame: !!u.inGame,
        updatedAt: u.updatedAt || Date.now(),
      };
    }

    const byId = new Map((social.groups || []).map((g) => [g.id, g]));
    for (const g of groups || []) {
      if (g?.id) byId.set(g.id, g);
    }
    social.groups = [...byId.values()];

    saveSocial(social);

    const names = friendNamesFor(me);
    await Promise.all(
      names.map(async (other) => {
        try {
          const remote = await Cloud.fetchChatMessages(me, other);
          mergeMessagesLocal(resolveDmFile(me, other), remote);
        } catch {}
      }),
    );

    await Promise.all(
      (social.groups || [])
        .filter((g) => (g.members || []).some((m) => sameNick(m, me)))
        .map(async (g) => {
          try {
            const remote = await Cloud.fetchGroupMessages(g.id);
            mergeMessagesLocal(groupChatFile(g.id), remote);
          } catch {}
        }),
    );
  } catch (err) {
    console.warn('[friends-cloud] pull', err.message || err);
  }
}

function loadMessages(file) {
  try {
    if (fs.existsSync(file)) {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      return Array.isArray(data.messages) ? data.messages : [];
    }
  } catch {}
  return [];
}

function saveMessages(file, messages) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify({ messages }, null, 2), 'utf8');
}

function fileSize(file) {
  try {
    if (fs.existsSync(file)) return fs.statSync(file).size;
  } catch {}
  return 0;
}

function makeMsg(from, text) {
  return {
    id: `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    from,
    text,
    at: Date.now(),
  };
}

function appendMessage(file, from, text) {
  const body = String(text || '').trim().slice(0, MAX_TEXT);
  if (!body) throw new Error('Mensagem vazia');
  const messages = loadMessages(file);
  const msg = makeMsg(from, body);
  messages.push(msg);
  while (messages.length > MAX_MESSAGES) messages.shift();
  saveMessages(file, messages);
  return msg;
}

function clearFile(file) {
  const bytes = fileSize(file);
  try {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  } catch {}
  return { freedBytes: bytes, freedLabel: formatBytes(bytes) };
}

function getFriends(me) {
  if (!displayNick(me)) return [];
  return friendNamesFor(requireMe(me));
}

function sendRequest(fromNick, toNick) {
  const from = requireMe(fromNick);
  const to = validateNick(toNick);
  if (sameNick(from, to)) throw new Error('Não pode adicionar a si mesmo');

  const social = loadSocial();
  if (areFriends(social, from, to)) throw new Error('Já são amigos');

  const exists = social.requests.some(
    (r) => sameNick(r.from, from) && sameNick(r.to, to)
  );
  if (exists) throw new Error('Pedido já enviado');

  const reverse = social.requests.find(
    (r) => sameNick(r.from, to) && sameNick(r.to, from)
  );
  if (reverse) {
    social.requests = social.requests.filter((r) => r !== reverse);
    const since = Date.now();
    social.friendships.push({ a: from, b: to, since });
    saveSocial(social);
    cloudSafe(async () => {
      await Cloud.deleteRequestMirror(from, to);
      await Cloud.deleteRequestMirror(to, from);
      await Cloud.publishFriendship(from, to, since);
    });
    return { autoAccepted: true };
  }

  const at = Date.now();
  social.requests.push({ from, to, at });
  saveSocial(social);
  cloudSafe(() => Cloud.publishRequestMirror(from, to));
  return { autoAccepted: false };
}

function acceptRequest(meNick, fromNick) {
  const me = requireMe(meNick);
  const from = validateNick(fromNick);
  const social = loadSocial();
  const idx = social.requests.findIndex(
    (r) => sameNick(r.to, me) && sameNick(r.from, from)
  );
  if (idx < 0) throw new Error('Pedido não encontrado');

  social.requests.splice(idx, 1);
  social.requests = social.requests.filter(
    (r) => !(sameNick(r.from, me) && sameNick(r.to, from))
  );
  const since = Date.now();
  if (!areFriends(social, me, from)) {
    social.friendships.push({ a: me, b: from, since });
  }
  saveSocial(social);
  cloudSafe(async () => {
    await Cloud.deleteRequestMirror(from, me);
    await Cloud.deleteRequestMirror(me, from);
    await Cloud.publishFriendship(me, from, since);
  });
  return true;
}

function declineRequest(meNick, fromNick) {
  const me = requireMe(meNick);
  const from = validateNick(fromNick);
  const social = loadSocial();
  const before = social.requests.length;
  social.requests = social.requests.filter(
    (r) => !(sameNick(r.to, me) && sameNick(r.from, from))
  );
  if (social.requests.length === before) throw new Error('Pedido não encontrado');
  saveSocial(social);
  cloudSafe(() => Cloud.deleteRequestMirror(from, me));
  return true;
}

function cancelRequest(meNick, toNick) {
  const me = requireMe(meNick);
  const to = validateNick(toNick);
  const social = loadSocial();
  const before = social.requests.length;
  social.requests = social.requests.filter(
    (r) => !(sameNick(r.from, me) && sameNick(r.to, to))
  );
  if (social.requests.length === before) throw new Error('Pedido não encontrado');
  saveSocial(social);
  cloudSafe(() => Cloud.deleteRequestMirror(me, to));
  return true;
}

function removeFriend(meNick, otherNick) {
  const me = requireMe(meNick);
  const other = validateNick(otherNick);
  const social = loadSocial();
  social.friendships = social.friendships.filter(
    (f) =>
      !(
        (sameNick(f.a, me) && sameNick(f.b, other)) ||
        (sameNick(f.a, other) && sameNick(f.b, me))
      )
  );
  saveSocial(social);
  try {
    const files = [dmChatFile(me, other), legacyDmChatFile(other)];
    for (const file of files) {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
  } catch {}
  cloudSafe(async () => {
    await Cloud.deleteFriendship(me, other);
    await Cloud.clearChatMessages(me, other);
  });
  return friendNamesFor(me);
}

async function getFriendsStatus(meNick) {
  const me = displayNick(meNick);
  if (!me) {
    return {
      me: '',
      friends: [],
      incoming: [],
      outgoing: [],
      groups: [],
      badges: { requests: 0, messages: 0, total: 0 },
      cloud: Cloud.status(),
    };
  }
  const self = requireMe(me);
  await pullCloud(self);
  const friends = friendNamesFor(self);
  const social = loadSocial();
  const server = await getServerStatus();
  const onlinePlayers = (server.players || []).map((p) => p.toLowerCase());

  let unreadMessages = 0;

  const friendCards = friends.map((name) => {
    const messages = loadMessages(resolveDmFile(self, name));
    const last = messages[messages.length - 1] || null;
    const unread = countUnread(messages, self, getLastRead(self, 'dm', name));
    unreadMessages += unread;
    const presence = resolvePresence(social.presence?.[normalizeNick(name)] || null, { forSelf: false });
    const onServer = server.online && onlinePlayers.includes(normalizeNick(name));
    return {
      name,
      online: onServer || (presence.display !== 'offline' && presence.display !== 'invisible'),
      serverOnline: server.online,
      onServer,
      presence,
      unread,
      lastMessage: last
        ? { text: last.text, at: last.at, from: last.from }
        : null,
    };
  });

  const incoming = social.requests
    .filter((r) => sameNick(r.to, self))
    .map((r) => ({ from: r.from, at: r.at }));

  const outgoing = social.requests
    .filter((r) => sameNick(r.from, self))
    .map((r) => ({ to: r.to, at: r.at }));

  const groups = social.groups
    .filter((g) => (g.members || []).some((m) => sameNick(m, self)))
    .map((g) => {
      const messages = loadMessages(groupChatFile(g.id));
      const last = messages[messages.length - 1] || null;
      const unread = countUnread(messages, self, getLastRead(self, 'group', g.id));
      unreadMessages += unread;
      return {
        id: g.id,
        name: g.name,
        members: g.members,
        createdBy: g.createdBy,
        unread,
        lastMessage: last
          ? { text: last.text, at: last.at, from: last.from }
          : null,
      };
    });

  const requests = incoming.length;
  const myPresence = resolvePresence(social.presence?.[normalizeNick(self)] || null, { forSelf: true });
  return {
    me: self,
    presence: myPresence,
    friends: friendCards,
    incoming,
    outgoing,
    groups,
    cloud: Cloud.status(),
    badges: {
      requests,
      messages: unreadMessages,
      total: requests + unreadMessages,
    },
  };
}

function assertDmAccess(me, other) {
  const social = loadSocial();
  if (!areFriends(social, me, other)) throw new Error('Amigo não encontrado');
}

function getMessages(meNick, friendNick) {
  const me = requireMe(meNick);
  const other = validateNick(friendNick);
  assertDmAccess(me, other);
  // pull rápido da nuvem pra chat aberto em outro PC
  if (Cloud.isConfigured()) {
    Cloud.fetchChatMessages(me, other)
      .then((remote) => mergeMessagesLocal(resolveDmFile(me, other), remote))
      .catch(() => {});
  }
  markChatRead(me, 'dm', other);
  return loadMessages(resolveDmFile(me, other));
}

async function getMessagesAsync(meNick, friendNick) {
  const me = requireMe(meNick);
  const other = validateNick(friendNick);
  assertDmAccess(me, other);
  if (Cloud.isConfigured()) {
    try {
      const remote = await Cloud.fetchChatMessages(me, other);
      mergeMessagesLocal(resolveDmFile(me, other), remote);
    } catch {}
  }
  markChatRead(me, 'dm', other);
  return loadMessages(resolveDmFile(me, other));
}

function sendMessage(meNick, friendNick, text) {
  const me = requireMe(meNick);
  const other = validateNick(friendNick);
  assertDmAccess(me, other);
  const file = resolveDmFile(me, other);
  const msg = appendMessage(file, me, text);
  const canonical = dmChatFile(me, other);
  if (file !== canonical && fs.existsSync(file)) {
    try {
      saveMessages(canonical, loadMessages(file));
      fs.unlinkSync(file);
    } catch {}
  }
  markChatRead(me, 'dm', other);
  cloudSafe(() => Cloud.publishChatMessage(me, other, msg));
  return msg;
}

function clearHistory(meNick, friendNick) {
  const me = requireMe(meNick);
  const other = validateNick(friendNick);
  assertDmAccess(me, other);
  const a = clearFile(dmChatFile(me, other));
  const b = clearFile(legacyDmChatFile(other));
  cloudSafe(() => Cloud.clearChatMessages(me, other));
  return {
    freedBytes: a.freedBytes + b.freedBytes,
    freedLabel: formatBytes(a.freedBytes + b.freedBytes),
  };
}

function getHistoryInfo(meNick, friendNick) {
  const me = requireMe(meNick);
  const other = validateNick(friendNick);
  assertDmAccess(me, other);
  const file = resolveDmFile(me, other);
  const bytes = fileSize(file);
  return {
    bytes,
    label: formatBytes(bytes),
    count: loadMessages(file).length,
  };
}

function findGroup(social, groupId) {
  return social.groups.find((g) => g.id === groupId);
}

function createGroup(meNick, { name, members }) {
  const me = requireMe(meNick);
  const social = loadSocial();
  const memberSet = new Map();
  memberSet.set(normalizeNick(me), me);

  for (const raw of members || []) {
    const n = validateNick(raw);
    if (sameNick(n, me)) continue;
    if (!areFriends(social, me, n)) {
      throw new Error(`Só dá para adicionar amigos: ${n}`);
    }
    memberSet.set(normalizeNick(n), n);
  }

  const list = [...memberSet.values()];
  if (list.length < MIN_GROUP_MEMBERS) {
    throw new Error(`Grupo precisa de pelo menos ${MIN_GROUP_MEMBERS} pessoas (você + 2 amigos)`);
  }
  if (list.length > MAX_GROUP_MEMBERS) {
    throw new Error(`Máximo de ${MAX_GROUP_MEMBERS} membros`);
  }

  const label = String(name || '').trim().slice(0, 40)
    || list.filter((n) => !sameNick(n, me)).slice(0, 2).join(', ');

  const group = {
    id: `g_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    name: label,
    members: list,
    createdBy: me,
    createdAt: Date.now(),
  };
  social.groups.push(group);
  saveSocial(social);
  cloudSafe(() => Cloud.publishGroup(group));
  return group;
}

function leaveGroup(meNick, groupId) {
  const me = requireMe(meNick);
  const social = loadSocial();
  const group = findGroup(social, groupId);
  if (!group) throw new Error('Grupo não encontrado');
  if (!group.members.some((m) => sameNick(m, me))) {
    throw new Error('Você não está neste grupo');
  }

  group.members = group.members.filter((m) => !sameNick(m, me));
  if (group.members.length < 2) {
    social.groups = social.groups.filter((g) => g.id !== groupId);
    try {
      const file = groupChatFile(groupId);
      if (fs.existsSync(file)) fs.unlinkSync(file);
    } catch {}
    cloudSafe(() => Cloud.deleteGroup(groupId));
  } else {
    cloudSafe(() => Cloud.patchGroup(groupId, { members: group.members }));
  }
  saveSocial(social);
  return true;
}

function assertGroupMember(me, groupId) {
  const social = loadSocial();
  const group = findGroup(social, groupId);
  if (!group) throw new Error('Grupo não encontrado');
  if (!group.members.some((m) => sameNick(m, me))) {
    throw new Error('Você não está neste grupo');
  }
  return group;
}

function getGroupMessages(meNick, groupId) {
  const me = requireMe(meNick);
  assertGroupMember(me, groupId);
  if (Cloud.isConfigured()) {
    Cloud.fetchGroupMessages(groupId)
      .then((remote) => mergeMessagesLocal(groupChatFile(groupId), remote))
      .catch(() => {});
  }
  markChatRead(me, 'group', groupId);
  return loadMessages(groupChatFile(groupId));
}

async function getGroupMessagesAsync(meNick, groupId) {
  const me = requireMe(meNick);
  assertGroupMember(me, groupId);
  if (Cloud.isConfigured()) {
    try {
      const remote = await Cloud.fetchGroupMessages(groupId);
      mergeMessagesLocal(groupChatFile(groupId), remote);
    } catch {}
  }
  markChatRead(me, 'group', groupId);
  return loadMessages(groupChatFile(groupId));
}

function sendGroupMessage(meNick, groupId, text) {
  const me = requireMe(meNick);
  assertGroupMember(me, groupId);
  const msg = appendMessage(groupChatFile(groupId), me, text);
  markChatRead(me, 'group', groupId);
  cloudSafe(() => Cloud.publishGroupMessage(groupId, msg));
  return msg;
}

function clearGroupHistory(meNick, groupId) {
  const me = requireMe(meNick);
  assertGroupMember(me, groupId);
  cloudSafe(() => Cloud.clearGroupMessages(groupId));
  return clearFile(groupChatFile(groupId));
}

function getGroupHistoryInfo(meNick, groupId) {
  const me = requireMe(meNick);
  assertGroupMember(me, groupId);
  const file = groupChatFile(groupId);
  const bytes = fileSize(file);
  return {
    bytes,
    label: formatBytes(bytes),
    count: loadMessages(file).length,
  };
}

/** Compat: lista antiga sem me. */
function getFriendsLegacy() {
  return Store.get('friends', []);
}

module.exports = {
  getFriends,
  getFriendsLegacy,
  sendRequest,
  acceptRequest,
  declineRequest,
  cancelRequest,
  removeFriend,
  getFriendsStatus,
  getMessages,
  getMessagesAsync,
  sendMessage,
  clearHistory,
  getHistoryInfo,
  createGroup,
  leaveGroup,
  getGroupMessages,
  getGroupMessagesAsync,
  sendGroupMessage,
  clearGroupHistory,
  getGroupHistoryInfo,
  markChatRead,
  getPresence,
  setPresence,
  heartbeatPresence,
  pullCloud,
};
