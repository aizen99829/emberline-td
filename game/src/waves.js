// EMBERLINE waves: the 12-wave composition and the spawn schedule.
import {
  WAVES, TOTAL_WAVES, SPAWN_INTERVAL,
  SURGE_WAVE, SURGE_DELAY, SURGE_WARN_BEFORE, SURGE_COUNT, SURGE_SPEED_MUL,
} from './config.js';
import { spawnEnemy } from './enemies.js';

// Expand a wave's [type, count] table into a flat spawn list.
// The boss leads wave 12; everything else shuffles in small mixed groups.
export function waveSpawnList(wave) {
  const table = WAVES[wave - 1] || [];
  const list = [];
  for (const [type, count] of table) {
    for (let i = 0; i < count; i++) list.push(type);
  }
  if (wave === TOTAL_WAVES) {
    // Boss first, escorts trickling in behind it.
    const boss = list.shift();
    return [boss, ...shuffleInterleaved(list)];
  }
  return shuffleInterleaved(list);
}

// Interleave types so the wave arrives as mixed groups, not one type at a time.
function shuffleInterleaved(list) {
  const groups = {};
  for (const t of list) (groups[t] = groups[t] || []).push(t);
  const keys = Object.keys(groups);
  const out = [];
  let more = true;
  while (more) {
    more = false;
    for (const k of keys) {
      const g = groups[k];
      if (g.length > 0) { out.push(g.shift()); more = true; }
    }
  }
  return out;
}

// A wave spawner: hands out one enemy per SPAWN_INTERVAL until the list is spent.
// Wave 6 also carries the Ember Surge: a telegraphed rush of fast scuttlers
// part-way through the wave. The warning fires SURGE_WARN_BEFORE seconds
// before the rush lands, and the wave is not over until the rush has spawned.
export function createSpawner(wave) {
  const hasSurge = wave === SURGE_WAVE;
  return {
    wave,
    queue: waveSpawnList(wave),
    timer: 0.4, // first enemy 0.4s after the wave starts
    done: false,
    elapsed: 0,
    surgeWarnAt: hasSurge ? SURGE_DELAY - SURGE_WARN_BEFORE : Infinity,
    surgeAt: hasSurge ? SURGE_DELAY : Infinity,
    surgeWarned: !hasSurge,
    surgeSpawned: !hasSurge,
    surgePending: hasSurge ? SURGE_COUNT : 0,
  };
}

// One surge scuttler: a normal scuttler, but half again as fast, flagged so
// main.js can announce the moment the rush actually lands.
function spawnSurgeScuttler(wave, index) {
  const e = spawnEnemy('scuttler', wave);
  e.baseSpeed *= SURGE_SPEED_MUL;
  e.speed = e.baseSpeed;
  e.distance = -index * 30; // tight group: they march in a breath apart
  e.surge = true;
  return e;
}

// Step the spawner; returns freshly spawned enemies (possibly none).
// onSurgeWarn (optional) fires once, SURGE_WARN_BEFORE before the rush.
export function updateSpawner(spawner, dt, onSurgeWarn) {
  const born = [];
  if (spawner.done) return born;
  spawner.elapsed += dt;
  spawner.timer -= dt;
  while (spawner.timer <= 0 && spawner.queue.length > 0) {
    const type = spawner.queue.shift();
    born.push(spawnEnemy(type, spawner.wave));
    spawner.timer += SPAWN_INTERVAL;
  }
  if (!spawner.surgeWarned && spawner.elapsed >= spawner.surgeWarnAt) {
    spawner.surgeWarned = true;
    if (onSurgeWarn) onSurgeWarn();
  }
  if (!spawner.surgeSpawned && spawner.elapsed >= spawner.surgeAt) {
    spawner.surgeSpawned = true;
    spawner.surgePending = 0;
    for (let i = 0; i < SURGE_COUNT; i++) born.push(spawnSurgeScuttler(spawner.wave, i));
  }
  if (spawner.queue.length === 0 && spawner.surgeSpawned) spawner.done = true;
  return born;
}

// Is this wave over: spawner spent and no living enemies left?
export function waveIsOver(spawner, enemies) {
  if (!spawner.done) return false;
  return enemies.every((e) => e.dead || e.reachedCore);
}

// How many enemies remain in this wave (unspawned + alive + surge pending)?
export function waveRemaining(spawner, enemies) {
  const alive = enemies.filter((e) => !e.dead && !e.reachedCore).length;
  return spawner.queue.length + alive + (spawner.surgePending || 0);
}
