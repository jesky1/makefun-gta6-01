// Caldera Heat — the whole simulation: Caldera Bay's streets, the player
// on foot and behind the wheel, traffic, pedestrians, the police heat
// system, taxi fares, stashes, the spray shop and the six-mission story.
// No drawing and no browser APIs live here: step(dt, input) advances one
// fixed step and returns EVENT_* flags, so the same code runs in the page,
// in the screenshot stager and in the headless node tests.

import {
  CITY, HEAT, MISSION_REWARDS, PENALTY, PLAYER, POLICE, SPRAY, STASH,
  TAXI, VEHICLE_TYPES, CAR_COLORS, TAXI_COLOR, POLICE_COLOR,
} from './config.js';

export const EVENT_CRIME = 1;
export const EVENT_MISSION = 2;
export const EVENT_COMPLETE = 4;
export const EVENT_BUSTED = 8;
export const EVENT_WASTED = 16;
export const EVENT_FARE = 32;
export const EVENT_SPRAY = 64;
export const EVENT_STASH = 128;
export const EVENT_ENTER = 256;

// Fixed places in Caldera Bay (world units, island is CITY.width x CITY.height).
// All fixed places sit on road intersections so they are always reachable.
export const PLACES = {
  spawn: { x: 366, y: 1666, label: 'Coral Flats' },
  hospital: { x: 626, y: 1666, label: 'Caldera General' },
  station: { x: 2186, y: 366, label: 'CBPD Station' },
  spray: { x: 2446, y: 106, label: 'Shine Spray Shop' },
  garage: { x: 2186, y: 1666, label: 'Docks Garage' },
  packageSpot: { x: 106, y: 366, label: 'Old Pier' },
  dropSpot: { x: 1406, y: 1146, label: 'Midtown Drop' },
  alarmSpot: { x: 1406, y: 366, label: 'Volcano Bank' },
};

const MISSION_STASHES = [
  { x: 366, y: 1146 }, { x: 1666, y: 1666 }, { x: 2186, y: 1146 },
];
const KING_GATES = [
  { x: 366, y: 366 }, { x: 1406, y: 366 }, { x: 2186, y: 1666 }, { x: 886, y: 1146 },
];

export const MISSION_TITLES = [
  'First Wheels', 'Package Run', 'Taxi Shift',
  'Heat Escape', 'Stash Grab', 'Caldera King',
];

function dist(ax, ay, bx, by) {
  const dx = ax - bx; const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

// Road centre lines: streets run along the gaps between blocks.
function roadCentres() {
  const xs = []; const ys = [];
  for (let x = CITY.margin + CITY.road / 2; x < CITY.width; x += CITY.block) xs.push(x);
  for (let y = CITY.margin + CITY.road / 2; y < CITY.height; y += CITY.block) ys.push(y);
  return { xs, ys };
}

export function createWorld(random) {
  const { xs: roadX, ys: roadY } = roadCentres();

  // ---- city geometry -------------------------------------------------
  const buildings = [];
  {
    const palette = ['#b08968', '#7f8c9b', '#a26769', '#5d8a7a', '#8d6e9f', '#c2b280', '#6b7f9e', '#9c6644'];
    for (let bx = 0; bx < 9; bx += 1) {
      for (let by = 0; by < 7; by += 1) {
        const ox = CITY.margin + CITY.road + bx * CITY.block;
        const oy = CITY.margin + CITY.road + by * CITY.block;
        const lot = CITY.block - CITY.road - 18;
        const near = (p) => Math.abs(p.x - (ox + lot / 2)) < 190 && Math.abs(p.y - (oy + lot / 2)) < 190;
        if (near(PLACES.spray) || near(PLACES.station)) continue; // civic lots stay open
        const count = random.int(1, 3);
        for (let i = 0; i < count; i += 1) {
          const w = random.range(52, 96);
          const h = random.range(52, 96);
          buildings.push({
            x: ox + 9 + random.range(0, Math.max(1, lot - w - 18)),
            y: oy + 9 + random.range(0, Math.max(1, lot - h - 18)),
            w, h,
            height: random.int(22, 96),
            color: random.pick(palette),
          });
        }
      }
    }
  }

  function hitsBuilding(x, y, r) {
    for (const b of buildings) {
      if (x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) return b;
    }
    return null;
  }
  // Push a circle out of a building along the smaller penetration axis.
  function pushOut(p, r) {
    const b = hitsBuilding(p.x, p.y, r);
    if (!b) return false;
    const left = (p.x + r) - b.x; const right = (b.x + b.w) - (p.x - r);
    const top = (p.y + r) - b.y; const bot = (b.y + b.h) - (p.y - r);
    const m = Math.min(left, right, top, bot);
    if (m === left) p.x = b.x - r; else if (m === right) p.x = b.x + b.w + r;
    else if (m === top) p.y = b.y - r; else p.y = b.y + b.h + r;
    return true;
  }

  // ---- entities --------------------------------------------------------
  let vehicleSeq = 0;
  function makeVehicle(type, x, y, angle, mode) {
    const spec = VEHICLE_TYPES[type];
    vehicleSeq += 1;
    return {
      id: vehicleSeq, type, x, y, angle, vx: 0, vy: 0, mode, // parked|traffic|player|police
      color: type === 'taxi' ? TAXI_COLOR : type === 'police' ? POLICE_COLOR : random.pick(CAR_COLORS),
      health: spec.health, maxHealth: spec.health,
      tx: x, ty: y, wait: 0, seedTurn: random.next(),
    };
  }

  const vehicles = [];
  {
    const types = ['sedan', 'sedan', 'taxi', 'sports', 'truck'];
    for (let i = 0; i < 30; i += 1) {
      const onVertical = random.chance(0.5);
      const rx = random.pick(roadX); const ry = random.pick(roadY);
      const x = onVertical ? rx + random.pick([-26, 26]) : clamp(random.range(120, CITY.width - 120), 0, CITY.width);
      const y = onVertical ? clamp(random.range(120, CITY.height - 120), 0, CITY.height) : ry + random.pick([-26, 26]);
      if (dist(x, y, PLACES.spawn.x, PLACES.spawn.y) < 130 && i > 2) continue;
      vehicles.push(makeVehicle(random.pick(types), x, y, onVertical ? Math.PI / 2 : 0, 'parked'));
    }
    // Guaranteed rides: one sedan by spawn, one taxi for the shift, one sports for the finale.
    vehicles.push(makeVehicle('sedan', PLACES.spawn.x + 58, PLACES.spawn.y, 0, 'parked'));
    vehicles.push(makeVehicle('taxi', 626, 1436, Math.PI / 2, 'parked'));
    vehicles.push(makeVehicle('sports', 2186, 1606, 0, 'parked'));
    for (let i = 0; i < 9; i += 1) {
      const v = makeVehicle(random.pick(['sedan', 'sedan', 'taxi', 'truck']),
        random.pick(roadX), random.pick(roadY), 0, 'traffic');
      pickTrafficTarget(v);
      vehicles.push(v);
    }
  }
  function pickTrafficTarget(v) {
    if (random.chance(0.5)) { v.tx = v.x; v.ty = random.pick(roadY); }
    else { v.tx = random.pick(roadX); v.ty = v.y; }
  }

  const peds = [];
  for (let i = 0; i < 14; i += 1) {
    peds.push({
      x: random.range(140, CITY.width - 140), y: random.range(140, CITY.height - 140),
      tx: 0, ty: 0, down: 0, hue: random.pick(['#e8b04b', '#b04b6e', '#4b7fe8', '#5ec46a', '#e8e3d8']),
    });
    peds[i].tx = peds[i].x; peds[i].ty = peds[i].y;
  }

  const stashes = [];
  for (let i = 0; i < STASH.count; i += 1) {
    stashes.push({ x: random.pick(roadX) + 60, y: random.pick(roadY) + 60, active: true, respawn: 0 });
  }

  // ---- state -----------------------------------------------------------
  const player = {
    x: PLACES.spawn.x, y: PLACES.spawn.y, angle: -Math.PI / 2,
    health: PLAYER.startHealth, money: PLAYER.startMoney,
    vehicle: null, hurtTimer: 0, bust: 0,
  };
  const state = {
    player, vehicles, peds, buildings, stashes,
    elapsed: 0, ticks: 0,
    heat: 0, stars: 0, quietTime: 0,
    mission: 0, step: 0, faresDone: 0, stashesGot: 0, gatesGot: 0,
    stepTimer: 0, fare: null, packageHeld: false,
    status: 'playing', // playing | complete
    objective: { x: PLACES.spawn.x, y: PLACES.spawn.y, kind: 'go', label: '' },
    message: '', messageTime: 0,
    policeTimer: 0, totalEarned: 0, crimes: 0,
    missionStashes: MISSION_STASHES.map((s) => ({ ...s, active: false })),
  };

  function say(text) { state.message = text; state.messageTime = 4.5; }
  function earn(amount) { player.money += amount; state.totalEarned += amount; }
  function addHeat(points) {
    state.heat = clamp(state.heat + points, 0, HEAT.perStar * HEAT.maxStars);
    state.quietTime = 0; state.crimes += 1;
  }

  // ---- missions ----------------------------------------------------------
  function currentObjective() {
    const o = state.objective;
    const set = (x, y, kind, label, needVehicle = false, needType = null) => {
      o.x = x; o.y = y; o.kind = kind; o.label = label; o.needVehicle = needVehicle; o.needType = needType;
    };
    if (state.status === 'complete') { set(player.x, player.y, 'done', 'Story complete — free roam'); return; }
    if (state.fare && state.mission === 2) {
      const f = state.fare;
      if (!f.picked) set(f.x, f.y, 'farePickup', 'Pick up the fare', true, 'taxi');
      else set(f.dx, f.dy, 'fareDrop', 'Drop off the fare', true, 'taxi');
      return;
    }
    const m = state.mission;
    if (m === 0) {
      if (state.step === 0) set(PLACES.spawn.x + 58, PLACES.spawn.y, 'enter', 'Get in the sedan', false, 'sedan');
      else set(PLACES.garage.x, PLACES.garage.y, 'drive', 'Drive to the Docks Garage', true);
    } else if (m === 1) {
      if (state.step === 0) set(PLACES.packageSpot.x, PLACES.packageSpot.y, 'go', 'Pick up the package at the Old Pier');
      else set(PLACES.dropSpot.x, PLACES.dropSpot.y, 'go', 'Deliver the package — the heat is on');
    } else if (m === 2) {
      set(player.x, player.y, 'taxiWork', `Work a taxi shift: ${state.faresDone}/2 fares done`, true, 'taxi');
    } else if (m === 3) {
      if (state.step === 0) set(PLACES.alarmSpot.x, PLACES.alarmSpot.y, 'go', 'Meet the crew at Volcano Bank');
      else set(PLACES.spray.x, PLACES.spray.y, 'spray', 'Lose the heat at Shine Spray Shop', true);
    } else if (m === 4) {
      const s = state.missionStashes.find((it) => it.active);
      if (s) set(s.x, s.y, 'go', `Grab the stash (${state.stashesGot}/3)`);
      else set(player.x, player.y, 'go', 'Stashes done');
    } else if (m === 5) {
      if (state.gatesGot < KING_GATES.length) {
        const g = KING_GATES[state.gatesGot];
        set(g.x, g.y, 'drive', `Checkpoint ${state.gatesGot + 1}/${KING_GATES.length} — any ride`, true);
      } else set(PLACES.garage.x, PLACES.garage.y, 'drive', 'Finish at the Docks Garage', true);
    }
  }

  function completeMission(events) {
    const reward = MISSION_REWARDS[state.mission];
    earn(reward);
    say(`Mission complete: ${MISSION_TITLES[state.mission]} (+$${reward})`);
    state.mission += 1; state.step = 0; state.faresDone = 0; state.stashesGot = 0; state.gatesGot = 0;
    state.stepTimer = 0; state.packageHeld = false; state.fare = null;
    if (state.mission === 4) for (const s of state.missionStashes) s.active = true;
    if (state.mission >= MISSION_TITLES.length) {
      state.status = 'complete';
      events |= EVENT_COMPLETE;
    }
    return events | EVENT_MISSION;
  }

  function checkMission(events) {
    if (state.status === 'complete') return events;
    const d = dist(player.x, player.y, state.objective.x, state.objective.y);
    const m = state.mission;
    if (m === 0) {
      if (state.step === 0 && player.vehicle) { state.step = 1; say('Wheels sorted. Head for the docks.'); }
      else if (state.step === 1 && player.vehicle && d < 80) events = completeMission(events);
    } else if (m === 1) {
      if (state.step === 0 && d < 62) {
        state.step = 1; state.packageHeld = true;
        state.heat = Math.max(state.heat, HEAT.perStar * 2);
        say('Package grabbed — two stars. Move!');
        events |= EVENT_CRIME;
      } else if (state.step === 1 && d < 70) events = completeMission(events);
    } else if (m === 2) {
      if (state.faresDone >= 2) events = completeMission(events);
    } else if (m === 3) {
      if (state.step === 0 && d < 62) {
        state.step = 1; state.heat = HEAT.perStar * 3;
        say('The job went loud — three stars! Get sprayed!');
        events |= EVENT_CRIME;
      }
      // step 1 completes inside the spray logic
    } else if (m === 4) {
      for (const s of state.missionStashes) {
        if (s.active && dist(player.x, player.y, s.x, s.y) < 56) {
          s.active = false; state.stashesGot += 1; earn(STASH.reward); addHeat(HEAT.stash);
          say(`Stash grabbed (+$${STASH.reward}) — ${state.stashesGot}/3`);
          events |= EVENT_STASH;
        }
      }
      if (state.stashesGot >= 3) events = completeMission(events);
    } else if (m === 5) {
      if (state.gatesGot < KING_GATES.length) {
        const g = KING_GATES[state.gatesGot];
        if (player.vehicle && dist(player.x, player.y, g.x, g.y) < 88) {
          state.gatesGot += 1; say(`Checkpoint ${state.gatesGot}/${KING_GATES.length}`);
        }
      } else if (player.vehicle && d < 84) events = completeMission(events);
    }
    return events;
  }

  // ---- police --------------------------------------------------------------
  function spawnPolice() {
    const a = random.range(0, Math.PI * 2);
    const x = clamp(player.x + Math.cos(a) * POLICE.spawnDist, 80, CITY.width - 80);
    const y = clamp(player.y + Math.sin(a) * POLICE.spawnDist, 80, CITY.height - 80);
    const v = makeVehicle('police', x, y, a, 'police');
    vehicles.push(v);
  }
  function policeCount() {
    let n = 0; for (const v of vehicles) if (v.mode === 'police') n += 1;
    return n;
  }

  // ---- penalties -------------------------------------------------------------
  function penalise(kind, events) {
    const rate = kind === 'wasted' ? PENALTY.wastedRate : PENALTY.bustedRate;
    const min = kind === 'wasted' ? PENALTY.wastedMin : PENALTY.bustedMin;
    player.money = Math.max(0, player.money - Math.max(min, Math.floor(player.money * rate)));
    if (player.vehicle) { player.vehicle.mode = 'parked'; player.vehicle = null; }
    const at = kind === 'wasted' ? PLACES.hospital : PLACES.station;
    player.x = at.x; player.y = at.y + 46;
    player.health = PLAYER.startHealth; player.bust = 0;
    state.heat = 0; state.quietTime = 0;
    for (let i = vehicles.length - 1; i >= 0; i -= 1) if (vehicles[i].mode === 'police') vehicles.splice(i, 1);
    say(kind === 'wasted' ? 'Wasted! The hospital patched you up — for a fee.' : 'Busted! The CBPD impounded your ride.');
    return events | (kind === 'wasted' ? EVENT_WASTED : EVENT_BUSTED);
  }

  // ---- taxi ---------------------------------------------------------------------
  function startFare() {
    const px = random.pick(roadX); const py = random.pick(roadY);
    let dx = random.pick(roadX); let dy = random.pick(roadY);
    if (dist(px, py, dx, dy) < 500) { dx = roadX[0]; dy = roadY[roadY.length - 1]; }
    const trip = dist(px, py, dx, dy);
    state.fare = {
      x: px, y: py, dx, dy, picked: false,
      pay: Math.round(TAXI.baseFare + trip * TAXI.perUnit),
      timeLeft: 30 + trip * TAXI.tipWindow,
    };
    say('Fare waiting — follow the yellow marker.');
  }

  // ---- main step ------------------------------------------------------------------
  function step(dt, input) {
    let events = 0;
    state.elapsed += dt; state.ticks += 1;
    if (state.messageTime > 0) state.messageTime -= dt;
    currentObjective();

    // ----- enter / exit a vehicle
    if (input.act) {
      if (player.vehicle) {
        const v = player.vehicle;
        v.mode = 'parked'; v.vx = 0; v.vy = 0;
        player.x = clamp(v.x - Math.sin(v.angle) * 30, 20, CITY.width - 20);
        player.y = clamp(v.y + Math.cos(v.angle) * 30, 20, CITY.height - 20);
        player.vehicle = null;
        if (state.fare && !state.fare.picked) { state.fare = null; say('Fare cancelled.'); }
      } else {
        let best = null; let bestD = PLAYER.enterRange;
        for (const v of vehicles) {
          if (v.mode === 'police') continue;
          const d = dist(player.x, player.y, v.x, v.y);
          if (d < bestD) { bestD = d; best = v; }
        }
        if (best) {
          if (best.mode === 'traffic') { addHeat(HEAT.jackMoving); say('Carjacked! Heat is rising.'); events |= EVENT_CRIME; }
          best.mode = 'player'; best.vx = 0; best.vy = 0;
          player.vehicle = best;
          events |= EVENT_ENTER;
          if (best.type === 'taxi' && !state.fare) startFare();
        }
      }
    }

    // ----- player movement
    const speedNow = player.vehicle
      ? Math.sqrt(player.vehicle.vx ** 2 + player.vehicle.vy ** 2) : 0;
    if (player.vehicle) {
      const v = player.vehicle; const spec = VEHICLE_TYPES[v.type];
      const worn = v.health <= 0 ? 0.35 : 1;
      v.vx += input.mx * spec.maxSpeed * worn * spec.accel * dt;
      v.vy += input.my * spec.maxSpeed * worn * spec.accel * dt;
      const damp = Math.max(0, 1 - spec.grip * 0.42 * dt);
      if (input.mx === 0) v.vx *= damp;
      if (input.my === 0) v.vy *= damp;
      const sp = Math.sqrt(v.vx * v.vx + v.vy * v.vy);
      const cap = spec.maxSpeed * worn;
      if (sp > cap) { v.vx = v.vx / sp * cap; v.vy = v.vy / sp * cap; }
      v.x = clamp(v.x + v.vx * dt, 24, CITY.width - 24);
      v.y = clamp(v.y + v.vy * dt, 24, CITY.height - 24);
      if (sp > 12) v.angle = Math.atan2(v.vy, v.vx);
      const before = { x: v.x, y: v.y };
      if (pushOut(v, 20)) {
        if (sp > 150) v.health -= (sp - 150) * 0.06;
        v.vx *= -0.25; v.vy *= -0.25;
        if (sp > 200) { addHeat(HEAT.hitCar); events |= EVENT_CRIME; }
        void before;
      }
      player.x = v.x; player.y = v.y; player.angle = v.angle;
    } else {
      player.x = clamp(player.x + input.mx * PLAYER.walkSpeed * dt, 16, CITY.width - 16);
      player.y = clamp(player.y + input.my * PLAYER.walkSpeed * dt, 16, CITY.height - 16);
      if (input.mx !== 0 || input.my !== 0) player.angle = Math.atan2(input.my, input.mx);
      pushOut(player, PLAYER.radius);
    }

    // ----- traffic
    for (const v of vehicles) {
      if (v.mode !== 'traffic') continue;
      const dx = v.tx - v.x; const dy = v.ty - v.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < 26) { pickTrafficTarget(v); continue; }
      const sp = 118;
      v.vx = dx / d * sp; v.vy = dy / d * sp;
      v.x += v.vx * dt; v.y += v.vy * dt; v.angle = Math.atan2(v.vy, v.vx);
      pushOut(v, 19);
      // traffic car nudges the walking player
      if (!player.vehicle && dist(v.x, v.y, player.x, player.y) < 30 && player.hurtTimer <= 0) {
        player.health -= 12; player.hurtTimer = 1.1;
        player.x += v.vx * 0.22; player.y += v.vy * 0.22;
      }
      // player rams traffic
      if (player.vehicle && v !== player.vehicle && dist(v.x, v.y, player.x, player.y) < 38 && speedNow > 130) {
        v.health -= 14; player.vehicle.health -= 5; addHeat(HEAT.hitCar); events |= EVENT_CRIME;
        v.tx = v.x + v.vx; v.ty = v.y + v.vy;
      }
    }

    // ----- pedestrians
    for (const p of peds) {
      if (p.down > 0) { p.down -= dt; continue; }
      const dx = p.tx - p.x; const dy = p.ty - p.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < 12) { p.tx = clamp(p.x + random.range(-260, 260), 90, CITY.width - 90); p.ty = clamp(p.y + random.range(-260, 260), 90, CITY.height - 90); continue; }
      p.x += dx / d * 42 * dt; p.y += dy / d * 42 * dt;
      if (player.vehicle && speedNow > 90 && dist(p.x, p.y, player.x, player.y) < 26) {
        p.down = 6; addHeat(HEAT.hitPed); player.vehicle.health -= 4;
        say('You clipped a pedestrian!'); events |= EVENT_CRIME;
      }
    }

    // ----- police
    state.stars = state.heat <= 0 ? 0 : Math.min(HEAT.maxStars, Math.ceil(state.heat / HEAT.perStar));
    state.quietTime += dt;
    // During the Heat Escape job the pressure stays on: no decay until sprayed.
    const pinnedHeat = state.mission === 3 && state.step === 1;
    if (!pinnedHeat && state.quietTime > HEAT.decayDelay && state.heat > 0) {
      state.heat = Math.max(0, state.heat - HEAT.decayRate * dt);
    }
    state.policeTimer -= dt;
    const wanted = Math.ceil(state.heat / HEAT.perStar);
    if (wanted > 0 && policeCount() < Math.min(POLICE.maxActive, wanted + 1) && state.policeTimer <= 0) {
      spawnPolice(); state.policeTimer = POLICE.spawnGap;
    }
    let pinned = false;
    for (let i = vehicles.length - 1; i >= 0; i -= 1) {
      const v = vehicles[i];
      if (v.mode !== 'police') continue;
      if (state.heat <= 0 && dist(v.x, v.y, player.x, player.y) > 700) { vehicles.splice(i, 1); continue; }
      const dx = player.x - v.x; const dy = player.y - v.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const spec = VEHICLE_TYPES.police;
      const chase = state.heat > 0 ? spec.maxSpeed * (0.72 + 0.07 * wanted) : 130;
      v.vx += (dx / d * chase - v.vx) * 1.7 * dt;
      v.vy += (dy / d * chase - v.vy) * 1.7 * dt;
      v.x = clamp(v.x + v.vx * dt, 24, CITY.width - 24);
      v.y = clamp(v.y + v.vy * dt, 24, CITY.height - 24);
      v.angle = Math.atan2(v.vy, v.vx);
      pushOut(v, 20);
      if (d < POLICE.bustRange) {
        if (player.vehicle && speedNow > 60) {
          if (player.hurtTimer <= 0) { player.vehicle.health -= POLICE.ramDamage; player.hurtTimer = 0.7; }
        } else pinned = true;
      }
    }
    if (pinned && state.heat > 0) player.bust += POLICE.bustFill * dt;
    else player.bust = Math.max(0, player.bust - POLICE.bustDrain * dt);
    if (player.bust >= 1) events = penalise('busted', events);

    // ----- spray shop
    if (player.vehicle && dist(player.x, player.y, PLACES.spray.x, PLACES.spray.y) < SPRAY.range) {
      if (state.mission === 3 && state.step === 1 && state.heat <= 0) {
        events = completeMission(events); // reached the shop clean: job done
      } else if (state.heat > 0 && player.money >= SPRAY.fee) {
        player.money -= SPRAY.fee;
        state.heat = 0; state.quietTime = 0;
        player.vehicle.health = player.vehicle.maxHealth;
        say(`Fresh paint, clean record (−$${SPRAY.fee}).`);
        events |= EVENT_SPRAY;
        if (state.mission === 3 && state.step === 1) events = completeMission(events);
      } else if (state.heat > 0 && player.money < SPRAY.fee) {
        if (state.messageTime <= 0) say(`Spray costs $${SPRAY.fee} — you are short.`);
      }
    }

    // ----- taxi fare progress
    if (state.mission === 2 && player.vehicle && player.vehicle.type === 'taxi' && !state.fare) startFare();
    if (state.fare) {
      const f = state.fare;
      if (player.vehicle && player.vehicle.type === 'taxi') {
        if (!f.picked && dist(player.x, player.y, f.x, f.y) < 52) {
          f.picked = true; say('Fare aboard — get them there fast for a tip.');
        } else if (f.picked) {
          f.timeLeft -= dt;
          if (dist(player.x, player.y, f.dx, f.dy) < 56) {
            const tip = f.timeLeft > 0 ? TAXI.tip : 0;
            earn(f.pay + tip);
            state.faresDone = state.mission === 2 ? state.faresDone + 1 : state.faresDone;
            say(`Fare paid $${f.pay}${tip ? ` + $${tip} tip` : ''}.`);
            events |= EVENT_FARE;
            state.fare = null;
            if (state.mission === 2 && state.faresDone < 2) startFare();
          }
        }
      }
    }

    // ----- free-roam stashes
    for (const s of stashes) {
      if (!s.active) { s.respawn -= dt; if (s.respawn <= 0) s.active = true; continue; }
      if (dist(player.x, player.y, s.x, s.y) < 46) {
        s.active = false; s.respawn = 45; earn(STASH.reward); addHeat(HEAT.stash);
        say(`Stash pocketed (+$${STASH.reward}) — someone noticed.`); events |= EVENT_STASH;
      }
    }

    // ----- health, death
    if (player.hurtTimer > 0) player.hurtTimer -= dt;
    if (player.vehicle && player.vehicle.health <= 0) {
      player.health -= 6 * dt; // a burning wreck drains you while you sit in it
    }
    if (player.hurtTimer <= 0 && state.heat <= 0 && !(player.vehicle && player.vehicle.health <= 0)) {
      player.health = Math.min(PLAYER.startHealth, player.health + PLAYER.regenRate * dt);
    }
    if (player.vehicle && player.vehicle.health < 0) player.vehicle.health = 0;
    if (player.health <= 0) events = penalise('wasted', events);

    events = checkMission(events);
    currentObjective();
    return events;
  }

  function reset() {
    // Fresh runs (title -> play, restarts, tests) rebuild the run state but
    // keep the city itself, which only depends on the seed.
    player.x = PLACES.spawn.x; player.y = PLACES.spawn.y;
    player.health = PLAYER.startHealth; player.money = PLAYER.startMoney;
    player.vehicle = null; player.bust = 0; player.hurtTimer = 0;
    for (let i = vehicles.length - 1; i >= 0; i -= 1) if (vehicles[i].mode === 'police') vehicles.splice(i, 1);
    for (const v of vehicles) if (v.mode === 'player') v.mode = 'parked';
    state.elapsed = 0; state.ticks = 0; state.heat = 0; state.stars = 0; state.quietTime = 0;
    state.mission = 0; state.step = 0; state.faresDone = 0; state.stashesGot = 0; state.gatesGot = 0;
    state.fare = null; state.packageHeld = false; state.status = 'playing';
    state.totalEarned = 0; state.crimes = 0; state.message = ''; state.messageTime = 0;
    for (const s of state.missionStashes) s.active = false;
    for (const s of stashes) s.active = true;
    currentObjective();
  }

  currentObjective();
  return { state, step, reset };
}
