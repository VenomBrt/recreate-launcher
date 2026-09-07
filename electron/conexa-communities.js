/**
 * Conexa Comunidades — canais, cargos, msgs + moderação global (launcher admins).
 */
const Cloud = require('./friends-cloud');
const { isAdmin, listAdmins } = require('./conexa');

const MAX_NAME = 32;
const MAX_DESC = 160;
const MAX_MSG = 500;
const MAX_ROLE = 24;
const MAX_CHANNEL = 24;

function normalizeNick(nick) {
  return String(nick || '').trim().toLowerCase();
}

function displayNick(nick) {
  return String(nick || '').trim().slice(0, 16);
}

function newId(prefix = 'c') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function cloudOk() {
  return Cloud.isConfigured();
}

function inviteCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

function defaultPerms() {
  return {
    manageChannels: false,
    manageRoles: false,
    deleteMessages: false,
    kick: false,
  };
}

function ownerPerms() {
  return {
    manageChannels: true,
    manageRoles: true,
    deleteMessages: true,
    kick: true,
  };
}

async function getCommunity(id) {
  if (!id) return null;
  const raw = await Cloud.fbGet(`conexa/communities/${id}`);
  if (!raw || typeof raw !== 'object') return null;
  return { ...raw, id };
}

async function getMember(communityId, nick) {
  const key = Cloud.nickKey(nick);
  if (!key) return null;
  const raw = await Cloud.fbGet(`conexa/communityMembers/${communityId}/${key}`);
  if (!raw || typeof raw !== 'object') return null;
  return { ...raw, key };
}

async function getRoles(communityId) {
  const raw = await Cloud.fbGet(`conexa/communityRoles/${communityId}`);
  if (!raw || typeof raw !== 'object') return [];
  return Object.entries(raw).map(([id, data]) => ({ id, ...data }));
}

async function getChannels(communityId) {
  const raw = await Cloud.fbGet(`conexa/communityChannels/${communityId}`);
  if (!raw || typeof raw !== 'object') return [];
  return Object.entries(raw)
    .map(([id, data]) => ({ id, ...data }))
    .sort((a, b) => (a.position || 0) - (b.position || 0) || (a.createdAt || 0) - (b.createdAt || 0));
}

async function resolvePerms(me, community) {
  const meKey = Cloud.nickKey(me);
  const globalAdmin = meKey ? await isAdmin(me) : false;
  if (!community) {
    return {
      globalAdmin,
      isMember: false,
      isOwner: false,
      perms: defaultPerms(),
      member: null,
    };
  }

  const member = meKey ? await getMember(community.id, me) : null;
  const isOwner = !!(member && (member.roles || []).includes('owner'))
    || (!!meKey && meKey === (community.ownerKey || Cloud.nickKey(community.owner)));

  if (globalAdmin || isOwner) {
    return {
      globalAdmin,
      isMember: !!member || globalAdmin,
      isOwner,
      perms: ownerPerms(),
      member,
    };
  }

  if (!member) {
    return {
      globalAdmin: false,
      isMember: false,
      isOwner: false,
      perms: defaultPerms(),
      member: null,
    };
  }

  const roles = await getRoles(community.id);
  const roleMap = new Map(roles.map((r) => [r.id, r]));
  const perms = defaultPerms();
  for (const roleId of member.roles || []) {
    if (roleId === 'owner') {
      Object.assign(perms, ownerPerms());
      break;
    }
    const role = roleMap.get(roleId);
    if (!role?.perms) continue;
    for (const k of Object.keys(perms)) {
      if (role.perms[k]) perms[k] = true;
    }
  }

  return {
    globalAdmin: false,
    isMember: true,
    isOwner: false,
    perms,
    member,
  };
}

async function assertCommunityMember(me, communityId) {
  const community = await getCommunity(communityId);
  if (!community) return { ok: false, error: 'Comunidade não encontrada' };
  const access = await resolvePerms(me, community);
  if (!access.isMember && !access.globalAdmin) {
    return { ok: false, error: 'Entre na comunidade pra postar' };
  }
  return { ok: true, community, access };
}

const modCache = new Map();

async function canModerateCommunity(me, communityId) {
  const key = `${Cloud.nickKey(me)}:${communityId}`;
  const hit = modCache.get(key);
  if (hit && (Date.now() - hit.at) < 15000) return hit.value;
  const community = await getCommunity(communityId);
  if (!community) return false;
  const access = await resolvePerms(me, community);
  const value = !!(access.globalAdmin || access.isOwner || access.perms.deleteMessages);
  modCache.set(key, { at: Date.now(), value });
  return value;
}

function shapeCommunity(raw, access) {
  if (!raw) return null;
  return {
    id: raw.id,
    name: String(raw.name || '').slice(0, MAX_NAME),
    description: String(raw.description || '').slice(0, MAX_DESC),
    owner: displayNick(raw.owner),
    ownerKey: raw.ownerKey,
    joinMode: raw.joinMode === 'invite' ? 'invite' : 'open',
    inviteCode: access?.isOwner || access?.globalAdmin || access?.isMember ? raw.inviteCode : undefined,
    banner: raw.banner ? String(raw.banner).slice(0, 320_000) : null,
    createdAt: Number(raw.createdAt) || 0,
    memberCount: Number(raw.memberCount) || 0,
    access: {
      isMember: !!access?.isMember,
      isOwner: !!access?.isOwner,
      globalAdmin: !!access?.globalAdmin,
      perms: access?.perms || defaultPerms(),
    },
  };
}

async function createCommunity(me, { name, description, joinMode } = {}) {
  const owner = displayNick(me);
  const ownerKey = Cloud.nickKey(me);
  if (!ownerKey) return { success: false, error: 'Entre na Conta com um nick' };
  if (!cloudOk()) return { success: false, error: 'Conexa precisa do Firebase online' };

  const cleanName = String(name || '').trim().slice(0, MAX_NAME);
  if (cleanName.length < 2) return { success: false, error: 'Nome da comunidade muito curto' };

  const id = newId('com');
  const channelId = newId('ch');
  const now = Date.now();
  const community = {
    id,
    name: cleanName,
    description: String(description || '').trim().slice(0, MAX_DESC),
    owner,
    ownerKey,
    joinMode: joinMode === 'invite' ? 'invite' : 'open',
    inviteCode: inviteCode(),
    createdAt: now,
    updatedAt: now,
    memberCount: 1,
  };

  await Cloud.fbPut(`conexa/communities/${id}`, community);
  await Cloud.fbPut(`conexa/communityMembers/${id}/${ownerKey}`, {
    nick: owner,
    roles: ['owner'],
    joinedAt: now,
  });
  await Cloud.fbPut(`conexa/communityChannels/${id}/${channelId}`, {
    name: 'geral',
    topic: 'Canal principal',
    position: 0,
    createdAt: now,
  });
  await Cloud.fbPut(`conexa/userCommunities/${ownerKey}/${id}`, true);

  const access = await resolvePerms(me, community);
  return {
    success: true,
    community: shapeCommunity(community, access),
    channelId,
  };
}

async function listCommunities(me) {
  const meKey = Cloud.nickKey(me);
  const globalAdmin = meKey ? await isAdmin(me) : false;
  if (!cloudOk()) {
    return { success: true, offline: true, mine: [], discover: [], isAdmin: globalAdmin };
  }

  const [allRaw, mineRaw] = await Promise.all([
    Cloud.fbGet('conexa/communities'),
    meKey ? Cloud.fbGet(`conexa/userCommunities/${meKey}`) : Promise.resolve(null),
  ]);

  const all = allRaw && typeof allRaw === 'object' ? allRaw : {};
  const mineIds = new Set(
    mineRaw && typeof mineRaw === 'object' ? Object.keys(mineRaw) : [],
  );

  const mine = [];
  const discover = [];

  for (const [id, data] of Object.entries(all)) {
    if (!data || typeof data !== 'object') continue;
    const community = { ...data, id };
    const isOwner = !!(meKey && meKey === (community.ownerKey || Cloud.nickKey(community.owner)));
    const isMember = mineIds.has(id) || isOwner;
    // Lista rápida: sem resolvePerms por item (isso lagava a aba)
    const access = {
      globalAdmin,
      isMember: isMember || globalAdmin,
      isOwner,
      perms: (isOwner || globalAdmin) ? ownerPerms() : defaultPerms(),
      member: null,
    };
    const shaped = shapeCommunity(community, access);
    if (isMember || globalAdmin) mine.push(shaped);
    else if (community.joinMode !== 'invite') discover.push(shaped);
  }

  mine.sort((a, b) => a.name.localeCompare(b.name));
  discover.sort((a, b) => (b.memberCount || 0) - (a.memberCount || 0));

  return {
    success: true,
    mine: mine.slice(0, 60),
    discover: discover.slice(0, 40),
    isAdmin: globalAdmin,
    admins: await listAdmins(),
  };
}

async function updateCommunityBanner(me, communityId, banner) {
  const meKey = Cloud.nickKey(me);
  if (!meKey) return { success: false, error: 'Entre na Conta com um nick' };
  if (!cloudOk()) return { success: false, error: 'Conexa precisa do Firebase online' };
  const community = await getCommunity(communityId);
  if (!community) return { success: false, error: 'Comunidade não encontrada' };
  const access = await resolvePerms(me, community);
  if (!access.isOwner && !access.globalAdmin) {
    return { success: false, error: 'Só o dono ou ADM pode trocar o banner' };
  }
  let data = banner ? String(banner) : null;
  if (data && data.length > 320_000) {
    return { success: false, error: 'Banner muito grande — usa outra imagem' };
  }
  await Cloud.fbPatch(`conexa/communities/${communityId}`, {
    banner: data,
    updatedAt: Date.now(),
  });
  const updated = { ...community, banner: data };
  return { success: true, community: shapeCommunity(updated, access) };
}

async function joinCommunity(me, { communityId, inviteCode: code } = {}) {
  const nick = displayNick(me);
  const meKey = Cloud.nickKey(me);
  if (!meKey) return { success: false, error: 'Entre na Conta com um nick' };
  if (!cloudOk()) return { success: false, error: 'Conexa precisa do Firebase online' };

  let community = null;
  if (communityId) {
    community = await getCommunity(communityId);
  } else if (code) {
    const all = await Cloud.fbGet('conexa/communities');
    const want = String(code || '').trim().toUpperCase();
    if (all && typeof all === 'object') {
      for (const [id, data] of Object.entries(all)) {
        if (data?.inviteCode && String(data.inviteCode).toUpperCase() === want) {
          community = { ...data, id };
          break;
        }
      }
    }
  }

  if (!community) return { success: false, error: 'Comunidade não encontrada' };

  const existing = await getMember(community.id, me);
  if (existing) {
    const access = await resolvePerms(me, community);
    return { success: true, community: shapeCommunity(community, access), already: true };
  }

  if (community.joinMode === 'invite') {
    const want = String(code || '').trim().toUpperCase();
    if (!want || want !== String(community.inviteCode || '').toUpperCase()) {
      return { success: false, error: 'Código de convite inválido' };
    }
  }

  const now = Date.now();
  await Cloud.fbPut(`conexa/communityMembers/${community.id}/${meKey}`, {
    nick,
    roles: [],
    joinedAt: now,
  });
  await Cloud.fbPut(`conexa/userCommunities/${meKey}/${community.id}`, true);
  const nextCount = (Number(community.memberCount) || 0) + 1;
  await Cloud.fbPatch(`conexa/communities/${community.id}`, {
    memberCount: nextCount,
    updatedAt: now,
  });

  const updated = { ...community, memberCount: nextCount };
  const access = await resolvePerms(me, updated);
  return { success: true, community: shapeCommunity(updated, access) };
}

async function leaveCommunity(me, communityId) {
  const meKey = Cloud.nickKey(me);
  if (!meKey) return { success: false, error: 'Entre na Conta com um nick' };
  if (!cloudOk()) return { success: false, error: 'Conexa precisa do Firebase online' };
  const community = await getCommunity(communityId);
  if (!community) return { success: false, error: 'Comunidade não encontrada' };

  const access = await resolvePerms(me, community);
  if (access.isOwner && !access.globalAdmin) {
    return { success: false, error: 'Dono não pode sair — transfira ou delete a comunidade' };
  }
  if (!access.isMember && !access.globalAdmin) {
    return { success: false, error: 'Você não está nessa comunidade' };
  }

  await Cloud.fbDelete(`conexa/communityMembers/${communityId}/${meKey}`);
  await Cloud.fbDelete(`conexa/userCommunities/${meKey}/${communityId}`);
  const nextCount = Math.max(0, (Number(community.memberCount) || 1) - 1);
  await Cloud.fbPatch(`conexa/communities/${communityId}`, {
    memberCount: nextCount,
    updatedAt: Date.now(),
  });
  return { success: true };
}

async function deleteCommunity(me, communityId) {
  const meKey = Cloud.nickKey(me);
  if (!meKey) return { success: false, error: 'Entre na Conta com um nick' };
  if (!cloudOk()) return { success: false, error: 'Conexa precisa do Firebase online' };
  const community = await getCommunity(communityId);
  if (!community) return { success: false, error: 'Comunidade não encontrada' };

  const access = await resolvePerms(me, community);
  if (!access.isOwner && !access.globalAdmin) {
    return { success: false, error: 'Só o dono ou ADM global pode deletar' };
  }

  const members = await Cloud.fbGet(`conexa/communityMembers/${communityId}`);
  if (members && typeof members === 'object') {
    for (const key of Object.keys(members)) {
      try { await Cloud.fbDelete(`conexa/userCommunities/${key}/${communityId}`); } catch {}
    }
  }

  await Cloud.fbDelete(`conexa/communities/${communityId}`);
  await Cloud.fbDelete(`conexa/communityMembers/${communityId}`);
  await Cloud.fbDelete(`conexa/communityChannels/${communityId}`);
  await Cloud.fbDelete(`conexa/communityRoles/${communityId}`);
  await Cloud.fbDelete(`conexa/communityMessages/${communityId}`);

  return { success: true, id: communityId, moderated: access.globalAdmin && !access.isOwner };
}

async function getCommunityView(me, communityId) {
  if (!cloudOk()) return { success: false, error: 'Conexa precisa do Firebase online' };
  const community = await getCommunity(communityId);
  if (!community) return { success: false, error: 'Comunidade não encontrada' };

  const access = await resolvePerms(me, community);
  if (!access.isMember && !access.globalAdmin && community.joinMode === 'invite') {
    return { success: false, error: 'Comunidade privada — use o código de convite' };
  }

  const [channels, roles, membersRaw] = await Promise.all([
    getChannels(communityId),
    getRoles(communityId),
    Cloud.fbGet(`conexa/communityMembers/${communityId}`),
  ]);

  const members = [];
  if (membersRaw && typeof membersRaw === 'object') {
    for (const [key, data] of Object.entries(membersRaw)) {
      if (!data || typeof data !== 'object') continue;
      members.push({
        key,
        nick: displayNick(data.nick || key),
        roles: Array.isArray(data.roles) ? data.roles : [],
        joinedAt: Number(data.joinedAt) || 0,
      });
    }
  }
  members.sort((a, b) => a.nick.localeCompare(b.nick));

  return {
    success: true,
    community: shapeCommunity(community, access),
    channels,
    roles,
    members: members.slice(0, 100),
    canJoin: !access.isMember && (community.joinMode !== 'invite' || access.globalAdmin),
  };
}

async function createChannel(me, communityId, { name, topic } = {}) {
  const community = await getCommunity(communityId);
  if (!community) return { success: false, error: 'Comunidade não encontrada' };
  const access = await resolvePerms(me, community);
  if (!access.perms.manageChannels) {
    return { success: false, error: 'Sem permissão para criar canais' };
  }

  const clean = String(name || '').trim().toLowerCase().replace(/\s+/g, '-').slice(0, MAX_CHANNEL);
  if (clean.length < 2) return { success: false, error: 'Nome do canal inválido' };

  const channels = await getChannels(communityId);
  if (channels.length >= 20) return { success: false, error: 'Limite de canais atingido' };

  const id = newId('ch');
  const channel = {
    name: clean,
    topic: String(topic || '').trim().slice(0, 80),
    position: channels.length,
    createdAt: Date.now(),
  };
  await Cloud.fbPut(`conexa/communityChannels/${communityId}/${id}`, channel);
  return { success: true, channel: { id, ...channel } };
}

async function deleteChannel(me, communityId, channelId) {
  const community = await getCommunity(communityId);
  if (!community) return { success: false, error: 'Comunidade não encontrada' };
  const access = await resolvePerms(me, community);
  if (!access.perms.manageChannels) {
    return { success: false, error: 'Sem permissão para apagar canais' };
  }

  const channels = await getChannels(communityId);
  if (channels.length <= 1) {
    return { success: false, error: 'Precisa ficar pelo menos 1 canal' };
  }

  await Cloud.fbDelete(`conexa/communityChannels/${communityId}/${channelId}`);
  await Cloud.fbDelete(`conexa/communityMessages/${communityId}/${channelId}`);
  return { success: true, id: channelId };
}

async function createRole(me, communityId, { name, color, perms } = {}) {
  const community = await getCommunity(communityId);
  if (!community) return { success: false, error: 'Comunidade não encontrada' };
  const access = await resolvePerms(me, community);
  if (!access.perms.manageRoles) {
    return { success: false, error: 'Sem permissão para criar cargos' };
  }

  const clean = String(name || '').trim().slice(0, MAX_ROLE);
  if (clean.length < 2) return { success: false, error: 'Nome do cargo inválido' };

  const roles = await getRoles(communityId);
  if (roles.length >= 15) return { success: false, error: 'Limite de cargos atingido' };

  const id = newId('role');
  const role = {
    name: clean,
    color: String(color || '#a78bfa').slice(0, 16),
    perms: {
      ...defaultPerms(),
      ...(perms && typeof perms === 'object' ? {
        manageChannels: !!perms.manageChannels,
        manageRoles: !!perms.manageRoles,
        deleteMessages: !!perms.deleteMessages,
        kick: !!perms.kick,
      } : {}),
    },
    createdAt: Date.now(),
  };
  await Cloud.fbPut(`conexa/communityRoles/${communityId}/${id}`, role);
  return { success: true, role: { id, ...role } };
}

async function deleteRole(me, communityId, roleId) {
  const community = await getCommunity(communityId);
  if (!community) return { success: false, error: 'Comunidade não encontrada' };
  const access = await resolvePerms(me, community);
  if (!access.perms.manageRoles) {
    return { success: false, error: 'Sem permissão para apagar cargos' };
  }
  if (roleId === 'owner') return { success: false, error: 'Cargo owner é fixo' };

  await Cloud.fbDelete(`conexa/communityRoles/${communityId}/${roleId}`);
  return { success: true, id: roleId };
}

async function setMemberRole(me, communityId, targetNick, roleId, assign = true) {
  const community = await getCommunity(communityId);
  if (!community) return { success: false, error: 'Comunidade não encontrada' };
  const access = await resolvePerms(me, community);
  if (!access.perms.manageRoles) {
    return { success: false, error: 'Sem permissão para gerenciar cargos' };
  }

  const targetKey = Cloud.nickKey(targetNick);
  const member = await getMember(communityId, targetNick);
  if (!member || !targetKey) return { success: false, error: 'Membro não encontrado' };
  if ((member.roles || []).includes('owner')) {
    return { success: false, error: 'Não dá pra alterar o dono assim' };
  }

  if (roleId && roleId !== 'owner') {
    const roles = await getRoles(communityId);
    if (!roles.some((r) => r.id === roleId)) {
      return { success: false, error: 'Cargo não existe' };
    }
  }

  let rolesList = Array.isArray(member.roles) ? [...member.roles] : [];
  if (assign) {
    if (!rolesList.includes(roleId)) rolesList.push(roleId);
  } else {
    rolesList = rolesList.filter((r) => r !== roleId);
  }

  await Cloud.fbPut(`conexa/communityMembers/${communityId}/${targetKey}`, {
    nick: displayNick(member.nick || targetNick),
    roles: rolesList,
    joinedAt: member.joinedAt || Date.now(),
  });
  return { success: true };
}

async function listMessages(me, communityId, channelId) {
  const community = await getCommunity(communityId);
  if (!community) return { success: false, error: 'Comunidade não encontrada' };
  const access = await resolvePerms(me, community);
  if (!access.isMember && !access.globalAdmin) {
    return { success: false, error: 'Entre na comunidade pra ver as mensagens' };
  }

  const raw = await Cloud.fbGet(`conexa/communityMessages/${communityId}/${channelId}`);
  const meKey = Cloud.nickKey(me);
  const messages = [];
  if (raw && typeof raw === 'object') {
    for (const [id, data] of Object.entries(raw)) {
      if (!data || typeof data !== 'object') continue;
      const authorKey = data.authorKey || Cloud.nickKey(data.author);
      messages.push({
        id,
        author: displayNick(data.author),
        authorKey,
        text: String(data.text || '').slice(0, MAX_MSG),
        createdAt: Number(data.createdAt) || 0,
        canDelete: !!(meKey && (meKey === authorKey || access.perms.deleteMessages || access.globalAdmin)),
      });
    }
  }
  messages.sort((a, b) => a.createdAt - b.createdAt);
  return {
    success: true,
    messages: messages.slice(-120),
    access: {
      isMember: access.isMember,
      isOwner: access.isOwner,
      globalAdmin: access.globalAdmin,
      perms: access.perms,
    },
  };
}

async function sendMessage(me, communityId, channelId, text) {
  const nick = displayNick(me);
  const meKey = Cloud.nickKey(me);
  if (!meKey) return { success: false, error: 'Entre na Conta com um nick' };
  const community = await getCommunity(communityId);
  if (!community) return { success: false, error: 'Comunidade não encontrada' };
  const access = await resolvePerms(me, community);
  if (!access.isMember && !access.globalAdmin) {
    return { success: false, error: 'Entre na comunidade pra enviar mensagem' };
  }

  const channel = await Cloud.fbGet(`conexa/communityChannels/${communityId}/${channelId}`);
  if (!channel) return { success: false, error: 'Canal não encontrado' };

  const body = String(text || '').trim().slice(0, MAX_MSG);
  if (!body) return { success: false, error: 'Mensagem vazia' };

  const id = newId('msg');
  const msg = {
    author: nick,
    authorKey: meKey,
    text: body,
    createdAt: Date.now(),
  };
  await Cloud.fbPut(`conexa/communityMessages/${communityId}/${channelId}/${id}`, msg);
  return {
    success: true,
    message: {
      id,
      ...msg,
      canDelete: true,
    },
  };
}

async function deleteMessage(me, communityId, channelId, messageId) {
  const meKey = Cloud.nickKey(me);
  if (!meKey) return { success: false, error: 'Entre na Conta com um nick' };
  const community = await getCommunity(communityId);
  if (!community) return { success: false, error: 'Comunidade não encontrada' };
  const access = await resolvePerms(me, community);

  const msg = await Cloud.fbGet(`conexa/communityMessages/${communityId}/${channelId}/${messageId}`);
  if (!msg) return { success: false, error: 'Mensagem não encontrada' };

  const authorKey = msg.authorKey || Cloud.nickKey(msg.author);
  if (meKey !== authorKey && !access.perms.deleteMessages && !access.globalAdmin) {
    return { success: false, error: 'Sem permissão para apagar mensagem' };
  }

  await Cloud.fbDelete(`conexa/communityMessages/${communityId}/${channelId}/${messageId}`);
  return { success: true, id: messageId };
}

module.exports = {
  createCommunity,
  listCommunities,
  joinCommunity,
  leaveCommunity,
  deleteCommunity,
  getCommunityView,
  createChannel,
  deleteChannel,
  createRole,
  deleteRole,
  setMemberRole,
  listMessages,
  sendMessage,
  deleteMessage,
  assertCommunityMember,
  canModerateCommunity,
  updateCommunityBanner,
};
