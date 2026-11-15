// EMBERLINE config: the valley, the path, the pads, every tower, enemy and wave.
// One place for all tuning so balance changes never touch game logic.
export const CANVAS_W = 1280;
export const CANVAS_H = 720;
export const TILE = 44; // path half-width is TILE / 2

// The ember path: a serpentine road the creatures march from the left edge to the Core.
export const PATH = [
  { x: -20, y: 100 },
  { x: 880, y: 100 },
  { x: 880, y: 260 },
  { x: 160, y: 260 },
  { x: 160, y: 430 },
  { x: 1020, y: 430 },
  { x: 1020, y: 600 },
  { x: 620, y: 600 },
  { x: 620, y: 700 },
];

// The glowing Core the creatures want to reach.
export const CORE = { x: 620, y: 648, radius: 30 };

// Stone build pads beside the path. Each pad holds one tower.
export const PADS = [
  { x: 200, y: 180 }, { x: 420, y: 180 }, { x: 640, y: 180 }, { x: 800, y: 180 },
  { x: 300, y: 345 }, { x: 540, y: 345 }, { x: 780, y: 345 }, { x: 1080, y: 345 },
  { x: 300, y: 515 }, { x: 540, y: 515 }, { x: 780, y: 515 }, { x: 1080, y: 515 },
];
export const PAD_RADIUS = 20;

// Towers. damage/range/rate are level-1 values; upgrades multiply them.
export const TOWER_TYPES = {
  spark: {
    name: 'Spark', cost: 50, range: 115, damage: 9, rate: 2.6, projSpeed: 520,
    color: '#ffb020', dark: '#8a5a00',
    desc: 'Fast ember bolts. Cheap, quick, honest damage.',
    upgradeCost: [45, 70],
  },
  frost: {
    name: 'Frost', cost: 75, range: 105, damage: 4, rate: 1.1, projSpeed: 380,
    color: '#4fe0d0', dark: '#0d5a52',
    slowPct: 0.45, slowDur: 1.4,
    desc: 'Chills what it hits, slowing the march.',
    upgradeCost: [65, 105],
  },
  mortar: {
    name: 'Mortar', cost: 150, range: 210, minRange: 45, damage: 42, rate: 0.55,
    projSpeed: 260, splash: 62, color: '#ff6a3d', dark: '#7a2400',
    desc: 'Slow lobbed shells. Huge splash damage, long range.',
    upgradeCost: [130, 210],
  },
  lance: {
    name: 'Lance', cost: 190, range: 300, damage: 55, rate: 0.42,
    pierceWidth: 18, color: '#c792ff', dark: '#4a1e8a',
    desc: 'Piercing beam. Slow, huge range, hits everything in line.',
    upgradeCost: [160, 250],
  },
};
export const TOWER_ORDER = ['spark', 'frost', 'mortar', 'lance'];
export const UPGRADE_DAMAGE = [1, 1.45, 2.1];
export const UPGRADE_RANGE = [1, 1.15, 1.32];
export const UPGRADE_RATE = [1, 1, 1.25];
export const SELL_RATE = 0.7;

// Enemies. hp/speed are wave-1 values; waves scale them.
export const ENEMY_TYPES = {
  scuttler: { name: 'Scuttler', hp: 34, speed: 78, reward: 6, radius: 11, color: '#ff9a3d', score: 10 },
  brute: { name: 'Brute', hp: 170, speed: 40, armour: 3, reward: 13, radius: 16, color: '#c98bb0', score: 15 },
  splitter: { name: 'Splitter', hp: 70, speed: 58, reward: 11, radius: 13, color: '#e8d44d', score: 15, splits: 'scuttler' },
  regen: { name: 'Regenerator', hp: 100, speed: 52, regen: 5, reward: 11, radius: 13, color: '#7ddc5a', score: 15 },
  aegis: {
    name: 'Aegis', hp: 260, speed: 34, reward: 16, radius: 15, color: '#a8c8e8', score: 20,
    auraRadius: 95, auraDamageCut: 0.4, // nearby allies (never an Aegis) take 40% less damage
  },
  boss: { name: 'Ember Colossus', hp: 5200, speed: 26, reward: 350, radius: 30, color: '#ff2d55', score: 500, slowResist: 0.5 },
};
export const HP_SCALE_PER_WAVE = 0.27;
export const SPEED_SCALE_PER_WAVE = 0.02;
export const SPEED_SCALE_CAP = 1.15;
export const REWARD_SCALE_PER_WAVE = 0.06;

// Wave table: 12 waves, escalating. Each entry is [type, count].
export const WAVES = [
  [['scuttler', 8]],
  [['scuttler', 12]],
  [['scuttler', 8], ['brute', 4]],
  [['scuttler', 10], ['splitter', 4]],
  [['scuttler', 6], ['brute', 6], ['regen', 4]],
  [['scuttler', 12], ['splitter', 6], ['brute', 4]],
  [['brute', 8], ['regen', 6], ['splitter', 6], ['aegis', 1]],
  [['scuttler', 16], ['brute', 8], ['regen', 6], ['aegis', 1]],
  [['splitter', 10], ['brute', 8], ['regen', 8], ['aegis', 2]],
  [['scuttler', 20], ['brute', 10], ['splitter', 8], ['aegis', 2]],
  [['brute', 12], ['regen', 10], ['splitter', 10], ['scuttler', 6], ['aegis', 2]],
  [['boss', 1], ['scuttler', 8], ['brute', 4]],
];
export const TOTAL_WAVES = 12;
export const SPAWN_INTERVAL = 0.9;
export const WAVE_CLEAR_BONUS = (wave) => 30 + 12 * wave;

// The Ember Surge: on wave 6, a rush of fast scuttlers lands SURGE_DELAY
// seconds into the wave, announced SURGE_WARN_BEFORE seconds ahead of it.
export const SURGE_WAVE = 6;
export const SURGE_DELAY = 11;
export const SURGE_WARN_BEFORE = 3;
export const SURGE_COUNT = 8;
export const SURGE_SPEED_MUL = 1.55;

// Kill streaks: kills chained inside STREAK_WINDOW seconds build a streak;
// every 5th streak kill is announced, every 10th pays a small gold bonus.
export const STREAK_WINDOW = 2.5;
export const STREAK_BONUS_GOLD = 15;

// Economy and scoring.
export const START_GOLD = 180;
export const START_LIVES = 20;
export const KILL_SCORE = 10;
export const WAVE_CLEAR_SCORE = 100;
export const VICTORY_LIFE_SCORE = 50;

// Palette: deep indigo night, amber fire, teal frost.
export const PALETTE = {
  skyTop: '#0b0e24', skyMid: '#171233', skyBottom: '#241a3d',
  ground: '#141126', groundAlt: '#181431',
  path: '#2e2440', pathEdge: '#57437a', pathStone: '#3a2d55',
  pad: '#241d3d', padEdge: '#6b5a9e', padHover: '#3a2f63',
  coreGlow: '#ffd76a', coreInner: '#fff3c4',
  text: '#f2ead8', textDim: '#b8aec9', gold: '#ffcf4d',
  danger: '#ff4d6a', ok: '#7ddc5a',
};

// Distance from a point to a path segment, for pad validation and rendering.
export function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx, cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

export function pathLength() {
  let total = 0;
  for (let i = 1; i < PATH.length; i++) total += Math.hypot(PATH[i].x - PATH[i - 1].x, PATH[i].y - PATH[i - 1].y);
  return total;
}
