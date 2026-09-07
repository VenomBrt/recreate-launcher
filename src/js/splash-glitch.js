/**
 * Splash — Ruptura do Universo
 * Glitch destrutivo em tela cheia. Calmo → tensão → ruptura.
 */
class SplashCinemaGlitch {
  constructor(container) {
    this.container = container;
    this.contentLayer = container.querySelector('#content-layer');
    this.statusEl = container.querySelector('#status-text');
    this.titleEl = container.querySelector('.splash-title');
    this.logoEl = container.querySelector('.logo');
    this.dispMap = null;

    this.canvas = null;
    this.ctx = null;
    this.overlay = null;
    this.raf = null;
    this.active = false;
    this.frame = 0;
    this.time = 0;
    this.intensity = 0;
    this.loadProgress = 0;
    this.startTime = 0;
    this.inBurst = false;
    this.burstTimeout = null;
    this.tensionTimeout = null;
    this.ruptureAnim = null;
    /** Duração da curva de intensidade (ms) — splash.js define */
    this.durationMs = 4500;
  }

  init() {
    if (this.overlay) return;

    this.dispMap = document.getElementById('rupture-disp');

    this.overlay = document.createElement('div');
    this.overlay.className = 'glitch-overlay visible';
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
    document.body.appendChild(this.overlay);

    this.canvas = this.overlay.querySelector('.glitch-canvas');
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.resize();
    window.addEventListener('resize', () => this.resize());

    this.prepareTargets();
  }

  prepareTargets() {
    if (this.titleEl) {
      this.titleEl.dataset.glitch = this.titleEl.textContent.trim();
      this.titleEl.classList.add('glitch-text-live');
    }
    if (this.logoEl) {
      this.logoEl.dataset.glitchImg = '1';
      this.logoEl.classList.add('glitch-img-live');
    }
    if (this.statusEl) {
      this.statusEl.dataset.glitch = this.statusEl.textContent.trim();
      this.statusEl.classList.add('glitch-text-live');
    }
  }

  resize() {
    if (!this.canvas) return;
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  smoothstep(e0, e1, x) {
    const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  }

  getProgressNorm() {
    const elapsed = performance.now() - this.startTime;
    const dur = this.durationMs || 4500;
    // Só pelo tempo — loadProgress não acelera os glitchs
    return Math.max(0, Math.min(1, elapsed / dur));
  }

  /** 0–25% calmo → 25–100% só sobe até ruptura máxima */
  getIntensity() {
    const t = this.getProgressNorm();

    if (t < 0.25) {
      return 0.03 + (t / 0.25) * 0.14;
    }

    const local = (t - 0.25) / 0.75;
    const ramp = Math.pow(this.smoothstep(0, 1, local), 0.65);
    return Math.min(1, 0.17 + ramp * 0.83);
  }

  getPhase() {
    const t = this.getProgressNorm();
    if (t < 0.25) return 'calm';
    if (t < 0.58) return 'rise';
    return 'rupture';
  }

  setProgress(p) {
    this.loadProgress = Math.max(0, Math.min(100, p));
  }

  notifyIcon(intensity) {
    if (intensity <= 0) {
      window.recreate?.setGlitchIntensity?.(0);
      return;
    }
    window.recreate?.setGlitchIntensity?.(intensity);
    if (intensity > 0.72) window.recreate?.glitchIcon?.(intensity, 'heavy');
    else if (intensity > 0.2) window.recreate?.glitchIcon?.(intensity, 'normal');
  }

  updateVisuals() {
    this.intensity = this.getIntensity();
    const i = this.intensity;
    const phase = this.getPhase();

    this.container.dataset.phase = phase;
    this.container.style.setProperty('--rupture', i.toFixed(3));

    if (this.overlay) {
      this.overlay.style.setProperty('--rupture', i.toFixed(3));
    }

    const distort = this.overlay?.querySelector('.glitch-distort');
    if (distort) {
      const show = i > 0.22 || this.inBurst;
      distort.classList.toggle('rupture-drift', show && !this.inBurst);
      distort.style.opacity = String(show ? 0.12 + i * 0.5 : 0);
    }

    const chroma = this.overlay?.querySelector('.glitch-chromatic');
    if (chroma && !this.inBurst) {
      chroma.style.opacity = String(0.08 + i * 0.35);
    }

    if (this.dispMap && !this.inBurst) {
      this.dispMap.setAttribute('scale', String(Math.floor(i * 14)));
    }

    if (this.contentLayer && !this.inBurst) {
      if (i > 0.22) {
        this.contentLayer.style.filter = `url(#rupture-wave)`;
        const sx = Math.sin(this.time * 9) * i * 1.5;
        const sy = Math.sin(this.time * 6) * i * 0.8;
        this.contentLayer.style.transform = `translate(${sx}px, ${sy}px)`;
      } else {
        this.contentLayer.style.filter = '';
        this.contentLayer.style.transform = '';
      }
    }
  }

  start() {
    this.init();
    this.active = true;
    this.startTime = performance.now();
    this.loadProgress = 0;
    this.container.classList.add('glitch-active', 'glitch-mode-splash', 'splash-rupture-live');
    document.body.classList.add('glitch-active', 'glitch-mode-splash');
    this.loop();
    this.scheduleBurst();
    this.scheduleTension();
    this.notifyIcon(0.1);
    // Primeiros glitchs cedo pra não parecer “parado”
    setTimeout(() => { if (this.active) this.triggerBurst(false); }, 900);
    setTimeout(() => { if (this.active) this.triggerBurst(false); }, 2200);
  }

  stop() {
    this.active = false;
    this.container.classList.remove(
      'glitch-active', 'glitch-mode-splash', 'splash-rupture-live',
      'glitch-burst', 'glitch-heavy', 'glitch-rupture'
    );
    document.body.classList.remove(
      'glitch-active', 'glitch-mode-splash',
      'glitch-burst', 'glitch-heavy', 'glitch-rupture'
    );
    this.container.removeAttribute('data-phase');
    if (this.raf) cancelAnimationFrame(this.raf);
    if (this.burstTimeout) clearTimeout(this.burstTimeout);
    if (this.tensionTimeout) clearTimeout(this.tensionTimeout);
    if (this.ruptureAnim) cancelAnimationFrame(this.ruptureAnim);
    this.overlay?.remove();
    this.overlay = null;
    this.canvas = null;
    if (this.contentLayer) {
      this.contentLayer.style.filter = '';
      this.contentLayer.style.transform = '';
    }
    this.notifyIcon(0);
  }

  scheduleBurst() {
    if (!this.active) return;
    const i = this.getIntensity();
    const phase = this.getPhase();

    let delay;
    let chance;
    let heavy;

    if (phase === 'calm') {
      delay = 700 + Math.random() * 900;
      chance = 0.55;
      heavy = 0.12;
    } else if (phase === 'rise') {
      delay = 420 - i * 120 + Math.random() * 280;
      chance = 0.75 + i * 0.2;
      heavy = 0.3 + i * 0.4;
    } else {
      delay = 220 + Math.random() * 280;
      chance = 0.97;
      heavy = 0.6 + i * 0.35;
    }

    this.burstTimeout = setTimeout(() => {
      if (!this.active) return;
      if (Math.random() < chance) this.triggerBurst(Math.random() < heavy);
      if (phase === 'rupture' && Math.random() < 0.5 + i * 0.35) {
        setTimeout(() => this.triggerBurst(Math.random() < 0.7), 60 + Math.random() * 80);
      }
      this.scheduleBurst();
    }, delay);
  }

  scheduleTension() {
    if (!this.active) return;
    const i = this.getIntensity();
    const phase = this.getPhase();
    const delay = phase === 'calm' ? 2200 : phase === 'rise' ? 900 - i * 250 : 450;

    this.tensionTimeout = setTimeout(() => {
      if (!this.active) return;
      if (phase !== 'calm') {
        TextRupture.ruptureElement(this.titleEl, {
          intensity: i, duration: 120 + i * 50, invertStyle: i > 0.5, modes: ['invert', 'swap'],
        });
        if (Math.random() < i) {
          TextRupture.ruptureElement(this.statusEl, { intensity: i, modes: ['invert', 'mirror'] });
        }
        if (Math.random() < i * 0.8) this.distortImage(this.logoEl);
      }
      this.scheduleTension();
    }, delay + Math.random() * 400);
  }

  animateRupture(heavy) {
    if (!this.dispMap || !this.contentLayer) return;
    const peak = heavy ? 38 : 22;
    let start = null;
    const dur = heavy ? 280 : 180;

    const step = (ts) => {
      if (!start) start = ts;
      const p = Math.min(1, (ts - start) / dur);
      const wave = Math.sin(p * Math.PI);
      const scale = wave * peak * (0.5 + this.intensity * 0.5);
      this.dispMap.setAttribute('scale', String(scale));
      if (p < 1) {
        this.ruptureAnim = requestAnimationFrame(step);
      } else {
        this.dispMap.setAttribute('scale', String(Math.floor(this.intensity * 14)));
      }
    };
    if (this.ruptureAnim) cancelAnimationFrame(this.ruptureAnim);
    this.ruptureAnim = requestAnimationFrame(step);
  }

  triggerBurst(heavy = false) {
    const i = this.intensity || this.getIntensity();
    const isHeavy = heavy || (this.getPhase() === 'rupture' && i > 0.7);

    try {
      window.glitchSfx?.burst?.(isHeavy);
    } catch {}

    this.inBurst = true;
    this.container.classList.add('glitch-burst');
    document.body.classList.add('glitch-burst');
    if (isHeavy) {
      this.container.classList.add('glitch-heavy', 'glitch-rupture');
      document.body.classList.add('glitch-heavy', 'glitch-rupture');
    }

    const distort = this.overlay?.querySelector('.glitch-distort');
    distort?.classList.add('active');

    const signal = this.overlay?.querySelector('.glitch-signal-loss');
    if (isHeavy || i > 0.45) {
      signal?.classList.add('active');
      setTimeout(() => signal?.classList.remove('active'), 260);
    }

    const chroma = this.overlay?.querySelector('.glitch-chromatic');
    chroma?.classList.add('cinema-hit');
    setTimeout(() => chroma?.classList.remove('cinema-hit'), 320);

    const flash = this.overlay?.querySelector('.glitch-flash');
    if (isHeavy || Math.random() > 0.35) {
      flash?.classList.add('active');
      setTimeout(() => flash?.classList.remove('active'), 100);
    }

    this.overlay?.querySelectorAll('.glitch-bars').forEach((bar, idx) => {
      bar.style.setProperty('--bar-y', `${8 + Math.random() * 84}%`);
      bar.classList.add('flash');
      setTimeout(() => bar.classList.remove('flash'), 160 + idx * 30);
    });

    if (this.contentLayer) {
      this.contentLayer.style.filter = isHeavy ? 'url(#rupture-heavy)' : 'url(#rupture-wave)';
      const skew = (Math.random() - 0.5) * (isHeavy ? 5 : 2.5) * (0.5 + i);
      const tx = (Math.random() - 0.5) * (isHeavy ? 22 : 12) * (0.5 + i);
      this.contentLayer.style.transform =
        `perspective(800px) skewX(${skew}deg) translateX(${tx}px) translateY(${(Math.random() - 0.5) * 6}px)`;
    }

    this.animateRupture(isHeavy);
    TextRupture.ruptureElement(this.titleEl, {
      intensity: i, duration: 140 + i * 70, invertStyle: true, modes: ['invert', 'swap', 'reverse'],
    });
    TextRupture.ruptureElement(this.statusEl, { intensity: i * 0.9, duration: 120 + i * 50, modes: ['invert', 'mirror'] });
    this.distortImage(this.logoEl);

    if (isHeavy || i > 0.5) this.notifyIcon(i);

    const dur = (isHeavy ? 320 : 200) + i * 50;
    setTimeout(() => {
      this.container.classList.remove('glitch-burst', 'glitch-heavy', 'glitch-rupture');
      document.body.classList.remove('glitch-burst', 'glitch-heavy', 'glitch-rupture');
      distort?.classList.remove('active');
      this.inBurst = false;
      if (this.contentLayer && this.intensity > 0.35) {
        this.contentLayer.style.filter = 'url(#rupture-wave)';
      } else if (this.contentLayer) {
        this.contentLayer.style.filter = '';
        this.contentLayer.style.transform = '';
      }
    }, dur);
  }

  /** Finaliza load com ruptura de letras antes de fechar */
  finishLoad() {
    TextRupture.ruptureElement(this.titleEl, {
      intensity: 1, duration: 320, invertStyle: true, modes: ['invert', 'swap'],
    });
    TextRupture.ruptureElement(this.statusEl, {
      intensity: 0.95, duration: 260, invertStyle: true, modes: ['invert', 'reverse'],
    });
    this.triggerBurst(true);
    setTimeout(() => this.triggerBurst(true), 150);
    setTimeout(() => this.stop(), 750);
  }

  distortImage(img) {
    if (!img) return;
    img.classList.add('glitch-img-corrupt');
    img.style.setProperty('--glitch-x', `${(Math.random() - 0.5) * 18}px`);
    img.style.setProperty('--glitch-y', `${(Math.random() - 0.5) * 12}px`);
    img.style.setProperty('--glitch-hue', `${Math.floor(Math.random() * 120 - 60)}deg`);
    setTimeout(() => {
      img.classList.remove('glitch-img-corrupt');
      img.style.removeProperty('--glitch-x');
      img.style.removeProperty('--glitch-y');
      img.style.removeProperty('--glitch-hue');
    }, 90 + Math.random() * 100);
  }

  loop() {
    if (!this.active) return;
    this.frame++;
    this.time = performance.now() * 0.001;
    if (this.frame % 3 === 0) {
      this.updateVisuals();
      if (this.frame % 15 === 0) this.notifyIcon(this.intensity);
    }
    this.render();
    this.raf = requestAnimationFrame(() => this.loop());
  }

  render() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const i = this.intensity;
    if (!ctx || !w || !h) return;

    ctx.clearRect(0, 0, w, h);

    const sliceChance = 0.88 - i * 0.22;
    if (Math.random() > sliceChance) {
      const y = Math.random() * h;
      const gh = (Math.random() * (18 + i * 55) + 2);
      const offset = (Math.random() - 0.5) * (20 + i * 55);
      try {
        const band = ctx.getImageData(0, y, w, gh);
        ctx.putImageData(band, offset, y);
        if (Math.random() > 0.45) ctx.putImageData(band, -offset * 0.7, y);
      } catch { /* canvas security */ }
    }

    if (i > 0.22 && Math.random() > 0.9) {
      const ty = Math.random() * h;
      const th = 3 + Math.random() * (12 + i * 20);
      const shift = (Math.random() - 0.5) * (40 + i * 80);
      try {
        const tear = ctx.getImageData(0, ty, w, th);
        ctx.putImageData(tear, shift, ty);
      } catch { /* */ }
      ctx.fillStyle = `rgba(255,0,255,${0.08 + i * 0.14})`;
      ctx.fillRect(shift, ty, w, 1);
      ctx.fillStyle = `rgba(0,255,255,${0.06 + i * 0.1})`;
      ctx.fillRect(shift, ty + th - 1, w, 1);
    }

    if (Math.random() > 0.91 - i * 0.08) {
      ctx.fillStyle = `rgba(255,255,255,${(0.04 + i * 0.08) * Math.random()})`;
      const n = 2 + Math.floor(i * 10);
      for (let p = 0; p < n; p++) {
        ctx.fillRect(Math.random() * w, Math.random() * h, 40 + Math.random() * 200, 1);
      }
    }

    if (i > 0.28 && Math.random() > 0.93) {
      const bh = 10 + Math.random() * (40 + i * 60);
      const by = Math.random() * (h - bh);
      ctx.fillStyle = `rgba(123,47,247,${0.06 + i * 0.1})`;
      ctx.fillRect(0, by, w, bh);
      ctx.fillStyle = `rgba(255,0,255,${0.12 + i * 0.18})`;
      ctx.fillRect(0, by, w, 1);
      ctx.fillStyle = `rgba(0,255,255,${0.08 + i * 0.12})`;
      ctx.fillRect(0, by + bh, w, 1);
    }

    if (this.frame % 2 === 0 && i > 0.25) {
      const scanY = (this.frame * (1.8 + i * 2)) % h;
      ctx.fillStyle = `rgba(224,64,251,${0.03 + i * 0.05})`;
      ctx.fillRect(0, scanY, w, 2 + i * 2);
    }

    if (i > 0.22 && this.frame % 2 === 0) {
      const flakes = Math.floor(2 + i * 12);
      for (let n = 0; n < flakes; n++) {
        if (Math.random() > 0.4) {
          ctx.fillStyle = `rgba(255,255,255,${Math.random() * (0.04 + i * 0.08)})`;
          ctx.fillRect(Math.random() * w, Math.random() * h, 1, 1);
        }
      }
    }
  }
}

window.SplashCinemaGlitch = SplashCinemaGlitch;
