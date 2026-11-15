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
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Deterministic pseudo-random from an index, so scenery never flickers.
function sceneryRand(i) {
  let s = (i * 2654435761) >>> 0;
  s = (s ^ (s >>> 13)) >>> 0;
  s = (s * 1664525 + 1013904223) >>> 0;
  return (s >>> 0) / 4294967296;
}

// One jagged mountain silhouette across the whole sky, its top edge kissed
// with ember light. Peaks are fixed by seed so the ridge never flickers.
function drawRidge(ctx, baseY, seedBase, sway, color, litColor) {
  const step = 90;
  const peakAt = (i) => baseY - 40 - sceneryRand(seedBase + i) * 120;
  const valeAt = (i) => baseY - 10 - sceneryRand(seedBase + 100 + i) * 40;
  ctx.beginPath();
  ctx.moveTo(-60, CANVAS_H);
  for (let x = -60, i = 0; x <= CANVAS_W + step; x += step, i++) {
    ctx.lineTo(x + sway, peakAt(i));
    ctx.lineTo(x + step / 2 + sway, valeAt(i));
  }
  ctx.lineTo(CANVAS_W + 60, CANVAS_H);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  // Ember-lit top edge.
  ctx.beginPath();
  for (let x = -60, i = 0; x <= CANVAS_W + step; x += step, i++) {
    if (i === 0) ctx.moveTo(x + sway, peakAt(i)); else ctx.lineTo(x + sway, peakAt(i));
    ctx.lineTo(x + step / 2 + sway, valeAt(i));
  }
  ctx.strokeStyle = litColor;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function drawSky(ctx, time) {
  const g = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
  g.addColorStop(0, PALETTE.skyTop);
  g.addColorStop(0.55, PALETTE.skyMid);
  g.addColorStop(1, PALETTE.skyBottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  // The ember moon: a pale gold disc in a wide halo, top right.
  const moonX = 1146, moonY = 88;
  const halo = ctx.createRadialGradient(moonX, moonY, 10, moonX, moonY, 120);
  halo.addColorStop(0, 'rgba(255,214,130,0.35)');
  halo.addColorStop(0.4, 'rgba(255,180,90,0.12)');
  halo.addColorStop(1, 'rgba(255,180,90,0)');
  ctx.fillStyle = halo;
  ctx.beginPath(); ctx.arc(moonX, moonY, 120, 0, Math.PI * 2); ctx.fill();
  const moonG = ctx.createRadialGradient(moonX - 10, moonY - 10, 4, moonX, moonY, 36);
  moonG.addColorStop(0, '#fff3cf');
  moonG.addColorStop(0.8, '#ffd98f');
  moonG.addColorStop(1, '#f0b45e');
  ctx.fillStyle = moonG;
  ctx.beginPath(); ctx.arc(moonX, moonY, 34, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(214,150,70,0.5)';
  for (const [cx, cy, cr] of [[-10, -6, 6], [8, 10, 4.5], [12, -14, 3.5], [-16, 12, 3]]) {
    ctx.beginPath(); ctx.arc(moonX + cx, moonY + cy, cr, 0, Math.PI * 2); ctx.fill();
  }
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
  // Bright cores along the near ribbons in additive light, so the curtains
  // shimmer like real aurora instead of reading as flat bands.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineWidth = 7;
  for (const [hue, phase] of [['#3fe0c0', 0], ['#8a5cff', 2.1]]) {
    ctx.strokeStyle = hue;
    ctx.globalAlpha = 0.09;
    ctx.beginPath();
    for (let x = 0; x <= CANVAS_W; x += 24) {
      const y = 74 + Math.sin(x / 260 + phase + time * 0.13) * 26 + Math.sin(x / 90 + time * 0.13 * 1.7) * 8;
      if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
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
  drawRidge(ctx, 336, 700, Math.sin(time * 0.02) * 5, '#0d0a1a', 'rgba(255,150,80,0.10)');
  drawRidge(ctx, 372, 1700, Math.sin(time * 0.045) * 11, '#120e22', 'rgba(255,170,90,0.16)');
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
  // Stone flecks and faint ember cracks scattered over the valley floor.
  for (let i = 0; i < 130; i++) {
    const x = sceneryRand(i * 3 + 11) * CANVAS_W;
    const y = 312 + sceneryRand(i * 3 + 12) * 390;
    const r = 1 + sceneryRand(i * 3 + 13) * 2.2;
    ctx.globalAlpha = 0.16 + sceneryRand(i * 7 + 5) * 0.2;
    ctx.fillStyle = i % 6 === 0 ? '#ff9a3d' : '#0a0817';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// A soft vignette that pulls the eye to the valley centre. Drawn over the
// world, under the HUD and menus.
function drawVignette(ctx) {
  const v = ctx.createRadialGradient(CANVAS_W / 2, CANVAS_H / 2, CANVAS_H * 0.42, CANVAS_W / 2, CANVAS_H / 2, CANVAS_H * 0.98);
  v.addColorStop(0, 'rgba(4,2,10,0)');
  v.addColorStop(1, 'rgba(4,2,10,0.42)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
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
  // Cobble stones: fixed flecks laid along every segment, so the road reads
  // as worn stone rather than a flat ribbon.
  for (let s = 0; s < PATH.length - 1; s++) {
    const a = PATH[s], b = PATH[s + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.floor(len / 26);
    const px = -(b.y - a.y) / (len || 1), py = (b.x - a.x) / (len || 1);
    for (let i = 0; i < n; i++) {
      const idx = s * 40 + i;
      const t = (i + 0.5) / n;
      const off = (sceneryRand(idx * 2 + 31) - 0.5) * (TILE - 12);
      const x = a.x + (b.x - a.x) * t + px * off;
      const y = a.y + (b.y - a.y) * t + py * off;
      ctx.globalAlpha = 0.35 + sceneryRand(idx * 2 + 32) * 0.3;
      ctx.fillStyle = sceneryRand(idx * 5 + 7) > 0.5 ? '#241b38' : '#453364';
      ctx.beginPath();
      ctx.ellipse(x, y, 3 + sceneryRand(idx * 3 + 3) * 3.5, 2 + sceneryRand(idx * 3 + 4) * 2, sceneryRand(idx) * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

function drawPads(ctx, state) {
  for (let i = 0; i < PADS.length; i++) {
    const p = PADS[i];
    const occupied = state.towers.some((t) => t.padIndex === i);
    const hovered = state.hoverPad === i || state.selectedPad === i;
    // Drop shadow, then a bevelled stone ring: dark rim, lit inner disc.
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath(); ctx.ellipse(p.x, p.y + 4, PAD_RADIUS + 3, PAD_RADIUS * 0.82 + 3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath();
    ctx.arc(p.x, p.y, PAD_RADIUS + 2, 0, Math.PI * 2);
    ctx.fillStyle = '#171230';
    ctx.fill();
    const disc = ctx.createRadialGradient(p.x - 6, p.y - 7, 2, p.x, p.y, PAD_RADIUS);
    disc.addColorStop(0, hovered ? '#4a3d78' : '#332a55');
    disc.addColorStop(1, hovered ? PALETTE.padHover : PALETTE.pad);
    ctx.beginPath();
    ctx.arc(p.x, p.y, PAD_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = disc;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = hovered ? '#c9b6ff' : PALETTE.padEdge;
    ctx.stroke();
    // Chisel ticks around the rim.
    ctx.strokeStyle = 'rgba(190,170,255,0.28)';
    ctx.lineWidth = 1.5;
    for (let k = 0; k < 4; k++) {
      const a = (Math.PI / 2) * k + Math.PI / 4;
      ctx.beginPath();
      ctx.moveTo(p.x + Math.cos(a) * (PAD_RADIUS - 4), p.y + Math.sin(a) * (PAD_RADIUS - 4));
      ctx.lineTo(p.x + Math.cos(a) * (PAD_RADIUS - 1), p.y + Math.sin(a) * (PAD_RADIUS - 1));
      ctx.stroke();
    }
    if (!occupied) {
      // A breathing invitation glow, brighter under the cursor.
      const breathe = 0.5 + 0.5 * Math.sin(state.time * 2.4 + i * 1.3);
      ctx.save();
      ctx.globalAlpha = (hovered ? 0.55 : 0.22) + breathe * 0.18;
      ctx.strokeStyle = '#c9b6ff';
      ctx.lineWidth = hovered ? 2.5 : 1.5;
      ctx.beginPath(); ctx.arc(p.x, p.y, PAD_RADIUS + 5 + breathe * 2, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = 'rgba(210,195,255,0.5)';
      ctx.font = 'bold 20px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('+', p.x, p.y + 1);
    }
  }
}

function drawCore(ctx, state) {
  const time = state.time;
  const hurt = state.eco.lives <= 5;
  const pulse = 1 + 0.08 * Math.sin(time * 2.2);
  // A warm pool of light on the ground beneath the crystal.
  ctx.save();
  ctx.translate(CORE.x, CORE.y + 16);
  ctx.scale(1, 0.36);
  const pool = ctx.createRadialGradient(0, 0, 4, 0, 0, 110 * pulse);
  pool.addColorStop(0, hurt ? 'rgba(255,90,90,0.30)' : 'rgba(255,190,80,0.32)');
  pool.addColorStop(1, 'rgba(255,180,60,0)');
  ctx.fillStyle = pool;
  ctx.beginPath(); ctx.arc(0, 0, 110 * pulse, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // Slow rotating light rays behind the crystal.
  ctx.save();
  ctx.translate(CORE.x, CORE.y);
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 6; i++) {
    const a = time * 0.12 + (Math.PI / 3) * i;
    ctx.save();
    ctx.rotate(a);
    ctx.globalAlpha = 0.05 + 0.03 * Math.sin(time * 1.7 + i * 2.1);
    ctx.fillStyle = hurt ? '#ff5a5a' : '#ffcf6a';
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(120, -13); ctx.lineTo(120, 13);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  ctx.restore();
  const glow = ctx.createRadialGradient(CORE.x, CORE.y, 4, CORE.x, CORE.y, 95 * pulse);
  glow.addColorStop(0, hurt ? 'rgba(255,110,110,0.55)' : 'rgba(255,215,106,0.55)');
  glow.addColorStop(0.5, 'rgba(255,180,60,0.18)');
  glow.addColorStop(1, 'rgba(255,180,60,0)');
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(CORE.x, CORE.y, 95 * pulse, 0, Math.PI * 2); ctx.fill();
  // Crystal: a faceted diamond with a white-hot heart.
  ctx.save();
  ctx.translate(CORE.x, CORE.y);
  ctx.rotate(Math.sin(time * 0.8) * 0.06);
  const r = CORE.radius;
  // Left facet in shade, right facet lit, crown facet brightest.
  ctx.fillStyle = '#e8a83e';
  ctx.beginPath();
  ctx.moveTo(0, -r); ctx.lineTo(0, r); ctx.lineTo(-r * 0.72, 0);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#ffd76a';
  ctx.beginPath();
  ctx.moveTo(0, -r); ctx.lineTo(r * 0.72, 0); ctx.lineTo(0, r);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = PALETTE.coreInner;
  ctx.beginPath();
  ctx.moveTo(0, -r); ctx.lineTo(r * 0.72, 0); ctx.lineTo(0, 0);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.beginPath();
  ctx.moveTo(0, -r); ctx.lineTo(r * 0.3, -r * 0.42); ctx.lineTo(0, 0);
  ctx.closePath(); ctx.fill();
  // The white-hot heart, breathing with the pulse.
  const heart = ctx.createRadialGradient(0, 0, 0, 0, 0, 11 * pulse);
  heart.addColorStop(0, 'rgba(255,255,255,0.95)');
  heart.addColorStop(0.55, 'rgba(255,240,190,0.55)');
  heart.addColorStop(1, 'rgba(255,240,190,0)');
  ctx.fillStyle = heart;
  ctx.beginPath(); ctx.arc(0, 0, 11 * pulse, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(255,230,160,0.9)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, -r); ctx.lineTo(r * 0.72, 0); ctx.lineTo(0, r); ctx.lineTo(-r * 0.72, 0);
  ctx.closePath(); ctx.stroke();
  ctx.restore();
  // Sparks orbiting the crystal.
  for (let i = 0; i < 5; i++) {
    const a = time * (0.7 + i * 0.13) + i * 2.4;
    const rr = CORE.radius + 14 + Math.sin(time * 2 + i * 1.7) * 4;
    const sx = CORE.x + Math.cos(a) * rr, sy = CORE.y + Math.sin(a) * rr * 0.82;
    ctx.globalAlpha = 0.5 + 0.4 * Math.sin(time * 3 + i * 2.2);
    ctx.fillStyle = '#ffe9a8';
    ctx.beginPath(); ctx.arc(sx, sy, 1.8, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  // Core HP ring on a faint full track.
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.beginPath();
  ctx.arc(CORE.x, CORE.y, CORE.radius + 10, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = hurt ? PALETTE.danger : PALETTE.coreGlow;
  ctx.beginPath();
  ctx.arc(CORE.x, CORE.y, CORE.radius + 10, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * state.eco.lives) / 20);
  ctx.stroke();
}

// How far the muzzle sits from the tower centre, per type — the flash and
// the recoil both anchor there.
const MUZZLE_DIST = { spark: 26, frost: 22, mortar: 24, lance: 42 };

function drawTowerShape(ctx, t, time, selectedTower = null) {
  const def = TOWER_TYPES[t.type];
  // Range ring under everything when selected, with a rotating dashed rim.
  if (selectedTower === t) {
    ctx.save();
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = def.color;
    ctx.beginPath(); ctx.arc(t.x, t.y, towerRange(t), 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.65;
    ctx.strokeStyle = def.color; ctx.lineWidth = 1.5;
    ctx.setLineDash([10, 8]);
    ctx.lineDashOffset = -time * 24;
    ctx.beginPath(); ctx.arc(t.x, t.y, towerRange(t), 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
  // Ground shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath(); ctx.ellipse(t.x, t.y + 13, 19, 7, 0, 0, Math.PI * 2); ctx.fill();
  ctx.save();
  ctx.translate(t.x, t.y);
  // Pedestal: a shaded stone drum with a lit rim.
  const base = ctx.createRadialGradient(-5, -6, 2, 0, 0, 18);
  base.addColorStop(0, '#37305a');
  base.addColorStop(0.75, '#241d40');
  base.addColorStop(1, '#171230');
  ctx.fillStyle = base;
  ctx.beginPath(); ctx.arc(0, 0, 17, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = def.dark; ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(0, 0, 14.5, Math.PI * 1.05, Math.PI * 1.75); ctx.stroke();
  // The barrel recoils along its aim while the muzzle flash lives.
  const recoil = t.muzzle > 0 ? (t.muzzle / 0.07) * (t.type === 'mortar' ? 4.5 : 2.5) : 0;
  ctx.rotate(t.angle);
  ctx.translate(-recoil, 0);
  ctx.fillStyle = def.color;
  if (t.type === 'spark') {
    // Twin-prong tesla head; arcs crackle between the prongs as it fires.
    ctx.fillRect(-2, -3, 16, 6);
    ctx.fillRect(12, -7, 4, 5);
    ctx.fillRect(12, 2, 4, 5);
    ctx.beginPath(); ctx.arc(20, 0, 3.5, 0, Math.PI * 2); ctx.fill();
    if (t.muzzle > 0) {
      ctx.strokeStyle = '#fff6c8'; ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(16, -5);
      ctx.lineTo(19, -1 + (Math.random() - 0.5) * 3);
      ctx.lineTo(16, 4);
      ctx.stroke();
    }
  } else if (t.type === 'frost') {
    // A fan of three crystal shards, the middle one longest.
    for (const [len, wid, tilt] of [[20, 5, 0], [14, 4, -0.5], [14, 4, 0.5]]) {
      ctx.save();
      ctx.rotate(tilt);
      ctx.beginPath();
      ctx.moveTo(0, -wid); ctx.lineTo(len, 0); ctx.lineTo(0, wid);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.beginPath();
    ctx.moveTo(2, -2); ctx.lineTo(15, 0); ctx.lineTo(2, 2);
    ctx.closePath(); ctx.fill();
  } else if (t.type === 'lance') {
    // Long slim barrel with glowing charge rings and a crystal tip that
    // brightens as the next shot charges (cooldown running down).
    ctx.fillRect(0, -2.5, 32, 5);
    const charge = 1 - Math.min(1, Math.max(0, t.cooldown || 0) * TOWER_TYPES.lance.rate);
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = i / 3 <= charge ? '#e3c8ff' : def.dark;
      ctx.fillRect(8 + i * 8, -4, 3.5, 8);
    }
    ctx.beginPath();
    ctx.moveTo(32, -5); ctx.lineTo(40, 0); ctx.lineTo(32, 5); ctx.closePath(); ctx.fill();
    const tipGlow = 2 + charge * 2.4 + Math.sin(time * 6) * 0.5;
    const tg = ctx.createRadialGradient(35, 0, 0, 35, 0, tipGlow + 5);
    tg.addColorStop(0, 'rgba(255,255,255,0.95)');
    tg.addColorStop(0.4, 'rgba(227,200,255,0.6)');
    tg.addColorStop(1, 'rgba(227,200,255,0)');
    ctx.fillStyle = tg;
    ctx.beginPath(); ctx.arc(35, 0, tipGlow + 5, 0, Math.PI * 2); ctx.fill();
  } else {
    // Mortar: a fat banded tube on a swivel block.
    ctx.fillStyle = def.dark;
    ctx.fillRect(-6, -8, 10, 16);
    ctx.fillStyle = def.color;
    ctx.fillRect(0, -6.5, 20, 13);
    ctx.fillStyle = def.dark;
    ctx.fillRect(6, -6.5, 3.5, 13);
    ctx.fillRect(14, -6.5, 3.5, 13);
    ctx.fillStyle = '#ffd0b0';
    ctx.beginPath(); ctx.arc(20, 0, 4.5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  // The glowing heart of the tower, pulsing in its own colour.
  const corePulse = 4.6 + Math.sin(time * 3.4 + t.id * 1.7) * 0.9 + (t.level - 1) * 0.8;
  const heart = ctx.createRadialGradient(t.x, t.y, 0, t.x, t.y, corePulse + 5);
  heart.addColorStop(0, 'rgba(255,255,255,0.9)');
  heart.addColorStop(0.35, def.color);
  heart.addColorStop(1, def.color + '00');
  ctx.fillStyle = heart;
  ctx.beginPath(); ctx.arc(t.x, t.y, corePulse + 5, 0, Math.PI * 2); ctx.fill();
  // Level pips as little diamonds under the pedestal.
  for (let i = 0; i < t.level; i++) {
    const px = t.x - (t.level - 1) * 5 + i * 10, py = t.y + 23;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = def.color;
    ctx.fillRect(-2.6, -2.6, 5.2, 5.2);
    ctx.restore();
  }
  // Muzzle flash: a four-point star with a hot core, at the barrel tip.
  if (t.muzzle > 0) {
    const a = Math.min(1, t.muzzle / 0.07);
    const dist = MUZZLE_DIST[t.type] || 24;
    const mx = t.x + Math.cos(t.angle) * dist, my = t.y + Math.sin(t.angle) * dist;
    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(t.angle + time * 3);
    ctx.globalAlpha = a;
    ctx.fillStyle = '#fff2b0';
    const L = 11 * a + 3, W = 3 * a + 1;
    ctx.beginPath();
    ctx.moveTo(L, 0); ctx.lineTo(W, W); ctx.lineTo(0, W * 0.4); ctx.lineTo(-W * 0.7, W);
    ctx.lineTo(-L * 0.6, 0); ctx.lineTo(-W * 0.7, -W); ctx.lineTo(0, -W * 0.4); ctx.lineTo(W, -W);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(0, 0, 3.2 * a + 1, 0, Math.PI * 2); ctx.fill();
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
    ctx.lineDashOffset = -time * 14;
    ctx.beginPath(); ctx.arc(e.x, e.y, ENEMY_TYPES.aegis.auraRadius, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
  // Walk cycle: the whole body bobs and breathes off the distance marched,
  // so every creature strides instead of gliding. The boss lumbers slowly.
  const stride = e.type === 'boss' ? 0.1 : e.type === 'brute' || e.type === 'aegis' ? 0.22 : 0.34;
  const bob = Math.sin(e.distance * stride) * (e.type === 'boss' ? 0.8 : 1.6);
  const squash = 1 + Math.sin(e.distance * stride * 2) * 0.045;
  // Ground shadow stays planted while the body bobs above it.
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.ellipse(e.x, e.y + e.radius * 0.85, e.radius * 0.95, e.radius * 0.34, 0, 0, Math.PI * 2); ctx.fill();
  ctx.save();
  ctx.translate(e.x, e.y + bob);
  ctx.scale(1, squash);
  // Scuttler legs: three a side, swinging against the stride phase.
  if (e.type === 'scuttler') {
    ctx.strokeStyle = '#8a4d12';
    ctx.lineWidth = 2;
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < 3; i++) {
        const swing = Math.sin(e.distance * 0.5 + i * 2.1 + (side > 0 ? Math.PI : 0)) * 4;
        const lx = -6 + i * 6;
        ctx.beginPath();
        ctx.moveTo(lx, side * e.radius * 0.55);
        ctx.lineTo(lx + swing, side * (e.radius + 4.5));
        ctx.stroke();
      }
    }
  }
  // Glow.
  const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, e.radius + 12);
  glow.addColorStop(0, e.color + 'aa');
  glow.addColorStop(1, e.color + '00');
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(0, 0, e.radius + 12, 0, Math.PI * 2); ctx.fill();
  // Body: distinct silhouettes per type.
  ctx.fillStyle = e.color;
  if (e.type === 'scuttler') {
    const body = ctx.createRadialGradient(-3, -4, 1, 0, 0, e.radius + 2);
    body.addColorStop(0, '#ffc478');
    body.addColorStop(1, e.color);
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.arc(0, 0, e.radius, 0, Math.PI * 2); ctx.fill();
    // Ember eyes, wide with the march.
    ctx.fillStyle = '#2a1400';
    ctx.beginPath(); ctx.arc(-4, -3, 2.6, 0, Math.PI * 2); ctx.arc(4, -3, 2.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffe9a8';
    ctx.beginPath(); ctx.arc(-4.8, -3.8, 0.9, 0, Math.PI * 2); ctx.arc(3.2, -3.8, 0.9, 0, Math.PI * 2); ctx.fill();
  } else if (e.type === 'brute') {
    roundRect(ctx, -e.radius, -e.radius * 0.8, e.radius * 2, e.radius * 1.6, 5);
    ctx.fill();
    // Shoulder plates and an armour band with rivets.
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(-e.radius, -2, e.radius * 2, 4);
    ctx.beginPath(); ctx.arc(-e.radius * 0.72, -e.radius * 0.62, 6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(e.radius * 0.72, -e.radius * 0.62, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath(); ctx.arc(i * e.radius * 0.55, 0, 1.3, 0, Math.PI * 2); ctx.fill();
    }
    // Glowing amber eyes under the brow.
    ctx.fillStyle = '#ffb020';
    ctx.beginPath(); ctx.arc(-5.5, -6, 2.1, 0, Math.PI * 2); ctx.arc(5.5, -6, 2.1, 0, Math.PI * 2); ctx.fill();
  } else if (e.type === 'splitter') {
    ctx.beginPath(); ctx.arc(0, 0, e.radius, 0, Math.PI * 2); ctx.fill();
    // The two children inside, swelling and shrinking against each other.
    const swell = 1 + Math.sin(time * 5 + e.id) * 0.12;
    ctx.fillStyle = '#7a6400';
    ctx.beginPath(); ctx.arc(-e.radius * 0.45, 0, e.radius * 0.4 * swell, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(e.radius * 0.45, 0, e.radius * 0.4 * (2 - swell), 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath(); ctx.arc(-e.radius * 0.55, -e.radius * 0.18, 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(e.radius * 0.35, -e.radius * 0.18, 1.6, 0, Math.PI * 2); ctx.fill();
  } else if (e.type === 'regen') {
    ctx.beginPath(); ctx.arc(0, 0, e.radius, 0, Math.PI * 2); ctx.fill();
    // A rotating broken ring and a bright healing cross at the heart.
    ctx.strokeStyle = '#d8ffd0'; ctx.lineWidth = 2;
    ctx.setLineDash([7, 5]);
    ctx.lineDashOffset = -time * 20;
    ctx.beginPath(); ctx.arc(0, 0, e.radius * 0.55, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#eaffea';
    ctx.fillRect(-1.6, -5, 3.2, 10);
    ctx.fillRect(-5, -1.6, 10, 3.2);
  } else if (e.type === 'aegis') {
    // Hexagonal shield-bearer with a bright rim, a dark core, and an inner
    // hex ring turning slowly against the outer shell.
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i + Math.PI / 6;
      const px = Math.cos(a) * e.radius, py = Math.sin(a) * e.radius;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#eaf6ff'; ctx.lineWidth = 2; ctx.stroke();
    ctx.save();
    ctx.rotate(time * 0.6);
    ctx.strokeStyle = 'rgba(234,246,255,0.55)'; ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i;
      const px = Math.cos(a) * e.radius * 0.68, py = Math.sin(a) * e.radius * 0.68;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#33506e';
    ctx.beginPath(); ctx.arc(0, 0, e.radius * 0.45, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#bfe0ff';
    ctx.beginPath(); ctx.arc(0, 0, e.radius * 0.2, 0, Math.PI * 2); ctx.fill();
  } else if (e.type === 'boss') {
    // The Ember Colossus: a molten body with glowing cracks, a pulsing
    // heart, burning eyes and a golden crown.
    const body = ctx.createRadialGradient(-8, -10, 4, 0, 0, e.radius + 6);
    body.addColorStop(0, '#ff7a5c');
    body.addColorStop(0.55, e.color);
    body.addColorStop(1, '#a11230');
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.arc(0, 0, e.radius, 0, Math.PI * 2); ctx.fill();
    // Molten cracks.
    ctx.strokeStyle = '#ffd76a'; ctx.lineWidth = 1.8;
    ctx.globalAlpha = 0.75 + 0.25 * Math.sin(time * 3.2);
    for (const crack of [[-16, 6, -6, 14, -10, 24], [14, -2, 8, 10, 16, 20], [2, 12, -2, 22, 4, 27]]) {
      ctx.beginPath();
      ctx.moveTo(crack[0], crack[1]);
      ctx.lineTo(crack[2], crack[3]);
      ctx.lineTo(crack[4], crack[5]);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // The pulsing heart.
    const heartR = 7 + Math.sin(time * 3.2) * 1.6;
    const heart = ctx.createRadialGradient(0, 6, 0, 0, 6, heartR + 6);
    heart.addColorStop(0, 'rgba(255,255,255,0.95)');
    heart.addColorStop(0.4, 'rgba(255,215,106,0.8)');
    heart.addColorStop(1, 'rgba(255,215,106,0)');
    ctx.fillStyle = heart;
    ctx.beginPath(); ctx.arc(0, 6, heartR + 6, 0, Math.PI * 2); ctx.fill();
    // Burning eyes.
    ctx.save();
    ctx.shadowColor = '#ff2d55'; ctx.shadowBlur = 10;
    ctx.fillStyle = '#ffe9a8';
    ctx.beginPath(); ctx.arc(-10, -8, 4.2, 0, Math.PI * 2); ctx.arc(10, -8, 4.2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#7a0020';
    ctx.beginPath(); ctx.arc(-10, -8, 1.8, 0, Math.PI * 2); ctx.arc(10, -8, 1.8, 0, Math.PI * 2); ctx.fill();
    // Crown spikes with a gem on the tallest.
    ctx.fillStyle = '#ffb020';
    for (let i = -1; i <= 1; i++) {
      const h = i === 0 ? 15 : 11;
      ctx.beginPath();
      ctx.moveTo(i * 12 - 5, -e.radius + 4); ctx.lineTo(i * 12, -e.radius - h); ctx.lineTo(i * 12 + 5, -e.radius + 4);
      ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = '#ff2d55';
    ctx.beginPath(); ctx.arc(0, -e.radius - 8, 3, 0, Math.PI * 2); ctx.fill();
  }
  // Damage flash: a white bloom over the body the instant a hit lands.
  if (e.flash > 0) {
    ctx.save();
    ctx.globalAlpha = Math.min(0.85, (e.flash / 0.08) * 0.85);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(0, 0, e.radius, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
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
    const a = Math.max(0, p.life / p.maxLife);
    // A soft halo, the ember itself, and a white-hot heart for burst sparks.
    ctx.globalAlpha = a * 0.3;
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 2.3, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = a;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
    if (!p.ambient) {
      ctx.globalAlpha = a * 0.85;
      ctx.fillStyle = '#fff6da';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 0.45, 0, Math.PI * 2); ctx.fill();
    }
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
    // A fading ember trail behind the shell, back along its flight line.
    const dx = p.tx - p.x, dy = p.ty - p.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    for (let k = 5; k >= 1; k--) {
      ctx.globalAlpha = 0.10 + (5 - k) * 0.05;
      ctx.fillStyle = '#ff8a3d';
      ctx.beginPath();
      ctx.arc(p.x - ux * k * 8, p.y - uy * k * 8, 4.6 - k * 0.55, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // The shell itself: glow, molten body, hot highlight.
    const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 11);
    glow.addColorStop(0, 'rgba(255,190,80,0.75)');
    glow.addColorStop(1, 'rgba(255,150,50,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(p.x, p.y, 11, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffb020';
    ctx.beginPath(); ctx.arc(p.x, p.y, 4.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff3cf';
    ctx.beginPath(); ctx.arc(p.x - 1.2, p.y - 1.2, 1.7, 0, Math.PI * 2); ctx.fill();
  }
  // Instant bolt tracers (spark/frost shots, lance beams this frame): a
  // wide soft under-stroke with a bright core line, so shots read as light.
  for (const tr of state.tracers) {
    const a = Math.max(0, tr.life / (tr.maxLife || 0.12));
    ctx.save();
    ctx.globalAlpha = a * 0.28;
    ctx.strokeStyle = tr.color; ctx.lineWidth = (tr.width || 2) * 3;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(tr.x1, tr.y1); ctx.lineTo(tr.x2, tr.y2); ctx.stroke();
    ctx.globalAlpha = a;
    ctx.lineWidth = tr.width || 2;
    ctx.beginPath(); ctx.moveTo(tr.x1, tr.y1); ctx.lineTo(tr.x2, tr.y2); ctx.stroke();
    ctx.globalAlpha = a * 0.9;
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1;
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
    ctx.fillText(`🔥 streak x${state.streak}`, 806, 24);
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
  drawVignette(ctx);
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
