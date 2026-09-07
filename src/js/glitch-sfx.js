/**
 * Glitch SFX — samples reais (Watch Dogs / Aranhaverso vibe)
 * Carrega MP3s de assets/sfx e toca cortes sincronizados.
 * Mix aberto (sem abafar).
 */
class GlitchSfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.bus = null;
    this.ready = false;
    this.loadingPromise = null;
    this.buffers = [];
    this.byKind = { hit: [], transition: [], texture: [] };
    this.lastBurst = 0;
    this.lastTransition = 0;
    this.active = new Set();
    this.unlocked = false;
    this.muted = false;

    // Nomes em assets/sfx/ (copiados dos Downloads)
    this.files = [
      { file: 'kave_msri-digital-glitch-sfx-438248.mp3', kind: 'hit' },
      { file: 'abirkhan006-glitch-and-distortion-sound-effects-547046.mp3', kind: 'texture' },
      { file: 'sound_garage-glitch-fx-transitions-8-311809.mp3', kind: 'transition' },
      { file: 'sound_garage-glitch-fx-transitions-6-311803_1.mp3', kind: 'transition' },
      { file: 'sound_garage-glitch-fx-transitions-9-311811_1.mp3', kind: 'transition' },
      { file: 'sound_garage-glitch-fx-transitions-10-311812.mp3', kind: 'transition' },
      { file: 'virtual_vibes-glitch-sound-effect-hd-379466.mp3', kind: 'hit' },
      { file: 'u_9fanyjsqqc-glitch-sound-111588.mp3', kind: 'hit' },
    ];
  }

  ensureCtx() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!this.ctx || this.ctx.state === 'closed') {
      this.ctx = new AC();

      // Mix aberto, mas controlado (sem estourar)
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.38;

      const hip = this.ctx.createBiquadFilter();
      hip.type = 'highpass';
      hip.frequency.value = 70;

      const presence = this.ctx.createBiquadFilter();
      presence.type = 'highshelf';
      presence.frequency.value = 2800;
      presence.gain.value = 2.5;

      const air = this.ctx.createBiquadFilter();
      air.type = 'peaking';
      air.frequency.value = 6500;
      air.Q.value = 0.7;
      air.gain.value = 1.8;

      // Soft limiter — segura picos quando vários samples se somam
      const lim = this.ctx.createDynamicsCompressor();
      lim.threshold.value = -18;
      lim.knee.value = 12;
      lim.ratio.value = 8;
      lim.attack.value = 0.003;
      lim.release.value = 0.18;

      this.bus = this.ctx.createGain();
      this.bus.gain.value = 0.85;

      this.bus.connect(hip);
      hip.connect(presence);
      presence.connect(air);
      air.connect(lim);
      lim.connect(this.master);
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  init() {
    if (this.ready) return Promise.resolve(true);
    if (this.loadingPromise) return this.loadingPromise;

    this.loadingPromise = (async () => {
      const ctx = this.ensureCtx();
      if (!ctx) return false;

      const loaded = [];
      await Promise.all(this.files.map(async (entry) => {
        try {
          const url = `../assets/sfx/${entry.file}`;
          const res = await fetch(url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const raw = await res.arrayBuffer();
          const buf = await ctx.decodeAudioData(raw.slice(0));
          const item = { buffer: buf, kind: entry.kind, file: entry.file };
          loaded.push(item);
          this.byKind[entry.kind].push(item);
        } catch (err) {
          console.warn('[sfx] falha', entry.file, err.message);
        }
      }));

      this.buffers = loaded;
      this.ready = loaded.length > 0;
      if (!this.ready) console.warn('[sfx] nenhum sample carregou');
      return this.ready;
    })();

    return this.loadingPromise;
  }

  unlock() {
    this.unlocked = true;
    this.ensureCtx();
    this.init();
  }

  /** Silencia SFX (minimizado / bandeja) */
  setMuted(muted) {
    this.muted = !!muted;
    if (this.muted) this.stopActive();
  }

  isMuted() {
    return !!this.muted || document.hidden || document.visibilityState === 'hidden';
  }

  stopActive() {
    for (const s of [...this.active]) {
      try { s.stop(); } catch {}
    }
    this.active.clear();
    try {
      if (this.master) this.master.gain.value = 0;
    } catch {}
  }

  restoreMasterGain() {
    try {
      if (this.master && !this.muted) this.master.gain.value = 0.38;
    } catch {}
  }

  r(a, b) { return a + Math.random() * (b - a); }

  pickPool(kind) {
    const pool = (kind && this.byKind[kind]?.length)
      ? this.byKind[kind]
      : this.buffers;
    if (!pool.length) return null;
    return pool[(Math.random() * pool.length) | 0];
  }

  /**
   * Toca sample (inteiro ou corte aleatório)
   */
  playSample(opts = {}) {
    if (this.isMuted()) return null;
    if (!this.ready || !this.ctx) return null;
    this.restoreMasterGain();
    const {
      kind = null,
      volume = 1,
      slice = false,
      minDur = 0.12,
      maxDur = 0.45,
      playbackRate = 1,
      when = 0,
    } = opts;

    const item = this.pickPool(kind);
    if (!item?.buffer) return null;

    const ctx = this.ensureCtx();
    const buf = item.buffer;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = playbackRate;

    const g = ctx.createGain();
    // Soft fade pra não bater no pico seco
    const peak = Math.max(0, Math.min(0.75, volume));
    g.gain.setValueAtTime(0.0001, ctx.currentTime + (when || 0));
    g.gain.linearRampToValueAtTime(peak, ctx.currentTime + (when || 0) + 0.012);
    g.gain.setValueAtTime(peak, ctx.currentTime + (when || 0) + Math.max(0.05, (slice ? minDur : 0.12) * 0.5));

    src.connect(g);
    g.connect(this.bus);

    const t0 = ctx.currentTime + (when || 0);
    let offset = 0;
    let dur = buf.duration;

    if (slice && buf.duration > minDur + 0.05) {
      dur = Math.min(buf.duration, this.r(minDur, Math.min(maxDur, buf.duration)));
      const span = Math.max(0, buf.duration - dur);
      offset = span > 0 ? Math.random() * span : 0;
    }

    // Fade out no fim do corte
    const endAt = t0 + (slice ? dur : Math.min(buf.duration, 0.8));
    g.gain.linearRampToValueAtTime(0.0001, endAt);

    try {
      if (slice) src.start(t0, offset, dur);
      else src.start(t0);
    } catch {
      try { src.start(t0); } catch { return null; }
    }

    this.active.add(src);
    src.onended = () => this.active.delete(src);
    return src;
  }

  /** Duas camadas leves = mais “design de jogo” */
  playLayered(kindA, kindB, vol = 0.65) {
    this.playSample({
      kind: kindA,
      volume: vol * 0.7,
      slice: true,
      minDur: 0.15,
      maxDur: 0.4,
      playbackRate: this.r(0.92, 1.08),
    });
    if (kindB) {
      this.playSample({
        kind: kindB,
        volume: vol * 0.35,
        slice: true,
        minDur: 0.08,
        maxDur: 0.22,
        playbackRate: this.r(1.05, 1.25),
        when: this.r(0.03, 0.07),
      });
    }
  }

  ensure() {
    this.unlock();
    return true;
  }

  tick() {
    if (this.isMuted()) return;
    this.init().then((ok) => {
      if (!ok) return;
      this.playSample({
        kind: 'hit',
        volume: 0.4,
        slice: true,
        minDur: 0.06,
        maxDur: 0.14,
        playbackRate: this.r(1.05, 1.35),
      });
    });
  }

  ambient() {
    if (this.isMuted()) return;
    this.init().then((ok) => {
      if (!ok) return;
      this.playSample({
        kind: Math.random() > 0.5 ? 'texture' : 'hit',
        volume: 0.28,
        slice: true,
        minDur: 0.08,
        maxDur: 0.18,
        playbackRate: this.r(0.95, 1.2),
      });
    });
  }

  burst(heavy = false) {
    if (this.isMuted()) return;
    const now = performance.now();
    if (now - this.lastBurst < 45) return;
    this.lastBurst = now;
    this.init().then((ok) => {
      if (!ok) return;
      this.playLayered(
        heavy ? 'hit' : (Math.random() > 0.4 ? 'hit' : 'texture'),
        heavy ? 'texture' : null,
        heavy ? 0.7 : 0.55,
      );
      if (heavy) {
        this.playSample({
          kind: 'transition',
          volume: 0.32,
          slice: true,
          minDur: 0.12,
          maxDur: 0.28,
          playbackRate: this.r(1.1, 1.3),
          when: 0.05,
        });
      }
    });
  }

  /** Troca de etapa no loading — transition SFX forte */
  stageChange() {
    if (this.isMuted()) return;
    this.init().then((ok) => {
      if (!ok) return;
      this.playSample({
        kind: 'transition',
        volume: 0.62,
        slice: Math.random() > 0.35,
        minDur: 0.22,
        maxDur: 0.5,
        playbackRate: this.r(0.95, 1.1),
      });
      this.playSample({
        kind: 'hit',
        volume: 0.38,
        slice: true,
        minDur: 0.1,
        maxDur: 0.25,
        playbackRate: this.r(1.0, 1.15),
        when: 0.04,
      });
      this.playSample({
        kind: 'texture',
        volume: 0.22,
        slice: true,
        minDur: 0.08,
        maxDur: 0.18,
        playbackRate: this.r(1.1, 1.35),
        when: 0.07,
      });
    });
  }

  transition() {
    if (this.isMuted()) return;
    const now = performance.now();
    if (now - this.lastTransition < 110) return;
    this.lastTransition = now;
    this.init().then((ok) => {
      if (!ok) return;
      this.playSample({
        kind: 'transition',
        volume: 0.65,
        slice: Math.random() > 0.3,
        minDur: 0.25,
        maxDur: 0.55,
        playbackRate: this.r(0.94, 1.12),
      });
      this.playSample({
        kind: 'hit',
        volume: 0.36,
        slice: true,
        minDur: 0.1,
        maxDur: 0.22,
        when: 0.05,
        playbackRate: this.r(1.0, 1.2),
      });
    });
  }

  startLoading() {
    if (this.isMuted()) return;
    this.unlock();
    this.init().then((ok) => {
      if (!ok) return;
      this.playSample({
        kind: 'texture',
        volume: 0.3,
        slice: true,
        minDur: 0.15,
        maxDur: 0.3,
      });
    });
  }

  stopLoading() {}
  setTension() {}

  finish() {
    if (this.isMuted()) return;
    this.init().then((ok) => {
      if (!ok) return;
      this.playSample({
        kind: 'transition',
        volume: 0.68,
        slice: false,
        playbackRate: 1,
      });
      this.playSample({
        kind: 'hit',
        volume: 0.42,
        slice: true,
        minDur: 0.15,
        maxDur: 0.3,
        when: 0.06,
      });
      this.playSample({
        kind: 'hit',
        volume: 0.28,
        slice: true,
        minDur: 0.08,
        maxDur: 0.16,
        when: 0.16,
        playbackRate: 1.15,
      });
    });
  }

  stop() {
    for (const s of [...this.active]) {
      try { s.stop(); } catch {}
    }
    this.active.clear();
    try { this.ctx?.close(); } catch {}
    this.ctx = null;
    this.ready = false;
    this.loadingPromise = null;
    this.buffers = [];
    this.byKind = { hit: [], transition: [], texture: [] };
  }
}

window.GlitchSfx = GlitchSfx;
window.glitchSfx = window.glitchSfx || new GlitchSfx();
