// EMBERLINE main: the game state machine, the fixed-timestep loop, every action,
// and the debug hooks the headless play-tests drive.
import {
  CANVAS_W, CANVAS_H, PADS, TOTAL_WAVES, TOWER_TYPES, START_GOLD,
} from './config.js';
import { createEconomy, spend, rewardKill, rewardWaveClear, leakEnemy, sellRefund, victoryBonus, canAfford } from './economy.js';
import { spawnEnemy, updateEnemies, splitEnemy, pointAt } from './enemies.js';
import { buildTower, updateTowers, updateProjectiles, upgradeTower, upgradeCost, towerCost } from './towers.js';
import { createSpawner, updateSpawner, waveIsOver, waveRemaining } from './waves.js';
import { drawGame } from './render.js';
import { attachInput, resolveClick } from './input.js';
import { sfx, setMuted, ensureAudio } from './audio.js';

const STEP = 1 / 60;
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

function freshState() {
  return {
    mode: 'title',
    phase: 'build',
    wave: 0,
    spawner: null,
    eco: createEconomy(),
    towers: [],
    enemies: [],
    projectiles: [],
    particles: [],
    floaters: [],
    tracers: [],
    pads: PADS,
    selectedPad: -1,
    selectedTower: null,
    ghostType: 'spark',
    hoverPad: -1,
    speed: 1,
    muted: false,
    time: 0,
    shake: 0,
    waveBanner: null,
    endBonus: null,
    waveRemaining: 0,
    emberTimer: 0,
    coinTimer: 0,
  };
}

let state = freshState();
let lastTime = 0;
let acc = 0;

function resetRun() {
  const muted = state.muted;
  state = freshState();
  state.muted = muted;
  setMuted(muted);
}

function addFloater(x, y, text, color, size = 14) {
  if (state.floaters.length > 40) state.floaters.shift();
  state.floaters.push({ x, y, text, color, size, life: 0.9, maxLife: 0.9, vy: -28 });
}

function burst(x, y, color, count, speed, size = 3) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = speed * (0.4 + Math.random() * 0.8);
    state.particles.push({
      x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 20,
      life: 0.4 + Math.random() * 0.4, maxLife: 0.8, size: size * (0.6 + Math.random() * 0.8),
      color, gravity: 160,
    });
  }
}

function spawnAmbientEmber() {
  state.particles.push({
    x: Math.random() * CANVAS_W, y: CANVAS_H + 6,
    vx: (Math.random() - 0.5) * 12, vy: -(14 + Math.random() * 22),
    life: 5 + Math.random() * 3, maxLife: 8, size: 1.5 + Math.random() * 2,
    color: Math.random() < 0.7 ? '#ff9a3d' : '#ffd76a', gravity: -4,
  });
}

function startWave() {
  if (state.mode !== 'playing' || state.phase !== 'build') return;
  state.wave += 1;
  state.phase = 'combat';
  state.spawner = createSpawner(state.wave);
  state.selectedPad = -1;
  state.selectedTower = null;
  const isBoss = state.wave === TOTAL_WAVES;
  state.waveBanner = { text: isBoss ? 'FINAL WAVE — EMBER COLOSSUS' : `WAVE ${state.wave}`, t: 2.2 };
  if (isBoss) sfx.bossHorn(); else sfx.waveStart();
}

function endWave() {
  const bonus = rewardWaveClear(state.eco, state.wave);
  addFloater(CANVAS_W / 2, 200, `Wave clear! +${bonus} gold`, '#ffcf4d', 18);
  state.phase = 'build';
  state.spawner = null;
  if (state.wave >= TOTAL_WAVES) {
    state.endBonus = victoryBonus(state.eco);
    state.mode = 'victory';
    sfx.victory();
  }
}

// Deaths are counted once, here, after every damage source has run.
function processDeaths() {
  const newborn = [];
  for (const e of state.enemies) {
    if (!e.dead || e.counted) continue;
    e.counted = true;
    const gold = rewardKill(state.eco, e.reward, state.wave);
    addFloater(e.x, e.y - 14, `+${gold}`, '#ffcf4d', 13);
    burst(e.x, e.y, e.color, e.type === 'boss' ? 40 : 8, 90, 3);
    if (state.time - state.coinTimer > 0.09) { sfx.coin(); state.coinTimer = state.time; }
    if (e.splits) newborn.push(...splitEnemy(e, state.wave));
  }
  if (newborn.length > 0) state.enemies.push(...newborn);
  state.enemies = state.enemies.filter((e) => !e.dead);
}

function onTowerEvent(ev) {
  if (ev.kind === 'shot') {
    state.tracers.push({
      x1: ev.tower.x, y1: ev.tower.y, x2: ev.target.x, y2: ev.target.y,
      color: ev.tower.type === 'frost' ? '#4fe0d0' : '#ffb020', life: 0.12, maxLife: 0.12,
    });
    if (ev.tower.type === 'frost') sfx.frost(); else sfx.shoot();
    if (ev.killed) sfx.hit();
  } else if (ev.kind === 'chain') {
    state.tracers.push({
      x1: ev.target.x, y1: ev.target.y, x2: ev.target.x, y2: ev.target.y,
      color: '#ffe9a8', life: 0.1, maxLife: 0.1,
    });
  } else if (ev.kind === 'lob') {
    sfx.mortar();
  } else if (ev.kind === 'explosion') {
    burst(ev.x, ev.y, '#ff8a3d', 16, 150, 4);
    burst(ev.x, ev.y, '#ffd76a', 8, 90, 3);
    state.shake = Math.max(state.shake, 3);
    sfx.explosion();
  }
}

function update(dt) {
  state.time += dt;
  if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 22);
  if (state.waveBanner && state.waveBanner.t > 0) state.waveBanner.t -= dt;

  // Ambient embers drift in every mode.
  state.emberTimer -= dt;
  if (state.emberTimer <= 0) {
    spawnAmbientEmber();
    state.emberTimer = 0.5 + Math.random() * 0.7;
  }
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const p = state.particles[i];
    p.life -= dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vy += p.gravity * dt;
    if (p.life <= 0) state.particles.splice(i, 1);
  }
  for (let i = state.floaters.length - 1; i >= 0; i--) {
    const f = state.floaters[i];
    f.life -= dt; f.y += f.vy * dt;
    if (f.life <= 0) state.floaters.splice(i, 1);
  }
  for (let i = state.tracers.length - 1; i >= 0; i--) {
    state.tracers[i].life -= dt;
    if (state.tracers[i].life <= 0) state.tracers.splice(i, 1);
  }

  if (state.mode !== 'playing') return;

  if (state.phase === 'combat' && state.spawner) {
    const born = updateSpawner(state.spawner, dt);
    state.enemies.push(...born);
  }
  const leaked = updateEnemies(state.enemies, dt, state.time);
  for (const e of leaked) {
    const lives = leakEnemy(state.eco);
    state.shake = 12;
    addFloater(e.x, e.y - 20, '-1 ♥', '#ff4d6a', 18);
    burst(e.x, e.y, '#ff4d6a', 14, 120, 4);
    sfx.leak();
    if (lives <= 0) {
      state.mode = 'defeat';
      sfx.defeat();
      return;
    }
  }
  updateTowers(state.towers, state.enemies, state.projectiles, dt, state.time, onTowerEvent);
  updateProjectiles(state.projectiles, state.enemies, dt, state.time, onTowerEvent);
  processDeaths();
  if (state.spawner) state.waveRemaining = waveRemaining(state.spawner, state.enemies);
  if (state.phase === 'combat' && state.spawner && waveIsOver(state.spawner, state.enemies)) {
    endWave();
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  const dtMs = Math.min(100, now - (lastTime || now));
  lastTime = now;
  acc += (dtMs / 1000) * state.speed;
  let steps = 0;
  while (acc >= STEP && steps < 8) {
    update(STEP);
    acc -= STEP;
    steps += 1;
  }
  if (steps === 8) acc = 0; // drop backlog rather than spiral
  drawGame(ctx, state);
  if (!window.__emberlineReady) window.__emberlineReady = true;
}

// --- Actions (wired to input) ---
function doClick(x, y) {
  ensureAudio();
  const r = resolveClick(state, x, y);
  switch (r.action) {
    case 'start':
      resetRun();
      state.mode = 'playing';
      sfx.click();
      break;
    case 'restart':
      resetRun();
      state.mode = 'playing';
      sfx.click();
      break;
    case 'startWave':
      startWave();
      break;
    case 'hud':
      if (r.id === 'speed') { state.speed = state.speed === 1 ? 2 : 1; sfx.click(); }
      else if (r.id === 'pause') { state.mode = state.mode === 'paused' ? 'playing' : 'paused'; sfx.click(); }
      else if (r.id === 'mute') { state.muted = !state.muted; setMuted(state.muted); sfx.click(); }
      break;
    case 'selectPad':
      state.selectedPad = r.pad;
      state.selectedTower = null;
      state.ghostType = 'spark';
      sfx.click();
      break;
    case 'selectTower':
      state.selectedTower = r.tower;
      state.selectedPad = -1;
      sfx.click();
      break;
    case 'build': {
      const pad = PADS[state.selectedPad];
      const cost = towerCost(r.type);
      if (spend(state.eco, cost)) {
        state.towers.push(buildTower(r.type, state.selectedPad, pad.x, pad.y));
        burst(pad.x, pad.y, TOWER_TYPES[r.type].color, 10, 70, 3);
        sfx.build();
        state.selectedPad = -1;
      }
      break;
    }
    case 'upgrade': {
      const t = state.selectedTower;
      const cost = upgradeCost(t);
      if (t && cost !== null && spend(state.eco, cost)) {
        upgradeTower(t);
        burst(t.x, t.y, TOWER_TYPES[t.type].color, 12, 80, 3);
        sfx.upgrade();
      }
      break;
    }
    case 'sell': {
      const t = state.selectedTower;
      if (t) {
        state.eco.gold += sellRefund(t.invested);
        state.towers = state.towers.filter((x) => x !== t);
        sfx.sell();
        state.selectedTower = null;
      }
      break;
    }
    case 'closeMenus':
    case 'deselect':
      state.selectedPad = -1;
      state.selectedTower = null;
      break;
    default:
      break;
  }
}

function doHover(x, y) {
  let pad = -1;
  for (let i = 0; i < PADS.length; i++) {
    if (Math.hypot(PADS[i].x - x, PADS[i].y - y) <= 26) { pad = i; break; }
  }
  state.hoverPad = pad;
}

attachInput(canvas, {
  click: doClick,
  hover: doHover,
  togglePause: () => {
    if (state.mode === 'playing') state.mode = 'paused';
    else if (state.mode === 'paused') state.mode = 'playing';
  },
  toggleSpeed: () => { state.speed = state.speed === 1 ? 2 : 1; },
  toggleMute: () => { state.muted = !state.muted; setMuted(state.muted); },
  restart: () => { resetRun(); state.mode = 'playing'; },
  closeMenus: () => { state.selectedPad = -1; state.selectedTower = null; },
  confirm: () => {
    if (state.mode === 'title') { resetRun(); state.mode = 'playing'; }
    else if (state.mode === 'victory' || state.mode === 'defeat') { resetRun(); state.mode = 'playing'; }
  },
});

// --- Debug hooks for headless play-testing and screenshots ---
// (Not a cheat menu: they only drive the same actions a player can take.)
window.__emberline = {
  get state() { return state; },
  get ready() { return !!window.__emberlineReady; },
  start() { resetRun(); state.mode = 'playing'; },
  restart() { resetRun(); state.mode = 'playing'; },
  startWave() { startWave(); },
  placeTower(padIndex, type) {
    const pad = PADS[padIndex];
    if (!pad || state.towers.some((t) => t.padIndex === padIndex)) return false;
    if (!spend(state.eco, towerCost(type))) return false;
    state.towers.push(buildTower(type, padIndex, pad.x, pad.y));
    return true;
  },
  upgradeTowerAt(padIndex) {
    const t = state.towers.find((x) => x.padIndex === padIndex);
    if (!t) return false;
    const cost = upgradeCost(t);
    if (cost === null || !spend(state.eco, cost)) return false;
    return upgradeTower(t);
  },
  setGold(n) { state.eco.gold = n; },
  setLives(n) { state.eco.lives = n; },
  skipToWave(n) {
    state.wave = Math.max(0, Math.min(TOTAL_WAVES, n - 1));
    state.phase = 'build';
    startWave();
  },
  winNow() {
    state.eco.wavesCleared = TOTAL_WAVES;
    state.endBonus = victoryBonus(state.eco);
    state.mode = 'victory';
  },
  loseNow() {
    state.eco.lives = 0;
    state.mode = 'defeat';
  },
  // Run the simulation headlessly for `seconds` of game time.
  step(seconds) {
    const n = Math.round(seconds / STEP);
    for (let i = 0; i < n; i++) update(STEP);
    drawGame(ctx, state);
  },
  // Autoplay: a simple but sensible strategy — fill pads with a mortar/spark/frost
  // mix, upgrade when affordable, start each wave as soon as the last one clears.
  // Returns the final mode after the run (victory/defeat/playing).
  autoPlay(maxSeconds = 900) {
    resetRun();
    state.mode = 'playing';
    const pattern = ['mortar', 'spark', 'frost', 'spark', 'mortar', 'spark', 'frost', 'spark', 'mortar', 'frost', 'spark', 'spark'];
    for (let i = 0; i < PADS.length; i++) {
      if (state.towers.length >= 3 && state.eco.gold < 150) break;
      const type = pattern[i % pattern.length];
      if (state.eco.gold >= towerCost(type)) this.placeTower(i, type);
    }
    let elapsed = 0;
    while (elapsed < maxSeconds && state.mode === 'playing') {
      if (state.phase === 'build') {
        // Upgrade cheapest towers first, then start the wave.
        let upgraded = true;
        while (upgraded) {
          upgraded = false;
          for (const t of state.towers) {
            const cost = upgradeCost(t);
            if (cost !== null && state.eco.gold >= cost + 60) {
              spend(state.eco, cost);
              upgradeTower(t);
              upgraded = true;
            }
          }
        }
        startWave();
      }
      this.step(1);
      elapsed += 1;
    }
    return state.mode;
  },
};

requestAnimationFrame(frame);
