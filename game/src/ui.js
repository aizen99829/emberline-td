// EMBERLINE ui: where every button and menu sits, and the numbers the HUD shows.
// render.js draws from this layout and input.js hit-tests against it — one source.
import { CANVAS_W, CANVAS_H, PADS, TOWER_ORDER, TOWER_TYPES, TOTAL_WAVES } from './config.js';
import { upgradeCost } from './towers.js';
import { sellRefund } from './economy.js';

export function formatGold(n) {
  return String(Math.floor(n));
}

// Hit-test helper: is (x, y) inside rect r?
export function inRect(x, y, r) {
  return r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

// The full layout for the current state. Buttons carry an id input.js acts on.
export function layout(state) {
  const L = {
    hudButtons: [
      { id: 'speed', label: state.speed === 1 ? '▶ 1x' : '▶▶ 2x', x: CANVAS_W - 260, y: 8, w: 70, h: 30, active: state.speed === 2 },
      { id: 'pause', label: state.mode === 'paused' ? '▶ Resume' : '❚❚ Pause', x: CANVAS_W - 182, y: 8, w: 84, h: 30 },
      { id: 'mute', label: state.muted ? '🔇 Muted' : '🔊 Sound', x: CANVAS_W - 90, y: 8, w: 82, h: 30 },
    ],
    startButton: { id: 'start', x: CANVAS_W / 2 - 170, y: 400, w: 340, h: 56 },
    restartButton: { id: 'restart', x: CANVAS_W / 2 - 160, y: 480, w: 320, h: 54 },
    startWaveButton: null,
    buildMenu: null,
    towerMenu: null,
  };

  if (state.mode === 'playing' && state.phase === 'build') {
    const next = Math.min(state.wave + 1, TOTAL_WAVES);
    L.startWaveButton = {
      id: 'startWave',
      label: state.wave === 0 ? '▶  START WAVE 1' : `▶  START WAVE ${next}`,
      x: CANVAS_W - 260, y: CANVAS_H - 64, w: 236, h: 44,
    };
  }

  if (state.selectedPad >= 0 && state.mode === 'playing') {
    const pad = PADS[state.selectedPad];
    const w = 360, h = 250;
    let x = Math.max(12, Math.min(CANVAS_W - w - 12, pad.x - w / 2));
    let y = Math.max(56, Math.min(CANVAS_H - h - 12, pad.y - h - 30));
    L.buildMenu = {
      x, y, w, h,
      cards: TOWER_ORDER.map((type, i) => ({
        type,
        x: x + 12, y: y + 44 + i * 66, w: w - 24, h: 58,
      })),
    };
  }

  if (state.selectedTower && state.mode === 'playing') {
    const t = state.selectedTower;
    const w = 340, h = 150;
    let x = Math.max(12, Math.min(CANVAS_W - w - 12, t.x - w / 2));
    let y = Math.max(56, Math.min(CANVAS_H - h - 12, t.y - h - 30));
    const up = upgradeCost(t);
    L.towerMenu = {
      x, y, w, h, tower: t,
      buttons: [
        {
          id: 'upgrade', kind: 'upgrade',
          label: up === null ? 'MAX LEVEL' : `Upgrade — ◆ ${up}`,
          x: x + 12, y: y + 78, w: 200, h: 34,
          disabled: up === null || state.eco.gold < up,
        },
        {
          id: 'sell', kind: 'sell',
          label: `Sell — ◆ ${sellRefund(t.invested)}`,
          x: x + 224, y: y + 78, w: 104, h: 34,
          disabled: false,
        },
        {
          id: 'closeMenu', kind: 'close',
          label: '✕', x: x + w - 34, y: y + 8, w: 26, h: 26,
          disabled: false,
        },
      ],
    };
  }

  return L;
}

// Which tower card (if any) was clicked in the build menu?
export function buildMenuCardAt(L, x, y) {
  if (!L.buildMenu) return null;
  for (const card of L.buildMenu.cards) {
    if (inRect(x, y, card)) return card.type;
  }
  return null;
}

// Which tower-menu button (if any) was clicked?
export function towerMenuButtonAt(L, x, y) {
  if (!L.towerMenu) return null;
  for (const b of L.towerMenu.buttons) {
    if (inRect(x, y, b)) return b;
  }
  return null;
}
