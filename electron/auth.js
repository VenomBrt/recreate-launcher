const crypto = require('crypto');
const { Authenticator } = require('minecraft-launcher-core');
const Store = require('./store');

function offlineUUID(username) {
  const md5 = crypto.createHash('md5').update(`OfflinePlayer:${username}`).digest();
  md5[6] = (md5[6] & 0x0f) | 0x30;
  md5[8] = (md5[8] & 0x3f) | 0x80;
  const hex = md5.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function getAccountType() {
  return Store.get('accountType', 'premium');
}

function saveAccountType(type) {
  Store.set('accountType', type);
}

function getSavedAuth() {
  return Store.get('msAuth', null);
}

function saveMsAuth(data) {
  Store.set('msAuth', data);
}

function clearMsAuth() {
  Store.set('msAuth', null);
}

function validateCrackedUsername(username) {
  const name = (username || '').trim();
  if (!/^[a-zA-Z0-9_]{3,16}$/.test(name)) {
    throw new Error('Nickname inválido. Use 3–16 caracteres (letras, números e _).');
  }
  return name;
}

async function loginMicrosoft() {
  const { Auth } = require('msmc');
  const authManager = new Auth('select_device');
  const xboxManager = await authManager.launch('electron');
  const mc = await xboxManager.getMinecraft();

  if (typeof mc.isDemo === 'function' && mc.isDemo()) {
    throw new Error('Conta demo do Minecraft não é suportada. Use uma conta completa.');
  }

  const mclcAuth = mc.mclc(true);
  const authData = {
    mclc: mclcAuth,
    refreshToken: mclcAuth.meta?.refresh || null,
    name: mclcAuth.name,
    uuid: mclcAuth.uuid,
    exp: mclcAuth.meta?.exp || null,
  };

  saveMsAuth(authData);
  saveAccountType('premium');
  Store.set('username', mclcAuth.name);

  return {
    type: 'premium',
    username: mclcAuth.name,
    uuid: mclcAuth.uuid,
    auth: mclcAuth,
  };
}

async function refreshPremiumAuth() {
  const saved = getSavedAuth();
  if (!saved?.refreshToken && !saved?.mclc) {
    throw new Error('Faça login com sua conta Microsoft na aba Conta.');
  }

  if (saved.mclc?.meta?.exp && Date.now() < saved.mclc.meta.exp - 120000) {
    return saved.mclc;
  }

  if (!saved.refreshToken) {
    throw new Error('Sessão expirada. Entre com Microsoft novamente.');
  }

  const { Auth } = require('msmc');
  const authManager = new Auth('select_device');
  const xboxManager = await authManager.refresh(saved.refreshToken);
  const mc = await xboxManager.getMinecraft();
  const mclcAuth = mc.mclc(true);

  saveMsAuth({
    mclc: mclcAuth,
    refreshToken: mclcAuth.meta?.refresh || saved.refreshToken,
    name: mclcAuth.name,
    uuid: mclcAuth.uuid,
    exp: mclcAuth.meta?.exp || null,
  });

  return mclcAuth;
}

function getCrackedAuth(username) {
  const name = validateCrackedUsername(username);
  const uuid = offlineUUID(name);
  const auth = Authenticator.getAuth(name);
  auth.uuid = uuid;
  auth.selectedProfile = { id: uuid.replace(/-/g, ''), name };
  return auth;
}

async function getAuthForLaunch(username, accountType) {
  const type = accountType || getAccountType();

  if (type === 'premium') {
    const auth = await refreshPremiumAuth();
    return {
      type: 'premium',
      auth,
      username: auth.name,
      uuid: auth.uuid,
    };
  }

  const name = validateCrackedUsername(username);
  Store.set('username', name);
  return {
    type: 'cracked',
    auth: getCrackedAuth(name),
    username: name,
    uuid: offlineUUID(name),
  };
}

function getAccountInfo() {
  const type = getAccountType();
  const saved = getSavedAuth();
  const premiumName = saved?.name || saved?.mclc?.name || '';
  return {
    type,
    username: type === 'premium' ? premiumName : Store.get('username', ''),
    uuid: type === 'premium' ? (saved?.uuid || saved?.mclc?.uuid || null) : null,
    loggedIn: type === 'premium' && !!(saved?.mclc || saved?.refreshToken),
  };
}

function logoutMicrosoft() {
  clearMsAuth();
}

module.exports = {
  loginMicrosoft,
  refreshPremiumAuth,
  getAuthForLaunch,
  getAccountInfo,
  getAccountType,
  saveAccountType,
  clearMsAuth,
  logoutMicrosoft,
  validateCrackedUsername,
  offlineUUID,
  getSavedAuth,
};
