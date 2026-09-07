const progressFill = document.getElementById('progress-fill');
const statusText = document.getElementById('status-text');
const splashRoot = document.getElementById('splash-root');
const contentLayer = document.getElementById('content-layer');

/** Deve bater com electron/main.js */
const SPLASH_DURATION_MS = 4500;

const statusMessages = [
  'O universo observa...',
  'Fissuras detectadas...',
  'A realidade cede...',
  'Algo tenta entrar...',
  'Ruptura iminente...',
  'Segure-se...',
];

let progress = 0;
let messageIndex = -1;
let finished = false;
let lastAmbient = 0;
let lastMilestone = 0;
const splashStart = performance.now();

const sfx = window.glitchSfx || new GlitchSfx();
window.glitchSfx = sfx;

function bootAudio() {
  try {
    sfx.unlock();
    sfx.startLoading?.();
  } catch {}
}

bootAudio();
window.addEventListener('pointerdown', () => bootAudio(), { once: true });
[200, 800, 1600].forEach((ms) => setTimeout(bootAudio, ms));

const cinema = new SplashCinemaGlitch(splashRoot);
cinema.durationMs = SPLASH_DURATION_MS;
cinema.start();

function setStage(index, { withSfx = true } = {}) {
  if (index < 0 || index >= statusMessages.length) return;
  if (index === messageIndex) return;
  messageIndex = index;
  const msg = statusMessages[messageIndex];
  statusText.textContent = msg;
  statusText.dataset.glitch = msg;
  statusText.classList.add('text-snap');
  setTimeout(() => statusText.classList.remove('text-snap'), 140);

  if (withSfx) {
    try {
      // Troca de etapa = glitch “de verdade”
      sfx.stageChange?.() || sfx.transition?.();
    } catch {}
    try {
      cinema.triggerBurst(index >= 3);
    } catch {}
  }
}

function setVisualProgress(p) {
  progress = Math.max(0, Math.min(100, p));
  if (progressFill) progressFill.style.width = `${progress}%`;
  cinema.setProgress(progress);
}

// primeira mensagem
setStage(0, { withSfx: false });
setTimeout(() => {
  try { sfx.ambient?.(); } catch {}
}, 400);

function tickProgress() {
  if (finished) return;
  const elapsed = performance.now() - splashStart;
  const target = Math.min(95, (elapsed / SPLASH_DURATION_MS) * 95);
  setVisualProgress(target);

  // Etapas do loading → SFX de transição entre elas
  const msgTarget = Math.min(
    statusMessages.length - 1,
    Math.floor((elapsed / SPLASH_DURATION_MS) * statusMessages.length),
  );
  if (msgTarget > messageIndex) {
    setStage(msgTarget, { withSfx: true });
  }

  // Ambient glitchs leves no meio do loading (entre as etapas)
  if (elapsed - lastAmbient > 320 + Math.random() * 380) {
    lastAmbient = elapsed;
    if (Math.random() > 0.25) {
      try { sfx.ambient?.(); } catch {}
      if (Math.random() > 0.55) {
        try { cinema.triggerBurst(false); } catch {}
      }
    }
  }

  // Marcos de progresso (25 / 50 / 75)
  const milestone = Math.floor(progress / 25) * 25;
  if (milestone >= 25 && milestone > lastMilestone && milestone < 100) {
    lastMilestone = milestone;
    try {
      sfx.burst?.(milestone >= 50);
      cinema.triggerBurst(milestone >= 75);
    } catch {}
  }

  requestAnimationFrame(tickProgress);
}

tickProgress();

if (window.recreate) {
  window.recreate.onProgress((data) => {
    if (data.message && !finished) {
      statusText.textContent = data.message;
      statusText.dataset.glitch = data.message;
    }
  });
}

setTimeout(() => {
  finished = true;
  setVisualProgress(100);
  statusText.textContent = 'Ruptura completa.';
  statusText.dataset.glitch = 'Ruptura completa.';
  contentLayer?.classList.add('ready');
  try { sfx.finish(); } catch {}
  cinema.finishLoad();
  setTimeout(() => {
    try { window.recreate?.splashDone?.(); } catch {}
  }, 600);
}, SPLASH_DURATION_MS);
