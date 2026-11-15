// EMBERLINE economy: gold, lives, kills, score. Pure numbers, no drawing.
import {
  START_GOLD, START_LIVES, KILL_SCORE, WAVE_CLEAR_SCORE,
  VICTORY_LIFE_SCORE, WAVE_CLEAR_BONUS, SELL_RATE,
} from './config.js';

// Fresh economy state for a new run.
export function createEconomy() {
  return {
    gold: START_GOLD,
    lives: START_LIVES,
    kills: 0,
    goldEarned: 0,
    score: 0,
    wavesCleared: 0,
  };
}

// Can the player afford this price right now?
export function canAfford(eco, price) {
  return eco.gold >= price;
}

// Spend gold. Returns true on success, false when broke (no change).
export function spend(eco, price) {
  if (eco.gold < price) return false;
  eco.gold -= price;
  return true;
}

// Gold earned from a kill. Rewards scale slightly with the wave.
export function rewardKill(eco, baseReward, wave) {
  const amount = Math.max(1, Math.round(baseReward * (1 + 0.06 * (wave - 1))));
  eco.gold += amount;
  eco.goldEarned += amount;
  eco.kills += 1;
  eco.score += KILL_SCORE;
  return amount;
}

// Gold and score for clearing a wave.
export function rewardWaveClear(eco, wave) {
  const bonus = WAVE_CLEAR_BONUS(wave);
  eco.gold += bonus;
  eco.goldEarned += bonus;
  eco.wavesCleared += 1;
  eco.score += WAVE_CLEAR_SCORE;
  return bonus;
}

// The Core is hit: one enemy leaked through.
export function leakEnemy(eco) {
  eco.lives -= 1;
  return eco.lives;
}

// Refund for selling a tower: 70% of everything invested in it.
export function sellRefund(invested) {
  return Math.floor(invested * SELL_RATE);
}

// Final victory tally: remaining lives and banked gold join the score.
export function victoryBonus(eco) {
  const lifePoints = eco.lives * VICTORY_LIFE_SCORE;
  eco.score += lifePoints + eco.gold;
  return { lifePoints, bankedGold: eco.gold };
}
