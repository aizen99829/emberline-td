// EMBERLINE towers: build, aim, fire, upgrade, sell. Projectiles live here too.
import {
  TOWER_TYPES, UPGRADE_DAMAGE, UPGRADE_RANGE, UPGRADE_RATE, PAD_RADIUS,
} from './config.js';
import { damageEnemy, applySlow } from './enemies.js';

let nextTowerId = 1;

// A fresh tower of a type on a pad. invested tracks total gold for the sell refund.
export function buildTower(type, padIndex, x, y) {
  const def = TOWER_TYPES[type];
  return {
    id: nextTowerId++,
    type, padIndex, x, y,
    level: 1,
    invested: def.cost,
    cooldown: 0,
    angle: -Math.PI / 2,
    muzzle: 0, // muzzle-flash timer, drawn by render.js
  };
}

export function towerDamage(t) {
  return TOWER_TYPES[t.type].damage * UPGRADE_DAMAGE[t.level - 1];
}
export function towerRange(t) {
  return TOWER_TYPES[t.type].range * UPGRADE_RANGE[t.level - 1];
}
export function towerRate(t) {
  return TOWER_TYPES[t.type].rate * UPGRADE_RATE[t.level - 1];
}
export function towerCost(type) {
  return TOWER_TYPES[type].cost;
}
export function upgradeCost(t) {
  if (t.level >= 3) return null;
  return TOWER_TYPES[t.type].upgradeCost[t.level - 1];
}
export function upgradeTower(t) {
  const cost = upgradeCost(t);
  if (cost === null) return false;
  t.level += 1;
  t.invested += cost;
  return true;
}

// Targeting: the enemy furthest along the path inside range (and outside min range).
export function pickTarget(tower, enemies) {
  const range = towerRange(tower);
  const minRange = TOWER_TYPES[tower.type].minRange || 0;
  let best = null;
  for (const e of enemies) {
    if (e.dead || e.reachedCore) continue;
    const d = Math.hypot(e.x - tower.x, e.y - tower.y);
    if (d > range || d < minRange) continue;
    if (!best || e.distance > best.distance) best = e;
  }
  return best;
}

// Fire one shot at the target: returns a projectile, or null for instant hits.
// Frost applies its chill on firing; damage is applied by the projectile on arrival
// (mortar shells) or at once (spark/frost bolts are fast enough to be hitscan-like).
export function fireTower(tower, target, now) {
  const def = TOWER_TYPES[tower.type];
  tower.cooldown = 1 / towerRate(tower);
  tower.angle = Math.atan2(target.y - tower.y, target.x - tower.x);
  tower.muzzle = 0.07;
  if (tower.type === 'mortar') {
    return {
      x: tower.x, y: tower.y, tx: target.x, ty: target.y,
      speed: def.projSpeed, damage: towerDamage(tower),
      splash: def.splash * (tower.level >= 3 ? 1.4 : 1),
      fromTower: tower, target,
    };
  }
  // Spark and frost bolts land instantly at this range: apply damage now.
  const killed = damageEnemy(target, towerDamage(tower), now);
  if (tower.type === 'frost') {
    applySlow(target, def.slowPct, def.slowDur, now);
    if (tower.level >= 3) {
      // Level-3 frost chills nearby enemies too.
      // (handled by the caller through chillSplash below)
    }
  }
  return { instant: true, target, killed, x: tower.x, y: tower.y };
}

// Level-3 frost: chill every enemy near the primary target.
export function chillSplash(tower, target, enemies, now) {
  if (tower.type !== 'frost' || tower.level < 3) return;
  const def = TOWER_TYPES.frost;
  for (const e of enemies) {
    if (e.dead || e.reachedCore || e === target) continue;
    if (Math.hypot(e.x - target.x, e.y - target.y) <= 55) {
      applySlow(e, def.slowPct, def.slowDur, now);
    }
  }
}

// Level-3 spark: chain to the nearest other enemy in range for half damage.
export function chainHit(tower, target, enemies, now) {
  if (tower.type !== 'spark' || tower.level < 3) return null;
  let best = null, bestD = Infinity;
  for (const e of enemies) {
    if (e.dead || e.reachedCore || e === target) continue;
    const d = Math.hypot(e.x - target.x, e.y - target.y);
    if (d < bestD && d <= towerRange(tower)) { best = e; bestD = d; }
  }
  if (!best) return null;
  const killed = damageEnemy(best, towerDamage(tower) * 0.5, now);
  return { target: best, killed };
}

// Step all towers: cooldowns tick, each ready tower fires at its best target.
// Returns { projectiles, events } where events carry hit/kill info for feedback.
export function updateTowers(towers, enemies, projectiles, dt, now, onEvent) {
  for (const t of towers) {
    if (t.cooldown > 0) t.cooldown -= dt;
    if (t.muzzle > 0) t.muzzle -= dt;
    if (t.cooldown > 0) continue;
    const target = pickTarget(t, enemies);
    if (!target) continue;
    const shot = fireTower(t, target, now);
    if (shot.instant) {
      onEvent({ kind: 'shot', tower: t, target, killed: shot.killed });
      chillSplash(t, target, enemies, now);
      const chained = chainHit(t, target, enemies, now);
      if (chained) onEvent({ kind: 'chain', tower: t, target: chained.target, killed: chained.killed });
    } else {
      projectiles.push(shot);
      onEvent({ kind: 'lob', tower: t, target });
    }
  }
}

// Step mortar shells toward their target point; on arrival, splash damage.
export function updateProjectiles(projectiles, enemies, dt, now, onEvent) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    const dx = p.tx - p.x, dy = p.ty - p.y;
    const dist = Math.hypot(dx, dy);
    const step = p.speed * dt;
    if (dist <= step || dist < 6) {
      // Impact: splash everything in radius.
      let kills = 0;
      for (const e of enemies) {
        if (e.dead || e.reachedCore) continue;
        if (Math.hypot(e.x - p.tx, e.y - p.ty) <= p.splash) {
          if (damageEnemy(e, p.damage, now)) kills += 1;
        }
      }
      onEvent({ kind: 'explosion', x: p.tx, y: p.ty, radius: p.splash, kills });
      projectiles.splice(i, 1);
    } else {
      p.x += (dx / dist) * step;
      p.y += (dy / dist) * step;
    }
  }
}

// Is a point inside a pad's circle?
export function padAt(pads, x, y) {
  for (let i = 0; i < pads.length; i++) {
    if (Math.hypot(pads[i].x - x, pads[i].y - y) <= PAD_RADIUS + 6) return i;
  }
  return -1;
}
