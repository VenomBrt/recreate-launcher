/* ═══ Recreate Launcher — App ═══ */

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

let accountType = 'premium';
let accountInfo = {};
let isPlaying = false;
let gameIsOpen = false;
let skinViewer = null;
let skinTileViewers = [];
let skinRefreshGen = 0;
let skinRefreshTimer = null;
let playerChipGen = 0;
let premiumAvatarGen = 0;
let usernameInputTimer = null;
let currentPage = 'play';
let isTransitioning = false;
let pendingNav = null;
let appSettings = {
  minimizeToTrayOnPlay: true,
  tabGlitchEnabled: true,
  titleGlitchEnabled: true,
  glitchSoundsEnabled: true,
};
const loadingGlitch = new GlitchEngine({ container: $('#app-root'), intensity: 1.1, mode: 'cinema' });
const tabGlitch = new GlitchEngine({ container: $('#app-root'), intensity: 2.4, mode: 'transition' });
const playTitleGlitch = new PlayTitleGlitch();
window.playTitleGlitchInstance = playTitleGlitch;

// Desbloqueia áudio (SFX de glitch / transição)
const glitchSfx = window.glitchSfx || (window.GlitchSfx ? new window.GlitchSfx() : null);
if (glitchSfx) window.glitchSfx = glitchSfx;
function unlockGlitchAudio() {
  try {
    window.glitchSfx?.unlock?.();
    window.glitchSfx?.init?.();
  } catch {}
}
unlockGlitchAudio();
window.addEventListener('pointerdown', unlockGlitchAudio, { once: true });
window.addEventListener('keydown', unlockGlitchAudio, { once: true });
try { window.glitchSfx?.init?.(); } catch {}

function setSfxForeground(active) {
  try {
    const allow = appSettings.glitchSoundsEnabled !== false;
    window.glitchSfx?.setMuted?.(!active || !allow);
    if (active && allow) window.glitchSfx?.restoreMasterGain?.();
  } catch {}
}

window.recreate?.onWindowActive?.((active) => setSfxForeground(active));
document.addEventListener('visibilitychange', () => {
  setSfxForeground(!document.hidden);
});

const PAGE_TITLES = {
  play: 'Jogar', skin: 'Skin', friends: 'Amigos', conexa: 'Conexa',
  account: 'Conta', settings: 'Configurações', wiki: 'Wiki',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const yieldToMain = () => new Promise((r) => {
  requestAnimationFrame(() => setTimeout(r, 0));
});

let skinviewLoadPromise = null;
function ensureSkinview3d() {
  if (window.skinview3d) return Promise.resolve();
  if (skinviewLoadPromise) return skinviewLoadPromise;
  skinviewLoadPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/skinview3d@3.4.1/bundles/skinview3d.bundle.js';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Falha ao carregar visualizador de skin'));
    document.head.appendChild(s);
  }).catch((err) => {
    console.warn(err);
    skinviewLoadPromise = null;
  });
  return skinviewLoadPromise;
}

// ─── Navigation with glitch transition ───
function resetPageTransitionUi() {
  const container = $('#page-container');
  const flash = $('#tab-glitch-flash');
  container?.classList.remove('tab-transitioning', 'tab-distort');
  flash?.classList.remove('active');
  $$('.page').forEach((p) => p.classList.remove('page-exit'));
  try { tabGlitch.finishTransition?.(); } catch {}
  try { tabGlitch.stop?.(); } catch {}
}

/** Cancela sync/preview da Skin se o usuário saiu da aba */
function abortSkinWork() {
  skinRefreshGen += 1;
  clearTimeout(skinRefreshTimer);
  skinRefreshTimer = null;
  setSkinPageLoading(false);
  disposeTileViewers();
  if (skinViewer) {
    stopSkinHurtLoop(skinViewer);
    try { skinViewer.dispose(); } catch {}
    skinViewer = null;
    const canvas = $('#skin-canvas');
    if (canvas) {
      canvas._skinBound = false;
      canvas.classList.add('hidden');
    }
  }
}

async function navigateTo(page, btn) {
  if (!page) return;
  if (page === currentPage && !isTransitioning) return;

  // Se ainda está animando, guarda o próximo destino (não trava o clique)
  if (isTransitioning) {
    pendingNav = { page, btn };
    return;
  }

  const newPage = $(`#page-${page}`);
  const navBtn = btn || $(`[data-page="${page}"]`);
  const oldPage = $(`#page-${currentPage}`);
  if (!newPage || !navBtn) return;

  isTransitioning = true;
  pendingNav = null;

  // Saiu da Skin no meio do sync → cancela tudo
  if (currentPage === 'skin' && page !== 'skin') {
    abortSkinWork();
  }

  resetPageTransitionUi();

  const container = $('#page-container');
  const flash = $('#tab-glitch-flash');
  const unlockTimer = setTimeout(() => {
    isTransitioning = false;
    resetPageTransitionUi();
  }, 1200);

  try {
    if (oldPage && oldPage !== newPage) {
      oldPage.classList.add('page-exit');
    }

    const useTabGlitch = appSettings.tabGlitchEnabled !== false;
    if (useTabGlitch) {
      container?.classList.add('tab-transitioning', 'tab-distort');
      flash?.classList.add('active');
      notifyIconGlitch(0.6, 'normal');
      if (appSettings.glitchSoundsEnabled !== false) {
        try { window.glitchSfx?.transition?.(); } catch {}
      }
      try { tabGlitch.playTransition(); } catch {}
      await sleep(120);
    }

    // Garante uma página só ativa (evita “mistura”)
    $$('.page').forEach((p) => {
      p.classList.remove('active', 'page-exit');
    });
    $$('.nav-item').forEach((b) => b.classList.remove('active'));
    navBtn.classList.add('active');
    newPage.classList.add('active');

    const title = PAGE_TITLES[page] || page;
    const pageTitle = $('#page-title');
    if (pageTitle) {
      pageTitle.textContent = title;
      TextRupture.syncText(pageTitle, title);
      if (useTabGlitch) {
        TextRupture.ruptureElement(pageTitle, { tier: 'heavy', intensity: 0.8, duration: 160 });
      }
    }
    currentPage = page;
    $('#page-container')?.classList.toggle('conexa-full', page === 'conexa');

    if (useTabGlitch) {
      await sleep(160);
      container?.classList.remove('tab-transitioning', 'tab-distort');
      flash?.classList.remove('active');
      tabGlitch.applyContentGlitch?.();
    } else {
      resetPageTransitionUi();
    }

    if (page === 'play' && appSettings.titleGlitchEnabled !== false) playTitleGlitch.burst();
    if (page === 'skin') {
      // Não bloqueia a UI — carrega em background e respeita cancelamento
      ensureSkinview3d()
        .then(() => {
          if (currentPage === 'skin') scheduleRefreshSkinPage();
        })
        .catch(() => {});
    }
    if (page === 'friends') refreshFriends();
    if (page === 'conexa') refreshConexa();
  } catch (err) {
    console.error('navigateTo:', err);
    resetPageTransitionUi();
  } finally {
    clearTimeout(unlockTimer);
    isTransitioning = false;
    const next = pendingNav;
    pendingNav = null;
    if (next && next.page !== currentPage) {
      // Próximo clique enfileirado
      setTimeout(() => navigateTo(next.page, next.btn), 0);
    }
  }
}

$$('.nav-item').forEach((btn) => {
  btn.addEventListener('click', () => navigateTo(btn.dataset.page, btn));
});

// ─── Window Controls ───
$('#btn-minimize').addEventListener('click', () => window.recreate.minimize());
$('#btn-maximize').addEventListener('click', () => window.recreate.maximize());
$('#btn-close').addEventListener('click', () => window.recreate.close());
$('#btn-quit').addEventListener('click', () => window.recreate.quit());

// ─── Account ───
function updateAccountUILabels() {
  const loggedIn = accountType === 'premium' && accountInfo.loggedIn;
  const name = accountInfo.username || 'Não conectado';

  TextRupture.syncText($('#premium-name'), loggedIn ? name : 'Não conectado');
  $('#premium-avatar').textContent = loggedIn ? name[0].toUpperCase() : '?';
  $('#premium-status').textContent = loggedIn
    ? `Conectado · ${name}`
    : 'Entre com sua conta Microsoft';

  $('#btn-ms-login').classList.toggle('hidden', loggedIn);
  $('#btn-ms-logout').classList.toggle('hidden', !loggedIn);

  if (accountType === 'cracked') {
    const nick = $('#username')?.value.trim() || '';
    $('#cracked-status').textContent = nick
      ? `Jogando como ${nick} (offline)`
      : 'Digite um nickname para jogar';
  }
}

function updateAccountUI() {
  updateAccountUILabels();
  updatePlayHint();
  updatePlayerChip();
  updatePremiumAvatar();
}

async function updatePremiumAvatar() {
  const el = $('#premium-avatar');
  if (!el) return;

  const loggedIn = accountType === 'premium' && accountInfo.loggedIn;
  if (!loggedIn) {
    el.style.backgroundImage = '';
    el.textContent = '?';
    return;
  }

  const gen = ++premiumAvatarGen;
  const skinUrl = await window.recreate.getSkinPreview({
    username: accountInfo.username,
    uuid: accountInfo.uuid,
    accountType: 'premium',
    sync: false,
  });
  if (gen !== premiumAvatarGen) return;

  if (skinUrl) {
    const head = await skinUrlToHeadDataUrl(skinUrl);
    if (gen !== premiumAvatarGen) return;
    if (head) {
      el.style.backgroundImage = `url(${head})`;
      el.style.backgroundSize = 'cover';
      el.style.backgroundPosition = 'center top';
      el.textContent = '';
      return;
    }
  }

  el.style.backgroundImage = '';
  el.textContent = accountInfo.username[0].toUpperCase();
}

const LOGIN_HINT = 'Por favor entre na conta do microsoft ou uma conta pirata para poder jogar';
const VIAJANTE_HEAD = '../assets/viajante-head.png';

function hasLinkedAccount() {
  if (accountType === 'premium') return !!accountInfo.loggedIn;
  if (accountType === 'cracked') return !!getUsername();
  return false;
}

function updatePlayMeta() {
  const readyPremium = accountType === 'premium' && accountInfo.loggedIn;
  const readyCracked = accountType === 'cracked' && !!getUsername();
  const linked = readyPremium || readyCracked;
  const name = linked ? (getUsername() || '—') : null;

  const metaAcc = $('#play-stat-account') || $('#play-meta-account');
  if (metaAcc) {
    metaAcc.textContent = linked ? name : 'Por favor Vincule uma conta';
    metaAcc.classList.toggle('needs-link', !linked);
  }

  const ram = $('#ram')?.value || '4';
  const metaRam = $('#play-meta-ram');
  if (metaRam) metaRam.textContent = `${ram} GB`;

  const displayName = linked ? (getUsername() || 'Jogador') : 'Viajante';
  const typeLabel = readyPremium
    ? 'Microsoft'
    : readyCracked
      ? 'Pirata'
      : 'Sem conta';

  const playerName = $('#play-player-name');
  if (playerName) TextRupture.syncText(playerName, displayName);

  const playerType = $('#play-player-type');
  if (playerType) playerType.textContent = typeLabel;
}

function updatePlayHint() {
  const hint = $('#hint-text');
  if (!hint || isPlaying) return;

  const needsLogin = (accountType === 'premium' && !accountInfo.loggedIn)
    || (accountType === 'cracked' && !getUsername())
    || (!accountInfo.loggedIn && !getUsername());

  if (needsLogin) {
    hint.textContent = LOGIN_HINT;
  } else {
    hint.textContent = '';
  }
  updatePlayMeta();
}

function setAccountType(type) {
  accountType = type;
  window.recreate.setAccountType(type);
  $('#tab-premium').classList.toggle('active', type === 'premium');
  $('#tab-cracked').classList.toggle('active', type === 'cracked');
  $('#section-premium').classList.toggle('hidden', type !== 'premium');
  $('#section-cracked').classList.toggle('hidden', type !== 'cracked');
  updateAccountUI();
}

$('#tab-premium').addEventListener('click', () => setAccountType('premium'));
$('#tab-cracked').addEventListener('click', () => setAccountType('cracked'));

function getUsername() {
  if (accountType === 'premium' && accountInfo.loggedIn) return accountInfo.username;
  return $('#username')?.value.trim() || '';
}

$('#username')?.addEventListener('input', () => {
  window.recreate.saveUsername($('#username').value);
  updateAccountUILabels();
  updatePlayHint();
  clearTimeout(usernameInputTimer);
  usernameInputTimer = setTimeout(() => updatePlayerChip(), 450);
});

$('#username')?.addEventListener('change', async () => {
  const nick = $('#username').value.trim();
  if (nick && !/^[a-zA-Z0-9_]{3,16}$/.test(nick)) {
    $('#cracked-status').textContent = 'Nickname inválido (3–16 caracteres).';
    return;
  }
  clearTimeout(usernameInputTimer);
  updateAccountUI();
  if (currentPage === 'skin') await refreshSkinPage();
});

$('#btn-ms-login').addEventListener('click', async () => {
  const btn = $('#btn-ms-login');
  btn.disabled = true;
  btn.textContent = 'Conectando...';
  try {
    const r = await window.recreate.loginMicrosoft();
    if (!r.success) throw new Error(r.error);
    accountInfo = await window.recreate.getAccount();
    btn.textContent = 'Entrar com Microsoft';
    await syncAccountSkin(true);
    updateAccountUI();
    await refreshSkinPage();
    updatePlayerChip();
    $('#hint-text').textContent = `Bem-vindo, ${r.username}! Clique em JOGAR.`;
  } catch (e) {
    $('#premium-status').textContent = e.message;
  }
  btn.disabled = false;
});

$('#btn-ms-logout').addEventListener('click', async () => {
  await window.recreate.logout();
  accountInfo = await window.recreate.getAccount();
  $('#btn-ms-login').textContent = 'Entrar com Microsoft';
  updateAccountUI();
  $('#hint-text').textContent = 'Você saiu da conta Microsoft.';
});

// ─── RAM ───
$('#ram').addEventListener('input', () => {
  $('#ram-value').textContent = `${$('#ram').value} GB`;
  updatePlayMeta();
});
$('#ram').addEventListener('change', () => {
  window.recreate.saveRam(parseInt($('#ram').value, 10));
  updatePlayMeta();
});

// ─── Play ───
function updatePlayButton() {
  const btn = $('#play-btn');
  if (!btn) return;

  btn.classList.remove('play-btn-stop', 'play-btn-loading');

  if (gameIsOpen) {
    btn.disabled = false;
    btn.classList.add('play-btn-stop');
    btn.innerHTML = '<span>■</span> <span class="play-btn-label rupture-target">FECHAR</span>';
    return;
  }

  if (isPlaying) {
    btn.disabled = true;
    btn.classList.add('play-btn-loading');
    btn.innerHTML = 'CARREGANDO...';
    return;
  }

  btn.disabled = false;
  btn.innerHTML = '<span>▶</span> <span class="play-btn-label rupture-target">JOGAR</span>';
}

function setBusy(busy) {
  isPlaying = busy;
  $('#progress-section').classList.toggle('hidden', !busy);
  $('#page-play')?.classList.toggle('loading-cinema', busy);
  if (busy) {
    $('#progress-fill').style.width = '2%';
    const glow = $('#progress-glow');
    if (glow) glow.style.width = '2%';
    $('#progress-text').textContent = 'Preparando arquivos...';
    loadingGlitch.start();
  } else {
    loadingGlitch.stop();
    window.recreate?.stopIconGlitch?.();
  }
  updatePlayButton();
}

function setGameOpen(open) {
  gameIsOpen = !!open;
  if (open) isPlaying = false;
  updatePlayButton();
  $('#progress-section')?.classList.add('hidden');
  $('#page-play')?.classList.remove('loading-cinema');
  syncMyPresenceHeartbeat();
}

async function stopMinecraftFromUi() {
  try {
    const r = await window.recreate.stopGame();
    setGameOpen(false);
    window.recreate.showFromTray?.();
    $('#hint-text').textContent = r?.alreadyStopped
      ? 'Minecraft já estava fechado.'
      : 'Minecraft fechado.';
    refreshLevel();
  } catch (e) {
    setGameOpen(false);
    $('#hint-text').textContent = e.message || 'Não foi possível fechar o Minecraft.';
  }
}

window.recreate.onProgress((data) => {
  if (data.percent !== undefined) {
    $('#progress-fill').style.width = `${data.percent}%`;
    const glow = $('#progress-glow');
    if (glow) glow.style.width = `${data.percent}%`;
    loadingGlitch?.setProgress?.(data.percent);
  }
  if (data.message) {
    $('#progress-text').textContent = data.message;
    loadingGlitch?.pulseOnProgress?.();
  }
});

window.recreate.onGameClosed?.((data) => {
  setGameOpen(false);
  refreshLevel();
  window.recreate.showFromTray?.();
  const mins = data?.minutes || 0;
  $('#hint-text').textContent = mins > 0
    ? `Sessão encerrada · +${mins} min`
    : 'Minecraft fechado.';
});

window.recreate.onLevelUpdated?.((info) => {
  if (!info) return;
  applyLevelInfo(info);
});

$('#play-btn').addEventListener('click', async () => {
  if (gameIsOpen) {
    await stopMinecraftFromUi();
    return;
  }

  // Trava imediata — evita clique duplo antes dos awaits
  if (isPlaying) return;
  setBusy(true);

  try {
    const username = getUsername();
    if (accountType === 'cracked' && !username) {
      setBusy(false);
      navigateTo('account', $('[data-page="account"]'));
      $('#hint-text').textContent = LOGIN_HINT;
      return;
    }
    if (accountType === 'cracked' && !/^[a-zA-Z0-9_]{3,16}$/.test(username)) {
      setBusy(false);
      navigateTo('account', $('[data-page="account"]'));
      $('#hint-text').textContent = LOGIN_HINT;
      return;
    }
    if (accountType === 'premium' && !accountInfo.loggedIn) {
      setBusy(false);
      navigateTo('account', $('[data-page="account"]'));
      $('#hint-text').textContent = LOGIN_HINT;
      return;
    }

    // Atualiza status/whitelist antes de jogar
    try {
      const latest = await window.recreate.getLauncherStatus();
      if (latest) applyLauncherStatus(latest);
    } catch {}

    if (launcherStatusInfo && launcherStatusInfo.allowPlay === false) {
      setBusy(false);
      $('#hint-text').textContent = launcherStatusInfo.message
        || 'Servidor indisponível no momento.';
      return;
    }

    if (launcherStatusInfo?.whitelistEnabled) {
      const nick = (username || '').trim().toLowerCase();
      const list = accountType === 'premium'
        ? (launcherStatusInfo.whitelistOriginal || [])
        : (launcherStatusInfo.whitelistPirata || []);
      if (!list.includes(nick)) {
        setBusy(false);
        $('#hint-text').textContent = accountType === 'premium'
          ? 'Sua conta original não está na whitelist.'
          : 'Seu nick pirata não está na whitelist.';
        return;
      }
    }

    const status = await window.recreate.getStatus();
    if (!status.java?.ok) {
      setBusy(false);
      $('#hint-text').textContent = status.java?.error || 'Java 17 não encontrado.';
      navigateTo('settings', $('[data-page="settings"]'));
      return;
    }

    if (status.gameRunning) {
      setBusy(false);
      setGameOpen(true);
      $('#hint-text').textContent = 'O Minecraft já está em execução.';
      return;
    }

    const launchSafety = setTimeout(() => {
      if (!isPlaying) return;
      setBusy(false);
      $('#hint-text').textContent = 'O lançamento demorou demais. Tente novamente.';
      $('#progress-text').textContent = 'Tempo esgotado ao iniciar.';
    }, 16 * 60 * 1000);

    try {
      const opts = { username, ram: parseInt($('#ram').value, 10), accountType };
      const play = await window.recreate.play(opts);
      if (!play.success) throw new Error(play.error);
      setBusy(false);
      setGameOpen(true);
      $('#hint-text').textContent = `Minecraft rodando como ${play.username || username}!`;
      refreshLevel();
    } catch (e) {
      setBusy(false);
      setGameOpen(false);
      $('#hint-text').textContent = e.message;
      $('#progress-text').textContent = e.message;
    } finally {
      clearTimeout(launchSafety);
    }
  } catch (e) {
    setBusy(false);
    $('#hint-text').textContent = e.message || 'Falha ao iniciar.';
  }
});

// ─── Skin hurt (upper body only, subtle) ───
const SKIN_IMPULSE = {
  maxEnergy: 4,
  energyPerClick: 1,
  decayPerSecond: 3.5,
  baseSpeed: 12,
  speedBoost: 3,
  bodyRot: 0.14,
  headRot: 0.18,
  armRot: 0.22,
  legRot: 0.07,
  shiftX: 0.06,
  dragThreshold: 8,
};

const skinImpulseState = new WeakMap();

function getSkinImpulseState(viewer) {
  if (!skinImpulseState.has(viewer)) {
    skinImpulseState.set(viewer, {
      energy: 0,
      phase: 0,
      side: 1,
      loopId: null,
      wasIdle: false,
    });
  }
  return skinImpulseState.get(viewer);
}

function setIdleAnimation(viewer) {
  if (!viewer || !window.skinview3d) return;
  try {
    viewer.animation = new skinview3d.IdleAnimation();
  } catch {
    viewer.animation = null;
  }
}

function resetUpperBody(viewer) {
  if (!viewer?.playerObject) return;
  try { viewer.playerObject.resetJoints(); } catch {}
  viewer.playerObject.position.set(0, 0, 0);
  viewer.playerObject.rotation.set(0, 0, 0);
}

function applyUpperBodyHurt(viewer, shake, side) {
  const { skin } = viewer.playerObject;
  skin.head.rotation.x = shake * SKIN_IMPULSE.headRot;
  skin.head.rotation.z = shake * SKIN_IMPULSE.headRot * 0.45 * side;
  skin.body.rotation.x = shake * SKIN_IMPULSE.bodyRot;
  skin.body.rotation.z = shake * SKIN_IMPULSE.bodyRot * 0.5 * side;
  skin.leftArm.rotation.x = shake * -SKIN_IMPULSE.armRot;
  skin.rightArm.rotation.x = shake * -SKIN_IMPULSE.armRot;
  skin.leftArm.rotation.z = shake * SKIN_IMPULSE.armRot * 0.35;
  skin.rightArm.rotation.z = shake * -SKIN_IMPULSE.armRot * 0.35;
  skin.leftLeg.rotation.x = shake * SKIN_IMPULSE.legRot * 0.55;
  skin.rightLeg.rotation.x = shake * -SKIN_IMPULSE.legRot * 0.4;
  skin.leftLeg.rotation.z = shake * SKIN_IMPULSE.legRot * 0.18 * side;
  skin.rightLeg.rotation.z = shake * -SKIN_IMPULSE.legRot * 0.12 * side;
  viewer.playerObject.position.x = shake * SKIN_IMPULSE.shiftX * side;
}

function updateSkinHurt(viewer, state, delta) {
  state.energy = Math.max(0, state.energy - SKIN_IMPULSE.decayPerSecond * delta);

  if (state.energy <= 0) {
    resetUpperBody(viewer);
    if (state.wasIdle) setIdleAnimation(viewer);
    state.wasIdle = false;
    return false;
  }

  const intensity = state.energy / SKIN_IMPULSE.maxEnergy;
  state.phase += delta * (SKIN_IMPULSE.baseSpeed + state.energy * SKIN_IMPULSE.speedBoost);
  const shake = Math.sin(state.phase) * intensity;
  applyUpperBodyHurt(viewer, shake, state.side);
  return true;
}

function startSkinHurtLoop(viewer) {
  const state = getSkinImpulseState(viewer);
  if (state.loopId) return;

  let lastTime = performance.now();

  const tick = (now) => {
    if (!viewer || viewer.disposed) {
      state.loopId = null;
      return;
    }

    const delta = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    if (updateSkinHurt(viewer, state, delta)) {
      state.loopId = requestAnimationFrame(tick);
    } else {
      state.loopId = null;
    }
  };

  state.loopId = requestAnimationFrame(tick);
}

function playClickHurt(viewer) {
  if (!viewer?.playerObject) return;

  const state = getSkinImpulseState(viewer);
  if (!state.loopId && viewer.animation) {
    state.wasIdle = true;
    viewer.animation = null;
  }

  state.side = Math.random() > 0.5 ? 1 : -1;
  state.energy = Math.min(
    SKIN_IMPULSE.maxEnergy,
    state.energy + SKIN_IMPULSE.energyPerClick,
  );

  startSkinHurtLoop(viewer);
}

function setupSkinViewerInteraction(viewer, canvas) {
  if (!viewer || !canvas || canvas._skinBound) return;
  canvas._skinBound = true;

  let startX = 0;
  let startY = 0;
  let hasDragged = false;

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    startX = e.clientX;
    startY = e.clientY;
    hasDragged = false;
  });

  canvas.addEventListener('pointermove', (e) => {
    if (
      Math.abs(e.clientX - startX) > SKIN_IMPULSE.dragThreshold
      || Math.abs(e.clientY - startY) > SKIN_IMPULSE.dragThreshold
    ) {
      hasDragged = true;
    }
  });

  canvas.addEventListener('click', (e) => {
    if (e.button !== 0) return;
    if (hasDragged) {
      hasDragged = false;
      return;
    }
    playClickHurt(viewer);
    hasDragged = false;
  });
}

function stopSkinHurtLoop(viewer) {
  const state = skinImpulseState.get(viewer);
  if (!state) return;
  if (state.loopId) cancelAnimationFrame(state.loopId);
  state.loopId = null;
  state.energy = 0;
  resetUpperBody(viewer);
  if (state.wasIdle) setIdleAnimation(viewer);
  state.wasIdle = false;
  skinImpulseState.delete(viewer);
}

function skinUrlToHeadDataUrl(skinUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const scale = img.width / 64;
      const c = document.createElement('canvas');
      c.width = 32;
      c.height = 32;
      const ctx = c.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      // base face + hat layer
      ctx.drawImage(img, 8 * scale, 8 * scale, 8 * scale, 8 * scale, 0, 0, 32, 32);
      ctx.drawImage(img, 40 * scale, 8 * scale, 8 * scale, 8 * scale, 0, 0, 32, 32);
      resolve(c.toDataURL('image/png'));
    };
    img.onerror = () => resolve(null);
    img.src = skinUrl;
  });
}

function skinUrlToBodyThumb(skinUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const u = img.width / 64;
      const legacy = img.height <= 32;
      const canvas = document.createElement('canvas');
      // margem em cima pra layer do chapéu não cortar
      canvas.width = 64;
      canvas.height = 104;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      const top = 6; // espaço pro outer layer (+2)

      const part = (sx, sy, sw, sh, dx, dy, dw, dh) => {
        ctx.drawImage(img, sx * u, sy * u, sw * u, sh * u, dx, dy, dw, dh);
      };
      const outer = (sx, sy, sw, sh, dx, dy, dw, dh) => {
        part(sx, sy, sw, sh, dx - 1, dy - 1, dw + 2, dh + 2);
      };

      // base (frente) — escala 2×
      part(4, 20, 4, 12, 32, top + 40, 8, 24);
      part(20, legacy ? 20 : 52, 4, 12, 24, top + 40, 8, 24);
      part(20, 20, 8, 12, 24, top + 16, 16, 24);
      part(44, 20, 4, 12, 40, top + 16, 8, 24);
      part(36, legacy ? 20 : 52, 4, 12, 16, top + 16, 8, 24);
      part(8, 8, 8, 8, 24, top, 16, 16);

      if (!legacy) {
        outer(4, 36, 4, 12, 32, top + 40, 8, 24);
        outer(4, 52, 4, 12, 24, top + 40, 8, 24);
        outer(20, 36, 8, 12, 24, top + 16, 16, 24);
        outer(44, 36, 4, 12, 40, top + 16, 8, 24);
        outer(52, 52, 4, 12, 16, top + 16, 8, 24);
        outer(40, 8, 8, 8, 24, top, 16, 16);
      }

      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => resolve(null);
    img.src = skinUrl;
  });
}

async function getSkinUrl({ sync = false } = {}) {
  const username = getUsername();
  if (!username) return null;
  return window.recreate.getSkinPreview({
    username,
    uuid: accountInfo.uuid || null,
    accountType,
    sync,
  });
}

async function syncAccountSkin(force = false) {
  if (accountType !== 'premium' || !accountInfo.loggedIn) return null;
  if (force) {
    const r = await window.recreate.syncPremiumSkin();
    if (!r.success) console.warn('Skin sync:', r.error);
  }
  return getSkinUrl();
}

async function initSkinViewer(skinUrl, gen = skinRefreshGen) {
  const canvas = $('#skin-canvas');
  if (!canvas || !window.skinview3d || !skinUrl) return;
  if (gen !== skinRefreshGen || currentPage !== 'skin') return;

  await ensureSkinview3d();
  if (gen !== skinRefreshGen || currentPage !== 'skin') return;

  await yieldToMain();
  if (gen !== skinRefreshGen || currentPage !== 'skin') return;

  if (!skinViewer) {
    const stage = canvas.parentElement;
    const w = Math.min(280, Math.max(220, Math.floor(stage?.clientWidth || 260)));
    const h = Math.min(380, Math.max(300, Math.floor(stage?.clientHeight || 340)));

    skinViewer = new skinview3d.SkinViewer({
      canvas,
      width: w,
      height: h,
    });

    // Enquadramento natural — sem achatar / engordar
    skinViewer.fov = 48;
    skinViewer.zoom = 0.7;
    skinViewer.camera.position.set(-14, 16, 56);
    skinViewer.camera.lookAt(0, 12, 0);
    skinViewer.controls.enableZoom = false;
    skinViewer.controls.enablePan = false;
    skinViewer.controls.enableRotate = true;
    setupSkinViewerInteraction(skinViewer, canvas);
  } else {
    // Reajusta se o stage mudou de tamanho
    const stage = canvas.parentElement;
    if (stage?.clientWidth && stage?.clientHeight) {
      skinViewer.width = Math.min(280, Math.max(220, Math.floor(stage.clientWidth)));
      skinViewer.height = Math.min(380, Math.max(300, Math.floor(stage.clientHeight)));
    }
  }

  canvas.classList.remove('hidden');

  try {
    await skinViewer.loadSkin(skinUrl, { model: 'auto-detect', makeVisible: true });
    enableSkinLayers(skinViewer);
  } catch (e) {
    console.warn('Falha ao carregar skin:', e);
  }

  if (gen !== skinRefreshGen) return;
  setIdleAnimation(skinViewer);
}

function showSkinViewerEmpty(show) {
  const canvas = $('#skin-canvas');
  const placeholder = $('#skin-viewer-empty');
  const hint = document.querySelector('.skin-drag-hint');

  if (show) {
    if (skinViewer) {
      stopSkinHurtLoop(skinViewer);
      try { skinViewer.dispose(); } catch {}
      skinViewer = null;
      if (canvas) canvas._skinBound = false;
    }
    canvas?.classList.add('hidden');
    placeholder?.classList.remove('hidden');
    hint?.classList.add('hidden');
    return;
  }

  placeholder?.classList.add('hidden');
  hint?.classList.remove('hidden');
}

function disposeTileViewers() {
  skinTileViewers.forEach((v) => { try { v.dispose(); } catch {} });
  skinTileViewers = [];
}

function enableSkinLayers(viewer) {
  const skin = viewer?.playerObject?.skin;
  if (!skin) return;
  if (skin.setOuterLayerVisible) skin.setOuterLayerVisible(true);
  if (skin.setInnerLayerVisible) skin.setInnerLayerVisible(true);
  for (const part of ['head', 'body', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg']) {
    if (skin[part]?.outerLayer) skin[part].outerLayer.visible = true;
    if (skin[part]?.innerLayer) skin[part].innerLayer.visible = true;
  }
}

/** Preview 3D nos cards — proporção correta (sem esticar) */
async function mountSkinCardViewer(canvas, skinDataUrl, gen) {
  try {
    await ensureSkinview3d();
    if (gen !== skinRefreshGen || currentPage !== 'skin' || !window.skinview3d || !skinDataUrl) return;

    const card = canvas.parentElement;
    // Espera o layout do card pra pegar o tamanho certo
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    if (gen !== skinRefreshGen || currentPage !== 'skin') return;

    const w = Math.max(120, Math.floor(card?.clientWidth || 148));
    const h = Math.max(150, Math.floor(card?.clientHeight || 190));

    const viewer = new skinview3d.SkinViewer({
      canvas,
      width: w,
      height: h,
    });

    viewer.fov = 45;
    viewer.zoom = 0.78;
    // Ângulo ¾ natural (launcher oficial)
    viewer.camera.position.set(-20, 14, 44);
    viewer.camera.lookAt(0, 11, 0);
    viewer.controls.enableRotate = false;
    viewer.controls.enableZoom = false;
    viewer.controls.enablePan = false;
    viewer.autoRotate = false;

    await viewer.loadSkin(skinDataUrl, { model: 'auto-detect', makeVisible: true });
    if (gen !== skinRefreshGen || currentPage !== 'skin') {
      try { viewer.dispose(); } catch {}
      return;
    }
    enableSkinLayers(viewer);

    try {
      viewer.animation = new skinview3d.IdleAnimation();
      viewer.animation.speed = 0.5;
    } catch {
      viewer.animation = null;
    }

    if (gen !== skinRefreshGen || currentPage !== 'skin') {
      try { viewer.dispose(); } catch {}
      return;
    }

    skinTileViewers.push(viewer);
  } catch (err) {
    console.warn('Thumb 3D:', err);
  }
}

function loadSkinCardThumb(canvas, skinPath, gen) {
  window.recreate.getSkinData(skinPath).then(async (skinDataUrl) => {
    if (gen !== skinRefreshGen || !skinDataUrl) return;
    await mountSkinCardViewer(canvas, skinDataUrl, gen);
  }).catch(() => {});
}

function scheduleRefreshSkinPage() {
  clearTimeout(skinRefreshTimer);
  skinRefreshTimer = setTimeout(() => {
    skinRefreshTimer = null;
    if (currentPage === 'skin') refreshSkinPage();
  }, 80);
}

function setSkinStatus(msg, type = '') {
  const el = $('#skin-status');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('skin-status-ok', 'skin-status-err');
  if (type) el.classList.add(`skin-status-${type}`);
}

function setSkinPageLoading(loading) {
  $('#page-skin')?.classList.toggle('skin-page-loading', loading);
}

async function renderSkinGrid(username, gen = skinRefreshGen) {
  const grid = $('#skin-grid');
  const empty = $('#skin-empty');
  grid.innerHTML = '';
  disposeTileViewers();

  const skins = await window.recreate.listSkins({ username, accountType });
  if (gen !== skinRefreshGen) return;

  const syncBtn = $('#btn-sync-skin');
  syncBtn?.classList.toggle('hidden', accountType !== 'premium' || !accountInfo.loggedIn);

  empty?.classList.add('hidden');
  grid.classList.remove('hidden');

  if (!skins.length) {
    empty?.classList.remove('hidden');
  }

  for (const skin of skins) {
    const card = document.createElement('div');
    card.className = 'skin-card';
    card.dataset.skinId = skin.id;
    if (skin.isActive) card.classList.add('active');

    const thumb = document.createElement('canvas');
    thumb.className = 'skin-card-thumb';
    card.appendChild(thumb);
    loadSkinCardThumb(thumb, skin.path, gen);

    const badge = document.createElement('span');
    badge.className = `skin-card-badge ${skin.type}`;
    badge.textContent = skin.type === 'official' ? 'Microsoft' : 'Custom';
    card.appendChild(badge);

    const name = document.createElement('span');
    name.className = 'skin-card-name';
    name.textContent = skin.name;
    card.appendChild(name);

    const check = document.createElement('div');
    check.className = 'skin-check';
    check.textContent = '✓';
    card.appendChild(check);

    const overlay = document.createElement('div');
    overlay.className = 'skin-card-overlay';

    const useBtn = document.createElement('button');
    useBtn.type = 'button';
    useBtn.className = 'skin-card-btn use';
    useBtn.textContent = 'Equipar';
    useBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await equipSkin(skin.id, card);
    });
    overlay.appendChild(useBtn);

    if (skin.canDelete) {
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'skin-card-btn delete';
      delBtn.textContent = 'Excluir';
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        confirmDeleteSkin(skin, card);
      });
      overlay.appendChild(delBtn);
    }

    card.appendChild(overlay);
    card.addEventListener('click', () => equipSkin(skin.id, card));
    grid.appendChild(card);
  }

  const addCard = document.createElement('div');
  addCard.className = 'skin-card skin-card-add';
  addCard.innerHTML = `
    <span class="add-icon">+</span>
    <span class="add-label">Importar</span>
    <span class="add-sublabel">PNG 64×64</span>
  `;
  addCard.addEventListener('click', importSkin);
  grid.appendChild(addCard);
}

async function equipSkin(skinId, cardEl) {
  try {
    const username = getUsername();
    if (!username) {
      setSkinStatus('Configure sua conta na aba Conta.', 'err');
      return;
    }
    await window.recreate.selectSkin({ skinId, username });
    $$('.skin-card').forEach((c) => c.classList.remove('active'));
    cardEl?.classList.add('active');
    const url = await getSkinUrl();
    if (url) {
      showSkinViewerEmpty(false);
      await initSkinViewer(url);
    } else {
      showSkinViewerEmpty(true);
    }
    updatePlayerChip();
    updatePremiumAvatar();
    setSkinStatus('Skin equipada!', 'ok');
  } catch (e) {
    setSkinStatus(e.message, 'err');
  }
}

function confirmDeleteSkin(skin, cardEl) {
  const existing = cardEl.querySelector('.skin-card-confirm');
  if (existing) {
    existing.remove();
    return;
  }

  const confirm = document.createElement('div');
  confirm.className = 'skin-card-confirm';
  confirm.innerHTML = `
    <p>Excluir esta skin?</p>
    <div class="skin-card-confirm-actions">
      <button type="button" class="skin-card-btn delete">Sim</button>
      <button type="button" class="skin-card-btn cancel">Não</button>
    </div>
  `;

  confirm.querySelector('.delete').addEventListener('click', async (e) => {
    e.stopPropagation();
    await deleteSkinById(skin.id);
  });
  confirm.querySelector('.cancel').addEventListener('click', (e) => {
    e.stopPropagation();
    confirm.remove();
  });

  cardEl.appendChild(confirm);
}

async function deleteSkinById(skinId) {
  const username = getUsername();
  if (!username) return;

  const r = await window.recreate.deleteSkin({ skinId, username, accountType });
  if (!r.success) {
    setSkinStatus(r.error || 'Erro ao excluir.', 'err');
    return;
  }
  setSkinStatus('Skin excluída.', 'ok');
  await refreshSkinPage();
}

function setupSkinDropZone() {
  const zone = $('#skin-drop-zone');
  if (!zone || zone._dropBound) return;
  zone._dropBound = true;

  const highlight = (on) => zone.classList.toggle('skin-drop-active', on);

  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    highlight(true);
  });
  zone.addEventListener('dragleave', (e) => {
    if (!zone.contains(e.relatedTarget)) highlight(false);
  });
  zone.addEventListener('drop', async (e) => {
    e.preventDefault();
    highlight(false);
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.png')) {
      setSkinStatus('Use um arquivo .png (skin Minecraft).', 'err');
      return;
    }
    await importSkinFromFile(file.path);
  });
}

async function importSkinFromFile(filePath) {
  const username = getUsername();
  if (!username) {
    setSkinStatus('Configure sua conta na aba Conta.', 'err');
    navigateTo('account', $('[data-page="account"]'));
    return;
  }
  const r = filePath
    ? await window.recreate.importSkinPath({ filePath, username })
    : await window.recreate.importSkin(username);

  if (r?.canceled) return;
  if (!r?.success) {
    setSkinStatus(r?.error || 'Falha ao importar.', 'err');
    return;
  }
  setSkinStatus('Skin importada e equipada!', 'ok');
  await refreshSkinPage();
}

async function refreshSkinPage() {
  if (currentPage !== 'skin') return;

  const gen = ++skinRefreshGen;
  setSkinPageLoading(true);

  try {
    const username = getUsername();
    TextRupture.syncText($('#skin-username'), username || '—');

    if (!username) {
      setSkinStatus('Entre na aba Conta para gerenciar skins.', 'err');
      showSkinViewerEmpty(true);
      if (gen !== skinRefreshGen || currentPage !== 'skin') return;
      await renderSkinGrid(username, gen);
      return;
    }

    if (gen !== skinRefreshGen || currentPage !== 'skin') return;
    await renderSkinGrid(username, gen);
    if (gen !== skinRefreshGen || currentPage !== 'skin') return;

    setSkinPageLoading(false);

    const preview = await getSkinUrl({ sync: false });
    if (gen !== skinRefreshGen || currentPage !== 'skin') return;

    if (!preview) {
      const hint = accountType === 'premium' && accountInfo.loggedIn
        ? 'Nenhuma skin local — importe ou clique em Sincronizar.'
        : 'Nenhuma skin local — importe um PNG ou troque o nickname na aba Conta.';
      setSkinStatus(hint, '');
      showSkinViewerEmpty(true);
      return;
    }

    setSkinStatus('Importe um PNG 64×64 ou 64×32 · Clique para equipar', '');
    showSkinViewerEmpty(false);
    await initSkinViewer(preview, gen);
  } finally {
    if (gen === skinRefreshGen) setSkinPageLoading(false);
  }
}

async function importSkin() {
  await importSkinFromFile(null);
}

async function syncOfficialSkin() {
  if (accountType !== 'premium' || !accountInfo.loggedIn) return;
  setSkinStatus('Sincronizando skin da conta...', '');
  const r = await window.recreate.syncPremiumSkin();
  if (!r.success) {
    setSkinStatus(r.error || 'Falha ao sincronizar.', 'err');
    return;
  }
  setSkinStatus('Skin da Microsoft atualizada!', 'ok');
  await refreshSkinPage();
  updatePlayerChip();
  updatePremiumAvatar();
}

$('#btn-import-skin').addEventListener('click', importSkin);
$('#btn-add-skin')?.addEventListener('click', importSkin);
$('#btn-sync-skin')?.addEventListener('click', syncOfficialSkin);
setupSkinDropZone();

// ─── Friends + requests + groups (local) ───
let chatTarget = null; // { type: 'dm'|'group', id, name, subtitle }
let friendsCache = { friends: [], incoming: [], outgoing: [], groups: [], badges: {} };
let friendsTab = 'friends';
let chatPollTimer = null;
let chatLastFingerprint = '';
let myPresence = { status: 'available', display: 'available', label: 'Disponível', inGame: false };

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatChatTime(ts) {
  try {
    return new Date(ts).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function previewText(text, max = 48) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function formatBadgeCount(n) {
  const num = Number(n) || 0;
  if (num <= 0) return '';
  return num > 99 ? '99+' : String(num);
}

function setBadgeEl(el, count) {
  if (!el) return;
  const label = formatBadgeCount(count);
  if (!label) {
    el.classList.add('hidden');
    el.textContent = '0';
    return;
  }
  el.textContent = label;
  el.classList.remove('hidden');
}

function requireFriendsMe() {
  const me = getUsername();
  if (!me) {
    alert('Defina um nickname na aba Conta (ou entre com Microsoft) para usar Amigos.');
    navigateTo('account', $('[data-page="account"]'));
    return null;
  }
  return me;
}

function setListEmpty(el, html) {
  if (!el) return;
  el.innerHTML = `<div class="empty-state">${html}</div>`;
}

function setFriendsTab(tab) {
  friendsTab = tab;
  $$('.friends-tab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.friendsTab === tab);
  });
  $$('[data-friends-panel]').forEach((panel) => {
    panel.classList.toggle('hidden', panel.dataset.friendsPanel !== tab);
  });
  ['friends', 'requests', 'groups'].forEach((name) => {
    $(`#friends-toolbar-${name}`)?.classList.toggle('hidden', name !== tab);
  });
  if (currentPage === 'friends') refreshFriends().catch(() => {});
}

function updateFriendsBadges(data) {
  const badges = data?.badges || { requests: 0, messages: 0, total: 0 };
  const dmUnread = (data?.friends || []).reduce((s, f) => s + (f.unread || 0), 0);
  const groupUnread = (data?.groups || []).reduce((s, g) => s + (g.unread || 0), 0);

  setBadgeEl($('#nav-friends-badge'), badges.total);
  setBadgeEl($('#badge-requests'), badges.requests);
  setBadgeEl($('#badge-friends-msg'), dmUnread);
  setBadgeEl($('#badge-groups-msg'), groupUnread);
}

function avatarBadgeHtml(count) {
  const label = formatBadgeCount(count);
  if (!label) return '';
  return `<span class="avatar-badge notif-badge">${label}</span>`;
}

function renderFriendsAlerts(data) {
  const box = $('#friends-alerts');
  if (!box) return;
  box.innerHTML = '';

  const alerts = [];

  for (const r of data?.incoming || []) {
    alerts.push({
      kind: 'request',
      count: 1,
      from: r.from,
      titleHtml: `Pedido de <strong>${escapeHtml(r.from)}</strong>`,
      sub: 'Quer ser seu amigo',
      avatar: `https://mc-heads.net/avatar/${encodeURIComponent(r.from)}/40`,
      onClick: () => {
        setFriendsTab('requests');
      },
    });
  }

  for (const f of data?.friends || []) {
    if (!f.unread) continue;
    const from = f.lastMessage?.from || f.name;
    alerts.push({
      kind: 'dm',
      count: f.unread,
      from,
      titleHtml: `Nova mensagem de <strong>${escapeHtml(from)}</strong>`,
      sub: f.lastMessage?.text ? previewText(f.lastMessage.text, 60) : `${f.unread} não lida(s)`,
      avatar: `https://mc-heads.net/avatar/${encodeURIComponent(f.name)}/40`,
      onClick: () => {
        setFriendsTab('friends');
        openChat({
          type: 'dm',
          id: f.name,
          name: f.name,
          subtitle: `${f.presence?.label || 'Offline'} · mensagens neste PC`,
          avatar: `https://mc-heads.net/avatar/${encodeURIComponent(f.name)}/40`,
        });
      },
    });
  }

  for (const g of data?.groups || []) {
    if (!g.unread) continue;
    const from = g.lastMessage?.from || g.name;
    alerts.push({
      kind: 'group',
      count: g.unread,
      from,
      titleHtml: `No grupo <strong>${escapeHtml(g.name)}</strong>`,
      sub: g.lastMessage
        ? `${g.lastMessage.from}: ${previewText(g.lastMessage.text, 48)}`
        : `${g.unread} não lida(s)`,
      avatar: null,
      onClick: () => {
        setFriendsTab('groups');
        openChat({
          type: 'group',
          id: g.id,
          name: g.name,
          subtitle: `${(g.members || []).length} membros · mensagens neste PC`,
          members: g.members,
        });
      },
    });
  }

  for (const a of alerts.slice(0, 4)) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'friends-alert';
    const countLabel = formatBadgeCount(a.count) || '1';
    btn.innerHTML = `
      <span class="friends-alert-badge">${countLabel}</span>
      ${a.avatar ? `<img class="friends-alert-avatar" src="${a.avatar}" alt="">` : ''}
      <span class="friends-alert-body">
        <span class="friends-alert-title">${a.titleHtml}</span>
        <span class="friends-alert-sub">${escapeHtml(a.sub)}</span>
      </span>
    `;
    btn.addEventListener('click', a.onClick);
    box.appendChild(btn);
  }
}

async function refreshFriendsBadgesOnly() {
  const me = getUsername();
  if (!me) {
    updateFriendsBadges({ badges: { requests: 0, messages: 0, total: 0 }, friends: [], groups: [] });
    const alerts = $('#friends-alerts');
    if (alerts) alerts.innerHTML = '';
    return;
  }
  // Na página Amigos, redesenha a lista — senão o badge muda e a lista fica vazia
  if (currentPage === 'friends') {
    await refreshFriends();
    return;
  }
  const data = await window.recreate.getFriendsStatus(me);
  friendsCache = data;
  updateFriendsBadges(data);
}

async function refreshFriends() {
  const me = getUsername();

  const data = me
    ? await window.recreate.getFriendsStatus(me)
    : { friends: [], incoming: [], outgoing: [], groups: [], badges: { requests: 0, messages: 0, total: 0 }, cloud: { configured: false } };
  friendsCache = data;
  updateFriendsBadges(data);
  renderFriendsAlerts(data);
  if (data.presence) applyPresenceToChip(data.presence);

  const hint = $('#friends-hint');
  if (hint) {
    hint.textContent = me
      ? (data?.cloud?.configured
        ? `Você está como ${me} · sync online (Firebase)`
        : `Você está como ${me} · configure o Firebase pra sync entre PCs`)
      : 'Entre na Conta para enviar pedidos e criar grupos.';
  }

  const reqList = $('#requests-list');
  if (!data.incoming?.length) {
    setListEmpty(reqList, 'Nenhuma solicitação recebida.');
  } else {
    reqList.innerHTML = '';
    for (const r of data.incoming) {
      const card = document.createElement('div');
      card.className = 'friend-card has-unread';
      card.innerHTML = `
        <div class="friend-avatar-wrap">
          <img class="friend-avatar" src="https://mc-heads.net/avatar/${encodeURIComponent(r.from)}/40" alt="">
          <span class="avatar-badge">1</span>
        </div>
        <div class="friend-info">
          <div class="friend-name">${escapeHtml(r.from)}</div>
          <div class="friend-status offline">Pedido de amizade de ${escapeHtml(r.from)}</div>
        </div>
        <div class="friend-actions">
          <button class="friend-accept-btn" type="button">Aceitar</button>
          <button class="friend-decline-btn" type="button">Recusar</button>
        </div>
      `;
      card.querySelector('.friend-accept-btn').addEventListener('click', async () => {
        const self = requireFriendsMe();
        if (!self) return;
        const res = await window.recreate.acceptFriendRequest(self, r.from);
        if (!res.success) alert(res.error);
        refreshFriends();
      });
      card.querySelector('.friend-decline-btn').addEventListener('click', async () => {
        const self = requireFriendsMe();
        if (!self) return;
        const res = await window.recreate.declineFriendRequest(self, r.from);
        if (!res.success) alert(res.error);
        refreshFriends();
      });
      reqList.appendChild(card);
    }
  }

  const outList = $('#outgoing-list');
  if (!data.outgoing?.length) {
    setListEmpty(outList, 'Nenhum pedido enviado.');
  } else {
    outList.innerHTML = '';
    for (const r of data.outgoing) {
      const card = document.createElement('div');
      card.className = 'friend-card';
      card.innerHTML = `
        <div class="friend-avatar-wrap">
          <img class="friend-avatar" src="https://mc-heads.net/avatar/${encodeURIComponent(r.to)}/40" alt="">
        </div>
        <div class="friend-info">
          <div class="friend-name">${escapeHtml(r.to)}</div>
          <div class="friend-status offline">Aguardando aceite</div>
        </div>
        <div class="friend-actions">
          <button class="friend-decline-btn" type="button">Cancelar</button>
        </div>
      `;
      card.querySelector('.friend-decline-btn').addEventListener('click', async () => {
        const self = requireFriendsMe();
        if (!self) return;
        const res = await window.recreate.cancelFriendRequest(self, r.to);
        if (!res.success) alert(res.error);
        refreshFriends();
      });
      outList.appendChild(card);
    }
  }

  const list = $('#friends-list');
  if (!data.friends?.length) {
    setListEmpty(list, 'Nenhum amigo ainda.<br>Envie um pedido pelo nickname acima.');
  } else {
    list.innerHTML = '';
    for (const f of data.friends) {
      const card = document.createElement('div');
      card.className = `friend-card${f.unread ? ' has-unread' : ''}`;
      const lastHtml = f.lastMessage
        ? `<div class="friend-last-msg${f.unread ? ' unread' : ''}">${
            f.unread
              ? `Nova mensagem de ${escapeHtml(f.lastMessage.from || f.name)}: ${escapeHtml(previewText(f.lastMessage.text, 40))}`
              : escapeHtml(previewText(f.lastMessage.text))
          }</div>`
        : '';
      card.innerHTML = `
        <div class="friend-avatar-wrap">
          <img class="friend-avatar" src="https://mc-heads.net/avatar/${encodeURIComponent(f.name)}/40" alt="">
          ${avatarBadgeHtml(f.unread)}
        </div>
        <div class="friend-info">
          <div class="friend-name">${escapeHtml(f.name)}</div>
          <div class="friend-status presence-${escapeHtml(f.presence?.display || 'offline')}">
            <span class="status-dot presence-${escapeHtml(f.presence?.display || 'offline')}"></span>
            ${escapeHtml(f.presence?.label || (f.onServer ? 'Online no servidor' : 'Offline'))}
            ${f.onServer && f.presence?.display !== 'ingame' ? ' · no servidor' : ''}
          </div>
          ${lastHtml}
        </div>
        <div class="friend-actions">
          <button class="friend-chat-btn" type="button">Conversar</button>
          <button class="friend-remove" type="button">Remover</button>
        </div>
      `;
      card.querySelector('.friend-chat-btn').addEventListener('click', () => {
        openChat({
          type: 'dm',
          id: f.name,
          name: f.name,
          subtitle: `${f.presence?.label || 'Offline'} · mensagens neste PC`,
          avatar: `https://mc-heads.net/avatar/${encodeURIComponent(f.name)}/40`,
        });
      });
      card.querySelector('.friend-remove').addEventListener('click', async () => {
        const self = requireFriendsMe();
        if (!self) return;
        if (chatTarget?.type === 'dm' && chatTarget.id === f.name) closeChat();
        await window.recreate.removeFriend(self, f.name);
        refreshFriends();
      });
      list.appendChild(card);
    }
  }

  const groupsList = $('#groups-list');
  if (!data.groups?.length) {
    setListEmpty(groupsList, 'Nenhum grupo.<br>Crie um com pelo menos 2 amigos (3 pessoas no total).');
  } else {
    groupsList.innerHTML = '';
    for (const g of data.groups) {
      const card = document.createElement('div');
      card.className = `friend-card${g.unread ? ' has-unread' : ''}`;
      const membersLabel = (g.members || []).join(', ');
      const lastHtml = g.lastMessage
        ? `<div class="friend-last-msg${g.unread ? ' unread' : ''}">${escapeHtml(previewText(`${g.lastMessage.from}: ${g.lastMessage.text}`))}</div>`
        : '';
      card.innerHTML = `
        <div class="friend-avatar-wrap">
          <div class="friend-avatar group">${(g.members || []).length}</div>
          ${avatarBadgeHtml(g.unread)}
        </div>
        <div class="friend-info">
          <div class="friend-name">${escapeHtml(g.name)}</div>
          <div class="friend-status offline">${escapeHtml(membersLabel)}</div>
          ${lastHtml}
        </div>
        <div class="friend-actions">
          <button class="friend-chat-btn" type="button">Abrir</button>
          <button class="friend-remove" type="button">Sair</button>
        </div>
      `;
      card.querySelector('.friend-chat-btn').addEventListener('click', () => {
        openChat({
          type: 'group',
          id: g.id,
          name: g.name,
          subtitle: `${(g.members || []).length} membros · mensagens neste PC`,
          avatar: '',
          members: g.members,
        });
      });
      card.querySelector('.friend-remove').addEventListener('click', async () => {
        const self = requireFriendsMe();
        if (!self) return;
        if (chatTarget?.type === 'group' && chatTarget.id === g.id) closeChat();
        const res = await window.recreate.leaveFriendGroup(self, g.id);
        if (!res.success) alert(res.error);
        refreshFriends();
      });
      groupsList.appendChild(card);
    }
  }
}

function setChatOverlayOpen(open) {
  const el = $('#chat-overlay');
  if (!el) return;
  el.classList.toggle('hidden', !open);
  el.setAttribute('aria-hidden', open ? 'false' : 'true');
}

function setConfirmClearOpen(open) {
  const el = $('#confirm-clear-overlay');
  if (!el) return;
  el.classList.toggle('hidden', !open);
  el.setAttribute('aria-hidden', open ? 'false' : 'true');
}

function setCreateGroupOpen(open) {
  const el = $('#create-group-overlay');
  if (!el) return;
  el.classList.toggle('hidden', !open);
  el.setAttribute('aria-hidden', open ? 'false' : 'true');
}

async function openChat(target) {
  chatTarget = target;
  chatLastFingerprint = '';
  $('#chat-friend-name').textContent = target.name;
  $('#chat-friend-sub').textContent = target.subtitle || 'Mensagens neste PC';
  const av = $('#chat-peer-avatar');
  if (av) {
    if (target.type === 'group') {
      av.removeAttribute('src');
      av.alt = '';
      av.style.display = 'none';
    } else {
      av.style.display = '';
      av.src = target.avatar || `https://mc-heads.net/avatar/${encodeURIComponent(target.id)}/40`;
    }
  }
  setChatOverlayOpen(true);
  $('#chat-input')?.focus();
  await renderChatMessages({ force: true });
  startChatPolling();
  refreshFriendsBadgesOnly();
}

function closeChat() {
  stopChatPolling();
  chatTarget = null;
  chatLastFingerprint = '';
  setChatOverlayOpen(false);
  setConfirmClearOpen(false);
}

function startChatPolling() {
  stopChatPolling();
  chatPollTimer = setInterval(() => {
    if (!chatTarget) return;
    renderChatMessages({ silent: true }).catch(() => {});
  }, 1200);
}

function stopChatPolling() {
  if (chatPollTimer) {
    clearInterval(chatPollTimer);
    chatPollTimer = null;
  }
}

function messagesFingerprint(messages) {
  if (!messages?.length) return '0';
  const last = messages[messages.length - 1];
  return `${messages.length}:${last.id || ''}:${last.at || ''}`;
}

async function renderChatMessages({ force = false, silent = false } = {}) {
  const box = $('#chat-messages');
  if (!box || !chatTarget) return;

  const me = getUsername();
  if (!me) return;

  const r = chatTarget.type === 'group'
    ? await window.recreate.getGroupMessages(me, chatTarget.id)
    : await window.recreate.getFriendMessages(me, chatTarget.id);
  const messages = r.success ? r.messages : [];
  const fp = messagesFingerprint(messages);
  if (!force && silent && fp === chatLastFingerprint) return;
  chatLastFingerprint = fp;

  const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;

  if (!messages.length) {
    box.innerHTML = '<div class="chat-empty">Nenhuma mensagem ainda.<br>Escreva abaixo — o histórico fica só neste computador.</div>';
    return;
  }

  box.innerHTML = '';
  for (const m of messages) {
    const mine = me && m.from.toLowerCase() === me.toLowerCase();
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${mine ? 'mine' : 'theirs'}`;
    bubble.innerHTML = `
      <div class="chat-bubble-text">${escapeHtml(m.text)}</div>
      <div class="chat-bubble-meta">
        <span>${escapeHtml(m.from)}</span>
        <span>${formatChatTime(m.at)}</span>
      </div>
    `;
    box.appendChild(bubble);
  }
  if (force || nearBottom || !silent) {
    box.scrollTop = box.scrollHeight;
  }
}

async function sendChatMessage(e) {
  e?.preventDefault?.();
  if (!chatTarget) return;
  const input = $('#chat-input');
  const text = input?.value.trim() || '';
  if (!text) return;

  const me = requireFriendsMe();
  if (!me) return;

  const r = chatTarget.type === 'group'
    ? await window.recreate.sendGroupMessage(me, chatTarget.id, text)
    : await window.recreate.sendFriendMessage(me, chatTarget.id, text);
  if (!r.success) {
    alert(r.error || 'Falha ao enviar');
    return;
  }
  input.value = '';
  await renderChatMessages({ force: true });
  refreshFriends();
}

async function askClearHistory() {
  if (!chatTarget) return;
  const me = requireFriendsMe();
  if (!me) return;
  const info = chatTarget.type === 'group'
    ? await window.recreate.getGroupHistoryInfo(me, chatTarget.id)
    : await window.recreate.getFriendHistoryInfo(me, chatTarget.id);
  const size = info.success ? info.label : '0 B';
  const count = info.success ? info.count : 0;
  const label = chatTarget.type === 'group' ? `o grupo ${chatTarget.name}` : chatTarget.name;
  $('#confirm-clear-body').textContent =
    `Todas as mensagens de ${label} serão apagadas só neste PC `
    + `(${count} mensagem${count === 1 ? '' : 'ens'}, cerca de ${size}). `
    + 'Não dá para desfazer.';
  setConfirmClearOpen(true);
}

async function confirmClearHistory() {
  if (!chatTarget) return;
  const me = requireFriendsMe();
  if (!me) return;
  const r = chatTarget.type === 'group'
    ? await window.recreate.clearGroupHistory(me, chatTarget.id)
    : await window.recreate.clearFriendHistory(me, chatTarget.id);
  setConfirmClearOpen(false);
  if (!r.success) {
    alert(r.error || 'Falha ao limpar');
    return;
  }
  await renderChatMessages({ force: true });
  refreshFriends();
}

function openCreateGroupModal() {
  const me = requireFriendsMe();
  if (!me) return;
  const friends = friendsCache.friends || [];
  if (friends.length < 2) {
    alert('Você precisa de pelo menos 2 amigos aceitos para criar um grupo de 3.');
    return;
  }
  const pick = $('#group-pick-list');
  pick.innerHTML = '';
  for (const f of friends) {
    const row = document.createElement('label');
    row.className = 'group-pick-item';
    row.innerHTML = `
      <input type="checkbox" value="${escapeHtml(f.name)}">
      <img class="friend-avatar" src="https://mc-heads.net/avatar/${encodeURIComponent(f.name)}/40" alt="" style="width:28px;height:28px">
      <span>${escapeHtml(f.name)}</span>
    `;
    pick.appendChild(row);
  }
  const nameInput = $('#group-name-input');
  if (nameInput) nameInput.value = '';
  setCreateGroupOpen(true);
}

async function confirmCreateGroup() {
  const me = requireFriendsMe();
  if (!me) return;
  const members = [...document.querySelectorAll('#group-pick-list input:checked')].map((el) => el.value);
  const name = $('#group-name-input')?.value.trim() || '';
  const r = await window.recreate.createFriendGroup(me, { name, members });
  if (!r.success) {
    alert(r.error || 'Falha ao criar grupo');
    return;
  }
  setCreateGroupOpen(false);
  setFriendsTab('groups');
  refreshFriends();
  if (r.group) {
    openChat({
      type: 'group',
      id: r.group.id,
      name: r.group.name,
      subtitle: `${r.group.members.length} membros · mensagens neste PC`,
    });
  }
}

async function sendFriendRequestFromInput(inputEl) {
  const me = requireFriendsMe();
  if (!me) return;
  const name = inputEl?.value.trim() || '';
  if (!name) return;
  const r = await window.recreate.sendFriendRequest(me, name);
  if (r.success) {
    inputEl.value = '';
    if (r.autoAccepted) alert(`${name} também tinha pedido você — agora são amigos!`);
    setFriendsTab('requests');
    refreshFriends();
  } else alert(r.error);
}

$$('.friends-tab').forEach((btn) => {
  btn.addEventListener('click', () => setFriendsTab(btn.dataset.friendsTab));
});

$('#btn-add-friend')?.addEventListener('click', () => sendFriendRequestFromInput($('#friend-input')));
$('#friend-input')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendFriendRequestFromInput($('#friend-input'));
});
$('#btn-add-friend-req')?.addEventListener('click', () => sendFriendRequestFromInput($('#friend-input-req')));
$('#friend-input-req')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendFriendRequestFromInput($('#friend-input-req'));
});

$('#btn-create-group')?.addEventListener('click', openCreateGroupModal);
$('#btn-create-group-cancel')?.addEventListener('click', () => setCreateGroupOpen(false));
$('#btn-create-group-ok')?.addEventListener('click', confirmCreateGroup);
$('#create-group-overlay')?.addEventListener('click', (e) => {
  if (e.target === $('#create-group-overlay')) setCreateGroupOpen(false);
});

$('#btn-close-chat')?.addEventListener('click', closeChat);
$('#chat-overlay')?.addEventListener('click', (e) => {
  if (e.target === $('#chat-overlay')) closeChat();
});
$('#chat-compose')?.addEventListener('submit', sendChatMessage);
$('#btn-clear-chat')?.addEventListener('click', askClearHistory);
$('#btn-confirm-clear-cancel')?.addEventListener('click', () => setConfirmClearOpen(false));
$('#btn-confirm-clear-ok')?.addEventListener('click', confirmClearHistory);
$('#confirm-clear-overlay')?.addEventListener('click', (e) => {
  if (e.target === $('#confirm-clear-overlay')) setConfirmClearOpen(false);
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!$('#create-group-overlay')?.classList.contains('hidden')) {
    setCreateGroupOpen(false);
    return;
  }
  if (!$('#confirm-clear-overlay')?.classList.contains('hidden')) {
    setConfirmClearOpen(false);
    return;
  }
  if (!$('#chat-overlay')?.classList.contains('hidden')) closeChat();
});

setFriendsTab('friends');
setInterval(() => { refreshFriendsBadgesOnly().catch(() => {}); }, 12000);

// ─── Server Status ───
let launcherStatusInfo = {
  status: 'online',
  tone: 'online',
  label: 'Servidor',
  message: '',
  allowPlay: true,
};

function applyLauncherStatus(info) {
  if (!info) return;
  launcherStatusInfo = info;

  const banner = $('#play-status-banner');
  if (banner) {
    banner.textContent = info.message || info.label || '';
    banner.classList.remove('hidden', 'tone-online', 'tone-dev', 'tone-warn', 'tone-offline', 'tone-demo');
    if (info.message || info.label) {
      banner.classList.add(`tone-${info.tone || 'online'}`);
    } else {
      banner.classList.add('hidden');
    }
  }

  const playBadge = $('#play-server-badge');
  if (playBadge) {
    const badgeDot = playBadge.querySelector('.status-dot');
    const onlineish = info.status === 'online';
    const warnish = info.status === 'development' || info.status === 'maintenance' || info.status === 'demo';
    if (badgeDot) {
      badgeDot.className = `status-dot ${onlineish ? 'online' : warnish ? 'warn' : 'offline'}`;
    }
    const badgeLabel = $('#play-badge-label');
    if (badgeLabel) TextRupture.syncText(badgeLabel, info.label || 'Servidor');
  }

  const statServer = $('#play-stat-server');
  if (statServer) statServer.textContent = info.label || '—';
}

async function refreshServerStatus() {
  const [status, launcherStatus] = await Promise.all([
    window.recreate.getServerStatus(),
    window.recreate.getLauncherStatus().catch(() => null),
  ]);

  if (launcherStatus) applyLauncherStatus(launcherStatus);

  const el = $('#server-status');
  const dot = el?.querySelector('.status-dot');
  const label = el?.querySelector('.status-label');

  // Sidebar: ping real; badge principal prioriza launcher.txt
  if (dot) dot.className = `status-dot ${status.online ? 'online' : 'offline'}`;
  if (label) {
    const labelText = status.online
      ? `Online · ${status.playersOnline} jogadores`
      : 'Offline';
    TextRupture.syncText(label, labelText);
  }

  // Se o status remoto for online, completa com players do ping
  if (launcherStatusInfo.status === 'online' && status.online) {
    const playBadge = $('#play-server-badge');
    if (playBadge) {
      const badgeDot = playBadge.querySelector('.status-dot');
      if (badgeDot) badgeDot.className = 'status-dot online';
      const badgeLabel = $('#play-badge-label');
      const badgeText = `Online · ${status.playersOnline}/${status.playersMax || '?'}`;
      TextRupture.syncText(badgeLabel, badgeText);
    }
    const statServer = $('#play-stat-server');
    if (statServer) {
      statServer.textContent = `${status.playersOnline}/${status.playersMax || '?'} online`;
    }
  }
}

// ─── Level ───
function applyLevelInfo(info) {
  if (!info) return;
  $('#level-badge').textContent = info.level;
  TextRupture.syncText($('#level-num'), String(info.level));
  $('#level-fill').style.width = `${info.progress}%`;
  TextRupture.syncText($('#level-xp'), `${info.currentXp} / ${info.nextXp} min`);

  const playtimeEl = $('#level-playtime');
  if (playtimeEl) {
    TextRupture.syncText(playtimeEl, info.playTimeLabel);
    playtimeEl.classList.toggle('never-played', !!info.neverPlayed);
  }

  const metaTime = $('#play-meta-time');
  if (metaTime) metaTime.textContent = info.playTimeLabel;
}

async function refreshLevel() {
  const info = await window.recreate.getLevelInfo();
  applyLevelInfo(info);
}

// ─── Player Chip + presence ───
function applyPresenceToChip(presence) {
  myPresence = presence || myPresence;
  const dot = $('#chip-status-dot');
  const label = $('#chip-status-label');
  const display = myPresence.display || 'offline';
  if (dot) {
    dot.className = `chip-status-dot ${display}`;
  }
  if (label) {
    label.textContent = hasLinkedAccount()
      ? (myPresence.label || 'Disponível')
      : 'Offline';
  }
  $$('.status-menu-item').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.status === (myPresence.status || 'available'));
  });
}

function setStatusMenuOpen(open) {
  const menu = $('#status-menu');
  if (!menu) return;
  menu.classList.toggle('hidden', !open);
}

async function syncMyPresenceHeartbeat() {
  const me = getUsername();
  if (!me || !hasLinkedAccount()) {
    applyPresenceToChip({ status: 'available', display: 'offline', label: 'Offline', inGame: false });
    return;
  }
  try {
    const r = await window.recreate.heartbeatPresence(me, { inGame: !!gameIsOpen });
    if (r.success) applyPresenceToChip(r.presence);
  } catch {}
}

async function choosePresenceStatus(status) {
  const me = requireFriendsMe();
  if (!me) return;
  const r = await window.recreate.setPresence(me, status, { inGame: !!gameIsOpen });
  if (!r.success) {
    alert(r.error || 'Falha ao mudar status');
    return;
  }
  applyPresenceToChip(r.presence);
  setStatusMenuOpen(false);
}

async function updatePlayerChip() {
  const linked = hasLinkedAccount();
  const username = linked ? getUsername() : '';
  const chipImg = $('#chip-avatar');
  const chipLetter = $('#chip-avatar-letter');
  const playAvatar = $('#play-player-avatar');
  const playLetter = $('#play-player-letter');

  TextRupture.syncText($('#chip-name'), linked ? (username || 'Jogador') : 'Viajante');
  updatePlayMeta();

  const applyHead = (img, letter, headUrl, fallbackLetter) => {
    if (!img) return;
    img.onload = () => {
      img.classList.remove('hidden');
      img.classList.add('visible');
      letter?.classList.add('hidden');
    };
    img.onerror = () => {
      img.classList.add('hidden');
      img.classList.remove('visible');
      if (letter) {
        letter.textContent = fallbackLetter;
        letter.classList.remove('hidden');
      }
    };
    img.src = headUrl;
  };

  if (!linked) {
    applyHead(chipImg, chipLetter, VIAJANTE_HEAD, 'V');
    applyHead(playAvatar, playLetter, VIAJANTE_HEAD, 'V');
    applyPresenceToChip({ status: 'available', display: 'offline', label: 'Offline', inGame: false });
    return;
  }

  syncMyPresenceHeartbeat();

  const gen = ++playerChipGen;
  const skinUrl = await window.recreate.getSkinPreview({
    username,
    uuid: accountInfo.uuid || null,
    accountType,
    sync: false,
  });
  if (gen !== playerChipGen) return;

  let headUrl = null;
  if (skinUrl) headUrl = await skinUrlToHeadDataUrl(skinUrl);
  if (gen !== playerChipGen) return;

  if (!headUrl) {
    headUrl = `https://mc-heads.net/avatar/${encodeURIComponent(username)}/64`;
  }

  applyHead(chipImg, chipLetter, headUrl, username[0].toUpperCase());
  applyHead(playAvatar, playLetter, headUrl, username[0].toUpperCase());
}

$('#player-chip')?.addEventListener('click', (e) => {
  e.stopPropagation();
  if (!hasLinkedAccount()) {
    navigateTo('account', $('[data-page="account"]'));
    return;
  }
  const menu = $('#status-menu');
  setStatusMenuOpen(!!menu?.classList.contains('hidden'));
});

$$('.status-menu-item').forEach((btn) => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    choosePresenceStatus(btn.dataset.status);
  });
});

document.addEventListener('click', (e) => {
  const menu = $('#status-menu');
  if (!menu || menu.classList.contains('hidden')) return;
  if (e.target.closest('#status-menu') || e.target.closest('.player-chip-wrap')) return;
  setStatusMenuOpen(false);
});

setInterval(() => { syncMyPresenceHeartbeat().catch(() => {}); }, 20000);

// ─── Changelog (GitHub log.txt) ───
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function refreshChangelog() {
  const list = $('#play-news-list');
  const versionPill = $('#play-changelog-version');
  if (!list) return;

  try {
    const data = await window.recreate.getChangelog();
    applyChangelog(data);
  } catch (err) {
    list.innerHTML = `
      <li class="play-changelog-loading">
        <div>
          <strong>Falha ao carregar</strong>
          <p>${escapeHtml(err.message || 'Erro desconhecido')}</p>
        </div>
      </li>`;
  }
}

function applyChangelog(data) {
  const list = $('#play-news-list');
  const versionPill = $('#play-changelog-version');
  if (!list || !data) return;

  const latest = data.latest || 'v0.3.10';
  if (versionPill) versionPill.textContent = latest;

  if (!data.entries?.length) {
    list.innerHTML = `
      <li class="play-changelog-loading">
        <div>
          <strong>Sem atualizações</strong>
          <p>${escapeHtml(data.error || 'Não foi possível carregar o log.')}</p>
        </div>
      </li>`;
    return;
  }

  list.innerHTML = data.entries.map((entry, index) => {
    const items = (entry.items || [])
      .map((item) => `<p class="play-changelog-item">• ${escapeHtml(item)}</p>`)
      .join('');
    const title = index === 0 ? `${escapeHtml(entry.version)} · atual` : escapeHtml(entry.version);
    return `
      <li>
        <span class="play-changelog-ver">${escapeHtml(entry.version)}</span>
        <div>
          <strong>${title}</strong>
          ${items || '<p class="play-changelog-item">Sem detalhes.</p>'}
        </div>
      </li>`;
  }).join('');
}

// ─── Conexa (Discord + Twitter) ───
let conexaPendingImage = null;
let conexaIsAdmin = false;
let conexaViewNick = null;
let conexaTab = 'global'; // global | me | profile
let conexaPeople = [];
let conexaMode = 'feed'; // feed | community
let conexaCommunityId = null;
let conexaChannelId = null;
let conexaCommunityView = null;
let conexaCommMsgTimer = null;
let conexaFeedGen = 0;
let conexaFeedFingerprint = '';
let conexaPeopleFingerprint = '';
const conexaCache = new Map(); // nickLower -> { profileRes, feed, at }
const conexaAvatarWarm = new Set();
let conexaProfileGlitchTimer = null;

function applyConexaBanner(el, bannerUrl) {
  if (!el) return;
  if (bannerUrl) {
    el.style.backgroundImage = `linear-gradient(180deg, rgba(0,0,0,0.15), rgba(0,0,0,0.35)), url("${bannerUrl}")`;
    el.classList.add('has-custom-banner');
  } else {
    el.style.backgroundImage = '';
    el.classList.remove('has-custom-banner');
  }
}

function conexaPostsFingerprint(posts = []) {
  return posts.map((p) => `${p.id}:${p.likeCount || 0}:${p.liked ? 1 : 0}`).join('|');
}

function conexaAvatarUrl(nick, size = 64) {
  return `https://mc-heads.net/avatar/${encodeURIComponent(nick || 'Steve')}/${size}`;
}

function warmConexaAvatar(nick, size = 96) {
  const name = String(nick || '').trim();
  if (!name) return;
  const key = `${name.toLowerCase()}:${size}`;
  if (conexaAvatarWarm.has(key)) return;
  conexaAvatarWarm.add(key);
  const img = new Image();
  img.decoding = 'async';
  img.src = conexaAvatarUrl(name, size);
}

function setConexaAvatar(imgEl, letterEl, nick) {
  if (!imgEl || !letterEl) return;
  const name = String(nick || '').trim();
  if (!name) {
    imgEl.classList.add('hidden');
    letterEl.classList.remove('hidden');
    letterEl.textContent = '?';
    return;
  }
  letterEl.textContent = name[0].toUpperCase();
  imgEl.classList.remove('hidden');
  letterEl.classList.add('hidden');
  imgEl.onerror = () => {
    imgEl.classList.add('hidden');
    letterEl.classList.remove('hidden');
  };
  const size = imgEl.classList.contains('conexa-avatar-lg') ? 96 : 48;
  warmConexaAvatar(name, size);
  imgEl.src = conexaAvatarUrl(name, size);
}

async function fetchConexaProfileBundle(nick, { force = false } = {}) {
  const target = String(nick || '').trim();
  if (!target) return null;
  const key = target.toLowerCase();
  const cached = conexaCache.get(key);
  const fresh = cached && (Date.now() - cached.at) < 90_000;
  if (!force && fresh) return cached;

  const me = getUsername() || 'guest';
  const [profileRes, feed] = await Promise.all([
    window.recreate.getConexaProfile(target),
    window.recreate.getConexaFeed(me, { author: target }),
  ]);
  const bundle = { profileRes, feed, at: Date.now() };
  conexaCache.set(key, bundle);
  warmConexaAvatar(profileRes?.profile?.nick || target, 96);
  return bundle;
}

async function warmConexaBootCache() {
  const me = getUsername();
  if (!me) return;
  try {
    warmConexaAvatar(me, 48);
    warmConexaAvatar(me, 96);
    await fetchConexaProfileBundle(me, { force: true });
    // Global feed em paralelo (não bloqueia)
    window.recreate.getConexaFeed(me, { scope: 'global' }).catch(() => {});
  } catch {}
}

function requireConexaMe() {
  const me = getUsername();
  if (!me) {
    alert('Defina um nickname na aba Conta (ou entre com Microsoft) para usar a Conexa.');
    navigateTo('account', $('[data-page="account"]'));
    return null;
  }
  return me;
}

function formatConexaTime(ts) {
  try {
    const d = new Date(ts);
    const diff = Date.now() - d.getTime();
    if (diff < 60_000) return 'agora';
    if (diff < 3600_000) return `${Math.floor(diff / 60_000)} min`;
    if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} h`;
    return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function compressImageFile(file, maxW = 1280, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Falha ao ler imagem'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Imagem inválida'));
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width);
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        let data = canvas.toDataURL('image/jpeg', quality);
        if (data.length > 520_000) data = canvas.toDataURL('image/jpeg', 0.55);
        if (data.length > 550_000) {
          reject(new Error('Imagem ainda grande demais — tenta outro arquivo'));
          return;
        }
        resolve(data);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function clearConexaComposeImage() {
  conexaPendingImage = null;
  $('#conexa-compose-preview')?.classList.add('hidden');
  const img = $('#conexa-compose-preview-img');
  if (img) img.src = '';
  const input = $('#conexa-image-input');
  if (input) input.value = '';
}

function setConexaRailActive() {
  $$('[data-conexa-tab]').forEach((btn) => {
    const tab = btn.dataset.conexaTab;
    const on = (conexaTab === 'global' && tab === 'global')
      || (conexaTab === 'me' && tab === 'me')
      || (conexaTab === 'profile' && tab === 'me' && conexaViewNick
        && getUsername()
        && conexaViewNick.toLowerCase() === getUsername().toLowerCase());
    btn.classList.toggle('active', !!on);
  });
  $$('.conexa-person').forEach((btn) => {
    const nick = btn.dataset.conexaPerson || '';
    btn.classList.toggle('active', conexaTab === 'profile' && nick.toLowerCase() === String(conexaViewNick || '').toLowerCase());
  });
}

function updateConexaHeader() {
  const title = $('#conexa-feed-title');
  const hint = $('#conexa-hint');
  const back = $('#btn-conexa-back');
  const me = getUsername();

  if (conexaTab === 'global') {
    if (title) title.textContent = 'Global';
    if (hint) hint.textContent = 'O que todo mundo tá postando agora';
    back?.classList.add('hidden');
  } else if (conexaTab === 'me') {
    if (title) title.textContent = 'Meu perfil';
    if (hint) hint.textContent = 'Seus posts — Global e só no perfil';
    back?.classList.add('hidden');
  } else {
    if (title) title.textContent = conexaViewNick || 'Perfil';
    if (hint) hint.textContent = `Tudo que @${conexaViewNick || ''} postou`;
    back?.classList.remove('hidden');
  }

  const compose = $('#conexa-compose');
  const canCompose = !!me && (
    conexaTab === 'global'
    || conexaTab === 'me'
    || (conexaTab === 'profile' && conexaViewNick && me.toLowerCase() === conexaViewNick.toLowerCase())
  );
  compose?.classList.toggle('hidden', !canCompose);
}

function renderConexaPeople(people = []) {
  const list = $('#conexa-people-list');
  if (!list) return;
  conexaPeople = people || [];
  const fp = conexaPeople.map((p) => p.nick).join(',');
  if (fp === conexaPeopleFingerprint && list.children.length) {
    setConexaRailActive();
    return;
  }
  conexaPeopleFingerprint = fp;
  if (!conexaPeople.length) {
    list.innerHTML = '<p class="conexa-people-empty">Ainda ninguém postou</p>';
    return;
  }
  list.innerHTML = conexaPeople.map((p) => `
    <button type="button" class="conexa-person" data-conexa-person="${escapeHtml(p.nick)}">
      <img src="${conexaAvatarUrl(p.nick, 40)}" alt="" loading="lazy" onerror="this.style.opacity=0.3">
      <span>${escapeHtml(p.nick)}</span>
    </button>
  `).join('');
  setConexaRailActive();
}

function renderConexaPosts(posts = []) {
  const feed = $('#conexa-feed');
  if (!feed) return;
  const fp = conexaPostsFingerprint(posts);
  if (fp === conexaFeedFingerprint && feed.querySelector('.conexa-post')) return;
  conexaFeedFingerprint = fp;
  if (!posts.length) {
    feed.innerHTML = '<p class="conexa-empty">Nada por aqui ainda — posta algo.</p>';
    return;
  }

  feed.innerHTML = posts.map((p) => {
    const adminDel = p.canDelete
      ? `<button type="button" class="conexa-action danger" data-conexa-del="${escapeHtml(p.id)}">Apagar</button>`
      : '';
    const img = p.image
      ? `<img class="conexa-post-image" src="${p.image}" alt="post" loading="lazy" decoding="async">`
      : '';
    const scope = p.communityId
      ? `<span class="conexa-post-badge community">${escapeHtml(p.communityName || 'comunidade')}</span>`
      : (p.global === false
        ? '<span class="conexa-post-badge">perfil</span>'
        : '<span class="conexa-post-badge">global</span>');
    return `
      <article class="conexa-post" data-post-id="${escapeHtml(p.id)}">
        <div class="conexa-post-head">
          <img class="conexa-avatar" src="${conexaAvatarUrl(p.author, 48)}" alt="" loading="lazy" onerror="this.style.display='none'">
          <div class="conexa-post-meta">
            <span>
              <span class="conexa-post-author" data-conexa-profile="${escapeHtml(p.author)}">${escapeHtml(p.author)}</span>
              ${scope}
            </span>
            <span class="conexa-post-time">${escapeHtml(formatConexaTime(p.createdAt))}</span>
          </div>
        </div>
        ${p.text ? `<p class="conexa-post-text">${escapeHtml(p.text)}</p>` : ''}
        ${img}
        <div class="conexa-post-actions">
          <button type="button" class="conexa-action ${p.liked ? 'liked' : ''}" data-conexa-like="${escapeHtml(p.id)}">
            ${p.liked ? '♥' : '♡'} ${p.likeCount || 0}
          </button>
          <button type="button" class="conexa-action" data-conexa-profile="${escapeHtml(p.author)}">Perfil</button>
          ${adminDel}
        </div>
      </article>`;
  }).join('');
}

async function loadConexaProfile(nick, { openFeed = false } = {}) {
  const target = String(nick || getUsername() || '').trim();
  if (!target) return;
  conexaViewNick = target;
  const me = getUsername();
  const res = await window.recreate.getConexaProfile(target);
  const profile = res?.profile || { nick: target, bio: '' };
  const isMe = me && me.toLowerCase() === target.toLowerCase();
  const admins = launcherStatusInfo?.admins || [];
  const targetIsAdmin = admins.includes(String(target).toLowerCase()) || !!res?.isAdmin;

  $('#conexa-profile-nick').textContent = profile.nick || target;
  $('#conexa-profile-handle').textContent = `@${profile.nick || target}`;
  $('#conexa-profile-bio').textContent = profile.bio || (isMe ? 'Sem bio ainda — edita aí.' : 'Sem bio.');
  $('#conexa-bio-input').value = profile.bio || '';
  $('#btn-conexa-edit-bio')?.classList.toggle('hidden', !isMe);
  $('#conexa-bio-edit')?.classList.add('hidden');
  $('#conexa-profile-bio')?.classList.remove('hidden');
  $('#conexa-profile-admin')?.classList.toggle('hidden', !targetIsAdmin);
  $('#btn-conexa-profile-banner')?.classList.toggle('hidden', !isMe);
  applyConexaBanner($('#conexa-profile-banner'), profile.banner || null);
  setConexaAvatar($('#conexa-profile-avatar'), $('#conexa-profile-letter'), profile.nick || target);

  if (openFeed) {
    conexaTab = isMe ? 'me' : 'profile';
    await refreshConexaFeed();
  }
}

async function refreshConexaFeed() {
  const gen = ++conexaFeedGen;
  const me = getUsername();
  if (conexaMode !== 'community') {
    updateConexaHeader();
    setConexaRailActive();
  }

  if (!me && conexaTab !== 'global' && conexaMode !== 'community') {
    $('#conexa-feed').innerHTML = '<p class="conexa-empty">Entra na Conta pra ver perfis e postar.</p>';
    return;
  }

  let opts = { scope: 'global' };
  if (conexaMode === 'community' && conexaCommunityId) {
    opts = { communityId: conexaCommunityId };
  } else if (conexaTab === 'me') {
    opts = { author: me };
  } else if (conexaTab === 'profile') {
    opts = { author: conexaViewNick || me };
  }

  const feed = await window.recreate.getConexaFeed(me || 'guest', opts);
  if (gen !== conexaFeedGen) return; // resposta velha — ignora

  conexaIsAdmin = !!feed?.isAdmin;
  $('#conexa-admin-pill')?.classList.toggle('hidden', !conexaIsAdmin);
  if (feed?.people?.length && conexaMode !== 'community') renderConexaPeople(feed.people);
  renderConexaPosts(feed?.posts || []);

  // Stats do painel: usa o feed já carregado (sem 2º request)
  if (conexaMode === 'community') return;
  if (opts.author) {
    const posts = feed?.posts || [];
    const likes = posts.reduce((s, p) => s + (p.likeCount || 0), 0);
    const sp = $('#conexa-stat-posts');
    const sl = $('#conexa-stat-likes');
    if (sp) sp.textContent = String(posts.length);
    if (sl) sl.textContent = String(likes);
  }
}

async function refreshConexa() {
  const me = getUsername();
  const hint = $('#conexa-hint');

  if (!me) {
    if (hint && conexaTab === 'global') hint.textContent = 'Olha o Global — pra postar, entra na Conta.';
    $('#conexa-compose')?.classList.add('hidden');
  } else {
    setConexaAvatar($('#conexa-compose-avatar'), $('#conexa-compose-letter'), me);
  }

  if (!conexaViewNick) conexaViewNick = me || null;

  // Paralelo: status + perfil + feed + comunidades (antes era em série)
  const statusP = window.recreate.getConexaStatus(me || '').catch(() => null);
  const profileP = loadConexaProfile(conexaViewNick || me || 'Steve', { openFeed: false }).catch(() => {});
  const feedP = refreshConexaFeed().catch(() => {});
  const commP = refreshConexaCommunities().catch(() => {});
  const status = await statusP;
  if (status) {
    conexaIsAdmin = !!status.isAdmin;
    $('#conexa-admin-pill')?.classList.toggle('hidden', !conexaIsAdmin);
  }
  await Promise.all([profileP, feedP, commP]);
}

async function openConexaProfile(nick) {
  const target = String(nick || '').trim();
  if (!target) return;
  const me = getUsername();
  conexaViewNick = target;
  conexaTab = me && me.toLowerCase() === target.toLowerCase() ? 'me' : 'profile';
  updateConexaHeader();
  setConexaRailActive();
  // UI imediata + fetch em paralelo
  const profileP = loadConexaProfile(target, { openFeed: false });
  const feedP = refreshConexaFeed();
  await Promise.all([profileP, feedP]);
}

function closeConexaFullProfile() {
  const overlay = $('#conexa-full-overlay');
  overlay?.classList.remove('glitch-in', 'glitch-self');
  overlay?.classList.add('hidden');
  overlay?.setAttribute('aria-hidden', 'true');
}

function playConexaProfileGlitch(isSelf, displayName) {
  const overlay = $('#conexa-full-overlay');
  const modal = overlay?.querySelector('.conexa-full-modal');
  if (!overlay || !modal) return;

  if (conexaProfileGlitchTimer) {
    clearTimeout(conexaProfileGlitchTimer);
    conexaProfileGlitchTimer = null;
  }

  overlay.classList.remove('glitch-in', 'glitch-self');
  void overlay.offsetWidth;
  overlay.classList.add(isSelf ? 'glitch-self' : 'glitch-in');

  try {
    if (appSettings.glitchSoundsEnabled !== false) {
      if (isSelf) window.glitchSfx?.burst?.(true);
      else window.glitchSfx?.transition?.();
    }
  } catch {}

  try {
    notifyIconGlitch?.(isSelf ? 0.85 : 0.45, isSelf ? 'heavy' : 'normal');
  } catch {}

  const nickEl = $('#conexa-full-nick');
  const handleEl = $('#conexa-full-handle');
  const bioEl = $('#conexa-full-bio');
  const name = String(displayName || nickEl?.textContent || '').trim();
  const handleText = name ? `@${name}` : (handleEl?.textContent || '@—');

  // Sempre sincroniza texto limpo — evita @ sumir / dataset.glitch velho
  try {
    if (nickEl && name && name !== '—') TextRupture.syncText(nickEl, name);
    if (handleEl) {
      handleEl.classList.add('no-glitch');
      handleEl.textContent = handleText;
      delete handleEl.dataset.glitch;
    }
    if (bioEl) TextRupture.syncText(bioEl, bioEl.textContent || 'Sem bio ainda.');
  } catch {}

  // Uma batida: letras aleatórias invertidas → voltam
  try {
    if (nickEl && name && name !== '—') {
      TextRupture.ruptureElement(nickEl, {
        tier: 'heavy',
        intensity: isSelf ? 0.95 : 0.7,
        duration: isSelf ? 420 : 280,
        modes: ['invert', 'mirror'],
      });
    }
    if (bioEl && isSelf) {
      TextRupture.ruptureElement(bioEl, {
        tier: 'light',
        intensity: 0.5,
        duration: 260,
      });
    }
  } catch {}

  const clearMs = isSelf ? 1100 : 560;
  conexaProfileGlitchTimer = setTimeout(() => {
    overlay.classList.remove('glitch-in', 'glitch-self');
    // Restaura @ limpo após qualquer rupture
    try {
      if (handleEl) handleEl.textContent = handleText;
      if (nickEl && name) TextRupture.syncText(nickEl, name);
    } catch {}
    conexaProfileGlitchTimer = null;
  }, clearMs);
}

async function openConexaFullProfile(nick) {
  const target = String(nick || conexaViewNick || getUsername() || '').trim();
  if (!target) {
    requireConexaMe();
    return;
  }

  const overlay = $('#conexa-full-overlay');
  if (!overlay) return;

  const me = getUsername();
  const isSelf = !!(me && me.toLowerCase() === target.toLowerCase());

  // Usa cache se já aquecido no loading — abre na hora
  let bundle = await fetchConexaProfileBundle(target, { force: false });
  if (!bundle) {
    bundle = {
      profileRes: { profile: { nick: target, bio: '' } },
      feed: { posts: [] },
      at: Date.now(),
    };
  }

  const profile = bundle.profileRes?.profile || { nick: target, bio: '' };
  const posts = bundle.feed?.posts || [];
  const likes = posts.reduce((s, p) => s + (p.likeCount || 0), 0);
  const admins = launcherStatusInfo?.admins || bundle.feed?.admins || [];
  const isAdm = admins.includes(String(target).toLowerCase()) || !!bundle.profileRes?.isAdmin;
  const display = profile.nick || target;

  overlay.classList.remove('hidden', 'glitch-in', 'glitch-self');
  overlay.setAttribute('aria-hidden', 'false');

  TextRupture.syncText($('#conexa-full-nick'), display);
  const handleEl = $('#conexa-full-handle');
  if (handleEl) {
    handleEl.classList.add('no-glitch');
    handleEl.textContent = `@${display}`;
    delete handleEl.dataset.glitch;
  }
  TextRupture.syncText($('#conexa-full-bio'), profile.bio || 'Sem bio ainda.');
  $('#conexa-full-badge-adm')?.classList.toggle('hidden', !isAdm);
  $('#conexa-full-stat-posts').textContent = String(posts.length);
  $('#conexa-full-stat-likes').textContent = String(likes);

  let since = '—';
  if (profile.createdAt) {
    try {
      since = new Date(profile.createdAt).toLocaleDateString('pt-BR', {
        day: '2-digit', month: 'short', year: 'numeric',
      });
    } catch {}
  }
  $('#conexa-full-since').textContent = since;
  $('#conexa-full-about-meta').textContent = isAdm
    ? 'Admin da Conexa · pode moderar posts.'
    : `${posts.length} post(s) · ${likes} like(s) no total.`;

  setConexaAvatar($('#conexa-full-avatar'), $('#conexa-full-avatar-letter'), display);
  applyConexaBanner($('#conexa-full-banner'), profile.banner || null);
  conexaViewNick = target;

  // Um único glitch (CSS + letras invertendo)
  requestAnimationFrame(() => playConexaProfileGlitch(isSelf, display));

  // Painel lateral em background + refresh silencioso do cache
  loadConexaProfile(target, { openFeed: false }).catch(() => {});
  fetchConexaProfileBundle(target, { force: true }).catch(() => {});
}

async function publishConexaPost() {
  const me = requireConexaMe();
  if (!me) return;
  if (conexaMode === 'community' && conexaCommunityId) {
    const isMember = !!(conexaCommunityView?.community?.access?.isMember
      || conexaCommunityView?.community?.access?.globalAdmin);
    if (!isMember) {
      alert('Entra na comunidade pra postar');
      return;
    }
  }
  const text = ($('#conexa-compose-text')?.value || '').trim();
  const toGlobal = $('#conexa-post-global')?.checked === true;
  const btn = $('#btn-conexa-post');
  if (btn) btn.disabled = true;
  try {
    const payload = {
      text,
      image: conexaPendingImage,
      global: conexaMode === 'community' ? toGlobal : ($('#conexa-post-global')?.checked !== false),
    };
    if (conexaMode === 'community' && conexaCommunityId) {
      payload.communityId = conexaCommunityId;
    }
    const res = await window.recreate.createConexaPost(me, payload);
    if (!res?.success) {
      alert(res?.error || 'Não deu pra postar');
      return;
    }
    if ($('#conexa-compose-text')) $('#conexa-compose-text').value = '';
    $('#conexa-compose-count').textContent = '0/280';
    clearConexaComposeImage();
    conexaFeedFingerprint = '';
    if (conexaMode === 'community') await refreshConexaFeed();
    else await refreshConexa();
  } finally {
    if (btn) btn.disabled = false;
  }
}

function setConexaMode(mode) {
  conexaMode = mode === 'community' ? 'community' : 'feed';
  const isComm = conexaMode === 'community';
  $('#conexa-comm-hero')?.classList.toggle('hidden', !isComm);
  $('#conexa-panel')?.querySelector('.conexa-panel-card')?.classList.toggle('hidden', isComm);
  $('#conexa-rules-feed')?.classList.toggle('hidden', isComm);
  $('#conexa-comm-panel')?.classList.toggle('hidden', !isComm);
  $('#btn-conexa-back')?.classList.toggle('hidden', !(isComm || conexaTab === 'profile'));

  const globalLabel = $('#conexa-post-global-label');
  const globalToggle = $('#conexa-post-global');
  const composeText = $('#conexa-compose-text');
  if (isComm) {
    if (globalLabel) globalLabel.textContent = 'também Global';
    if (globalToggle) globalToggle.checked = false;
    if (composeText) composeText.placeholder = 'Posta na comunidade...';
  } else {
    if (globalLabel) globalLabel.textContent = 'Global';
    if (globalToggle) globalToggle.checked = true;
    if (composeText) composeText.placeholder = 'O que tá rolando no multiverso?';
  }
}

function exitConexaCommunity() {
  conexaCommunityId = null;
  conexaChannelId = null;
  conexaCommunityView = null;
  if (conexaCommMsgTimer) {
    clearInterval(conexaCommMsgTimer);
    conexaCommMsgTimer = null;
  }
  setConexaMode('feed');
  const me = getUsername();
  $('#conexa-compose')?.classList.toggle('hidden', !me);
}

function renderConexaCommunities(list) {
  const el = $('#conexa-comm-list');
  if (!el) return;
  const mine = list?.mine || [];
  const discover = (list?.discover || []).filter((c) => !mine.some((m) => m.id === c.id));
  if (!mine.length && !discover.length) {
    el.innerHTML = '<p class="conexa-people-empty">Nenhuma ainda</p>';
    return;
  }
  const blocks = [];
  if (mine.length) {
    blocks.push(mine.map((c) => `
      <button type="button" class="conexa-comm-item${conexaCommunityId === c.id ? ' active' : ''}" data-conexa-comm="${c.id}">
        <span class="conexa-comm-dot" aria-hidden="true"></span>
        <span class="conexa-comm-item-copy">
          <strong>${escapeHtml(c.name)}</strong>
          <small>${c.memberCount || 0} membros</small>
        </span>
      </button>
    `).join(''));
  }
  if (discover.length) {
    blocks.push('<p class="conexa-people-empty" style="margin:6px 0 2px">Explorar</p>');
    blocks.push(discover.slice(0, 8).map((c) => `
      <button type="button" class="conexa-comm-item" data-conexa-comm="${c.id}">
        <span class="conexa-comm-dot" aria-hidden="true"></span>
        <span class="conexa-comm-item-copy">
          <strong>${escapeHtml(c.name)}</strong>
          <small>${c.memberCount || 0} · aberta</small>
        </span>
      </button>
    `).join(''));
  }
  el.innerHTML = blocks.join('');
}

async function refreshConexaCommunities() {
  const me = getUsername() || 'guest';
  const res = await window.recreate.listConexaCommunities(me);
  if (res?.success) renderConexaCommunities(res);
  return res;
}

function renderConexaCommHero(view) {
  const c = view?.community;
  if (!c) return;
  $('#conexa-comm-hero-name').textContent = c.name || 'Comunidade';
  $('#conexa-comm-hero-desc').textContent = c.description || 'Sem descrição ainda.';
  $('#conexa-comm-hero-members').textContent = String(c.memberCount || 0);
  $('#conexa-comm-hero-privacy').textContent = c.joinMode === 'invite' ? 'Só convite' : 'Aberta';
  const joinBtn = $('#btn-conexa-comm-hero-join');
  joinBtn?.classList.toggle('hidden', !view.canJoin);
  const canBanner = !!(c.access?.isOwner || c.access?.globalAdmin);
  $('#btn-conexa-comm-banner')?.classList.toggle('hidden', !canBanner);
  applyConexaBanner($('#conexa-comm-hero-banner'), c.banner || null);
}

function renderConexaCommPanel(view) {
  const c = view?.community;
  if (!c) return;
  $('#conexa-comm-panel-title').textContent = c.name || 'Comunidade';
  $('#conexa-comm-panel-desc').textContent = c.description || 'Sem descrição.';
  $('#conexa-comm-meta').textContent = `${c.memberCount || 0} membro(s) · @${c.owner}${c.joinMode === 'invite' ? ' · privada' : ' · aberta'}`;

  const inviteWrap = $('#conexa-comm-invite-wrap');
  const inviteCode = $('#conexa-comm-invite-code');
  const showInvite = !!(c.inviteCode && (c.access?.isMember || c.access?.globalAdmin));
  inviteWrap?.classList.toggle('hidden', !showInvite);
  if (inviteCode && c.inviteCode) inviteCode.textContent = c.inviteCode;

  const perms = c.access?.perms || {};
  $('#btn-conexa-add-role')?.classList.toggle('hidden', !perms.manageRoles);
  $('#btn-conexa-comm-leave')?.classList.toggle('hidden', !(c.access?.isMember && !c.access?.isOwner));
  $('#btn-conexa-comm-join-open')?.classList.toggle('hidden', !view.canJoin);
  $('#btn-conexa-comm-delete')?.classList.toggle(
    'hidden',
    !(c.access?.isOwner || c.access?.globalAdmin),
  );

  const roleList = $('#conexa-role-list');
  if (roleList) {
    const roles = view.roles || [];
    roleList.innerHTML = roles.length
      ? roles.map((r) => `
        <div class="conexa-role-chip">
          <span style="color:${escapeHtml(r.color || '#a78bfa')}">${escapeHtml(r.name)}</span>
          ${perms.manageRoles ? `<button type="button" data-conexa-del-role="${r.id}">apagar</button>` : ''}
        </div>
      `).join('')
      : '<p class="conexa-people-empty">Dono modera por padrão</p>';
  }

  const memberList = $('#conexa-member-list');
  if (memberList) {
    const members = view.members || [];
    memberList.innerHTML = members.map((m) => `
      <div class="conexa-member-row">
        <span>@${escapeHtml(m.nick)}${(m.roles || []).includes('owner') ? ' · dono' : ''}</span>
      </div>
    `).join('') || '<p class="conexa-people-empty">Sem membros</p>';
  }
}

async function openConexaCommunity(id) {
  const me = requireConexaMe();
  if (!me) return;
  const res = await window.recreate.getConexaCommunityView(me, id);
  if (!res?.success) {
    alert(res?.error || 'Não abriu a comunidade');
    return;
  }

  conexaCommunityId = id;
  conexaCommunityView = res;
  conexaFeedFingerprint = '';
  setConexaMode('community');

  const isMember = !!(res.community?.access?.isMember || res.community?.access?.globalAdmin);
  $('#conexa-compose')?.classList.toggle('hidden', !isMember);
  $('#conexa-feed-title').textContent = res.community?.name || 'Comunidade';
  $('#conexa-hint').textContent = 'Timeline da comunidade';

  renderConexaCommHero(res);
  renderConexaCommPanel(res);
  // Feed primeiro; lista de comunidades depois (não trava o clique)
  refreshConexaFeed().catch(() => {});
  refreshConexaCommunities().catch(() => {});
}

function wireConexaUI() {
  $('#btn-conexa-refresh')?.addEventListener('click', () => {
    if (conexaMode === 'community') {
      openConexaCommunity(conexaCommunityId).catch(() => {});
    } else {
      refreshConexa().catch(() => {});
    }
    refreshConexaCommunities().catch(() => {});
  });

  $('#btn-conexa-back')?.addEventListener('click', () => {
    if (conexaMode === 'community') {
      exitConexaCommunity();
      conexaTab = 'global';
      refreshConexaFeed().catch(() => {});
      return;
    }
    conexaTab = 'global';
    refreshConexaFeed().catch(() => {});
  });

  $$('[data-conexa-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      exitConexaCommunity();
      const tab = btn.dataset.conexaTab;
      if (tab === 'global') {
        conexaTab = 'global';
      } else if (tab === 'me') {
        const me = requireConexaMe();
        if (!me) return;
        conexaTab = 'me';
        conexaViewNick = me;
        loadConexaProfile(me).catch(() => {});
      }
      conexaFeedFingerprint = '';
      updateConexaHeader();
      setConexaRailActive();
      refreshConexaFeed().catch(() => {});
    });
  });

  $('#conexa-people-list')?.addEventListener('click', (e) => {
    const person = e.target.closest('[data-conexa-person]');
    if (!person) return;
    exitConexaCommunity();
    openConexaProfile(person.dataset.conexaPerson).catch(() => {});
  });

  $('#conexa-comm-list')?.addEventListener('click', (e) => {
    const item = e.target.closest('[data-conexa-comm]');
    if (!item) return;
    openConexaCommunity(item.dataset.conexaComm).catch((err) => alert(err.message || 'Erro'));
  });

  $('#btn-conexa-comm-create')?.addEventListener('click', () => {
    if (!requireConexaMe()) return;
    $('#conexa-comm-create-modal')?.classList.remove('hidden');
  });
  $('#btn-conexa-comm-create-cancel')?.addEventListener('click', () => {
    $('#conexa-comm-create-modal')?.classList.add('hidden');
  });
  $('#btn-conexa-comm-create-ok')?.addEventListener('click', async () => {
    const me = requireConexaMe();
    if (!me) return;
    const name = $('#conexa-comm-create-name')?.value || '';
    const description = $('#conexa-comm-create-desc')?.value || '';
    const joinMode = $('#conexa-comm-create-invite')?.checked ? 'invite' : 'open';
    const res = await window.recreate.createConexaCommunity(me, { name, description, joinMode });
    if (!res?.success) {
      alert(res?.error || 'Não criou');
      return;
    }
    $('#conexa-comm-create-modal')?.classList.add('hidden');
    if ($('#conexa-comm-create-name')) $('#conexa-comm-create-name').value = '';
    if ($('#conexa-comm-create-desc')) $('#conexa-comm-create-desc').value = '';
    if ($('#conexa-comm-create-invite')) $('#conexa-comm-create-invite').checked = false;
    await refreshConexaCommunities();
    if (res.community?.id) await openConexaCommunity(res.community.id);
  });

  $('#btn-conexa-comm-join')?.addEventListener('click', () => {
    if (!requireConexaMe()) return;
    $('#conexa-comm-join-modal')?.classList.remove('hidden');
  });
  $('#btn-conexa-comm-join-cancel')?.addEventListener('click', () => {
    $('#conexa-comm-join-modal')?.classList.add('hidden');
  });
  $('#btn-conexa-comm-join-ok')?.addEventListener('click', async () => {
    const me = requireConexaMe();
    if (!me) return;
    const code = $('#conexa-comm-join-code')?.value || '';
    const res = await window.recreate.joinConexaCommunity(me, { inviteCode: code });
    if (!res?.success) {
      alert(res?.error || 'Não entrou');
      return;
    }
    $('#conexa-comm-join-modal')?.classList.add('hidden');
    if ($('#conexa-comm-join-code')) $('#conexa-comm-join-code').value = '';
    await refreshConexaCommunities();
    if (res.community?.id) await openConexaCommunity(res.community.id);
  });

  async function joinCurrentCommunity() {
    const me = requireConexaMe();
    if (!me || !conexaCommunityId) return;
    const res = await window.recreate.joinConexaCommunity(me, { communityId: conexaCommunityId });
    if (!res?.success) {
      alert(res?.error || 'Não entrou');
      return;
    }
    await openConexaCommunity(conexaCommunityId);
  }

  $('#btn-conexa-comm-join-open')?.addEventListener('click', () => {
    joinCurrentCommunity().catch((err) => alert(err.message || 'Erro'));
  });
  $('#btn-conexa-comm-hero-join')?.addEventListener('click', () => {
    joinCurrentCommunity().catch((err) => alert(err.message || 'Erro'));
  });

  $('#btn-conexa-comm-leave')?.addEventListener('click', async () => {
    const me = requireConexaMe();
    if (!me || !conexaCommunityId) return;
    if (!confirm('Sair desta comunidade?')) return;
    const res = await window.recreate.leaveConexaCommunity(me, conexaCommunityId);
    if (!res?.success) {
      alert(res?.error || 'Não saiu');
      return;
    }
    exitConexaCommunity();
    await refreshConexaCommunities();
    conexaTab = 'global';
    await refreshConexaFeed();
  });

  $('#btn-conexa-comm-delete')?.addEventListener('click', async () => {
    const me = requireConexaMe();
    if (!me || !conexaCommunityId) return;
    if (!confirm('Deletar esta comunidade e todas as mensagens? Isso não dá pra desfazer.')) return;
    const res = await window.recreate.deleteConexaCommunity(me, conexaCommunityId);
    if (!res?.success) {
      alert(res?.error || 'Não deletou');
      return;
    }
    exitConexaCommunity();
    await refreshConexaCommunities();
    conexaTab = 'global';
    await refreshConexaFeed();
  });

  $('#btn-conexa-add-role')?.addEventListener('click', async () => {
    const me = requireConexaMe();
    if (!me || !conexaCommunityId) return;
    const name = prompt('Nome do mod (cargo)');
    if (!name) return;
    const delMsg = confirm('Pode apagar posts da comunidade?');
    const res = await window.recreate.createConexaRole(me, conexaCommunityId, {
      name,
      perms: {
        deleteMessages: delMsg,
        manageChannels: false,
        manageRoles: false,
        kick: false,
      },
    });
    if (!res?.success) {
      alert(res?.error || 'Não criou o cargo');
      return;
    }
    await openConexaCommunity(conexaCommunityId);
  });

  $('#conexa-role-list')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-conexa-del-role]');
    if (!btn) return;
    const me = requireConexaMe();
    if (!me || !conexaCommunityId) return;
    if (!confirm('Apagar este cargo?')) return;
    const res = await window.recreate.deleteConexaRole(me, conexaCommunityId, btn.dataset.conexaDelRole);
    if (!res?.success) {
      alert(res?.error || 'Não apagou');
      return;
    }
    await openConexaCommunity(conexaCommunityId);
  });

  $('#btn-conexa-open-profile')?.addEventListener('click', () => {
    const nick = conexaViewNick || getUsername();
    if (!nick) {
      requireConexaMe();
      return;
    }
    openConexaFullProfile(nick).catch((err) => alert(err.message || 'Erro ao abrir perfil'));
  });

  $('#btn-conexa-full-close')?.addEventListener('click', () => closeConexaFullProfile());
  $('#conexa-full-overlay')?.addEventListener('click', (e) => {
    if (e.target === $('#conexa-full-overlay')) closeConexaFullProfile();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!$('#conexa-comm-create-modal')?.classList.contains('hidden')) {
      $('#conexa-comm-create-modal')?.classList.add('hidden');
      return;
    }
    if (!$('#conexa-comm-join-modal')?.classList.contains('hidden')) {
      $('#conexa-comm-join-modal')?.classList.add('hidden');
      return;
    }
    if (!$('#conexa-full-overlay')?.classList.contains('hidden')) closeConexaFullProfile();
  });

  $('#conexa-compose-text')?.addEventListener('input', (e) => {
    const n = String(e.target.value || '').length;
    const el = $('#conexa-compose-count');
    if (el) el.textContent = `${n}/280`;
  });

  // Enter = enviar · Shift+Enter = nova linha
  $('#conexa-compose-text')?.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    if (e.shiftKey) return; // deixa quebrar linha
    e.preventDefault();
    if (e.isComposing) return;
    publishConexaPost().catch((err) => alert(err.message || 'Erro ao postar'));
  });

  $('#btn-conexa-post')?.addEventListener('click', () => {
    publishConexaPost().catch((err) => alert(err.message || 'Erro ao postar'));
  });

  $('#conexa-image-input')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      conexaPendingImage = await compressImageFile(file);
      const preview = $('#conexa-compose-preview');
      const img = $('#conexa-compose-preview-img');
      if (img) img.src = conexaPendingImage;
      preview?.classList.remove('hidden');
    } catch (err) {
      clearConexaComposeImage();
      alert(err.message || 'Não deu pra anexar a imagem');
    }
  });

  $('#btn-conexa-remove-img')?.addEventListener('click', () => clearConexaComposeImage());

  $('#btn-conexa-edit-bio')?.addEventListener('click', () => {
    $('#conexa-bio-edit')?.classList.remove('hidden');
    $('#conexa-profile-bio')?.classList.add('hidden');
    $('#btn-conexa-edit-bio')?.classList.add('hidden');
  });

  $('#btn-conexa-bio-cancel')?.addEventListener('click', () => {
    $('#conexa-bio-edit')?.classList.add('hidden');
    $('#conexa-profile-bio')?.classList.remove('hidden');
    $('#btn-conexa-edit-bio')?.classList.remove('hidden');
  });

  $('#btn-conexa-bio-save')?.addEventListener('click', async () => {
    const me = requireConexaMe();
    if (!me) return;
    const bio = $('#conexa-bio-input')?.value || '';
    const res = await window.recreate.updateConexaBio(me, bio);
    if (!res?.success) {
      alert(res?.error || 'Não salvou a bio');
      return;
    }
    await loadConexaProfile(me);
  });

  async function pickConexaBanner(file, { kind }) {
    if (!file) return;
    const me = requireConexaMe();
    if (!me) return;
    try {
      const data = await compressImageFile(file, 1280, 0.62);
      if (kind === 'profile') {
        const res = await window.recreate.updateConexaBanner(me, data);
        if (!res?.success) {
          alert(res?.error || 'Não salvou o banner');
          return;
        }
        applyConexaBanner($('#conexa-profile-banner'), data);
        applyConexaBanner($('#conexa-full-banner'), data);
      } else if (kind === 'community' && conexaCommunityId) {
        const res = await window.recreate.updateConexaCommunityBanner(me, conexaCommunityId, data);
        if (!res?.success) {
          alert(res?.error || 'Não salvou o banner');
          return;
        }
        if (conexaCommunityView?.community) conexaCommunityView.community.banner = data;
        applyConexaBanner($('#conexa-comm-hero-banner'), data);
      }
    } catch (err) {
      alert(err.message || 'Falha no banner');
    }
  }

  $('#conexa-profile-banner-input')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    pickConexaBanner(file, { kind: 'profile' }).catch(() => {});
  });
  $('#conexa-comm-banner-input')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    pickConexaBanner(file, { kind: 'community' }).catch(() => {});
  });

  $('#conexa-feed')?.addEventListener('click', async (e) => {
    const profileBtn = e.target.closest('[data-conexa-profile]');
    if (profileBtn) {
      await openConexaProfile(profileBtn.getAttribute('data-conexa-profile'));
      return;
    }

    const likeBtn = e.target.closest('[data-conexa-like]');
    if (likeBtn) {
      const me = requireConexaMe();
      if (!me) return;
      const id = likeBtn.getAttribute('data-conexa-like');
      const res = await window.recreate.likeConexaPost(me, id);
      if (res?.success && res.post) {
        const card = document.querySelector(`.conexa-post[data-post-id="${id.replace(/"/g, '')}"]`);
        const action = card?.querySelector('[data-conexa-like]');
        if (action) {
          action.classList.toggle('liked', !!res.post.liked);
          action.textContent = `${res.post.liked ? '♥' : '♡'} ${res.post.likeCount || 0}`;
        }
      }
      return;
    }

    const delBtn = e.target.closest('[data-conexa-del]');
    if (delBtn) {
      const me = requireConexaMe();
      if (!me) return;
      const id = delBtn.getAttribute('data-conexa-del');
      if (!confirm('Apagar este post?')) return;
      const res = await window.recreate.deleteConexaPost(me, id);
      if (!res?.success) {
        alert(res?.error || 'Não apagou');
        return;
      }
      conexaFeedFingerprint = '';
      await refreshConexaFeed();
    }
  });

  setInterval(() => {
    if (currentPage === 'conexa') refreshConexaFeed().catch(() => {});
  }, 45000);

  refreshConexaCommunities().catch(() => {});
}
async function playMenuEntrance() {
  const pageTitle = $('#page-title');
  TextRupture.register(pageTitle);

  if (appSettings.tabGlitchEnabled !== false) {
    notifyIconGlitch(1, 'heavy');
    tabGlitch.playTransition();
  }
  playTitleGlitch.init();
  if (appSettings.titleGlitchEnabled !== false) {
    playTitleGlitch.start();
    playTitleGlitch.burst();
  } else {
    playTitleGlitch.stop?.();
  }
}

function applyAppSettings(settings = {}) {
  appSettings = {
    minimizeToTrayOnPlay: settings.minimizeToTrayOnPlay !== false,
    tabGlitchEnabled: settings.tabGlitchEnabled !== false,
    titleGlitchEnabled: settings.titleGlitchEnabled !== false,
    glitchSoundsEnabled: settings.glitchSoundsEnabled !== false,
  };

  const tray = $('#setting-tray-minimize');
  const tabG = $('#setting-tab-glitch');
  const titleG = $('#setting-title-glitch');
  const sfx = $('#setting-glitch-sfx');
  if (tray) tray.checked = appSettings.minimizeToTrayOnPlay;
  if (tabG) tabG.checked = appSettings.tabGlitchEnabled;
  if (titleG) titleG.checked = appSettings.titleGlitchEnabled;
  if (sfx) sfx.checked = appSettings.glitchSoundsEnabled;

  try {
    const allow = appSettings.glitchSoundsEnabled !== false;
    const foreground = !document.hidden;
    window.glitchSfx?.setMuted?.(!allow || !foreground);
    if (allow && foreground) window.glitchSfx?.restoreMasterGain?.();
  } catch {}

  if (appSettings.titleGlitchEnabled) {
    try {
      playTitleGlitch.init();
      playTitleGlitch.start();
    } catch {}
  } else {
    try { playTitleGlitch.stop?.(); } catch {}
  }
}

async function patchAppSetting(key, value) {
  const patch = { [key]: value };
  const next = await window.recreate.setSettings(patch);
  applyAppSettings(next || { ...appSettings, ...patch });
}

// ─── Auto-update (GitHub Releases) ───
let updateStatus = { status: 'idle', currentVersion: '', availableVersion: null, percent: 0, message: '' };
let updateBtnAnimTimer = null;
let updateUserCheck = false; // animação do botão Config só depois do clique

function stopUpdateBtnAnim() {
  if (updateBtnAnimTimer) {
    clearInterval(updateBtnAnimTimer);
    updateBtnAnimTimer = null;
  }
}

function resetCheckUpdateButton() {
  stopUpdateBtnAnim();
  const checkBtn = $('#btn-check-update');
  if (checkBtn) {
    checkBtn.disabled = false;
    checkBtn.textContent = 'Verificar atualização';
  }
}

/** Uma passagem rápida: Texto. → Texto.. → Texto... */
async function playDotsOnce(baseText, stepMs = 160) {
  const checkBtn = $('#btn-check-update');
  if (!checkBtn) return;
  stopUpdateBtnAnim();
  checkBtn.disabled = true;
  for (let dots = 1; dots <= 3; dots += 1) {
    checkBtn.textContent = `${baseText}${'.'.repeat(dots)}`;
    await sleep(stepMs);
  }
}

function sanitizeUpdatePayload(st = {}) {
  const next = { ...st };
  const bad = /electron-updater|missing|ENOENT|HttpError|latest\.yml/i;
  if (bad.test(String(next.error || ''))) next.error = null;
  if (bad.test(String(next.message || ''))) {
    if (next.status === 'error') next.message = 'Não foi possível verificar atualização.';
    else if (next.status === 'up-to-date' || !next.status) {
      next.status = 'up-to-date';
      next.message = 'Não há atualização';
    } else next.message = '';
  }
  return next;
}

function syncTitlebarUpdateBtn(status) {
  const titleBtn = $('#btn-titlebar-update');
  if (!titleBtn) return;
  const show = ['available', 'downloading', 'ready'].includes(status);
  titleBtn.classList.toggle('hidden', !show);
  if (!show) return;
  if (status === 'downloading') {
    titleBtn.textContent = 'Atualizando...';
    titleBtn.disabled = true;
  } else if (status === 'ready') {
    titleBtn.textContent = 'Reiniciando...';
    titleBtn.disabled = true;
  } else {
    titleBtn.textContent = 'Atualize aqui';
    titleBtn.disabled = false;
  }
}

function applyUpdateStatus(st = {}) {
  updateStatus = { ...updateStatus, ...sanitizeUpdatePayload(st) };
  const verEl = $('#launcher-version');
  const setMsg = $('#update-settings-msg');
  const status = updateStatus.status || 'idle';

  if (verEl && updateStatus.currentVersion) {
    verEl.textContent = `Launcher v${updateStatus.currentVersion}`;
  }

  // Título: pode atualizar em background (só aparece se tiver update)
  syncTitlebarUpdateBtn(status);

  // Config: botão/mensagem SÓ se o usuário clicou
  if (!updateUserCheck) {
    if (setMsg) setMsg.textContent = '';
    resetCheckUpdateButton();
    return;
  }

  if (setMsg) {
    if (status === 'checking') setMsg.textContent = '';
    else if (status === 'up-to-date') setMsg.textContent = 'Não há atualização';
    else if (status === 'available' || status === 'downloading') {
      setMsg.textContent = updateStatus.availableVersion
        ? `Atualização v${updateStatus.availableVersion} encontrada`
        : 'Atualização encontrada';
    } else if (status === 'ready') setMsg.textContent = 'Reiniciando com a nova versão...';
    else if (status === 'error') setMsg.textContent = 'Não foi possível verificar atualização.';
    else setMsg.textContent = '';
  }

  // Animação do botão é controlada só pelos handlers de clique (playDotsOnce)
  if (status === 'up-to-date' || status === 'error' || status === 'idle') {
    resetCheckUpdateButton();
  } else if (status === 'available' || status === 'downloading' || status === 'ready') {
    const checkBtn = $('#btn-check-update');
    if (checkBtn) {
      checkBtn.disabled = true;
      if (!String(checkBtn.textContent || '').startsWith('Atualizando')
        && !String(checkBtn.textContent || '').startsWith('Verificando')) {
        checkBtn.textContent = 'Atualizando...';
      }
    }
  }
}

async function handleTitlebarUpdateClick() {
  updateUserCheck = true;
  const btn = $('#btn-titlebar-update');
  if (btn) btn.disabled = true;
  applyUpdateStatus({
    ...updateStatus,
    status: 'downloading',
    percent: updateStatus.percent || 0,
    message: 'Atualizando...',
    error: null,
  });
  await playDotsOnce('Atualizando', 160);
  await window.recreate.downloadAndInstallUpdate();
}

async function handleSettingsUpdateClick() {
  updateUserCheck = true;
  const setMsg = $('#update-settings-msg');
  if (setMsg) setMsg.textContent = '';

  const checkBtn = $('#btn-check-update');
  if (checkBtn) checkBtn.disabled = true;

  if (['available', 'downloading', 'ready'].includes(updateStatus.status)) {
    await playDotsOnce('Atualizando', 160);
    applyUpdateStatus({ ...updateStatus, status: 'downloading', error: null });
    await window.recreate.downloadAndInstallUpdate();
    return;
  }

  // Verificando. → .. → ... (uma vez, rápido) em paralelo com o check
  const anim = playDotsOnce('Verificando', 160);
  let st;
  try {
    st = sanitizeUpdatePayload((await window.recreate.checkForUpdates()) || {});
  } catch {
    st = { status: 'error', message: 'Não foi possível verificar atualização.', error: null };
  }
  await anim;

  if (st.status === 'available' || st.status === 'ready') {
    await playDotsOnce('Atualizando', 160);
    applyUpdateStatus({ ...st, status: 'downloading', error: null });
    await window.recreate.downloadAndInstallUpdate();
    return;
  }

  applyUpdateStatus({
    ...st,
    status: st.status === 'error' ? 'error' : 'up-to-date',
    message: st.status === 'error' ? 'Não foi possível verificar atualização.' : 'Não há atualização',
    error: null,
  });
}

function initUpdaterUI() {
  resetCheckUpdateButton();
  const setMsg = $('#update-settings-msg');
  if (setMsg) setMsg.textContent = '';

  $('#btn-titlebar-update')?.addEventListener('click', () => {
    handleTitlebarUpdateClick().catch(() => {});
  });
  $('#btn-check-update')?.addEventListener('click', () => {
    handleSettingsUpdateClick().catch(() => {});
  });

  window.recreate.onUpdateStatus?.((st) => {
    const clean = sanitizeUpdatePayload(st || {});
    updateStatus = { ...updateStatus, ...clean };

    const verEl = $('#launcher-version');
    if (verEl && clean.currentVersion) {
      verEl.textContent = `Launcher v${clean.currentVersion}`;
    }

    // Nunca anima o botão Config por evento de fundo — só "Atualize aqui"
    syncTitlebarUpdateBtn(clean.status || 'idle');

    if (!updateUserCheck) return;

    // Durante/após clique: só atualiza a mensagem, não reinicia animação
    const setMsg = $('#update-settings-msg');
    if (!setMsg) return;
    const status = clean.status || 'idle';
    if (status === 'up-to-date') setMsg.textContent = 'Não há atualização';
    else if (status === 'available' || status === 'downloading') {
      setMsg.textContent = clean.availableVersion
        ? `Atualização v${clean.availableVersion} encontrada`
        : 'Atualização encontrada';
    } else if (status === 'ready') setMsg.textContent = 'Reiniciando com a nova versão...';
    else if (status === 'error') setMsg.textContent = 'Não foi possível verificar atualização.';
  });

  window.recreate.getUpdateStatus?.()
    .then((st) => {
      const clean = sanitizeUpdatePayload(st || {});
      updateStatus = {
        status: 'idle',
        currentVersion: clean.currentVersion || '',
        availableVersion: ['available', 'downloading', 'ready'].includes(clean.status)
          ? clean.availableVersion
          : null,
        percent: 0,
        message: '',
        error: null,
      };
      if (['available', 'downloading', 'ready'].includes(clean.status)) {
        updateStatus.status = clean.status === 'available' ? 'available' : clean.status;
      }
      const verEl = $('#launcher-version');
      if (verEl && updateStatus.currentVersion) {
        verEl.textContent = `Launcher v${updateStatus.currentVersion}`;
      }
      syncTitlebarUpdateBtn(updateStatus.status);
      resetCheckUpdateButton();
      if (setMsg) setMsg.textContent = '';
    })
    .catch(() => {
      resetCheckUpdateButton();
    });
}

// ─── Init ───
async function init() {
  const [username, ram, account] = await Promise.all([
    window.recreate.getUsername(),
    window.recreate.getRam(),
    window.recreate.getAccount(),
  ]);

  accountInfo = account;
  setAccountType(account.type || 'premium');

  if (username) $('#username').value = username;
  if (ram) { $('#ram').value = ram; $('#ram-value').textContent = `${ram} GB`; }

  updateAccountUI();

  if (account.loggedIn && account.type === 'premium') {
    syncAccountSkin(true).then(() => {
      updateAccountUI();
      updatePlayerChip();
      if (currentPage === 'skin') refreshSkinPage();
    });
  }

  const launchStatus = await window.recreate.getStatus();
  const javaEl = $('#java-status');
  if (javaEl) {
    javaEl.textContent = launchStatus.java?.ok
      ? `✓ ${launchStatus.java.version}`
      : `✗ ${launchStatus.java?.error || 'Java 17 não encontrado'}`;
  }

  if (!launchStatus.java?.ok) {
    $('#hint-text').textContent = 'Instale o Java 17 para jogar (veja Configurações).';
  } else {
    updatePlayHint();
  }

  updatePlayMeta();
  updatePlayerChip();
  refreshServerStatus();
  refreshLevel();
  refreshChangelog();
  refreshFriendsBadgesOnly().catch(() => {});

  // Sync ao vivo com GitHub (log.txt + launcher.txt) sem reiniciar
  window.recreate.onRemoteSync?.((data) => {
    if (data?.changelog) applyChangelog(data.changelog);
    if (data?.launcherStatus) {
      applyLauncherStatus(data.launcherStatus);
      updatePlayButton();
      updatePlayHint();
    }
  });

  try {
    const settings = await window.recreate.getSettings();
    applyAppSettings(settings || {});
  } catch {
    applyAppSettings(appSettings);
  }

  initUpdaterUI();
  wireConexaUI();
  // Durante a splash a main já está carregando — aquece skin/perfil Conexa
  warmConexaBootCache().catch(() => {});

  loadingGlitch.applyContentGlitch();
  tabGlitch.applyContentGlitch();
  TextRupture.registerAll($('#app-root'));
  // Handle do perfil completo nunca entra no rupture ambient
  const fullHandle = $('#conexa-full-handle');
  if (fullHandle) {
    fullHandle.classList.add('no-glitch');
    delete fullHandle.dataset.glitch;
  }

  playMenuEntrance();
  TextRupture.startAmbient($('#app-root'), { interval: 7000, intervalJitter: 5000 });
  window.recreate?.setGlitchIntensity?.(0);

  setInterval(refreshServerStatus, 45000);
  setInterval(refreshLevel, 90000);
  // Backup leve: se o push do main falhar, ainda atualiza de vez em quando
  setInterval(refreshChangelog, 60 * 1000);
  setInterval(async () => {
    try {
      const st = await window.recreate.getStatus();
      if (st?.gameRunning && !gameIsOpen) setGameOpen(true);
      if (!st?.gameRunning && gameIsOpen && !isPlaying) setGameOpen(false);
    } catch {}
  }, 4000);

  try {
    const st = await window.recreate.getStatus();
    if (st?.gameRunning) setGameOpen(true);
    else updatePlayButton();
  } catch {
    updatePlayButton();
  }
}

$('#setting-tray-minimize')?.addEventListener('change', async (e) => {
  await patchAppSetting('minimizeToTrayOnPlay', !!e.target.checked);
});
$('#setting-tab-glitch')?.addEventListener('change', async (e) => {
  await patchAppSetting('tabGlitchEnabled', !!e.target.checked);
});
$('#setting-title-glitch')?.addEventListener('change', async (e) => {
  await patchAppSetting('titleGlitchEnabled', !!e.target.checked);
});
$('#setting-glitch-sfx')?.addEventListener('change', async (e) => {
  await patchAppSetting('glitchSoundsEnabled', !!e.target.checked);
});

init();
