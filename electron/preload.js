const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('recreate', {
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  quit: () => ipcRenderer.invoke('app:quit'),

  getStatus: () => ipcRenderer.invoke('launcher:get-status'),
  getJava: () => ipcRenderer.invoke('launcher:get-java'),
  install: (opts) => ipcRenderer.invoke('launcher:install', opts),
  play: (opts) => ipcRenderer.invoke('launcher:play', opts),
  stopGame: () => ipcRenderer.invoke('launcher:stop'),

  getUsername: () => ipcRenderer.invoke('launcher:get-username'),
  saveUsername: (u) => ipcRenderer.invoke('launcher:save-username', u),
  getRam: () => ipcRenderer.invoke('launcher:get-ram'),
  saveRam: (r) => ipcRenderer.invoke('launcher:save-ram', r),

  loginMicrosoft: () => ipcRenderer.invoke('auth:login-microsoft'),
  logout: () => ipcRenderer.invoke('auth:logout'),
  getAccount: () => ipcRenderer.invoke('auth:get-account'),
  setAccountType: (t) => ipcRenderer.invoke('auth:set-type', t),

  importSkin: (u) => ipcRenderer.invoke('skin:import', u),
  importSkinPath: (opts) => ipcRenderer.invoke('skin:import-path', opts),
  deleteSkin: (opts) => ipcRenderer.invoke('skin:delete', opts),
  selectSkin: (opts) => ipcRenderer.invoke('skin:select', opts),
  getSkinPreview: (opts) => ipcRenderer.invoke('skin:get-preview', opts),
  syncPremiumSkin: () => ipcRenderer.invoke('skin:sync-premium'),
  getAvatar: (u) => ipcRenderer.invoke('skin:get-avatar', u),
  getActiveSkinId: () => ipcRenderer.invoke('skin:get-active-id'),
  getSkinData: (p) => ipcRenderer.invoke('skin:get-data', p),
  listSkins: (opts) => ipcRenderer.invoke('skin:list', opts),

  getServerStatus: () => ipcRenderer.invoke('server:status'),
  getLevelInfo: () => ipcRenderer.invoke('level:info'),
  getChangelog: () => ipcRenderer.invoke('changelog:get'),
  getLauncherStatus: () => ipcRenderer.invoke('launcher-status:get'),
  refreshRemote: () => ipcRenderer.invoke('remote:refresh'),
  onRemoteSync: (cb) => {
    const handler = (_, data) => cb(data);
    ipcRenderer.on('remote:sync', handler);
    return () => ipcRenderer.removeListener('remote:sync', handler);
  },

  getFriends: (me) => ipcRenderer.invoke('friends:list', me),
  sendFriendRequest: (from, to) => ipcRenderer.invoke('friends:send-request', from, to),
  acceptFriendRequest: (me, from) => ipcRenderer.invoke('friends:accept', me, from),
  declineFriendRequest: (me, from) => ipcRenderer.invoke('friends:decline', me, from),
  cancelFriendRequest: (me, to) => ipcRenderer.invoke('friends:cancel-request', me, to),
  removeFriend: (me, u) => ipcRenderer.invoke('friends:remove', me, u),
  getFriendsStatus: (me) => ipcRenderer.invoke('friends:status', me),
  getFriendMessages: (me, nick) => ipcRenderer.invoke('friends:messages', me, nick),
  sendFriendMessage: (me, nick, text) => ipcRenderer.invoke('friends:send-message', me, nick, text),
  getFriendHistoryInfo: (me, nick) => ipcRenderer.invoke('friends:history-info', me, nick),
  clearFriendHistory: (me, nick) => ipcRenderer.invoke('friends:clear-history', me, nick),
  createFriendGroup: (me, opts) => ipcRenderer.invoke('friends:create-group', me, opts),
  leaveFriendGroup: (me, id) => ipcRenderer.invoke('friends:leave-group', me, id),
  getGroupMessages: (me, id) => ipcRenderer.invoke('friends:group-messages', me, id),
  sendGroupMessage: (me, id, text) => ipcRenderer.invoke('friends:send-group-message', me, id, text),
  getGroupHistoryInfo: (me, id) => ipcRenderer.invoke('friends:group-history-info', me, id),
  clearGroupHistory: (me, id) => ipcRenderer.invoke('friends:clear-group-history', me, id),
  markFriendChatRead: (me, kind, id) => ipcRenderer.invoke('friends:mark-read', me, kind, id),
  getPresence: (me) => ipcRenderer.invoke('friends:get-presence', me),
  setPresence: (me, status, extras) => ipcRenderer.invoke('friends:set-presence', me, status, extras),
  heartbeatPresence: (me, extras) => ipcRenderer.invoke('friends:heartbeat-presence', me, extras),
  getFriendsCloudStatus: () => ipcRenderer.invoke('friends:cloud-status'),

  getConexaStatus: (me) => ipcRenderer.invoke('conexa:status', me),
  getConexaFeed: (me, opts) => ipcRenderer.invoke('conexa:feed', me, opts),
  getConexaProfile: (nick) => ipcRenderer.invoke('conexa:profile', nick),
  updateConexaBio: (me, bio) => ipcRenderer.invoke('conexa:update-bio', me, bio),
  updateConexaBanner: (me, banner) => ipcRenderer.invoke('conexa:update-banner', me, banner),
  createConexaPost: (me, payload) => ipcRenderer.invoke('conexa:create-post', me, payload),
  likeConexaPost: (me, postId) => ipcRenderer.invoke('conexa:like', me, postId),
  deleteConexaPost: (me, postId) => ipcRenderer.invoke('conexa:delete-post', me, postId),

  listConexaCommunities: (me) => ipcRenderer.invoke('conexa:communities-list', me),
  createConexaCommunity: (me, payload) => ipcRenderer.invoke('conexa:community-create', me, payload),
  joinConexaCommunity: (me, payload) => ipcRenderer.invoke('conexa:community-join', me, payload),
  leaveConexaCommunity: (me, id) => ipcRenderer.invoke('conexa:community-leave', me, id),
  deleteConexaCommunity: (me, id) => ipcRenderer.invoke('conexa:community-delete', me, id),
  getConexaCommunityView: (me, id) => ipcRenderer.invoke('conexa:community-view', me, id),
  updateConexaCommunityBanner: (me, id, banner) => ipcRenderer.invoke('conexa:community-banner', me, id, banner),
  createConexaChannel: (me, id, payload) => ipcRenderer.invoke('conexa:community-create-channel', me, id, payload),
  deleteConexaChannel: (me, id, channelId) => ipcRenderer.invoke('conexa:community-delete-channel', me, id, channelId),
  createConexaRole: (me, id, payload) => ipcRenderer.invoke('conexa:community-create-role', me, id, payload),
  deleteConexaRole: (me, id, roleId) => ipcRenderer.invoke('conexa:community-delete-role', me, id, roleId),
  setConexaMemberRole: (me, id, nick, roleId, assign) => ipcRenderer.invoke('conexa:community-set-role', me, id, nick, roleId, assign),
  getConexaCommunityMessages: (me, id, channelId) => ipcRenderer.invoke('conexa:community-messages', me, id, channelId),
  sendConexaCommunityMessage: (me, id, channelId, text) => ipcRenderer.invoke('conexa:community-send', me, id, channelId, text),
  deleteConexaCommunityMessage: (me, id, channelId, msgId) => ipcRenderer.invoke('conexa:community-delete-msg', me, id, channelId, msgId),

  onProgress: (cb) => {
    ipcRenderer.on('launcher:progress', (_, data) => cb(data));
  },
  splashDone: () => ipcRenderer.invoke('splash:done'),
  onGameClosed: (cb) => {
    ipcRenderer.on('launcher:game-closed', (_, data) => cb(data));
  },
  onLevelUpdated: (cb) => {
    ipcRenderer.on('level:updated', (_, data) => cb(data));
  },
  onWindowActive: (cb) => {
    const handler = (_, active) => cb(!!active);
    ipcRenderer.on('window:active', handler);
    return () => ipcRenderer.removeListener('window:active', handler);
  },

  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  hideToTray: () => ipcRenderer.invoke('window:hide-to-tray'),
  showFromTray: () => ipcRenderer.invoke('window:show-from-tray'),

  glitchIcon: (intensity, mode) => ipcRenderer.invoke('glitch:icon-pulse', intensity, mode),
  stopIconGlitch: () => ipcRenderer.invoke('glitch:icon-stop'),
  setGlitchIntensity: (intensity) => ipcRenderer.invoke('glitch:set-intensity', intensity),

  getUpdateStatus: () => ipcRenderer.invoke('updater:status'),
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  downloadUpdate: () => ipcRenderer.invoke('updater:download'),
  downloadAndInstallUpdate: () => ipcRenderer.invoke('updater:download-install'),
  installUpdate: () => ipcRenderer.invoke('updater:install'),
  onUpdateStatus: (cb) => {
    const handler = (_, data) => cb(data);
    ipcRenderer.on('updater:status', handler);
    return () => ipcRenderer.removeListener('updater:status', handler);
  },
});
