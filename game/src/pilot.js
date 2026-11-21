// A deterministic autopilot that plays Caldera Heat through its own
// rules: it reads only the public state (position, objective, nearby
// vehicles) and returns the same input shape a keyboard produces. When
// driving it navigates the road grid axis-by-axis, the way a careful
// player would, so it does not grind through city blocks. The screenshot
// stager and the headless story test both drive the game with it, so
// what they show is a real playthrough, not a posed scene.

import { CITY } from './config.js';

function dist(ax, ay, bx, by) {
  const dx = ax - bx; const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

const ROAD_X = [];
const ROAD_Y = [];
for (let x = CITY.margin + CITY.road / 2; x < CITY.width; x += CITY.block) ROAD_X.push(x);
for (let y = CITY.margin + CITY.road / 2; y < CITY.height; y += CITY.block) ROAD_Y.push(y);

function nearest(list, v) {
  let best = list[0]; let bestD = Infinity;
  for (const c of list) { const d = Math.abs(c - v); if (d < bestD) { bestD = d; best = c; } }
  return best;
}
function onBand(list, v, tol) { return Math.abs(nearest(list, v) - v) <= tol; }

function steer(px, py, tx, ty, dead) {
  const dx = tx - px; const dy = ty - py;
  if (Math.sqrt(dx * dx + dy * dy) < dead) return { mx: 0, my: 0, act: false };
  return { mx: Math.abs(dx) > 6 ? Math.sign(dx) : 0, my: Math.abs(dy) > 6 ? Math.sign(dy) : 0, act: false };
}

function carBlockedAhead(state, mx, my) {
  const p = state.player;
  for (const ahead of [62, 112]) {
    const x = p.x + mx * ahead; const y = p.y + my * ahead;
    for (const b of state.buildings) {
      if (x > b.x - 24 && x < b.x + b.w + 24 && y > b.y - 24 && y < b.y + b.h + 24) return true;
    }
  }
  return false;
}

function driveInput(state, tx, ty) {
  const p = state.player;
  if (dist(p.x, p.y, tx, ty) < 78) return steer(p.x, p.y, tx, ty, 8);
  const alignedX = Math.abs(p.x - tx) <= 34;
  const alignedY = Math.abs(p.y - ty) <= 34;
  let input;
  if (!alignedX && onBand(ROAD_Y, p.y, 52)) input = { mx: Math.sign(tx - p.x), my: 0, act: false };
  else if (!alignedY && onBand(ROAD_X, p.x, 52)) input = { mx: 0, my: Math.sign(ty - p.y), act: false };
  else if (alignedX && !alignedY) input = { mx: 0, my: Math.sign(ty - p.y), act: false };
  else if (alignedY && !alignedX) input = { mx: Math.sign(tx - p.x), my: 0, act: false };
  else input = steer(p.x, p.y, nearest(ROAD_X, p.x), nearest(ROAD_Y, p.y), 10); // off-grid: nearest crossing
  // Wedged against a building (a lot, a bad park): break out to the crossing.
  if ((input.mx !== 0 || input.my !== 0) && carBlockedAhead(state, input.mx, input.my)) {
    const ix = nearest(ROAD_X, p.x); const iy = nearest(ROAD_Y, p.y);
    if (dist(p.x, p.y, ix, iy) > 44) return steer(p.x, p.y, ix, iy, 10);
  }
  return input;
}

function blockedAhead(state, mx, my) {
  const p = state.player;
  for (const ahead of [24, 44]) {
    const x = p.x + mx * ahead; const y = p.y + my * ahead;
    for (const b of state.buildings) {
      if (x > b.x - 13 && x < b.x + b.w + 13 && y > b.y - 13 && y < b.y + b.h + 13) return true;
    }
  }
  return false;
}

function walkInput(state, tx, ty) {
  const p = state.player;
  let input;
  if (dist(p.x, p.y, tx, ty) < 60) input = steer(p.x, p.y, tx, ty, 6);
  else {
    // Walk the grid too: cut corners only near the goal.
    const alignedX = Math.abs(p.x - tx) <= 26;
    const alignedY = Math.abs(p.y - ty) <= 26;
    if (!alignedX && onBand(ROAD_Y, p.y, 60)) input = { mx: Math.sign(tx - p.x), my: 0, act: false };
    else if (!alignedY && onBand(ROAD_X, p.x, 60)) input = { mx: 0, my: Math.sign(ty - p.y), act: false };
    else if (alignedX || alignedY) input = steer(p.x, p.y, tx, ty, 6);
    else input = steer(p.x, p.y, nearest(ROAD_X, p.x), nearest(ROAD_Y, p.y), 8);
  }
  // A building in the face: fall back to the nearest intersection, whose
  // roads are always clear, and let the grid logic take over from there.
  if ((input.mx !== 0 || input.my !== 0) && blockedAhead(state, input.mx, input.my)) {
    const ix = nearest(ROAD_X, p.x); const iy = nearest(ROAD_Y, p.y);
    if (dist(p.x, p.y, ix, iy) > 30) return steer(p.x, p.y, ix, iy, 8);
    if (input.my !== 0) return { mx: tx >= p.x ? 1 : -1, my: 0, act: false };
    return { mx: 0, my: ty >= p.y ? 1 : -1, act: false };
  }
  return input;
}

function nearestVehicle(state, type) {
  const p = state.player;
  let best = null; let bestD = Infinity;
  for (const v of state.vehicles) {
    if (v.mode !== 'parked') continue;
    if (type && v.type !== type) continue;
    const d = dist(p.x, p.y, v.x, v.y);
    if (d < bestD) { bestD = d; best = v; }
  }
  return best;
}

/** One tick of autopilot input for the given world state. */
export function pilotInput(state) {
  const p = state.player;
  const o = state.objective;
  if (state.status === 'complete') return { mx: 0, my: 0, act: false };
  const typed = o.needType ? nearestVehicle(state, o.needType) : null;

  if (p.vehicle) {
    // Wrong ride for a typed job (a fare, the taxi shift): drive to the
    // right vehicle and swap, instead of walking across the island.
    if (o.needType && p.vehicle.type !== o.needType && o.kind !== 'drive' && typed) {
      if (dist(p.x, p.y, typed.x, typed.y) < 110) {
        const sp = Math.abs(p.vehicle.vx) + Math.abs(p.vehicle.vy);
        if (sp < 30) return { mx: 0, my: 0, act: true };
        return { mx: 0, my: 0, act: false };
      }
      return driveInput(state, typed.x, typed.y);
    }
    if (o.kind === 'taxiWork') return { mx: 0, my: 0, act: false };
    return driveInput(state, o.x, o.y);
  }

  // On foot: fetch a vehicle when the objective needs one or names a type.
  if (o.needVehicle || o.needType || o.kind === 'enter' || o.kind === 'taxiWork') {
    if (typed && dist(p.x, p.y, typed.x, typed.y) <= 320) {
      // The world seats you in the NEAREST car: only hit the key when the
      // typed car is also the nearest, or you would loop in and out of
      // whatever happens to be parked beside it.
      const anyNear = nearestVehicle(state, null);
      if (dist(p.x, p.y, typed.x, typed.y) < 40 && anyNear === typed) return { mx: 0, my: 0, act: true };
      return walkInput(state, typed.x, typed.y);
    }
    // The right ride is far away: borrow any close parked car to get there.
    const any = nearestVehicle(state, null);
    if (any && dist(p.x, p.y, any.x, any.y) < 230) {
      if (dist(p.x, p.y, any.x, any.y) < 40) return { mx: 0, my: 0, act: true };
      return walkInput(state, any.x, any.y);
    }
    if (typed) return walkInput(state, typed.x, typed.y);
    if (any) return walkInput(state, any.x, any.y);
  }
  return walkInput(state, o.x, o.y);
}
