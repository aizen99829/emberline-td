// EMBERLINE input: mouse clicks and keyboard, translated into game actions.
// Hit-tests against ui.layout so buttons, pads and towers share one geometry.
import { CANVAS_W, CANVAS_H } from './config.js';
import { padAt } from './towers.js';
import { layout, inRect, buildMenuCardAt, towerMenuButtonAt } from './ui.js';

// Convert a DOM mouse event into canvas coordinates (canvas is scaled by CSS).
export function canvasPos(canvas, event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * CANVAS_W,
    y: ((event.clientY - rect.top) / rect.height) * CANVAS_H,
  };
}

// Attach listeners. `actions` is the set of callbacks main.js wires up.
export function attachInput(canvas, actions) {
  canvas.addEventListener('click', (event) => {
    const pos = canvasPos(canvas, event);
    actions.click(pos.x, pos.y);
  });
  canvas.addEventListener('mousemove', (event) => {
    const pos = canvasPos(canvas, event);
    actions.hover(pos.x, pos.y);
  });
  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    const k = event.key.toLowerCase();
    if (k === 'p') actions.togglePause();
    else if (k === ' ') { event.preventDefault(); actions.toggleSpeed(); }
    else if (k === 'm') actions.toggleMute();
    else if (k === 'r') actions.restart();
    else if (k === 'escape') actions.closeMenus();
    else if (k === 'enter') actions.confirm();
    // 1/2/3 retarget the selected tower: First / Strong / Close.
    else if (k === '1' && actions.setTargetMode) actions.setTargetMode('first');
    else if (k === '2' && actions.setTargetMode) actions.setTargetMode('strong');
    else if (k === '3' && actions.setTargetMode) actions.setTargetMode('close');
  });
}

// Resolve a click at (x, y) into an action, given the current state.
// Returns one of: {action:'start'} | {action:'restart'} | {action:'startWave'}
// | {action:'hud', id} | {action:'selectPad', pad} | {action:'selectTower', tower}
// | {action:'build', type} | {action:'upgrade'} | {action:'sell'} | {action:'closeMenus'}
// | {action:'setTarget', mode} | {action:'deselect'}
export function resolveClick(state, x, y) {
  const L = layout(state);

  if (state.mode === 'title') {
    if (inRect(x, y, L.startButton)) return { action: 'start' };
    return { action: 'none' };
  }
  if (state.mode === 'victory' || state.mode === 'defeat') {
    if (inRect(x, y, L.restartButton)) return { action: 'restart' };
    return { action: 'none' };
  }
  if (state.mode === 'paused') {
    for (const b of L.hudButtons) {
      if (inRect(x, y, b)) return { action: 'hud', id: b.id };
    }
    return { action: 'none' };
  }

  // Playing: HUD buttons first.
  for (const b of L.hudButtons) {
    if (inRect(x, y, b)) return { action: 'hud', id: b.id };
  }
  if (L.startWaveButton && inRect(x, y, L.startWaveButton)) return { action: 'startWave' };

  // Open menus swallow their own clicks.
  if (L.buildMenu) {
    const type = buildMenuCardAt(L, x, y);
    if (type) return { action: 'build', type };
    if (inRect(x, y, L.buildMenu)) return { action: 'none' };
  }
  if (L.towerMenu) {
    const btn = towerMenuButtonAt(L, x, y);
    if (btn) {
      if (btn.disabled) return { action: 'none' };
      if (btn.kind === 'target') return { action: 'setTarget', mode: btn.mode };
      if (btn.id === 'upgrade') return { action: 'upgrade' };
      if (btn.id === 'sell') return { action: 'sell' };
      if (btn.id === 'closeMenu') return { action: 'closeMenus' };
    }
    if (inRect(x, y, L.towerMenu)) return { action: 'none' };
  }

  // A tower was clicked?
  for (const t of state.towers) {
    if (Math.hypot(t.x - x, t.y - y) <= 22) return { action: 'selectTower', tower: t };
  }
  // A pad was clicked?
  const pad = padAt(state.pads, x, y);
  if (pad >= 0) {
    const occupied = state.towers.some((t) => t.padIndex === pad);
    if (!occupied) return { action: 'selectPad', pad };
    const tower = state.towers.find((t) => t.padIndex === pad);
    if (tower) return { action: 'selectTower', tower };
  }
  return { action: 'deselect' };
}
