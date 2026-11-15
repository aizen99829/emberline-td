// EMBERLINE audio: every sound is synthesized with WebAudio — no asset files.
// The context is created lazily on the first user gesture and every call is guarded,
// so a headless run or a browser that blocks audio never breaks the game.
let ctx = null;
let muted = false;
let noiseBuffer = null;

export function setMuted(m) {
  muted = m;
}
export function isMuted() {
  return muted;
}

// Create (or resume) the audio context. Call from a user gesture.
export function ensureAudio() {
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      const len = ctx.sampleRate * 0.5;
      noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq, dur, type, vol, slideTo) {
  if (muted) return;
  const c = ensureAudio();
  if (!c) return;
  try {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, c.currentTime);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), c.currentTime + dur);
    gain.gain.setValueAtTime(vol, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    osc.connect(gain).connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + dur + 0.02);
  } catch { /* sound is decoration, never fatal */ }
}

function noise(dur, vol, filterFreq) {
  if (muted) return;
  const c = ensureAudio();
  if (!c || !noiseBuffer) return;
  try {
    const src = c.createBufferSource();
    src.buffer = noiseBuffer;
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = c.createGain();
    gain.gain.setValueAtTime(vol, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    src.connect(filter).connect(gain).connect(c.destination);
    src.start();
    src.stop(c.currentTime + dur + 0.02);
  } catch { /* sound is decoration, never fatal */ }
}

// Named effects, one per game event.
export const sfx = {
  shoot() { tone(880, 0.06, 'square', 0.05, 440); },
  frost() { tone(1200, 0.12, 'sine', 0.06, 700); },
  mortar() { noise(0.18, 0.12, 900); tone(160, 0.15, 'triangle', 0.08, 60); },
  lance() { tone(140, 0.28, 'sawtooth', 0.1, 55); tone(1200, 0.1, 'square', 0.04, 300); noise(0.12, 0.06, 2400); },
  streak(n) {
    const base = 660 + Math.min(600, n * 12);
    tone(base, 0.09, 'triangle', 0.08);
    setTimeout(() => tone(base * 1.335, 0.12, 'triangle', 0.08), 60);
  },
  surgeWarn() {
    tone(196, 0.16, 'sawtooth', 0.1, 185);
    setTimeout(() => tone(196, 0.16, 'sawtooth', 0.1, 185), 200);
    setTimeout(() => tone(262, 0.24, 'sawtooth', 0.1, 247), 400);
  },
  hit() { tone(220, 0.04, 'square', 0.03, 180); },
  coin() { tone(990, 0.07, 'sine', 0.06); setTimeout(() => tone(1320, 0.09, 'sine', 0.06), 55); },
  explosion() { noise(0.35, 0.22, 600); tone(90, 0.3, 'sine', 0.14, 40); },
  leak() { tone(140, 0.4, 'sawtooth', 0.14, 70); noise(0.2, 0.1, 500); },
  waveStart() { tone(523, 0.1, 'triangle', 0.09); setTimeout(() => tone(784, 0.14, 'triangle', 0.09), 90); },
  bossHorn() { tone(98, 0.9, 'sawtooth', 0.12, 65); tone(147, 0.9, 'sawtooth', 0.08, 98); },
  build() { tone(392, 0.08, 'triangle', 0.09); setTimeout(() => tone(587, 0.1, 'triangle', 0.09), 70); },
  upgrade() { tone(523, 0.08, 'triangle', 0.09); setTimeout(() => tone(659, 0.08, 'triangle', 0.09), 60); setTimeout(() => tone(784, 0.12, 'triangle', 0.09), 120); },
  sell() { tone(660, 0.07, 'sine', 0.06); setTimeout(() => tone(440, 0.1, 'sine', 0.06), 60); },
  victory() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.22, 'triangle', 0.1), i * 130)); },
  defeat() { [392, 330, 262, 196].forEach((f, i) => setTimeout(() => tone(f, 0.28, 'sawtooth', 0.08), i * 160)); },
  click() { tone(700, 0.04, 'sine', 0.04); },
};
