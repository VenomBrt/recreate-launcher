/**
 * Cinematic Glitch Engine — modes: default | cinema | splash | transition
 */
class GlitchEngine {
  constructor(options = {}) {
    this.intensity = options.intensity || 1;
    this.mode = options.mode || 'default';
    this.canvas = null;
    this.ctx = null;
    this.raf = null;
    this.active = false;
    this.burstTimer = null;
    this.microBurstTimer = null;
    this.container = options.container || document.body;
    this.frame = 0;
    this.progress = 0;
    this.lastProgressPulse = 0;
    this.transitionTimer = null;
  }

  get isCinema() { return this.mode === 'cinema'; }
  get isSplash() { return this.mode === 'splash'; }
  get isTransition() { return this.mode === 'transition'; }
  get isSoft() { return this.isCinema; }

  init() {
    if (this.canvas) return;

    this.overlay = document.createElement('div');
    this.overlay.className = 'glitch-overlay';
    this.overlay.innerHTML = `
      <div class="glitch-vhs"></div>
      <div class="glitch-scanlines"></div>
      <div class="glitch-noise"></div>
      <div class="glitch-chromatic"></div>
      <div class="glitch-distort"></div>
      <div class="glitch-signal-loss"></div>
      <div class="glitch-vignette"></div>
      <div class="glitch-bars"></div>
      <div class="glitch-bars glitch-bars-2"></div>
      <div class="glitch-flash"></div>
      <canvas class="glitch-canvas"></canvas>
    `;
    this.container.appendChild(this.overlay);

    this.canvas = this.overlay.querySelector('.glitch-canvas');
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.applyContentGlitch();
  }

  resize() {
    if (!this.canvas) return;
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  applyContentGlitch() {
    TextRupture.registerAll(this.container);

    this.container.querySelectorAll('img').forEach((img) => {
      if (img.closest('.glitch-overlay') || img.dataset.glitchImg) return;
      img.dataset.glitchImg = '1';
      img.classList.add('glitch-img-live');
    });
  }

  setProgress(percent) {
    this.progress = Math.max(0, Math.min(100, percent));
    if (this.isCinema && this.overlay) {
      this.overlay.style.setProperty('--glitch-progress', `${this.progress}%`);
    }
  }

  pulseOnProgress() {
    if (!this.active || !this.isCinema) return;
    const now = Date.now();
    if (now - this.lastProgressPulse < 280) return;
    this.lastProgressPulse = now;
    this.triggerBurst(false);
  }

  _setModeClass() {
    this.container.classList.remove('glitch-mode-cinema', 'glitch-mode-splash', 'glitch-mode-transition');
    if (this.isCinema) this.container.classList.add('glitch-mode-cinema');
    if (this.isSplash) this.container.classList.add('glitch-mode-splash');
    if (this.isTransition) this.container.classList.add('glitch-mode-transition');
  }

  start() {
    this.init();
    this.active = true;
    this.container.classList.add('glitch-active');
    this._setModeClass();
    this.overlay.classList.add('visible');
    // Cinema: só CSS/overlay — sem canvas RAF contínuo (comia CPU no carregamento)
    if (!this.isCinema) {
      this.loop();
      this.scheduleMicroBursts();
    }
    this.scheduleBursts();
    const delay = this.isSplash ? 300 : this.isCinema ? 900 : 400;
    setTimeout(() => this.triggerBurst(this.isCinema ? false : true), delay);
  }

  stop() {
    this.active = false;
    this.container.classList.remove(
      'glitch-active', 'glitch-burst', 'glitch-heavy',
      'glitch-mode-cinema', 'glitch-mode-splash', 'glitch-mode-transition',
      'glitch-cinema-pulse', 'glitch-transition-pulse'
    );
    if (this.overlay) this.overlay.classList.remove('visible');
    if (this.raf) cancelAnimationFrame(this.raf);
    if (this.burstTimer) clearInterval(this.burstTimer);
    if (this.microBurstTimer) clearInterval(this.microBurstTimer);
    if (this.transitionTimer) clearTimeout(this.transitionTimer);
    this.overlay?.querySelector('.glitch-distort')?.classList.remove('active');
  }

  /** One-shot burst for tab transitions — leve, sem cascata infinita */
  playTransition() {
    this.init();
    this.active = true;
    this.mode = 'transition';
    try { window.glitchSfx?.transition?.(); } catch {}
    this.container.classList.add(
      'glitch-active', 'glitch-mode-transition',
      'glitch-burst', 'glitch-heavy', 'glitch-transition-pulse'
    );
    this.overlay.classList.add('visible');

    const distort = this.overlay.querySelector('.glitch-distort');
    const flash = this.overlay?.querySelector('.glitch-flash');
    const chromatic = this.overlay?.querySelector('.glitch-chromatic');
    distort?.classList.add('active');
    flash?.classList.add('active');
    chromatic?.classList.add('cinema-hit');

    TextRupture.transitionBurst(this.container, { count: 4 });

    let frames = 0;
    const maxFrames = 16;

    const tick = () => {
      if (frames >= maxFrames) {
        this.finishTransition(distort, flash, chromatic);
        return;
      }
      frames++;
      this.renderFrame();
      this.raf = requestAnimationFrame(tick);
    };

    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(tick);

    this.transitionTimer = setTimeout(() => {
      this.finishTransition(distort, flash, chromatic);
    }, 420);
  }

  finishTransition(distort, flash, chromatic) {
    if (this.transitionTimer) {
      clearTimeout(this.transitionTimer);
      this.transitionTimer = null;
    }
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = null;
    this.active = false;
    this.container.classList.remove(
      'glitch-active', 'glitch-mode-transition',
      'glitch-burst', 'glitch-heavy', 'glitch-transition-pulse'
    );
    this.overlay?.classList.remove('visible');
    if (!distort) distort = this.overlay?.querySelector('.glitch-distort');
    if (!flash) flash = this.overlay?.querySelector('.glitch-flash');
    if (!chromatic) chromatic = this.overlay?.querySelector('.glitch-chromatic');
    distort?.classList.remove('active');
    flash?.classList.remove('active');
    chromatic?.classList.remove('cinema-hit');
  }

  corruptBurst(count = 3) {
    for (let i = 0; i < count; i++) {
      setTimeout(() => {
        TextRupture.ruptureBurst(this.container, TextRupture.SELECTOR, {
          tier: 'light',
          intensity: 0.3,
          count: 1,
        });
        this.corruptRandomImage();
      }, i * 40);
    }
  }

  scheduleBursts() {
    if (this.isTransition) return;
    // Cinema: bem mais espaçado pra não comer CPU no carregamento
    const base = this.isSplash ? 1100 : this.isCinema ? 4500 : 1400;
    const interval = Math.max(900, base - this.intensity * 150);
    this.burstTimer = setInterval(() => {
      if (!this.active) return;
      const heavyChance = this.isSplash ? 0.45 : this.isCinema ? 0.9 : 0.7;
      this.triggerBurst(Math.random() > heavyChance);
      if (!this.isCinema || Math.random() > 0.75) {
        TextRupture.ruptureBurst(this.container, TextRupture.SELECTOR, {
          tier: 'light',
          intensity: this.intensity * 0.35,
          count: 1,
        });
      }
      if (this.isSplash && Math.random() > 0.4) this.corruptRandomImage();
    }, interval + Math.random() * (this.isSplash ? 900 : this.isCinema ? 1800 : 600));
  }

  scheduleMicroBursts() {
    if (this.isTransition || this.isCinema) return;
    const base = this.isSplash ? 220 : 180;
    this.microBurstTimer = setInterval(() => {
      if (!this.active) return;
      const chance = this.isSplash ? 0.42 : 0.55;
      if (Math.random() > chance) this.triggerMicroGlitch();
    }, base + Math.random() * (this.isSplash ? 400 : 320));
  }

  triggerBurst(heavy = false) {
    try { window.glitchSfx?.burst?.(!!heavy); } catch {}
    this.applyContentGlitch();
    this.container.classList.add('glitch-burst');
    if (heavy) {
      this.container.classList.add('glitch-heavy');
      if (this.isTransition) {
        window.notifyIconGlitch?.(1, 'heavy');
      }
      if (this.isCinema && document.getElementById('page-play')?.classList.contains('active')) {
        window.playTitleGlitchInstance?.burst?.();
      }
    }
    if (this.isCinema) this.container.classList.add('glitch-cinema-pulse');
    if (this.isTransition) this.container.classList.add('glitch-transition-pulse');

    const burstCount = this.isTransition ? 4
      : this.isSplash ? (heavy ? 4 : 2)
      : this.isCinema ? (heavy ? 2 : 1)
      : (heavy ? 5 : 3);

    for (let i = 0; i < burstCount; i++) {
      setTimeout(() => {
        if (this.isCinema && Math.random() > 0.5) {
          TextRupture.ruptureBurst(this.container, TextRupture.SELECTOR, { tier: 'light', intensity: 0.3, count: 1 });
        } else if (!this.isCinema) {
          if (!this.isTransition) {
            TextRupture.ruptureBurst(this.container, TextRupture.SELECTOR, { tier: 'light', intensity: 0.4, count: 1 });
          }
          if (Math.random() > 0.35) this.corruptRandomImage();
        }
      }, i * (this.isTransition ? 45 : this.isSplash ? 50 : this.isCinema ? 60 : 35));
    }

    const bars = this.overlay?.querySelectorAll('.glitch-bars');
    bars?.forEach((bar, i) => {
      bar.style.setProperty('--bar-y', `${10 + Math.random() * 80}%`);
      bar.classList.add('flash');
      setTimeout(() => bar.classList.remove('flash'), 150 + i * 40);
    });

    const flash = this.overlay?.querySelector('.glitch-flash');
    if (flash && (heavy || Math.random() > (this.isSoft ? 0.7 : 0.45))) {
      flash.classList.add('active');
      setTimeout(() => flash.classList.remove('active'), this.isTransition ? 100 : this.isSoft ? 120 : 80);
    }

    const signal = this.overlay?.querySelector('.glitch-signal-loss');
    if (signal && heavy && (this.isSplash || this.isTransition)) {
      signal.classList.add('active');
      setTimeout(() => signal.classList.remove('active'), 220);
    }

    const chromatic = this.overlay?.querySelector('.glitch-chromatic');
    if (chromatic && (this.isSplash || this.isTransition || this.isCinema)) {
      chromatic.classList.add('cinema-hit');
      setTimeout(() => chromatic.classList.remove('cinema-hit'), this.isTransition ? 320 : 280);
    }

    const distort = this.overlay?.querySelector('.glitch-distort');
    if (distort && (this.isSplash || this.isTransition) && heavy) {
      distort.classList.add('active');
      setTimeout(() => distort.classList.remove('active'), 300);
    }

    const dur = this.isTransition ? 360
      : this.isSplash ? (heavy ? 280 : 180)
      : this.isCinema ? (heavy ? 320 : 200)
      : (heavy ? 220 : 140);

    setTimeout(() => {
      this.container.classList.remove('glitch-burst', 'glitch-heavy', 'glitch-cinema-pulse', 'glitch-transition-pulse');
    }, dur);
  }

  triggerMicroGlitch() {
    this.container.classList.add('glitch-micro');
    if (!this.isCinema) {
      if (Math.random() > 0.4) {
        TextRupture.ruptureBurst(this.container, TextRupture.SELECTOR, {
          tier: 'light',
          intensity: 0.28,
          duration: 90,
        });
      }
      if (Math.random() > 0.45) this.corruptRandomImage();
    }
    setTimeout(() => this.container.classList.remove('glitch-micro'), this.isSplash ? 70 : this.isCinema ? 90 : 60);
  }

  corruptRandomText() {
    TextRupture.ruptureBurst(this.container, TextRupture.SELECTOR, {
      tier: 'light',
      intensity: this.isSoft ? 0.3 : 0.45,
      count: 1,
    });
  }

  corruptRandomImage() {
    const imgs = this.container.querySelectorAll('.glitch-img-live, .logo');
    if (!imgs.length) return;
    const img = imgs[Math.floor(Math.random() * imgs.length)];
    img.classList.add('glitch-img-corrupt');
    img.style.setProperty('--glitch-x', `${(Math.random() - 0.5) * 14}px`);
    img.style.setProperty('--glitch-y', `${(Math.random() - 0.5) * 10}px`);
    img.style.setProperty('--glitch-hue', `${Math.floor(Math.random() * 180 - 90)}deg`);
    setTimeout(() => {
      img.classList.remove('glitch-img-corrupt');
      img.style.removeProperty('--glitch-x');
      img.style.removeProperty('--glitch-y');
      img.style.removeProperty('--glitch-hue');
    }, 60 + Math.random() * 100);
  }

  loop() {
    if (!this.active) return;
    this.frame++;
    this.renderFrame();
    this.raf = requestAnimationFrame(() => this.loop());
  }

  renderFrame() {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const ctx = this.ctx;
    const i = this.intensity;
    const soft = this.isSoft;
    const splash = this.isSplash;
    const trans = this.isTransition;

    ctx.clearRect(0, 0, w, h);

    const sliceChance = trans ? 0.82
      : splash ? 0.86
      : soft ? 0.96
      : 0.88 - i * 0.08;

    if (Math.random() > sliceChance) {
      const y = Math.random() * h;
      const gh = (Math.random() * (trans ? 45 : splash ? 50 : soft ? 28 : 60) + 2) * i;
      const offset = (Math.random() - 0.5) * (trans ? 38 : splash ? 42 : soft ? 22 : 50) * i;
      const isCyan = Math.random() > 0.5;
      const alpha = soft ? Math.random() * 0.08 * i : Math.random() * (splash || trans ? 0.14 : 0.18) * i;
      ctx.fillStyle = `rgba(${isCyan ? '0,255,255' : '255,0,255'}, ${alpha})`;
      ctx.fillRect(0, y, w, gh);
      try {
        const imageData = ctx.getImageData(0, y, w, gh);
        ctx.putImageData(imageData, offset, y);
        if (!soft && Math.random() > 0.4) {
          ctx.putImageData(imageData, -offset * 0.65, y);
        }
      } catch {}
    }

    // Horizontal tear distortion
    if ((splash || trans) && Math.random() > 0.93) {
      const ty = Math.random() * h;
      const th = 4 + Math.random() * 20;
      const shift = (Math.random() - 0.5) * 60;
      try {
        const tear = ctx.getImageData(0, ty, w, th);
        ctx.putImageData(tear, shift, ty);
      } catch {}
    }

    if (Math.random() > (soft ? 0.96 : splash ? 0.88 : 0.9)) {
      ctx.fillStyle = `rgba(255, 255, 255, ${Math.random() * (soft ? 0.04 : splash ? 0.07 : 0.08) * i})`;
      const count = soft ? 2 + Math.floor(Math.random() * 5)
        : splash || trans ? 3 + Math.floor(Math.random() * 8)
        : 4 + Math.floor(Math.random() * 12);
      for (let n = 0; n < count; n++) {
        ctx.fillRect(Math.random() * w, Math.random() * h, Math.random() * (soft ? 180 : 280) + 20, 1);
      }
    }

    if (!soft && Math.random() > (splash ? 0.9 : 0.94)) {
      const blockH = Math.random() * (splash ? 80 : 120) + 15;
      const by = Math.random() * (h - blockH);
      ctx.fillStyle = `rgba(123, 47, 247, ${0.06 + Math.random() * 0.1})`;
      ctx.fillRect(0, by, w, blockH);
      ctx.fillStyle = `rgba(255, 0, 255, ${0.1 + Math.random() * 0.12})`;
      ctx.fillRect(0, by, w, 1);
    }

    if (Math.random() > (soft ? 0.985 : splash ? 0.96 : 0.97)) {
      const x = Math.random() * w * 0.8;
      const bw = Math.random() * (soft ? 40 : splash ? 60 : 80) + 20;
      ctx.fillStyle = splash ? 'rgba(123, 47, 247, 0.12)' : 'rgba(123, 47, 247, 0.15)';
      ctx.fillRect(x, 0, bw, h);
    }

    if ((soft || splash) && this.frame % 2 === 0) {
      const scanY = (this.frame * (splash ? 2.4 : 1.8)) % h;
      ctx.fillStyle = `rgba(224, 64, 251, ${splash ? 0.045 : 0.03})`;
      ctx.fillRect(0, scanY, w, splash ? 3 : 2);
    }

    if (this.frame % 3 === 0 && Math.random() > (soft ? 0.85 : 0.7)) {
      ctx.fillStyle = `rgba(224, 64, 251, ${Math.random() * (soft ? 0.02 : splash ? 0.035 : 0.04)})`;
      for (let p = 0; p < (soft ? 3 : splash ? 5 : 6); p++) {
        ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
      }
    }
  }
}

window.GlitchEngine = GlitchEngine;
