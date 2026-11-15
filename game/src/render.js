// EMBERLINE render: every pixel the player sees, drawn on one Canvas 2D context.
// Pure drawing from state — no game logic here.
import { CANVAS_W, CANVAS_H, PATH, CORE, PADS, PAD_RADIUS, PALETTE, TOWER_TYPES, TOWER_ORDER, ENEMY_TYPES, TOTAL_WAVES, TILE } from './config.js';
import { towerDamage, towerRange, towerRate, upgradeCost } from './towers.js';
import { layout, formatGold } from './ui.js';

// Fixed star field so the sky never flickers between frames.
const STARS = [];
{
  let seed = 1234567;
  const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < 90; i++) {
    STARS.push({ x: rand() * CANVAS_W, y: rand() * 300, r: 0.5 + rand() * 1.4, tw: rand() * Math.PI * 2 });
  }
}
const MOUNTAINS = [
  { x: 0, y: 210, w: 420, h: 150 }, { x: 300, y: 180, w: 520, h: 180 },
  { x: 760, y: 200, w: 520, h: 160 },
];

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawSky(ctx, time) {
  const g = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
  g.addColorStop(0, PALETTE.skyTop);
  g.addColorStop(0.55, PALETTE.skyMid);
  g.addColorStop(1, PALETTE.skyBottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  // Aurora ribbons in two parallax depths: a far layer crawling high in the
  // sky and a near layer drifting lower and faster — the sky feels deep.
  ctx.save();
  for (const layer of [
    { drift: 0.05, base: 34, alpha: 0.1, bands: [['#8a5cff', 1.3, 18], ['#3fe0c0', 3.9, 14]] },
    { drift: 0.13, base: 74, alpha: 0.17, bands: [['#3fe0c0', 0, 26], ['#8a5cff', 2.1, 32], ['#3fe0c0', 4.2, 20]] },
  ]) {
    ctx.globalAlpha = layer.alpha;
    for (const [hue, phase, amp] of layer.bands) {
      ctx.fillStyle = hue;
      ctx.beginPath();
      ctx.moveTo(0, layer.base);
      for (let x = 0; x <= CANVAS_W; x += 32) {
        ctx.lineTo(x, layer.base + Math.sin(x / 260 + phase + time * layer.drift) * amp + Math.sin(x / 90 + time * layer.drift * 1.7) * 8);
      }
      ctx.lineTo(CANVAS_W, 0); ctx.lineTo(0, 0); ctx.closePath(); ctx.fill();
    }
  }
  ctx.restore();
  // Stars.
  for (const s of STARS) {
    ctx.globalAlpha = 0.35 + 0.35 * Math.sin(time * 1.4 + s.tw);
    ctx.fillStyle = '#e8ecff';
    ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  // Mountain ridges, far and near, swaying a breath apart (parallax).
  const ridges = [
    { color: '#0c0918', sway: Math.sin(time * 0.02) * 5, lift: 26 },
    { color: '#100d20', sway: Math.sin(time * 0.045) * 11, lift: 0 },
  ];
  for (const ridge of ridges) {
    ctx.fillStyle = ridge.color;
    for (const m of MOUNTAINS) {
      ctx.beginPath();
      ctx.moveTo(m.x - 40 + ridge.sway, m.y + m.h);
      ctx.lineTo(m.x + m.w / 2 + ridge.sway, m.y + ridge.lift);
      ctx.lineTo(m.x + m.w + 40 + ridge.sway, m.y + m.h);
      ctx.closePath(); ctx.fill();
    }
  }
  // Ground.
  ctx.fillStyle = PALETTE.ground;
  ctx.fillRect(0, 300, CANVAS_W, CANVAS_H - 300);
  ctx.fillStyle = PALETTE.groundAlt;
  for (let i = 0; i < 40; i++) {
    const x = (i * 173) % CANVAS_W, y = 320 + ((i * 97) % 380);
    ctx.globalAlpha = 0.25;
    ctx.beginPath(); ctx.ellipse(x, y, 26 + (i % 5) * 8, 10, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawPath(ctx) {
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // Glow edge.
  ctx.strokeStyle = PALETTE.pathEdge;
  ctx.globalAlpha = 0.5; ctx.lineWidth = TILE + 10;
  ctx.beginPath();
  PATH.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.stroke();
  // Stone road.
  ctx.globalAlpha = 1;
  ctx.strokeStyle = PALETTE.path;
  ctx.lineWidth = TILE;
  ctx.beginPath();
  PATH.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.stroke();
  // Centre dashes.
  ctx.strokeStyle = PALETTE.pathStone;
  ctx.lineWidth = 3;
  ctx.setLineDash([14, 22]);
  ctx.beginPath();
  PATH.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawPads(ctx, state) {
  for (let i = 0; i < PADS.length; i++) {
    const p = PADS[i];
    const occupied = state.towers.some((t) => t.padIndex === i);
    const hovered = state.hoverPad === i || state.selectedPad === i;
    ctx.beginPath();
    ctx.arc(p.x, p.y, PAD_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = hovered ? PALETTE.padHover : PALETTE.pad;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = hovered ? '#a894e0' : PALETTE.padEdge;
    ctx.stroke();
    if (!occupied) {
      ctx.fillStyle = 'rgba(200,180,255,0.35)';
      ctx.font = 'bold 20px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('+', p.x, p.y + 1);
    }
  }
}

function drawCore(ctx, state) {
  const pulse = 1 + 0.08 * Math.sin(state.time * 2.2);
  const glow = ctx.createRadialGradient(CORE.x, CORE.y, 4, CORE.x, CORE.y, 90 * pulse);
  glow.addColorStop(0, 'rgba(255,215,106,0.55)');
  glow.addColorStop(0.5, 'rgba(255,180,60,0.18)');
  glow.addColorStop(1, 'rgba(255,180,60,0)');
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(CORE.x, CORE.y, 90 * pulse, 0, Math.PI * 2); ctx.fill();
  // Crystal: a faceted diamond.
  ctx.save();
  ctx.translate(CORE.x, CORE.y);
  ctx.rotate(Math.sin(state.time * 0.8) * 0.06);
  ctx.fillStyle = PALETTE.coreInner;
  ctx.beginPath();
  ctx.moveTo(0, -CORE.radius); ctx.lineTo(CORE.radius * 0.72, 0);
  ctx.lineTo(0, CORE.radius); ctx.lineTo(-CORE.radius * 0.72, 0);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,180,60,0.55)';
  ctx.beginPath();
  ctx.moveTo(0, -CORE.radius); ctx.lineTo(CORE.radius * 0.72, 0); ctx.lineTo(0, 0);
  ctx.closePath(); ctx.fill();
  ctx.restore();
  // Core HP ring.
  ctx.lineWidth = 4;
  ctx.strokeStyle = state.eco.lives <= 5 ? PALETTE.danger : PALETTE.coreGlow;
  ctx.beginPath();
  ctx.arc(CORE.x, CORE.y, CORE.radius + 10, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * state.eco.lives) / 20);
  ctx.stroke();
}

function drawTowerShape(ctx, t, time, selectedTower = null) {
  const def = TOWER_TYPES[t.type];
  ctx.save();
  ctx.translate(t.x, t.y);
  // Base.
  ctx.fillStyle = '#1c1730';
  ctx.beginPath(); ctx.arc(0, 0, 17, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = def.dark; ctx.stroke();
  // Barrel / head aims at the target angle.
  ctx.rotate(t.angle);
  ctx.fillStyle = def.color;
  if (t.type === 'spark') {
    ctx.fillRect(0, -3, 20, 6);
    ctx.beginPath(); ctx.arc(20, 0, 4, 0, Math.PI * 2); ctx.fill();
  } else if (t.type === 'frost') {
    ctx.beginPath();
    ctx.moveTo(0, -7); ctx.lineTo(18, 0); ctx.lineTo(0, 7); ctx.closePath(); ctx.fill();
  } else if (t.type === 'lance') {
    // Long slim barrel with a bright crystal tip — reads as a beam lance.
    ctx.fillRect(0, -2.5, 30, 5);
    ctx.beginPath();
    ctx.moveTo(30, -5); ctx.lineTo(38, 0); ctx.lineTo(30, 5); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(33, 0, 2.5, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.fillRect(-2, -6, 20, 12);
    ctx.beginPath(); ctx.arc(18, 0, 6, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  // Level pips.
  for (let i = 0; i < t.level; i++) {
    ctx.fillStyle = def.color;
    ctx.beginPath(); ctx.arc(t.x - 8 + i * 8, t.y + 22, 2.5, 0, Math.PI * 2); ctx.fill();
  }
  // Muzzle flash.
  if (t.muzzle > 0) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, t.muzzle / 0.07);
    ctx.fillStyle = '#fff2b0';
    const mx = t.x + Math.cos(t.angle) * 24, my = t.y + Math.sin(t.angle) * 24;
    ctx.beginPath(); ctx.arc(mx, my, 7, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  // Range ring when selected.
  if (selectedTower === t) {
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = def.color;
    ctx.beginPath(); ctx.arc(t.x, t.y, towerRange(t), 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = def.color; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(t.x, t.y, towerRange(t), 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
}

function drawEnemyShape(ctx, e, time) {
  // An Aegis projects its shield aura: a pale dashed ring, so the protected
  // pack is obvious and the priority target reads at a glance.
  if (e.type === 'aegis') {
    ctx.save();
    ctx.globalAlpha = 0.05 + 0.015 * Math.sin(time * 2);
    ctx.fillStyle = e.color;
    ctx.beginPath(); ctx.arc(e.x, e.y, ENEMY_TYPES.aegis.auraRadius, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = e.color; ctx.lineWidth = 1.5;
    ctx.setLineDash([8, 7]);
    ctx.beginPath(); ctx.arc(e.x, e.y, ENEMY_TYPES.aegis.auraRadius, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
  ctx.save();
  ctx.translate(e.x, e.y);
  if (e.flash > 0) ctx.globalAlpha = 0.7;
  // Glow.
  const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, e.radius + 12);
  glow.addColorStop(0, e.color + 'aa');
  glow.addColorStop(1, e.color + '00');
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(0, 0, e.radius + 12, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
  // Body: distinct silhouettes per type.
  ctx.fillStyle = e.color;
  if (e.type === 'scuttler') {
    ctx.beginPath(); ctx.arc(0, 0, e.radius, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2a1400';
    ctx.beginPath(); ctx.arc(-4, -3, 2.5, 0, Math.PI * 2); ctx.arc(4, -3, 2.5, 0, Math.PI * 2); ctx.fill();
  } else if (e.type === 'brute') {
    roundRect(ctx, -e.radius, -e.radius * 0.8, e.radius * 2, e.radius * 1.6, 5);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(-e.radius, -2, e.radius * 2, 4);
  } else if (e.type === 'splitter') {
    ctx.beginPath(); ctx.arc(0, 0, e.radius, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#7a6400';
    ctx.beginPath(); ctx.arc(-e.radius * 0.45, 0, e.radius * 0.4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(e.radius * 0.45, 0, e.radius * 0.4, 0, Math.PI * 2); ctx.fill();
  } else if (e.type === 'regen') {
    ctx.beginPath(); ctx.arc(0, 0, e.radius, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#d8ffd0'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, e.radius * 0.55, 0, Math.PI * 2); ctx.stroke();
  } else if (e.type === 'aegis') {
    // Hexagonal shield-bearer with a bright rim and a dark core.
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i + Math.PI / 6;
      const px = Math.cos(a) * e.radius, py = Math.sin(a) * e.radius;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#eaf6ff'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#33506e';
    ctx.beginPath(); ctx.arc(0, 0, e.radius * 0.45, 0, Math.PI * 2); ctx.fill();
  } else if (e.type === 'boss') {
    ctx.beginPath(); ctx.arc(0, 0, e.radius, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#7a0020';
    ctx.beginPath(); ctx.arc(-10, -8, 5, 0, Math.PI * 2); ctx.arc(10, -8, 5, 0, Math.PI * 2); ctx.fill();
    // Crown spikes.
    ctx.fillStyle = '#ffb020';
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 12 - 5, -e.radius + 4); ctx.lineTo(i * 12, -e.radius - 12); ctx.lineTo(i * 12 + 5, -e.radius + 4);
      ctx.closePath(); ctx.fill();
    }
  }
  ctx.restore();
  // HP bar.
  if (e.hp < e.maxHp) {
    const w = e.radius * 2;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(e.x - w / 2, e.y - e.radius - 9, w, 4);
    ctx.fillStyle = e.hp / e.maxHp > 0.5 ? '#7ddc5a' : e.hp / e.maxHp > 0.25 ? '#ffcf4d' : '#ff4d6a';
    ctx.fillRect(e.x - w / 2, e.y - e.radius - 9, w * Math.max(0, e.hp / e.maxHp), 4);
  }
  // Slow tint.
  if (e.slowUntil > time) {
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = '#4fe0d0'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(e.x, e.y, e.radius + 3, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
  // Shielded by an Aegis aura: a pale ring, distinct from the teal slow tint.
  if (e.shielded) {
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = '#a8c8e8'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(e.x, e.y, e.radius + 6, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
}

function drawParticles(ctx, state) {
  for (const p of state.particles) {
    if (p.ambient && p.layer === 2) continue; // near embers draw in front, below
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// Near-layer ambient embers, drawn over the world for depth.
function drawForegroundEmbers(ctx, state) {
  for (const p of state.particles) {
    if (!p.ambient || p.layer !== 2) continue;
    const a = Math.max(0, p.life / p.maxLife);
    ctx.globalAlpha = a * 0.35;
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 2.1, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = a;
    ctx.fillStyle = '#ffe9b0';
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 0.7, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawProjectiles(ctx, state) {
  for (const p of state.projectiles) {
    ctx.save();
    ctx.fillStyle = '#ffb020';
    ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,176,32,0.4)';
    ctx.beginPath(); ctx.arc(p.x, p.y, 8, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  // Instant bolt tracers (spark/frost shots, lance beams this frame).
  for (const tr of state.tracers) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, tr.life / (tr.maxLife || 0.12));
    ctx.strokeStyle = tr.color; ctx.lineWidth = tr.width || 2;
    ctx.beginPath(); ctx.moveTo(tr.x1, tr.y1); ctx.lineTo(tr.x2, tr.y2); ctx.stroke();
    ctx.restore();
  }
}

function drawFloaters(ctx, state) {
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const f of state.floaters) {
    ctx.globalAlpha = Math.max(0, f.life / f.maxLife);
    ctx.font = `bold ${f.size || 14}px sans-serif`;
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
}

function drawGhost(ctx, state) {
  if (state.selectedPad < 0 || state.ghostType === null) return;
  const pad = PADS[state.selectedPad];
  const def = TOWER_TYPES[state.ghostType];
  ctx.save();
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = def.color;
  ctx.beginPath(); ctx.arc(pad.x, pad.y, towerRange({ type: state.ghostType, level: 1 }), 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 0.8;
  ctx.strokeStyle = def.color; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(pad.x, pad.y, towerRange({ type: state.ghostType, level: 1 }), 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = 0.6;
  ctx.fillStyle = def.color;
  ctx.beginPath(); ctx.arc(pad.x, pad.y, 14, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawHud(ctx, state, L) {
  // Top bar.
  ctx.fillStyle = 'rgba(10,8,24,0.78)';
  ctx.fillRect(0, 0, CANVAS_W, 46);
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.font = 'bold 18px sans-serif';
  ctx.fillStyle = PALETTE.gold;
  ctx.fillText(`◆ ${formatGold(state.eco.gold)} gold`, 16, 24);
  ctx.fillStyle = state.eco.lives <= 5 ? PALETTE.danger : PALETTE.text;
  ctx.fillText(`♥ ${state.eco.lives} core`, 190, 24);
  ctx.fillStyle = PALETTE.text;
  ctx.fillText(`Wave ${Math.max(1, state.wave)} / ${TOTAL_WAVES}`, 330, 24);
  ctx.fillText(`Score ${state.eco.score}`, 470, 24);
  if (state.phase === 'combat' && state.spawner) {
    const remaining = state.waveRemaining;
    ctx.fillStyle = PALETTE.textDim;
    ctx.font = '16px sans-serif';
    ctx.fillText(`enemies left: ${remaining}`, 620, 24);
  }
  // Top-right buttons.
  for (const b of L.hudButtons) {
    ctx.fillStyle = b.active ? '#3a2f63' : '#241d3d';
    roundRect(ctx, b.x, b.y, b.w, b.h, 6);
    ctx.fill();
    ctx.strokeStyle = '#6b5a9e'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = PALETTE.text;
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 1);
  }
  // Start-wave button during build phase.
  if (state.mode === 'playing' && state.phase === 'build' && L.startWaveButton) {
    const b = L.startWaveButton;
    ctx.fillStyle = '#7a4d00';
    roundRect(ctx, b.x, b.y, b.w, b.h, 8);
    ctx.fill();
    ctx.strokeStyle = PALETTE.gold; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#fff3c4';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 1);
  }
  // Wave banner.
  if (state.waveBanner && state.waveBanner.t > 0) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, state.waveBanner.t);
    ctx.font = 'bold 44px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd76a';
    ctx.shadowColor = '#ff6a00'; ctx.shadowBlur = 24;
    ctx.fillText(state.waveBanner.text, CANVAS_W / 2, 150);
    ctx.restore();
  }
  // Kill-streak: a live counter by the score, and a shout when a milestone lands.
  if (state.streak >= 3 && state.mode === 'playing') {
    ctx.fillStyle = '#ff9a3d';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`🔥 streak x${state.streak}`, 700, 24);
  }
  if (state.streakBanner && state.streakBanner.t > 0) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, state.streakBanner.t);
    ctx.font = 'bold 30px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffb020';
    ctx.shadowColor = '#ff4400'; ctx.shadowBlur = 16;
    ctx.fillText(state.streakBanner.text, CANVAS_W / 2, 196);
    ctx.restore();
  }
}

function drawBuildMenu(ctx, state, L) {
  const m = L.buildMenu;
  if (!m) return;
  ctx.fillStyle = 'rgba(10,8,24,0.92)';
  roundRect(ctx, m.x, m.y, m.w, m.h, 10);
  ctx.fill();
  ctx.strokeStyle = '#6b5a9e'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = PALETTE.text;
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('Build tower', m.x + 14, m.y + 24);
  for (const card of m.cards) {
    const def = TOWER_TYPES[card.type];
    const afford = state.eco.gold >= def.cost;
    ctx.fillStyle = afford ? '#241d3d' : '#1a1428';
    roundRect(ctx, card.x, card.y, card.w, card.h, 8);
    ctx.fill();
    ctx.strokeStyle = afford ? def.color : '#4a3f6e'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = def.color;
    ctx.beginPath(); ctx.arc(card.x + 22, card.y + 22, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = afford ? PALETTE.text : PALETTE.textDim;
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText(`${def.name} — ◆ ${def.cost}`, card.x + 40, card.y + 18);
    ctx.font = '12px sans-serif';
    ctx.fillStyle = PALETTE.textDim;
    ctx.fillText(def.desc, card.x + 40, card.y + 38);
    ctx.fillText(`DMG ${def.damage} · RNG ${def.range} · ${def.rate}/s`, card.x + 14, card.y + 60);
  }
  ctx.fillStyle = PALETTE.textDim;
  ctx.font = '12px sans-serif';
  ctx.fillText('Click a card to build · Esc to close', m.x + 14, m.y + m.h - 12);
}

function drawTowerMenu(ctx, state, L) {
  const m = L.towerMenu;
  if (!m) return;
  const t = m.tower;
  const def = TOWER_TYPES[t.type];
  ctx.fillStyle = 'rgba(10,8,24,0.92)';
  roundRect(ctx, m.x, m.y, m.w, m.h, 10);
  ctx.fill();
  ctx.strokeStyle = def.color; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = def.color;
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`${def.name}  ${'●'.repeat(t.level)}${'○'.repeat(3 - t.level)}`, m.x + 14, m.y + 24);
  ctx.fillStyle = PALETTE.text;
  ctx.font = '14px sans-serif';
  ctx.fillText(`Damage ${Math.round(towerDamage(t))}   Range ${Math.round(towerRange(t))}   Rate ${towerRate(t).toFixed(2)}/s`, m.x + 14, m.y + 48);
  ctx.fillStyle = PALETTE.textDim;
  ctx.font = 'bold 11px sans-serif';
  ctx.fillText('TARGETING  (or keys 1 / 2 / 3)', m.x + 14, m.y + 66);
  for (const b of m.buttons) {
    const disabled = b.disabled;
    ctx.fillStyle = disabled ? '#1a1428' : b.active ? '#4a3a7d' : b.kind === 'sell' ? '#3d1a24' : '#2a2145';
    roundRect(ctx, b.x, b.y, b.w, b.h, 6);
    ctx.fill();
    ctx.strokeStyle = disabled ? '#4a3f6e' : def.color; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = disabled ? PALETTE.textDim : PALETTE.text;
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 1);
  }
}

function drawTitle(ctx, state, L) {
  ctx.fillStyle = 'rgba(8,6,20,0.55)';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd76a';
  ctx.font = 'bold 72px sans-serif';
  ctx.shadowColor = '#ff6a00'; ctx.shadowBlur = 32;
  ctx.fillText('EMBERLINE', CANVAS_W / 2, 190);
  ctx.shadowBlur = 0;
  ctx.fillStyle = PALETTE.text;
  ctx.font = '28px sans-serif';
  ctx.fillText('Hold the Last Light', CANVAS_W / 2, 232);
  ctx.font = '17px sans-serif';
  ctx.fillStyle = PALETTE.textDim;
  ctx.fillText('Ember-creatures march the valley path. Build towers on the stone pads.', CANVAS_W / 2, 280);
  ctx.fillText('Stop them before they reach the Core. Survive all 12 waves — the Ember Colossus waits on 12.', CANVAS_W / 2, 306);
  ctx.fillStyle = PALETTE.text;
  ctx.font = '15px sans-serif';
  ctx.fillText('Click a pad to build · Click a tower to upgrade or sell · P pause · Space speed · M mute · R restart', CANVAS_W / 2, 352);
  const b = L.startButton;
  ctx.fillStyle = '#7a4d00';
  roundRect(ctx, b.x, b.y, b.w, b.h, 10);
  ctx.fill();
  ctx.strokeStyle = PALETTE.gold; ctx.lineWidth = 2.5; ctx.stroke();
  ctx.fillStyle = '#fff3c4';
  ctx.font = 'bold 24px sans-serif';
  ctx.fillText('▶  START THE DEFENSE', b.x + b.w / 2, b.y + b.h / 2 + 1);
  ctx.font = '14px sans-serif';
  ctx.fillStyle = PALETTE.textDim;
  ctx.fillText('Spark — fast and cheap · Frost — slows the march · Mortar — huge splash · Lance — piercing beam', CANVAS_W / 2, 500);
  ctx.fillText('Set each tower to target First, Strong or Close · Sell any tower back for 70% · Beware the wave-6 Ember Surge', CANVAS_W / 2, 526);
}

function drawEndScreen(ctx, state, L, victory) {
  ctx.fillStyle = victory ? 'rgba(8,20,10,0.6)' : 'rgba(24,6,10,0.6)';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.textAlign = 'center';
  ctx.fillStyle = victory ? '#ffd76a' : '#ff4d6a';
  ctx.font = 'bold 56px sans-serif';
  ctx.shadowColor = victory ? '#ff6a00' : '#ff0033'; ctx.shadowBlur = 28;
  ctx.fillText(victory ? 'THE LIGHT HOLDS' : 'THE CORE HAS FALLEN', CANVAS_W / 2, 180);
  ctx.shadowBlur = 0;
  ctx.fillStyle = PALETTE.text;
  ctx.font = '20px sans-serif';
  const rows = victory
    ? [
        `Waves cleared: ${state.eco.wavesCleared} / ${TOTAL_WAVES}`,
        `Enemies slain: ${state.eco.kills}`,
        `Core lives left: ${state.eco.lives}  (+${state.endBonus ? state.endBonus.lifePoints : 0} pts)`,
        `Gold banked: ${state.eco.gold}  (+${state.endBonus ? state.endBonus.bankedGold : 0} pts)`,
        `FINAL SCORE: ${state.eco.score}`,
      ]
    : [
        `Waves cleared: ${state.eco.wavesCleared} / ${TOTAL_WAVES}`,
        `Enemies slain: ${state.eco.kills}`,
        `Gold earned: ${state.eco.goldEarned}`,
        `SCORE: ${state.eco.score}`,
      ];
  rows.forEach((r, i) => ctx.fillText(r, CANVAS_W / 2, 240 + i * 32));
  const b = L.restartButton;
  ctx.fillStyle = '#7a4d00';
  roundRect(ctx, b.x, b.y, b.w, b.h, 10);
  ctx.fill();
  ctx.strokeStyle = PALETTE.gold; ctx.lineWidth = 2.5; ctx.stroke();
  ctx.fillStyle = '#fff3c4';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText('↻  PLAY AGAIN  (R)', b.x + b.w / 2, b.y + b.h / 2 + 1);
}

function drawPaused(ctx, state) {
  ctx.fillStyle = 'rgba(8,6,20,0.6)';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.text;
  ctx.font = 'bold 44px sans-serif';
  ctx.fillText('PAUSED', CANVAS_W / 2, CANVAS_H / 2 - 10);
  ctx.font = '18px sans-serif';
  ctx.fillStyle = PALETTE.textDim;
  ctx.fillText('Press P to resume · R to restart', CANVAS_W / 2, CANVAS_H / 2 + 30);
}

// Decorative towers behind the title screen, so the cover reads as a game at a glance.
function drawTitleBackdropTowers(ctx) {
  const demo = [
    { type: 'spark', x: 200, y: 180, angle: 0.6 },
    { type: 'frost', x: 540, y: 345, angle: -0.4 },
    { type: 'mortar', x: 780, y: 515, angle: 2.4 },
    { type: 'lance', x: 1080, y: 345, angle: 2.8 },
  ];
  for (const d of demo) {
    drawTowerShape(ctx, { ...d, level: 2, muzzle: 0, id: 0, padIndex: 0, cooldown: 0 }, 0);
  }
}

// The one draw call the main loop makes.
export function drawGame(ctx, state) {
  ctx.save();
  if (state.shake > 0.2) {
    ctx.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
  }
  drawSky(ctx, state.time);
  drawPath(ctx);
  drawCore(ctx, state);
  drawPads(ctx, state);
  if (state.mode === 'title') drawTitleBackdropTowers(ctx);
  for (const t of state.towers) drawTowerShape(ctx, t, state.time, state.selectedTower);
  for (const e of state.enemies) {
    if (!e.dead && !e.reachedCore) drawEnemyShape(ctx, e, state.time);
  }
  drawProjectiles(ctx, state);
  drawParticles(ctx, state);
  drawFloaters(ctx, state);
  drawForegroundEmbers(ctx, state);
  drawGhost(ctx, state);
  const L = layout(state);
  if (state.mode !== 'title') drawHud(ctx, state, L);
  drawBuildMenu(ctx, state, L);
  drawTowerMenu(ctx, state, L);
  if (state.mode === 'title') drawTitle(ctx, state, L);
  if (state.mode === 'victory') drawEndScreen(ctx, state, L, true);
  if (state.mode === 'defeat') drawEndScreen(ctx, state, L, false);
  if (state.mode === 'paused') drawPaused(ctx, state);
  ctx.restore();
}
