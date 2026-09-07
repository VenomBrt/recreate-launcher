/**
 * Glitch contínuo do título RECREATE na aba Jogar.
 */
class PlayTitleGlitch {
  constructor() {
    this.title = null;
    this.wrap = null;
    this.logoWrap = null;
    this.logo = null;
    this.timer = null;
    this.active = false;
  }

  init() {
    this.title = document.getElementById('play-recreate-title');
    this.wrap = document.getElementById('play-title-wrap');
    this.logoWrap = document.getElementById('play-logo-wrap');
    this.logo = document.getElementById('play-logo');
    if (this.title) TextRupture.register(this.title);
  }

  isPlayVisible() {
    return document.getElementById('page-play')?.classList.contains('active');
  }

  start() {
    this.init();
    if (this.active) return;
    this.active = true;
    this.schedule();
  }

  stop() {
    this.active = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.wrap?.classList.remove('play-title-chroma', 'play-title-hit');
    this.logoWrap?.classList.remove('play-logo-glitch-hit');
  }

  schedule() {
    if (!this.active) return;
    const delay = 4500 + Math.random() * 4500;
    this.timer = setTimeout(() => {
      // Só anima/sfx se a janela estiver em primeiro plano
      if (this.isPlayVisible() && !document.hidden && !window.glitchSfx?.isMuted?.()) {
        this.tick();
      }
      this.schedule();
    }, delay);
  }

  tick() {
    if (!this.title) return;
    // Sem SFX se minimizado / bandeja / aba oculta
    if (document.hidden || window.glitchSfx?.isMuted?.()) {
      // Visual leve ainda ok? User pediu sem som — visual pode continuar quiet
    } else if (Math.random() < 0.55) {
      try { window.glitchSfx?.tick?.(); } catch {}
    }

    TextRupture.jitterElement(this.title, {
      intensity: 0.35 + Math.random() * 0.35,
      duration: 110 + Math.random() * 70,
    });

    if (Math.random() < 0.72) {
      TextRupture.scrambleGlitch(this.title, {
        intensity: 0.4 + Math.random() * 0.35,
        duration: 130 + Math.random() * 100,
      });
    }

    this.wrap?.classList.add('play-title-chroma');
    setTimeout(() => this.wrap?.classList.remove('play-title-chroma'), 160 + Math.random() * 120);

    if (this.logo && Math.random() < 0.45) {
      this.logoWrap?.classList.add('play-logo-glitch-hit');
      setTimeout(() => this.logoWrap?.classList.remove('play-logo-glitch-hit'), 140 + Math.random() * 100);
    }
  }

  /** Burst forte — loading / transição voltando pra Jogar */
  burst() {
    if (!this.title) this.init();
    if (!this.title) return;
    try { window.glitchSfx?.burst?.(true); } catch {}

    TextRupture.jitterElement(this.title, { intensity: 0.85, duration: 200 });
    TextRupture.scrambleGlitch(this.title, { intensity: 0.9, duration: 220 });
    TextRupture.transformElement(this.title, { intensity: 0.75, duration: 180, modes: ['scramble', 'invert'] });

    this.wrap?.classList.add('play-title-chroma', 'play-title-hit');
    this.logoWrap?.classList.add('play-logo-glitch-hit');
    setTimeout(() => {
      this.wrap?.classList.remove('play-title-chroma', 'play-title-hit');
      this.logoWrap?.classList.remove('play-logo-glitch-hit');
    }, 280);
  }
}

window.PlayTitleGlitch = PlayTitleGlitch;

function notifyIconGlitch(intensity = 0.88, mode = 'normal') {
  if (mode === 'heavy' || mode === 'storm') {
    window.recreate?.glitchIcon?.(intensity, mode);
    return;
  }
  const now = Date.now();
  if (!notifyIconGlitch._last) notifyIconGlitch._last = 0;
  if (now - notifyIconGlitch._last < 70) return;
  notifyIconGlitch._last = now;
  window.recreate?.glitchIcon?.(intensity, mode);
}

window.notifyIconGlitch = notifyIconGlitch;
