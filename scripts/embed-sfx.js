const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'assets', 'sfx');
const files = ['tick', 'burst', 'heavy', 'transition'];
const map = {};
for (const f of files) {
  const b = fs.readFileSync(path.join(dir, `${f}.wav`));
  map[f] = `data:audio/wav;base64,${b.toString('base64')}`;
}

const out = `/**
 * SFX de glitch — WAV embutido (data URI). Sem path/asar.
 */
class GlitchSfx {
  constructor() {
    this.lastBurst = 0;
    this.lastTransition = 0;
    this.unlocked = false;
    this.files = ${JSON.stringify(map)};
  }

  _play(key, volume = 1) {
    try {
      const src = this.files[key];
      if (!src) return;
      const a = new Audio(src);
      a.volume = Math.max(0, Math.min(1, volume));
      const p = a.play();
      if (p && p.catch) p.catch(() => {});
    } catch (err) {
      console.warn('[sfx]', key, err && err.message);
    }
  }

  unlock() {
    this.unlocked = true;
    try {
      const a = new Audio(this.files.tick);
      a.volume = 0.001;
      a.play().then(() => a.pause()).catch(() => {});
    } catch {}
  }

  ensure() { return true; }

  tick() { this._play('tick', 0.9); }

  burst(heavy = false) {
    const now = performance.now();
    if (now - this.lastBurst < 45) return;
    this.lastBurst = now;
    this._play(heavy ? 'heavy' : 'burst', 1);
    if (heavy) setTimeout(() => this.tick(), 40);
  }

  transition() {
    const now = performance.now();
    if (now - this.lastTransition < 140) return;
    this.lastTransition = now;
    this._play('transition', 1);
    setTimeout(() => this.burst(true), 60);
  }

  setTension() {}

  finish() {
    this.burst(true);
    setTimeout(() => this.burst(true), 100);
    setTimeout(() => this.tick(), 200);
  }

  stop() {}
}

window.GlitchSfx = GlitchSfx;
window.glitchSfx = window.glitchSfx || new GlitchSfx();
`;

fs.writeFileSync(path.join(__dirname, '..', 'src', 'js', 'glitch-sfx.js'), out);
console.log('wrote glitch-sfx.js', out.length, 'chars');
