// Drawing only for Caldera Heat: the world state and the current screen
// go in, pixels come out. The city is painted top-down with extruded
// low-poly buildings (a shifted, lighter roof face gives the 3D read),
// a chase camera follows the player, and a minimap, wanted stars, health
// and cash sit in the HUD. The 1280x720 logical view is scaled to fit.

import { CITY, FONT, VIEW } from './config.js';
import { PLACES } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';

const WATER = '#17384f';
const SAND = '#c9b083';
const GRASS = '#4d7c4f';
const ROAD = '#33373d';
const ROAD_LINE = '#c8b458';
const SIDEWALK = '#9aa0a3';

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(window.innerWidth * ratio);
    canvas.height = Math.round(window.innerHeight * ratio);
    view.scale = Math.min(canvas.width / VIEW.width, canvas.height / VIEW.height);
    view.x = (canvas.width - VIEW.width * view.scale) / 2;
    view.y = (canvas.height - VIEW.height * view.scale) / 2;
  }

  const fonts = new Map();
  function text(value, x, y, size, color, align = 'left', bold = false) {
    const key = size + (bold ? 'b' : '');
    if (!fonts.has(key)) fonts.set(key, `${bold ? '700 ' : ''}${size}px ${FONT}`);
    ctx.font = fonts.get(key);
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.fillText(value, x, y);
  }

  function drawCity(state, camX, camY) {
    ctx.fillStyle = WATER;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    ctx.fillStyle = SAND;
    ctx.fillRect(-camX - 26, -camY - 26, CITY.width + 52, CITY.height + 52);
    ctx.fillStyle = GRASS;
    ctx.fillRect(-camX, -camY, CITY.width, CITY.height);

    // Roads: verticals then horizontals, with dashed centre lines.
    ctx.fillStyle = SIDEWALK;
    for (let x = CITY.margin; x < CITY.width; x += CITY.block) ctx.fillRect(x - camX - 5, -camY, CITY.road + 10, CITY.height);
    for (let y = CITY.margin; y < CITY.height; y += CITY.block) ctx.fillRect(-camX, y - camY - 5, CITY.width, CITY.road + 10);
    ctx.fillStyle = ROAD;
    for (let x = CITY.margin; x < CITY.width; x += CITY.block) ctx.fillRect(x - camX, -camY, CITY.road, CITY.height);
    for (let y = CITY.margin; y < CITY.height; y += CITY.block) ctx.fillRect(-camX, y - camY, CITY.width, CITY.road);
    ctx.fillStyle = ROAD_LINE;
    for (let x = CITY.margin + CITY.road / 2 - 2; x < CITY.width; x += CITY.block) {
      for (let y = 8; y < CITY.height; y += 44) ctx.fillRect(x - camX, y - camY, 4, 22);
    }
    for (let y = CITY.margin + CITY.road / 2 - 2; y < CITY.height; y += CITY.block) {
      for (let x = 8; x < CITY.width; x += 44) ctx.fillRect(x - camX, y - camY, 22, 4);
    }

    // Landmark pads.
    ctx.fillStyle = '#7d7468';
    ctx.fillRect(PLACES.spray.x - 84 - camX, PLACES.spray.y - 84 - camY, 168, 168);
    ctx.fillStyle = '#e8e3d8';
    text('SPRAY', PLACES.spray.x - camX, PLACES.spray.y - 92 - camY, 17, '#333', 'center', true);
    ctx.fillStyle = '#8b4a42';
    ctx.fillRect(PLACES.hospital.x - 40 - camX, PLACES.hospital.y - 40 - camY, 80, 80);
    text('H', PLACES.hospital.x - camX, PLACES.hospital.y + 12 - camY, 34, '#fff', 'center', true);

    // Buildings: shadow, wall face, lighter roof — the low-poly extrusion.
    for (const b of state.buildings) {
      const bx = b.x - camX; const by = b.y - camY;
      if (bx + b.w + 60 < 0 || by + b.h + 60 < 0 || bx - 60 > VIEW.width || by - 60 > VIEW.height) continue;
      const lift = b.height * 0.42;
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(bx + 7, by + 9, b.w, b.h);
      ctx.fillStyle = b.color;
      ctx.fillRect(bx - lift * 0.4, by - lift * 0.4, b.w, b.h);
      ctx.fillStyle = 'rgba(255,255,255,0.20)';
      ctx.fillRect(bx - lift * 0.4, by - lift * 0.4, b.w, 7);
      ctx.fillRect(bx - lift * 0.4, by - lift * 0.4, 7, b.h);
    }

    // Stashes.
    for (const s of state.stashes) {
      if (!s.active) continue;
      ctx.fillStyle = '#39d353';
      ctx.fillRect(s.x - 9 - camX, s.y - 9 - camY, 18, 18);
      text('$', s.x - camX, s.y + 6 - camY, 15, '#06280f', 'center', true);
    }
    for (const s of state.missionStashes) {
      if (!s.active) continue;
      ctx.fillStyle = '#b26bff';
      ctx.beginPath(); ctx.arc(s.x - camX, s.y - camY, 13, 0, Math.PI * 2); ctx.fill();
      text('$', s.x - camX, s.y + 6 - camY, 15, '#fff', 'center', true);
    }
  }

  function drawVehicle(v, camX, camY, isPlayer) {
    const x = v.x - camX; const y = v.y - camY;
    if (x < -70 || y < -70 || x > VIEW.width + 70 || y > VIEW.height + 70) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(v.angle);
    const truck = v.type === 'truck';
    const len = truck ? 56 : 44; const wid = truck ? 25 : 22;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(-len / 2 + 3, -wid / 2 + 4, len, wid);
    ctx.fillStyle = v.color;
    ctx.beginPath(); ctx.roundRect(-len / 2, -wid / 2, len, wid, 6); ctx.fill();
    ctx.fillStyle = '#1d2733';
    ctx.fillRect(-len * 0.08, -wid / 2 + 3, len * 0.3, wid - 6); // windshield + cabin
    if (v.type === 'police') {
      ctx.fillStyle = '#e8e8ec'; ctx.fillRect(-len / 2 + 4, -wid / 2, len - 8, 5); ctx.fillRect(-len / 2 + 4, wid / 2 - 5, len - 8, 5);
      ctx.fillStyle = (Math.floor(performance.now() / 280) % 2 === 0) ? '#ff4444' : '#4477ff';
      ctx.fillRect(-4, -4, 8, 8);
    }
    if (v.type === 'taxi') { ctx.fillStyle = '#222'; ctx.fillRect(-6, -5, 12, 10); ctx.fillStyle = '#ffd94d'; text('T', 0, 4, 10, '#ffd94d', 'center', true); }
    if (v.health < v.maxHealth * 0.35) { ctx.fillStyle = 'rgba(60,60,60,0.65)'; ctx.beginPath(); ctx.arc(len / 3, 0, 9, 0, Math.PI * 2); ctx.fill(); }
    if (isPlayer) { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(-len / 2 - 3, -wid / 2 - 3, len + 6, wid + 6, 8); ctx.stroke(); }
    ctx.restore();
  }

  function drawMarker(state, camX, camY) {
    const o = state.objective;
    if (o.kind === 'done' || o.kind === 'taxiWork') return;
    const x = o.x - camX; const y = o.y - camY;
    const bob = Math.sin(state.elapsed * 4) * 6;
    ctx.fillStyle = o.kind.startsWith('fare') ? '#ffd94d' : '#37c8f5';
    ctx.beginPath(); ctx.arc(x, y, 26 + bob * 0.4, 0, Math.PI * 2); ctx.globalAlpha = 0.3; ctx.fill(); ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.moveTo(x, y - 34 + bob); ctx.lineTo(x - 13, y - 56 + bob); ctx.lineTo(x + 13, y - 56 + bob);
    ctx.closePath(); ctx.fill();
    // Off-screen direction arrow.
    if (x < 30 || y < 30 || x > VIEW.width - 30 || y > VIEW.height - 30) {
      const cx = Math.min(Math.max(x, 36), VIEW.width - 36);
      const cy = Math.min(Math.max(y, 36), VIEW.height - 36);
      ctx.beginPath(); ctx.arc(cx, cy, 15, 0, Math.PI * 2); ctx.fill();
      text('!', cx, cy + 6, 17, '#fff', 'center', true);
    }
  }

  function drawMinimap(state) {
    const W = 196; const H = 150; const X = VIEW.width - W - 18; const Y = 18;
    ctx.fillStyle = 'rgba(16,24,32,0.82)';
    ctx.fillRect(X, Y, W, H);
    ctx.strokeStyle = '#5b6b7a'; ctx.strokeRect(X, Y, W, H);
    const sx = W / CITY.width; const sy = H / CITY.height;
    ctx.fillStyle = '#3d4a56';
    for (let x = CITY.margin; x < CITY.width; x += CITY.block) ctx.fillRect(X + x * sx, Y, CITY.road * sx, H);
    for (let y = CITY.margin; y < CITY.height; y += CITY.block) ctx.fillRect(X, Y + y * sy, W, CITY.road * sy);
    for (const v of state.vehicles) {
      if (v.mode === 'police') { ctx.fillStyle = '#ff5545'; ctx.fillRect(X + v.x * sx - 2, Y + v.y * sy - 2, 4, 4); }
    }
    ctx.fillStyle = '#37c8f5';
    ctx.beginPath(); ctx.arc(X + state.objective.x * sx, Y + state.objective.y * sy, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(X + state.player.x * sx, Y + state.player.y * sy, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd94d';
    ctx.fillRect(X + PLACES.spray.x * sx - 3, Y + PLACES.spray.y * sy - 3, 6, 6);
  }

  function drawHud(state, best) {
    const p = state.player;
    ctx.fillStyle = 'rgba(10,14,20,0.66)';
    ctx.fillRect(16, 16, 300, 118);
    text(`$${p.money}`, 30, 52, 30, '#7be382', 'left', true);
    // wanted stars
    for (let i = 0; i < 5; i += 1) {
      text('★', 30 + i * 27, 84, 24, i < state.stars ? '#ffb02e' : '#4a5560');
    }
    ctx.fillStyle = '#3a2326'; ctx.fillRect(30, 100, 180, 14);
    ctx.fillStyle = p.health > 30 ? '#e84c5a' : '#ff2222';
    ctx.fillRect(30, 100, Math.max(0, p.health) / 100 * 180, 14);
    if (p.vehicle) {
      ctx.fillStyle = '#26313a'; ctx.fillRect(30, 120 - 2, 180, 0); // spacer kept for layout stability
      text(`${p.vehicle.type.toUpperCase()}  DMG ${Math.max(0, Math.round(100 - p.vehicle.health / p.vehicle.maxHealth * 100))}%`, 222, 112, 15, '#cfd8e0');
    }
    if (p.bust > 0.03) {
      ctx.fillStyle = '#222'; ctx.fillRect(VIEW.width / 2 - 130, VIEW.height - 74, 260, 18);
      ctx.fillStyle = '#ffb02e'; ctx.fillRect(VIEW.width / 2 - 130, VIEW.height - 74, p.bust * 260, 18);
      text('BUSTED?', VIEW.width / 2, VIEW.height - 82, 16, '#ffb02e', 'center', true);
    }
    // Mission banner.
    ctx.fillStyle = 'rgba(10,14,20,0.6)';
    ctx.fillRect(VIEW.width / 2 - 330, 16, 660, 56);
    const title = state.status === 'complete' ? 'CALDERA HEAT — STORY COMPLETE' : `Mission ${Math.min(state.mission + 1, 6)}/6`;
    text(title, VIEW.width / 2, 40, 16, '#ffd94d', 'center', true);
    text(state.objective.label || '', VIEW.width / 2, 64, 19, '#eef3f6', 'center');
    if (state.messageTime > 0 && state.message) {
      ctx.fillStyle = 'rgba(10,14,20,0.72)';
      ctx.fillRect(VIEW.width / 2 - 360, VIEW.height - 132, 720, 34);
      text(state.message, VIEW.width / 2, VIEW.height - 108, 18, '#ffe9a8', 'center');
    }
    void best;
    drawMinimap(state);
  }

  function drawPanel(title, lines, prompt, accent = '#ffd94d') {
    ctx.fillStyle = 'rgba(8,12,18,0.78)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    ctx.fillStyle = '#141c26';
    ctx.fillRect(VIEW.width / 2 - 330, 168, 660, 120 + lines.length * 32 + 74);
    ctx.strokeStyle = accent; ctx.lineWidth = 2;
    ctx.strokeRect(VIEW.width / 2 - 330, 168, 660, 120 + lines.length * 32 + 74);
    text(title, VIEW.width / 2, 248, 46, accent, 'center', true);
    lines.forEach((line, i) => text(line, VIEW.width / 2, 300 + i * 32, 20, '#cfd8e0', 'center'));
    text(prompt, VIEW.width / 2, 300 + lines.length * 32 + 42, 21, '#7be382', 'center', true);
  }

  function draw(state, screen, best) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0b0f14';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    const p = state.player;
    const camX = Math.min(Math.max(p.x - VIEW.width / 2, -40), CITY.width - VIEW.width + 40);
    const camY = Math.min(Math.max(p.y - VIEW.height / 2, -40), CITY.height - VIEW.height + 40);
    ctx.save();
    drawCity(state, camX, camY);
    for (const ped of state.peds) {
      const x = ped.x - camX; const y = ped.y - camY;
      if (x < -20 || y < -20 || x > VIEW.width + 20 || y > VIEW.height + 20) continue;
      ctx.fillStyle = ped.down > 0 ? '#666' : ped.hue;
      ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f0c8a0'; ctx.beginPath(); ctx.arc(x, y - 2, 4, 0, Math.PI * 2); ctx.fill();
    }
    for (const v of state.vehicles) drawVehicle(v, camX, camY, v === p.vehicle);
    if (!p.vehicle) {
      const x = p.x - camX; const y = p.y - camY;
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.arc(x + 3, y + 4, 12, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f5f0e6'; ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2456c8';
      ctx.beginPath(); ctx.arc(x + Math.cos(p.angle) * 5, y + Math.sin(p.angle) * 5, 7, 0, Math.PI * 2); ctx.fill();
    }
    drawMarker(state, camX, camY);
    ctx.restore();

    if (screen === SCREEN_TITLE) {
      drawPanel('CALDERA HEAT', [
        'Caldera Bay is hot, broke and wide open. Six jobs stand',
        'between you and running this island.',
        'WASD / arrows to move · E to get in or out of a car',
        'Watch the stars: spray shops wipe your heat — for a price.',
        best > 0 ? `Best take so far: $${best}` : '',
      ], 'Press Space or click to play');
      return;
    }
    drawHud(state, best);
    if (screen === SCREEN_PAUSED) drawPanel('PAUSED', ['The bay waits for no one. Well — just this once.'], 'Press P to resume');
    else if (screen === SCREEN_OVER) {
      drawPanel('RUN OVER', [`Take: $${p.money} · Earned: $${state.totalEarned}`, `Missions done: ${state.mission}/6 · Best: $${best}`], 'Press Space to run it again', '#e84c5a');
    } else if (screen === SCREEN_WIN) {
      drawPanel('CALDERA KING', ['All six jobs done. The island knows your name.', `Final take: $${p.money} · Total earned: $${state.totalEarned}`, 'Free roam: fares, stashes and heat still pay.'], 'Press Space to keep roaming', '#7be382');
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw };
}
