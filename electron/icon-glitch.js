const { nativeImage, BrowserWindow } = require('electron');

/** Duração fixa — glitch e cor param juntos no mesmo instante */
const LIGHT_PULSE_MS = 140;
const HEAVY_BURST_MS = 420;
const FRAME_MS_LIGHT = 35;
const FRAME_MS_HEAVY = 10;
const FRAME_MS_STORM = 9;

/**
 * normal → glitch de slice (cor original, sem tint)
 * heavy  → glitch + troca de cor (mesma duração, para junto)
 * storm  → heavy contínuo até stopStorm()
 */
class IconGlitch {
  constructor(iconPath) {
    this.iconPath = iconPath;
    this.base = this.loadBaseIcon(iconPath);
    this.lightFrames = [];
    this.heavyFrames = [];
    this.windows = new Set();
    this.ambientTimer = null;
    this.activeGen = 0;
    this.stormGen = 0;
    this.timers = new Set();
    this.getIntensity = () => 0;
    this.mode = 'idle';
    this.srcBitmap = null;

    if (!this.base.isEmpty()) {
      this.srcBitmap = this.base.toBitmap();
      const { width, height } = this.base.getSize();
      this.w = width;
      this.h = height;
      this.lightFrames = this.buildLightFrames();
      this.heavyFrames = this.buildHeavyFrames();
    }
  }

  loadBaseIcon(iconPath) {
    let img = nativeImage.createFromPath(iconPath);
    if (img.isEmpty()) return img;
    const { width, height } = img.getSize();
    if (width !== 256 || height !== 256) {
      img = img.resize({ width: 256, height: 256, quality: 'best' });
    }
    return img;
  }

  schedule(fn, ms) {
    const id = setTimeout(() => {
      this.timers.delete(id);
      fn();
    }, ms);
    this.timers.add(id);
    return id;
  }

  clearTimers() {
    this.timers.forEach((id) => clearTimeout(id));
    this.timers.clear();
  }

  bumpGen() {
    this.activeGen++;
    return this.activeGen;
  }

  /** Copia faixas deslocadas — zero mudança de cor */
  buildLightFrames() {
    const src = this.srcBitmap;
    const w = this.w;
    const h = this.h;
    const frames = [];

    for (let seed = 0; seed < 10; seed++) {
      const dst = Buffer.from(src);
      const bands = 2 + (seed % 4);

      for (let b = 0; b < bands; b++) {
        const y0 = Math.floor((h / bands) * b + (seed * 5) % 6);
        const bh = Math.max(5, Math.floor(h / bands / 1.6) + (seed % 5));
        const shift = ((seed + b) % 5) - 2;
        if (shift === 0) continue;

        for (let y = y0; y < Math.min(y0 + bh, h); y++) {
          for (let x = 0; x < w; x++) {
            const sx = x - shift;
            if (sx < 0 || sx >= w) continue;
            const si = (y * w + sx) * 4;
            const di = (y * w + x) * 4;
            dst[di] = src[si];
            dst[di + 1] = src[si + 1];
            dst[di + 2] = src[si + 2];
            dst[di + 3] = src[si + 3];
          }
        }
      }

      frames.push(nativeImage.createFromBitmap(dst, { width: w, height: h }));
    }

    return frames;
  }

  buildHeavyFrames() {
    const src = this.srcBitmap;
    const w = this.w;
    const h = this.h;
    const frames = [];
    const palettes = [
      { r: 0, g: 255, b: 255 },
      { r: 255, g: 0, b: 255 },
      { r: 180, g: 60, b: 255 },
      { r: 255, g: 80, b: 180 },
      { r: 0, g: 200, b: 255 },
    ];

    for (let seed = 0; seed < 20; seed++) {
      const dst = Buffer.from(src);
      const bands = 4 + (seed % 4);
      const shiftMul = 3 + (seed % 3);

      for (let b = 0; b < bands; b++) {
        const y0 = Math.floor((h / bands) * b + (seed * 7) % 10);
        const bh = Math.max(4, Math.floor(h / bands / 1.1) + (seed % 5));
        const shift = Math.floor(((seed + b) % 9) - 4) * shiftMul;

        for (let y = y0; y < Math.min(y0 + bh, h); y++) {
          for (let x = 0; x < w; x++) {
            const sx = x - shift;
            if (sx < 0 || sx >= w) continue;
            const si = (y * w + sx) * 4;
            const di = (y * w + x) * 4;
            dst[di] = src[si];
            dst[di + 1] = src[si + 1];
            dst[di + 2] = src[si + 2];
            dst[di + 3] = src[si + 3];
          }
        }
      }

      const rgbOff = 2 + (seed % 4);
      for (let y = 0; y < h; y++) {
        for (let x = rgbOff; x < w; x++) {
          const di = (y * w + x) * 4;
          const ri = (y * w + x - rgbOff) * 4;
          dst[di + 2] = src[ri + 2];
        }
        for (let x = 0; x < w - rgbOff; x++) {
          const di = (y * w + x) * 4;
          const gi = (y * w + x + rgbOff) * 4;
          dst[di] = src[gi];
        }
      }

      const pal = palettes[seed % palettes.length];
      const tint = 0.4 + (seed % 4) * 0.12;
      for (let i = 0; i < dst.length; i += 4) {
        if (dst[i + 3] < 15) continue;
        dst[i] = Math.min(255, dst[i] * (1 - tint) + pal.r * tint);
        dst[i + 1] = Math.min(255, dst[i + 1] * (1 - tint) + pal.g * tint);
        dst[i + 2] = Math.min(255, dst[i + 2] * (1 - tint) + pal.b * tint);
      }

      if (seed % 2 === 0) {
        const blockY = Math.floor((seed * 37) % Math.max(1, h - 24));
        const blockH = 10 + (seed % 16);
        for (let y = blockY; y < Math.min(blockY + blockH, h); y++) {
          for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            dst[i] = 255 - dst[i];
            dst[i + 1] = 255 - dst[i + 1];
            dst[i + 2] = 255 - dst[i + 2];
          }
        }
      }

      const barY = Math.floor((seed * 47) % h);
      for (let x = 0; x < w; x++) {
        const i = (barY * w + x) * 4;
        const tone = seed % 3;
        if (tone === 0) { dst[i] = 0; dst[i + 1] = 255; dst[i + 2] = 255; }
        else if (tone === 1) { dst[i] = 255; dst[i + 1] = 0; dst[i + 2] = 255; }
        else { dst[i] = 200; dst[i + 1] = 50; dst[i + 2] = 255; }
        dst[i + 3] = 255;
      }

      frames.push(nativeImage.createFromBitmap(dst, { width: w, height: h }));
    }

    return frames;
  }

  makeLightFrame() {
    if (!this.srcBitmap) return this.base;
    const src = this.srcBitmap;
    const w = this.w;
    const h = this.h;
    const dst = Buffer.from(src);

    for (let band = 0; band < 2 + Math.floor(Math.random() * 2); band++) {
      const shift = (Math.random() > 0.5 ? 1 : -1) * (1 + Math.floor(Math.random() * 2));
      const y0 = Math.floor(Math.random() * (h - 16));
      const bh = 10 + Math.floor(Math.random() * 28);

      for (let y = y0; y < Math.min(y0 + bh, h); y++) {
        for (let x = 0; x < w; x++) {
          const sx = x - shift;
          if (sx < 0 || sx >= w) continue;
          const si = (y * w + sx) * 4;
          const di = (y * w + x) * 4;
          dst[di] = src[si];
          dst[di + 1] = src[si + 1];
          dst[di + 2] = src[si + 2];
          dst[di + 3] = src[si + 3];
        }
      }
    }

    return nativeImage.createFromBitmap(dst, { width: w, height: h });
  }

  makeHeavyFrame(phase = 0) {
    if (!this.srcBitmap) return this.base;
    const src = this.srcBitmap;
    const w = this.w;
    const h = this.h;
    const dst = Buffer.from(src);
    const shift = Math.floor((Math.random() - 0.5) * 20);
    const palettes = [
      { r: 0, g: 255, b: 255 },
      { r: 255, g: 0, b: 255 },
      { r: 160, g: 40, b: 255 },
      { r: 255, g: 50, b: 200 },
    ];
    const pal = palettes[phase % palettes.length];
    const tint = 0.5 + (phase % 3) * 0.15;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const sx = Math.max(0, Math.min(w - 1, x + shift));
        const si = (y * w + sx) * 4;
        const di = (y * w + x) * 4;
        dst[di] = src[si];
        dst[di + 1] = src[si + 1];
        dst[di + 2] = src[si + 2];
        dst[di + 3] = src[si + 3];
      }
    }

    for (let i = 0; i < dst.length; i += 4) {
      if (dst[i + 3] < 15) continue;
      dst[i] = Math.min(255, dst[i] * (1 - tint) + pal.r * tint);
      dst[i + 1] = Math.min(255, dst[i + 1] * (1 - tint) + pal.g * tint);
      dst[i + 2] = Math.min(255, dst[i + 2] * (1 - tint) + pal.b * tint);
    }

    const barY = Math.floor(Math.random() * h);
    for (let x = 0; x < w; x++) {
      const i = (barY * w + x) * 4;
      dst[i] = phase % 2 === 0 ? 0 : 255;
      dst[i + 1] = phase % 2 === 0 ? 255 : 0;
      dst[i + 2] = 255;
      dst[i + 3] = 255;
    }

    return nativeImage.createFromBitmap(dst, { width: w, height: h });
  }

  attach(win) {
    if (win) this.windows.add(win);
  }

  detach(win) {
    this.windows.delete(win);
  }

  setIntensityFn(fn) {
    this.getIntensity = fn;
  }

  applyIcon(img) {
    const targets = new Set(this.windows);
    BrowserWindow.getAllWindows().forEach((w) => targets.add(w));
    targets.forEach((win) => {
      if (!win.isDestroyed()) {
        try { win.setIcon(img); } catch {}
      }
    });
  }

  restoreBase() {
    this.applyIcon(this.base);
  }

  finishEffect(gen, fromMode) {
    if (gen !== this.activeGen) return;
    if (fromMode === 'heavy' && this.mode === 'storm') return;
    this.clearTimers();
    this.mode = 'idle';
    this.restoreBase();
  }

  /** Glitch normal — só slice, cor original, duração fixa */
  pulse() {
    if (!this.lightFrames.length || this.mode === 'storm' || this.mode === 'heavy') return;

    this.clearTimers();
    const gen = this.bumpGen();
    this.mode = 'light';

    const totalFrames = Math.max(2, Math.floor(LIGHT_PULSE_MS / FRAME_MS_LIGHT));
    let frame = 0;

    const tick = () => {
      if (gen !== this.activeGen || this.mode !== 'light') return;

      if (frame >= totalFrames) {
        this.finishEffect(gen, 'light');
        return;
      }

      const img = frame % 2 === 0
        ? this.makeLightFrame()
        : this.lightFrames[1 + (frame % (this.lightFrames.length - 1))];

      this.applyIcon(img);
      frame++;
      this.schedule(tick, FRAME_MS_LIGHT);
    };

    this.schedule(() => {
      if (gen === this.activeGen && this.mode === 'light') {
        this.finishEffect(gen, 'light');
      }
    }, LIGHT_PULSE_MS);

    tick();
  }

  /** Glitch forte — slice + cor, mesma duração, para tudo junto */
  burstHeavy() {
    if (!this.heavyFrames.length) return;

    this.clearTimers();
    const gen = this.bumpGen();
    this.mode = 'heavy';

    const totalFrames = Math.floor(HEAVY_BURST_MS / FRAME_MS_HEAVY);
    let frame = 0;

    const tick = () => {
      if (gen !== this.activeGen || this.mode !== 'heavy') return;

      if (frame >= totalFrames) {
        this.finishEffect(gen, 'heavy');
        return;
      }

      const img = frame % 2 === 0
        ? this.makeHeavyFrame(frame)
        : this.heavyFrames[1 + (frame % (this.heavyFrames.length - 1))];

      this.applyIcon(img);
      frame++;
      this.schedule(tick, FRAME_MS_HEAVY);
    };

    this.schedule(() => {
      if (gen === this.activeGen && this.mode === 'heavy') {
        this.finishEffect(gen, 'heavy');
      }
    }, HEAVY_BURST_MS);

    tick();
  }

  /** Loading — forte contínuo até stopStorm restaurar ícone */
  startStorm() {
    this.stopStorm();
    this.clearTimers();

    const gen = this.bumpGen();
    this.stormGen = gen;
    this.mode = 'storm';
    let frame = 0;

    const tick = () => {
      if (gen !== this.stormGen || this.mode !== 'storm') return;

      const img = frame % 2 === 0
        ? this.makeHeavyFrame(frame)
        : this.heavyFrames[1 + (frame % (this.heavyFrames.length - 1))];

      this.applyIcon(img);
      frame++;
      this.schedule(tick, FRAME_MS_STORM);
    };

    tick();
  }

  stopStorm() {
    this.stormGen = this.bumpGen();
    this.clearTimers();
    this.mode = 'idle';
    this.restoreBase();
  }

  handlePulse(_intensity = 0.35, mode = 'normal') {
    if (mode === 'storm') this.startStorm();
    else if (mode === 'heavy') this.burstHeavy();
    else this.pulse();
  }

  startAmbient() {
    this.stopAmbient();
    this.ambientTimer = setInterval(() => {
      if (this.mode !== 'idle' && this.mode !== 'light') return;
      const intensity = this.getIntensity();
      if (intensity < 0.12) return;
      if (Math.random() < 0.14 + intensity * 0.3) this.pulse();
    }, 1600 + Math.random() * 2000);
  }

  stopAmbient() {
    if (this.ambientTimer) clearInterval(this.ambientTimer);
    this.ambientTimer = null;
    if (this.mode === 'idle') this.restoreBase();
  }
}

module.exports = { IconGlitch };
