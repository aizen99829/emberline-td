// EMBERLINE enemies: spawn, march the path, take damage, slow, regenerate, split.
import {
  PATH, CORE, ENEMY_TYPES, HP_SCALE_PER_WAVE, SPEED_SCALE_PER_WAVE,
  SPEED_SCALE_CAP,
} from './config.js';

let nextId = 1;

// Precomputed path segments with cumulative lengths, for position lookups.
const SEGMENTS = [];
{
  let acc = 0;
  for (let i = 1; i < PATH.length; i++) {
    const a = PATH[i - 1], b = PATH[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    SEGMENTS.push({ a, b, len, start: acc });
    acc += len;
  }
}
export const TOTAL_PATH_LENGTH = SEGMENTS[SEGMENTS.length - 1].start + SEGMENTS[SEGMENTS.length - 1].len;

// Position on the path at a travelled distance.
export function pointAt(distance) {
  const d = Math.max(0, Math.min(TOTAL_PATH_LENGTH, distance));
  for (const s of SEGMENTS) {
    if (d <= s.start + s.len) {
      const t = s.len === 0 ? 0 : (d - s.start) / s.len;
      return { x: s.a.x + (s.b.x - s.a.x) * t, y: s.a.y + (s.b.y - s.a.y) * t };
    }
  }
  const last = SEGMENTS[SEGMENTS.length - 1];
  return { x: last.b.x, y: last.b.y };
}

// Make one enemy of a type for a wave. hp/speed scale with the wave number.
export function spawnEnemy(type, wave) {
  const def = ENEMY_TYPES[type];
  const hpMul = 1 + HP_SCALE_PER_WAVE * (wave - 1);
  const speedMul = Math.min(SPEED_SCALE_CAP, 1 + SPEED_SCALE_PER_WAVE * (wave - 1));
  const hp = Math.round(def.hp * hpMul);
  return {
    id: nextId++,
    type,
    name: def.name,
    x: PATH[0].x, y: PATH[0].y,
    distance: 0,
    hp, maxHp: hp,
    speed: def.speed * speedMul,
    baseSpeed: def.speed * speedMul,
    armour: def.armour || 0,
    regen: def.regen || 0,
    reward: def.reward,
    radius: def.radius,
    color: def.color,
    score: def.score,
    splits: def.splits || null,
    shielded: false, // inside an Aegis aura this tick (set by updateEnemies)
    slowResist: def.slowResist || 0,
    slowUntil: 0,
    slowPct: 0,
    flash: 0, // hit-flash timer, drawn by render.js
    dead: false,
    reachedCore: false,
  };
}

// Is this enemy currently slowed?
export function isSlowed(enemy, now) {
  return now < enemy.slowUntil;
}

// Apply a slow. A stronger slow replaces a weaker one; boss resists half.
export function applySlow(enemy, pct, duration, now) {
  const resisted = pct * (1 - enemy.slowResist);
  if (resisted <= enemy.slowPct && now < enemy.slowUntil) return;
  enemy.slowPct = resisted;
  enemy.slowUntil = now + duration;
}

// Damage one enemy. Armour shaves flat damage (min 1). Inside an Aegis aura
// the hit is blunted first (the aura never protects an Aegis itself).
// `enemies` is the whole field, used for the aura check; omit it and the
// enemy's last computed `shielded` flag is trusted instead.
// Returns true if it died.
export function damageEnemy(enemy, rawDamage, now, enemies) {
  const shielded = enemies ? isShielded(enemy, enemies) : enemy.shielded;
  const blunted = shielded ? rawDamage * (1 - ENEMY_TYPES.aegis.auraDamageCut) : rawDamage;
  const dealt = Math.max(1, Math.round(blunted - enemy.armour));
  enemy.hp -= dealt;
  enemy.flash = 0.08;
  if (enemy.hp <= 0) {
    enemy.dead = true;
    return true;
  }
  return false;
}

// Is this enemy currently inside a living Aegis aura? An Aegis shields its
// allies only — never itself and never another Aegis — so killing the Aegis
// first is always the right call. render.js draws the flag as a pale ring.
export function isShielded(enemy, enemies) {
  if (enemy.type === 'aegis') return false;
  const aura = ENEMY_TYPES.aegis;
  for (const a of enemies) {
    if (a.type !== 'aegis' || a.dead || a.reachedCore || a === enemy) continue;
    if (Math.hypot(a.x - enemy.x, a.y - enemy.y) <= aura.auraRadius) return true;
  }
  return false;
}

// Move every living enemy along the path for dt seconds.
// Returns the enemies that reached the Core this tick.
export function updateEnemies(enemies, dt, now) {
  const leaked = [];
  for (const e of enemies) {
    e.shielded = !e.dead && !e.reachedCore && isShielded(e, enemies);
    if (e.dead || e.reachedCore) continue;
    if (e.flash > 0) e.flash -= dt;
    if (e.regen > 0 && e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + e.regen * dt);
    const slow = isSlowed(e, now) ? e.slowPct : 0;
    const speed = e.baseSpeed * (1 - slow);
    e.distance += speed * dt;
    const p = pointAt(e.distance);
    e.x = p.x; e.y = p.y;
    const coreDist = Math.hypot(e.x - CORE.x, e.y - CORE.y);
    if (coreDist < CORE.radius + 4 || e.distance >= TOTAL_PATH_LENGTH - 2) {
      e.reachedCore = true;
      leaked.push(e);
    }
  }
  return leaked;
}

// On death, a splitter breaks into two fresh scuttlers at the same spot.
export function splitEnemy(enemy, wave) {
  if (!enemy.splits) return [];
  const children = [];
  for (let i = 0; i < 2; i++) {
    const child = spawnEnemy(enemy.splits, wave);
    child.distance = Math.max(0, enemy.distance - 12 - i * 10);
    const p = pointAt(child.distance);
    child.x = p.x; child.y = p.y;
    children.push(child);
  }
  return children;
}
