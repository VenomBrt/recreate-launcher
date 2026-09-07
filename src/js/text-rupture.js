/**
 * Glitch de fontes — jitter esq/dir, letras invertidas, leve contínuo / forte na transição.
 */
const TextRupture = (() => {
  const MIRROR = {
    A: '∀', B: 'ᗺ', C: 'Ɔ', D: 'ᗡ', E: 'Ǝ', F: 'ꟻ', G: 'Ә', H: 'H',
    I: 'I', J: 'Ⴑ', K: 'ʞ', L: '⅃', M: 'M', N: 'И', O: 'O', P: 'Ԁ',
    Q: 'Ọ', R: 'ᴚ', S: 'Ƨ', T: 'T', U: 'U', V: 'V', W: 'W', X: 'X',
    Y: '⅄', Z: 'Z',
    a: 'ɐ', b: 'q', c: 'ɔ', d: 'p', e: 'ǝ', f: 'ɟ', g: 'ƃ', h: 'ɥ',
    i: 'ᴉ', j: 'ɾ', k: 'ʞ', l: 'ן', m: 'ɯ', n: 'u', o: 'o', p: 'd',
    q: 'b', r: 'ɹ', s: 's', t: 'ʇ', u: 'n', v: 'ʌ', w: 'ʍ', x: 'x',
    y: 'ʎ', z: 'z',
  };

  const SELECTOR = '.rupture-target, .glitch-text-live, .glitch-target, .splash-title';

  function mirrorChar(c) {
    return MIRROR[c] || c;
  }

  function register(el) {
    if (!el || el.closest('.glitch-overlay') || el.classList.contains('no-glitch')) return;
    if (el.children.length > 0) return;
    const text = (el.dataset.glitch || el.textContent || '').trim();
    if (!text || text.length > 80) return;
    el.dataset.glitch = text;
    el.classList.add('rupture-target', 'glitch-text-live');
  }

  function registerAll(root = document) {
    root.querySelectorAll(`
      ${SELECTOR},
      #chip-name, .status-label, #play-badge-label,
      .nav-item span, .play-btn-label, #hint-text,
      .page-title, .splash-title, #progress-text,
      .account-name, .skin-preview-name, .btn-logout,
      .level-text, #level-xp, #level-num, .level-label-part, #level-playtime
    `).forEach(register);
  }

  function syncText(el, text) {
    if (!el) return;
    el.textContent = text;
    el.dataset.glitch = text;
    register(el);
  }

  function getTargets(container, selector = SELECTOR) {
    const root = container || document;
    return [...root.querySelectorAll(selector)].filter(
      (el) => el.textContent?.trim() && !el.closest('.glitch-overlay') && !el.classList.contains('no-glitch')
    );
  }

  function pickFromList(list, count) {
    const indices = list.map((_, i) => i).sort(() => Math.random() - 0.5);
    return indices.slice(0, Math.min(count, indices.length));
  }

  function buildSpans(text) {
    return text.split('').map((ch) => {
      const span = document.createElement('span');
      span.className = 'rupture-char';
      span.textContent = ch === ' ' ? '\u00A0' : ch;
      return span;
    });
  }

  /** Movimento esquerda ↔ direita e volta */
  function jitterElement(el, options = {}) {
    if (!el || el.dataset.jittering === '1') return;
    const i = options.intensity ?? 0.35;
    const amp = 2 + i * 11;
    const a = (Math.random() > 0.5 ? 1 : -1) * amp;
    const b = -a * (0.55 + Math.random() * 0.35);

    el.dataset.jittering = '1';
    el.style.setProperty('--jitter-a', `${a.toFixed(1)}px`);
    el.style.setProperty('--jitter-b', `${b.toFixed(1)}px`);
    el.style.setProperty('--jitter-dur', `${(0.1 + i * 0.08).toFixed(2)}s`);
    el.classList.add('rupture-jitter');

    const dur = options.duration ?? (90 + i * 70);
    setTimeout(() => {
      el.classList.remove('rupture-jitter');
      el.style.removeProperty('--jitter-a');
      el.style.removeProperty('--jitter-b');
      el.style.removeProperty('--jitter-dur');
      delete el.dataset.jittering;
    }, dur);
  }

  /** Inverte só algumas letras aleatórias (leve) */
  function partialLetterGlitch(el, intensity = 0.35) {
    if (!el || el.dataset.rupturing === '1') return;
    const original = (el.dataset.glitch || el.textContent || '').trim();
    if (!original || original.length < 2) return;

    el.dataset.glitch = original;
    el.dataset.rupturing = '1';
    el.innerHTML = '';
    const spans = buildSpans(original);
    spans.forEach((s) => el.appendChild(s));

    const letters = spans.filter((s) => s.textContent.trim());
    const n = Math.max(1, Math.floor(letters.length * (0.12 + intensity * 0.28)));
    pickFromList(letters, n).forEach((idx) => {
      const span = letters[idx];
      if (Math.random() > 0.55) {
        span.classList.add(Math.random() > 0.5 ? 'flip-x' : 'flip-y');
      } else {
        span.textContent = mirrorChar(span.textContent);
        if (Math.random() > 0.5) span.classList.add('flip-x');
      }
    });

    el.classList.add('glitch-letter-light');
    const dur = 90 + intensity * 90;
    setTimeout(() => {
      el.textContent = original;
      el.classList.remove('glitch-letter-light');
      delete el.dataset.rupturing;
    }, dur);
  }

  function applyInvertLetters(spans, intensity) {
    const letters = spans.filter((s) => s.textContent.trim());
    const n = Math.max(2, Math.floor(letters.length * (0.35 + intensity * 0.45)));
    pickFromList(letters, n).forEach((idx) => {
      const span = letters[idx];
      span.classList.add(Math.random() > 0.45 ? 'flip-x' : 'flip-y');
      if (Math.random() > 0.4) span.classList.add('rupture-shift');
    });
  }

  function applySwapLetters(spans, intensity) {
    const letters = spans.filter((s) => s.textContent.trim());
    const swaps = Math.max(1, Math.floor(intensity * 3));
    for (let s = 0; s < swaps; s++) {
      const i = Math.floor(Math.random() * (letters.length - 1));
      const a = letters[i];
      const b = letters[i + 1];
      if (!a || !b) continue;
      const tmp = a.textContent;
      a.textContent = b.textContent;
      b.textContent = tmp;
      a.classList.add('rupture-shift');
      b.classList.add('rupture-shift');
    }
  }

  function applyMirrorLetters(spans, intensity) {
    const rate = 0.3 + intensity * 0.45;
    spans.forEach((span) => {
      const c = span.textContent;
      if (!c.trim() || Math.random() > rate) return;
      span.textContent = mirrorChar(c);
      if (Math.random() > 0.45) span.classList.add('flip-x');
    });
  }

  function applyReverseRun(spans) {
    const letters = spans.filter((s) => s.textContent.trim());
    if (letters.length < 3) return;
    const run = 2 + Math.floor(Math.random() * Math.min(4, letters.length - 1));
    const start = Math.floor(Math.random() * (letters.length - run));
    const chunk = letters.slice(start, start + run);
    const texts = chunk.map((s) => s.textContent);
    texts.reverse().forEach((t, i) => {
      chunk[i].textContent = t;
      chunk[i].classList.add('rupture-shift');
    });
  }

  /** Troca letras por outras do mesmo texto (E→R, C→A…) */
  function applyScrambleLetters(spans, original, intensity) {
    const pool = original.replace(/\s/g, '').split('').filter((c) => /[A-Za-zÀ-ÿ]/.test(c));
    if (!pool.length) return;
    const letters = spans.filter((s) => s.textContent.trim() && /[A-Za-z]/.test(s.textContent));
    const n = Math.max(1, Math.floor(letters.length * (0.18 + intensity * 0.42)));
    pickFromList(letters, n).forEach((span) => {
      let replacement = span.textContent;
      for (let t = 0; t < 4 && replacement === span.textContent; t++) {
        replacement = pool[Math.floor(Math.random() * pool.length)];
      }
      if (replacement !== span.textContent) {
        span.textContent = replacement;
        span.classList.add('rupture-scramble');
      }
    });
  }

  function scrambleGlitch(el, options = {}) {
    if (!el || el.dataset.rupturing === '1') return false;
    const original = (el.dataset.glitch || el.textContent || '').trim();
    if (!original) return false;

    el.dataset.glitch = original;
    el.dataset.rupturing = '1';
    const intensity = options.intensity ?? 0.5;

    el.innerHTML = '';
    const spans = buildSpans(original);
    spans.forEach((s) => el.appendChild(s));
    applyScrambleLetters(spans, original, intensity);
    el.classList.add('glitch-letter-light');

    const dur = options.duration ?? (100 + intensity * 90);
    setTimeout(() => {
      el.textContent = original;
      el.classList.remove('glitch-letter-light');
      delete el.dataset.rupturing;
    }, dur);
    return true;
  }

  /** Glitch completo — transições */
  function transformElement(el, options = {}) {
    if (!el || el.dataset.rupturing === '1') return false;
    const original = (el.dataset.glitch || el.textContent || '').trim();
    if (!original) return false;

    jitterElement(el, { intensity: options.intensity ?? 0.7, duration: options.duration });

    el.dataset.glitch = original;
    el.dataset.rupturing = '1';

    const intensity = options.intensity ?? 0.65;
    const modes = options.modes || ['invert', 'swap', 'mirror', 'reverse', 'scramble'];
    const mode = modes[Math.floor(Math.random() * modes.length)];

    el.innerHTML = '';
    const spans = buildSpans(original);
    spans.forEach((s) => el.appendChild(s));

    if (mode === 'invert') applyInvertLetters(spans, intensity);
    else if (mode === 'swap') applySwapLetters(spans, intensity);
    else if (mode === 'mirror') applyMirrorLetters(spans, intensity);
    else if (mode === 'scramble') applyScrambleLetters(spans, original, intensity);
    else applyReverseRun(spans);

    el.classList.add('glitch-letter-rupture');

    const dur = options.duration ?? (130 + intensity * 110);
    setTimeout(() => {
      el.textContent = original;
      el.classList.remove('glitch-letter-rupture');
      delete el.dataset.rupturing;
    }, dur);

    return true;
  }

  /** Glitch leve contínuo — jitter + às vezes letras */
  function lightGlitch(el, options = {}) {
    if (!el) return;
    const intensity = options.intensity ?? 0.28 + Math.random() * 0.22;
    jitterElement(el, { intensity, duration: 80 + intensity * 60 });
    if (Math.random() < 0.42 + intensity * 0.45) {
      setTimeout(() => partialLetterGlitch(el, intensity), 25);
    }
  }

  function ruptureElement(el, options = {}) {
    const tier = options.tier || 'heavy';
    if (tier === 'light') return lightGlitch(el, options);
    return transformElement(el, options);
  }

  function ruptureBurst(container, selector = SELECTOR, options = {}) {
    const tier = options.tier || 'light';
    const nodes = getTargets(container, selector);
    if (!nodes.length) return;
    const count = options.count ?? (tier === 'heavy' ? 3 : 1);
    const pool = [...nodes].sort(() => Math.random() - 0.5);
    for (let i = 0; i < Math.min(count, pool.length); i++) {
      if (tier === 'heavy') transformElement(pool[i], options);
      else lightGlitch(pool[i], options);
    }
  }

  function ruptureMany(container, options = {}) {
    const nodes = getTargets(container, options.selector || SELECTOR);
    const max = options.max ?? Math.ceil(nodes.length * 0.5);
    const tier = options.tier || 'heavy';
    [...nodes].sort(() => Math.random() - 0.5).slice(0, max).forEach((el) => {
      if (tier === 'heavy') transformElement(el, options);
      else lightGlitch(el, options);
    });
  }

  /** Burst forte — transição de aba */
  function transitionBurst(container, options = {}) {
    if (options.iconMode) {
      window.notifyIconGlitch?.(options.iconIntensity ?? 1, options.iconMode);
    }
    const nodes = getTargets(container, options.selector || SELECTOR);
    const count = Math.min(nodes.length, options.count ?? 6 + Math.floor(Math.random() * 4));
    const pool = [...nodes].sort(() => Math.random() - 0.5).slice(0, count);
    pool.forEach((el, idx) => {
      setTimeout(() => {
        transformElement(el, {
          intensity: 0.75 + Math.random() * 0.2,
          duration: 150 + Math.random() * 80,
          modes: ['invert', 'swap', 'mirror'],
        });
      }, idx * 35);
    });
  }

  let ambientTimer = null;

  function startAmbient(container, options = {}) {
    stopAmbient();
    const root = container || document.getElementById('app-root') || document.body;
    const tick = () => {
      const delay = (options.interval || 1100) + Math.random() * (options.intervalJitter || 1200);
      ambientTimer = setTimeout(() => {
        const nodes = getTargets(root, options.selector || SELECTOR);
        if (nodes.length) {
          const hits = 1 + Math.floor(Math.random() * 2);
          for (let i = 0; i < hits; i++) {
            lightGlitch(nodes[Math.floor(Math.random() * nodes.length)], {
              intensity: 0.22 + Math.random() * 0.3,
            });
          }
        }
        tick();
      }, delay);
    };
    tick();
  }

  function stopAmbient() {
    if (ambientTimer) clearTimeout(ambientTimer);
    ambientTimer = null;
  }

  return {
    register,
    registerAll,
    syncText,
    jitterElement,
    scrambleGlitch,
    lightGlitch,
    ruptureElement,
    ruptureBurst,
    ruptureMany,
    transitionBurst,
    startAmbient,
    stopAmbient,
    SELECTOR,
  };
})();

window.TextRupture = TextRupture;
