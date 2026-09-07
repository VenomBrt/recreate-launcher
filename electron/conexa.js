/**
 * Conexa — rede social do Recreate (Firebase RTDB).
 */
const Cloud = require('./friends-cloud');
const { getLauncherStatus } = require('./launcher-status');

const MAX_TEXT = 280;
const MAX_BIO = 160;
const MAX_IMAGE_CHARS = 550_000; // ~400KB útil em base64
const MAX_BANNER_CHARS = 320_000;

let postsCache = { at: 0, raw: null };

function invalidatePostsCache() {
  postsCache = { at: 0, raw: null };
}

async function getPostsRaw({ force = false } = {}) {
  const ttl = 7000;
  if (!force && postsCache.raw && (Date.now() - postsCache.at) < ttl) {
    return postsCache.raw;
  }
  let raw = await Cloud.fbGet('conexa/posts');
  if (!raw || typeof raw !== 'object') raw = {};
  postsCache = { at: Date.now(), raw };
  return raw;
}
function normalizeNick(nick) {
  return String(nick || '').trim().toLowerCase();
}

function displayNick(nick) {
  return String(nick || '').trim().slice(0, 16);
}

function newId(prefix = 'p') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function cloudOk() {
  return Cloud.isConfigured();
}

async function listAdmins() {
  try {
    const st = await getLauncherStatus();
    return Array.isArray(st?.admins) ? st.admins : [];
  } catch {
    return [];
  }
}

async function isAdmin(nick) {
  const admins = await listAdmins();
  return admins.includes(normalizeNick(nick));
}

function likesMap(raw) {
  if (!raw || typeof raw !== 'object') return {};
  return raw;
}

function likeCount(likes) {
  return Object.keys(likesMap(likes)).length;
}

function shapePost(id, raw, meKey, admin, { communityMod = false } = {}) {
  if (!raw || typeof raw !== 'object') return null;
  const likes = likesMap(raw.likes);
  const authorKey = raw.authorKey || Cloud.nickKey(raw.author);
  const meLiked = !!(meKey && likes[meKey]);
  const canDelete = !!(meKey && (meKey === authorKey || admin || communityMod));
  const communityId = raw.communityId ? String(raw.communityId) : null;
  const isGlobal = communityId ? raw.global === true : raw.global !== false;
  return {
    id,
    author: displayNick(raw.author),
    authorKey,
    text: String(raw.text || '').slice(0, MAX_TEXT),
    image: raw.image ? String(raw.image).slice(0, MAX_IMAGE_CHARS) : null,
    createdAt: Number(raw.createdAt) || 0,
    likeCount: likeCount(likes),
    liked: meLiked,
    canDelete,
    global: isGlobal,
    communityId,
    communityName: raw.communityName ? String(raw.communityName).slice(0, 32) : null,
  };
}

async function ensureProfile(nick) {
  const key = Cloud.nickKey(nick);
  if (!key) return null;
  if (!cloudOk()) return { nick: displayNick(nick), bio: '', banner: null, key };
  let profile = await Cloud.fbGet(`conexa/profiles/${key}`);
  if (!profile || typeof profile !== 'object') {
    profile = {
      nick: displayNick(nick),
      bio: '',
      banner: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await Cloud.fbPut(`conexa/profiles/${key}`, profile);
  }
  return {
    ...profile,
    key,
    nick: displayNick(profile.nick || nick),
    banner: profile.banner ? String(profile.banner).slice(0, MAX_BANNER_CHARS) : null,
  };
}

async function getProfile(nick) {
  const key = Cloud.nickKey(nick);
  if (!key) return { success: false, error: 'Nick inválido' };
  if (!cloudOk()) {
    return {
      success: true,
      offline: true,
      profile: { nick: displayNick(nick), bio: '', key },
      isAdmin: await isAdmin(nick),
    };
  }
  const profile = await ensureProfile(nick);
  return {
    success: true,
    profile,
    isAdmin: await isAdmin(nick),
  };
}

async function updateBio(me, bio) {
  const key = Cloud.nickKey(me);
  if (!key) return { success: false, error: 'Entre na Conta com um nick' };
  if (!cloudOk()) return { success: false, error: 'Conexa precisa do Firebase online' };
  const clean = String(bio || '').trim().slice(0, MAX_BIO);
  const profile = await ensureProfile(me);
  const next = {
    nick: displayNick(me),
    bio: clean,
    banner: profile.banner || null,
    createdAt: profile.createdAt || Date.now(),
    updatedAt: Date.now(),
  };
  await Cloud.fbPut(`conexa/profiles/${key}`, next);
  return { success: true, profile: { ...next, key } };
}

async function updateBanner(me, banner) {
  const key = Cloud.nickKey(me);
  if (!key) return { success: false, error: 'Entre na Conta com um nick' };
  if (!cloudOk()) return { success: false, error: 'Conexa precisa do Firebase online' };
  let data = banner ? String(banner) : null;
  if (data && data.length > MAX_BANNER_CHARS) {
    return { success: false, error: 'Banner muito grande — usa outra imagem' };
  }
  const profile = await ensureProfile(me);
  const next = {
    nick: displayNick(me),
    bio: profile.bio || '',
    banner: data,
    createdAt: profile.createdAt || Date.now(),
    updatedAt: Date.now(),
  };
  await Cloud.fbPut(`conexa/profiles/${key}`, next);
  return { success: true, profile: { ...next, key } };
}

async function createPost(me, { text, image, global: toGlobal = true, communityId = null } = {}) {
  const author = displayNick(me);
  const authorKey = Cloud.nickKey(me);
  if (!authorKey) return { success: false, error: 'Entre na Conta com um nick' };
  if (!cloudOk()) return { success: false, error: 'Conexa precisa do Firebase online' };

  const body = String(text || '').trim().slice(0, MAX_TEXT);
  let img = image ? String(image) : null;
  if (img && img.length > MAX_IMAGE_CHARS) {
    return { success: false, error: 'Imagem muito grande — manda um arquivo menor' };
  }
  if (!body && !img) return { success: false, error: 'Escreve algo ou anexa uma imagem' };

  let communityName = null;
  let commId = communityId ? String(communityId).trim() : null;
  if (commId) {
    const Comm = require('./conexa-communities');
    const gate = await Comm.assertCommunityMember(me, commId);
    if (!gate.ok) return { success: false, error: gate.error || 'Entre na comunidade pra postar' };
    communityName = gate.community?.name || null;
  }

  await ensureProfile(me);
  const id = newId('post');
  const post = {
    id,
    author,
    authorKey,
    text: body,
    image: img,
    // Em comunidade: só vai pro Global se marcar. Sem comunidade: default global.
    global: commId ? toGlobal === true : toGlobal !== false,
    communityId: commId,
    communityName,
    createdAt: Date.now(),
    likes: {},
  };
  await Cloud.fbPut(`conexa/posts/${id}`, post);
  await Cloud.fbPut(`conexa/userPosts/${authorKey}/${id}`, true);
  invalidatePostsCache();
  return { success: true, post: shapePost(id, post, authorKey, await isAdmin(me)) };
}

async function listFeed(me, { author, scope, communityId } = {}) {
  const meKey = Cloud.nickKey(me);
  const admin = meKey ? await isAdmin(me) : false;
  if (!cloudOk()) {
    return {
      success: true,
      offline: true,
      posts: [],
      people: [],
      isAdmin: admin,
      admins: await listAdmins(),
    };
  }

  let communityMod = false;
  const commId = communityId ? String(communityId).trim() : null;
  if (commId && meKey) {
    try {
      const Comm = require('./conexa-communities');
      communityMod = await Comm.canModerateCommunity(me, commId);
    } catch {}
  }

  let raw = await getPostsRaw();

  let posts = Object.entries(raw)
    .map(([id, data]) => shapePost(id, data, meKey, admin, {
      communityMod: !!(commId && data?.communityId === commId && communityMod),
    }))
    .filter(Boolean);

  // People rail só no global — evita custo extra nas outras views
  let people = [];
  if (!commId && !author) {
    const peopleMap = new Map();
    for (const p of posts) {
      if (!p.authorKey || peopleMap.has(p.authorKey)) continue;
      peopleMap.set(p.authorKey, { nick: p.author, key: p.authorKey });
    }
    people = [...peopleMap.values()].slice(0, 40);
  }

  if (commId) {
    posts = posts.filter((p) => p.communityId === commId);
  } else if (author) {
    const ak = Cloud.nickKey(author);
    posts = posts.filter((p) => p.authorKey === ak);
  } else if (scope === 'global' || !scope) {
    // Global: posts sem comunidade, ou da comunidade marcados "também Global"
    posts = posts.filter((p) => {
      if (p.communityId) return p.global === true;
      return p.global !== false;
    });
  }

  posts.sort((a, b) => b.createdAt - a.createdAt);
  return {
    success: true,
    posts: posts.slice(0, 80),
    people,
    isAdmin: admin,
    admins: await listAdmins(),
  };
}

async function toggleLike(me, postId) {
  const meKey = Cloud.nickKey(me);
  if (!meKey) return { success: false, error: 'Entre na Conta com um nick' };
  if (!cloudOk()) return { success: false, error: 'Conexa precisa do Firebase online' };
  const id = String(postId || '').trim();
  if (!id) return { success: false, error: 'Post inválido' };

  const post = await Cloud.fbGet(`conexa/posts/${id}`);
  if (!post) return { success: false, error: 'Post não encontrado' };

  const likes = likesMap(post.likes);
  if (likes[meKey]) {
    await Cloud.fbDelete(`conexa/posts/${id}/likes/${meKey}`);
    delete likes[meKey];
  } else {
    await Cloud.fbPut(`conexa/posts/${id}/likes/${meKey}`, { at: Date.now() });
    likes[meKey] = { at: Date.now() };
  }

  invalidatePostsCache();
  return {
    success: true,
    post: shapePost(id, { ...post, likes }, meKey, await isAdmin(me)),
  };
}

async function deletePost(me, postId) {
  const meKey = Cloud.nickKey(me);
  if (!meKey) return { success: false, error: 'Entre na Conta com um nick' };
  if (!cloudOk()) return { success: false, error: 'Conexa precisa do Firebase online' };
  const id = String(postId || '').trim();
  if (!id) return { success: false, error: 'Post inválido' };

  const post = await Cloud.fbGet(`conexa/posts/${id}`);
  if (!post) return { success: false, error: 'Post não encontrado' };

  const authorKey = post.authorKey || Cloud.nickKey(post.author);
  const admin = await isAdmin(me);
  let communityMod = false;
  if (post.communityId) {
    try {
      const Comm = require('./conexa-communities');
      communityMod = await Comm.canModerateCommunity(me, post.communityId);
    } catch {}
  }
  if (meKey !== authorKey && !admin && !communityMod) {
    return { success: false, error: 'Só o autor ou um admin pode apagar' };
  }

  await Cloud.fbDelete(`conexa/posts/${id}`);
  if (authorKey) {
    try { await Cloud.fbDelete(`conexa/userPosts/${authorKey}/${id}`); } catch {}
  }
  invalidatePostsCache();
  return { success: true, id, moderated: (admin || communityMod) && meKey !== authorKey };
}

async function status(me) {
  return {
    ok: cloudOk(),
    configured: cloudOk(),
    isAdmin: me ? await isAdmin(me) : false,
    admins: await listAdmins(),
  };
}

module.exports = {
  getProfile,
  updateBio,
  updateBanner,
  createPost,
  listFeed,
  toggleLike,
  deletePost,
  status,
  isAdmin,
  listAdmins,
};
