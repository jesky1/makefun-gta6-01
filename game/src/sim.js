// Caldera Heat simulation: the whole game as a fixed-step, seeded, headless
// model. No DOM, no timers, no Math.random — the browser shell feeds it input
// objects and Node tests drive it exactly the same way.
import { createRng, clamp, angleTo, angleDiff } from './rng.js';
import { createCity, collideBuildings, nearestJunction, junctionPos, neighbours, CITY_BOUNDS } from './city.js';
import { MISSIONS, missionTargetPos } from './missions.js';

export const DT = 1 / 30;
const WALK = 8, SPRINT = 13.5, CAR_MAX = 30, CAR_ACCEL = 22;

export function createGame(seed = 7) {
  const rng = createRng(seed);
  const city = createCity();
  const game = {
    city, rng, tick: 0, started: false, paused: false,
    events: [], notice: '', noticeTicks: 0, storyDone: false,
    missionIndex: 0, missionActive: false, missionText: '',
    fireCooldown: 0, reloadTicks: 0, crimeTimer: 0, spawnTimer: 0,
    camera: null,
  };
  const player = {
    x: -138, z: -96, angle: -Math.PI / 2, hp: 100, cash: 40,
    heat: 0, bust: 0, inCar: null, ammo: 12, reserve: 60,
  };
  game.player = player;

  let nextId = 1;
  const cars = [];
  // Moving traffic on the road graph; three of them are taxis.
  for (let i = 0; i < 11; i++) {
    const j = rng.int(0, 29);
    const p = junctionPos(j);
    cars.push({
      id: nextId++, kind: i < 3 ? 'taxi' : 'traffic', x: p.x, z: p.z, angle: 0,
      speed: 0, target: rng.pick(neighbours(j)), color: rng.pick(city.carColors),
      hp: 40, player: false,
    });
  }
  for (const pk of city.parked) {
    cars.push({
      id: nextId++, kind: 'parked', x: pk.x, z: pk.z, angle: pk.angle, speed: 0,
      target: -1, color: pk.color, hp: 40, player: false,
    });
  }
  game.cars = cars;

  const peds = [];
  for (let i = 0; i < 24; i++) {
    const j = rng.int(0, 29);
    const p = junctionPos(j);
    peds.push({
      x: p.x + rng.range(7.5, 9.5), z: p.z + rng.range(-4, 4), angle: 0,
      target: rng.pick(neighbours(j)), hp: 3, down: false, hue: rng.range(0, 1),
    });
  }
  game.peds = peds;
  game.cops = []; // foot cops: {x,z,angle,hp,down}
  game.crates = city.crates.map((c) => ({ x: c.x, z: c.z, taken: false }));

  game.getStars = () => (player.heat <= 0.05 ? 0 : Math.min(5, Math.ceil(player.heat)));
  game.mission = () => (game.missionIndex < MISSIONS.length ? MISSIONS[game.missionIndex] : null);
  game.missionTarget = () => {
    const m = game.mission();
    return m ? missionTargetPos(city, m) : null;
  };
  function crime(amount) {
    player.heat = Math.min(5.6, player.heat + amount);
    game.crimeTimer = 150; // 5 s before heat can decay
  }
  game.addHeat = crime;
  game.damagePlayer = (n) => { player.hp -= n; };

  function respawn(poiKey, penalty) {
    const poi = city.pois[poiKey];
    player.cash = Math.max(0, player.cash - penalty);
    player.x = poi.x + 10; player.z = poi.z;
    player.inCar = null; player.bust = 0;
    for (const c of cars) c.player = false;
  }
  function busted() {
    game.events.push('busted');
    game.notice = 'BUSTED'; game.noticeTicks = 90;
    respawn('police', 150);
    player.heat = 0;
    game.cops.length = 0;
    for (let i = cars.length - 1; i >= 0; i--) if (cars[i].kind === 'police') cars.splice(i, 1);
  }
  function wasted() {
    game.events.push('wasted');
    game.notice = 'WASTED'; game.noticeTicks = 90;
    respawn('hospital', 100);
    player.hp = 100;
    player.heat = player.heat / 2;
  }
  game.busted = busted;
  game.wasted = wasted;

  function enterCar(car, jacked) {
    player.inCar = car.id;
    car.player = true;
    car.speed = 0;
    if (jacked) { crime(1.1); game.events.push('jack'); }
    game.events.push('enter');
  }
  function exitCar() {
    const car = cars.find((c) => c.id === player.inCar);
    player.inCar = null;
    if (car) {
      car.player = false; car.speed = 0;
      player.x = car.x + Math.cos(car.angle) * 3;
      player.z = car.z - Math.sin(car.angle) * 3;
      [player.x, player.z] = collideBuildings(city, player.x, player.z, 0.7);
    }
    game.events.push('exit');
  }
  game.nearestCar = (maxD = 5) => {
    let best = null, bd = maxD * maxD;
    for (const c of cars) {
      const d = (c.x - player.x) ** 2 + (c.z - player.z) ** 2;
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  };
  game.doInteract = () => {
    if (player.inCar != null) {
      const car = cars.find((c) => c.id === player.inCar);
      const spray = city.pois.spray;
      if (car && (car.x - spray.x) ** 2 + (car.z - spray.z) ** 2 < 100 && player.heat > 0 && player.cash >= 120) {
        player.cash -= 120; player.heat = 0; game.crimeTimer = 0;
        game.cops.length = 0;
        for (let i = cars.length - 1; i >= 0; i--) if (cars[i].kind === 'police') cars.splice(i, 1);
        game.events.push('spray', 'cash');
        return;
      }
      exitCar();
      return;
    }
    const car = game.nearestCar(5);
    if (car) {
      if (car.kind === 'taxi') {
        const t = game.missionTarget() || city.pois.cafe;
        const d = Math.hypot(t.x - player.x, t.z - player.z);
        const fare = Math.min(player.cash, 10 + Math.round(d / 25));
        player.cash -= fare;
        player.x = t.x + 9; player.z = t.z + 4;
        [player.x, player.z] = collideBuildings(city, player.x, player.z, 0.7);
        game.events.push('taxi', 'cash');
        return;
      }
      enterCar(car, car.kind === 'traffic');
      return;
    }
    // Start the story at the cafe fixer.
    if (game.missionIndex === 0 && !game.missionActive) {
      const cafe = city.pois.cafe;
      if ((player.x - cafe.x) ** 2 + (player.z - cafe.z) ** 2 < 64) {
        game.missionActive = true;
        game.events.push('mission');
      }
    }
  };

  function movePlayer(input) {
    if (player.inCar != null) {
      const car = cars.find((c) => c.id === player.inCar);
      if (!car) { player.inCar = null; return; }
      const throttle = clamp(input.z || 0, -1, 1);
      const steer = clamp(input.x || 0, -1, 1);
      if (throttle !== 0) car.speed += throttle * CAR_ACCEL * DT * (car.speed * throttle < 0 ? 1.8 : 1);
      else car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 14 * DT);
      car.speed = clamp(car.speed, -11, CAR_MAX);
      if (Math.abs(car.speed) > 0.2) car.angle += steer * 1.7 * DT * Math.sign(car.speed) * Math.min(1, Math.abs(car.speed) / 8);
      const nx = car.x + Math.sin(car.angle) * car.speed * DT;
      const nz = car.z + Math.cos(car.angle) * car.speed * DT;
      const [cx, cz] = collideBuildings(city, nx, nz, 1.7);
      if ((cx !== nx || cz !== nz) && Math.abs(car.speed) > 16) { player.hp -= 3; car.speed *= -0.25; }
      car.x = clamp(cx, CITY_BOUNDS.minX, CITY_BOUNDS.maxX);
      car.z = clamp(cz, CITY_BOUNDS.minZ, CITY_BOUNDS.maxZ);
      player.x = car.x; player.z = car.z; player.angle = car.angle;
      // Running someone down in a car is a crime.
      if (Math.abs(car.speed) > 9) {
        for (const p of peds) {
          if (!p.down && (p.x - car.x) ** 2 + (p.z - car.z) ** 2 < 4.4) { p.down = true; p.hp = 0; crime(0.9); game.events.push('hit'); }
        }
      }
      return;
    }
    let mx = input.x || 0, mz = input.z || 0;
    const len = Math.hypot(mx, mz);
    if (len > 0.01) {
      mx /= Math.max(1, len); mz /= Math.max(1, len);
      const cam = input.camAngle || 0;
      const sin = Math.sin(cam), cos = Math.cos(cam);
      const wx = mx * cos - mz * sin;
      const wz = -mx * sin - mz * cos;
      const sp = input.sprint ? SPRINT : WALK;
      const nx = player.x + wx * sp * DT;
      const nz = player.z + wz * sp * DT;
      const [cx, cz] = collideBuildings(city, nx, nz, 0.7);
      player.x = clamp(cx, CITY_BOUNDS.minX, CITY_BOUNDS.maxX);
      player.z = clamp(cz, CITY_BOUNDS.minZ, CITY_BOUNDS.maxZ);
      player.angle = Math.atan2(wx, wz);
    }
  }

  function moveTraffic() {
    for (const car of cars) {
      if (car.player || car.kind === 'parked') continue;
      if (car.kind === 'police') {
        const want = angleTo(car.x, car.z, player.x, player.z);
        car.angle += clamp(angleDiff(want, car.angle), -2.4 * DT, 2.4 * DT);
        const d = Math.hypot(player.x - car.x, player.z - car.z);
        car.speed = d > 7 ? 19 : 0;
        car.x += Math.sin(car.angle) * car.speed * DT;
        car.z += Math.cos(car.angle) * car.speed * DT;
        continue;
      }
      const t = junctionPos(car.target);
      const d = Math.hypot(t.x - car.x, t.z - car.z);
      if (d < 3) {
        const cur = nearestJunction(car.x, car.z);
        car.target = rng.pick(neighbours(cur));
        continue;
      }
      const want = angleTo(car.x, car.z, t.x, t.z);
      car.angle += clamp(angleDiff(want, car.angle), -3 * DT, 3 * DT);
      car.speed = 11;
      car.x += Math.sin(car.angle) * car.speed * DT;
      car.z += Math.cos(car.angle) * car.speed * DT;
    }
    for (const p of peds) {
      if (p.down) continue;
      const t = junctionPos(p.target);
      const tx = t.x + 8.5, tz = t.z;
      const d = Math.hypot(tx - p.x, tz - p.z);
      if (d < 1.5) { p.target = rng.pick(neighbours(nearestJunction(p.x, p.z))); continue; }
      p.angle = angleTo(p.x, p.z, tx, tz);
      p.x += Math.sin(p.angle) * 2.2 * DT;
      p.z += Math.cos(p.angle) * 2.2 * DT;
    }
  }

  function policeWork() {
    const stars = game.getStars();
    game.spawnTimer -= 1;
    if (stars >= 1 && game.spawnTimer <= 0) {
      game.spawnTimer = 90;
      const policeCars = cars.filter((c) => c.kind === 'police');
      if (policeCars.length < stars) {
        const j = junctionPos(nearestJunction(player.x, player.z));
        cars.push({
          id: nextId++, kind: 'police', x: j.x + 26, z: j.z + 26, angle: 0, speed: 0,
          target: -1, color: [0.1, 0.1, 0.12], hp: 60, player: false,
        });
      }
      if (stars >= 2 && game.cops.length < stars - 1) {
        game.cops.push({ x: player.x + 20, z: player.z + 12, angle: 0, hp: 3, down: false });
      }
    }
    if (stars === 0 && cars.some((c) => c.kind === 'police')) {
      for (let i = cars.length - 1; i >= 0; i--) if (cars[i].kind === 'police') cars.splice(i, 1);
      game.cops.length = 0;
    }
    let nearCop = false;
    for (const cop of game.cops) {
      if (cop.down) continue;
      const d = Math.hypot(player.x - cop.x, player.z - cop.z);
      if (d > 80) { cop.x = player.x + 24; cop.z = player.z - 18; continue; }
      if (d > 3) {
        cop.angle = angleTo(cop.x, cop.z, player.x, player.z);
        cop.x += Math.sin(cop.angle) * 4.8 * DT;
        cop.z += Math.cos(cop.angle) * 4.8 * DT;
      } else if (player.inCar == null) nearCop = true;
    }
    if (player.inCar == null) {
      for (const c of cars) {
        if (c.kind === 'police' && Math.hypot(player.x - c.x, player.z - c.z) < 5.5) nearCop = true;
      }
    } else {
      const car = cars.find((c) => c.id === player.inCar);
      if (car && Math.abs(car.speed) < 2) {
        for (const c of cars) if (c.kind === 'police' && Math.hypot(player.x - c.x, player.z - c.z) < 7) nearCop = true;
        if (game.cops.some((cop) => !cop.down && Math.hypot(player.x - cop.x, player.z - cop.z) < 4)) nearCop = true;
      }
    }
    if (nearCop && stars >= 1) player.bust += DT / 1.1;
    else player.bust = Math.max(0, player.bust - DT / 2);
    if (player.bust >= 1) busted();
  }

  function combat(input) {
    if (game.fireCooldown > 0) game.fireCooldown--;
    if (game.reloadTicks > 0) {
      game.reloadTicks--;
      if (game.reloadTicks === 0) {
        const take = Math.min(12 - player.ammo, player.reserve);
        player.ammo += take; player.reserve -= take;
      }
      return;
    }
    if (input.reload && player.ammo < 12 && player.reserve > 0) { game.reloadTicks = 40; return; }
    if (!input.fire || player.inCar != null) return;
    if (player.ammo <= 0) { game.reloadTicks = 40; return; }
    if (game.fireCooldown > 0) return;
    player.ammo--;
    game.fireCooldown = 7;
    game.events.push('shot');
    const aim = input.aim != null ? input.aim : player.angle;
    let best = null, bd = 34 * 34;
    const consider = (o, kind) => {
      if (o.down || o.hp <= 0) return;
      const d = (o.x - player.x) ** 2 + (o.z - player.z) ** 2;
      if (d < bd && Math.abs(angleDiff(angleTo(player.x, player.z, o.x, o.z), aim)) < 0.28) { bd = d; best = { o, kind }; }
    };
    for (const p of peds) consider(p, 'ped');
    for (const c of game.cops) consider(c, 'cop');
    if (best) {
      best.o.hp -= 1;
      if (best.o.hp <= 0) best.o.down = true;
      crime(best.kind === 'cop' ? 1.3 : 0.8);
      game.events.push('hit');
    }
  }

  function worldWork() {
    if (player.inCar == null) {
      for (const c of game.crates) {
        if (!c.taken && (c.x - player.x) ** 2 + (c.z - player.z) ** 2 < 9) {
          c.taken = true;
          const pay = rng.int(25, 60);
          player.cash += pay;
          game.events.push('pickup', 'cash');
        }
      }
    }
    if (game.missionActive && game.missionIndex < MISSIONS.length) {
      const m = MISSIONS[game.missionIndex];
      const t = game.missionTarget();
      const d = Math.hypot(t.x - player.x, t.z - player.z);
      const okMode = m.byCar ? player.inCar != null : player.inCar == null;
      if (d < 7.5 && okMode) {
        player.cash += m.reward;
        game.missionText = m.done;
        game.events.push('mission', 'cash');
        game.missionIndex++;
        if (game.missionIndex >= MISSIONS.length) { game.storyDone = true; game.missionActive = false; }
      }
    }
    if (game.crimeTimer > 0) game.crimeTimer--;
    else if (player.heat > 0) player.heat = Math.max(0, player.heat - 0.06 * DT);
    if (game.noticeTicks > 0) game.noticeTicks--;
    if (player.hp <= 0) wasted();
  }

  game.step = (input = {}) => {
    if (!game.started || game.paused) return;
    game.events.length = 0;
    game.tick++;
    if (input.interact) game.doInteract();
    movePlayer(input);
    combat(input);
    moveTraffic();
    policeWork();
    worldWork();
  };
  game.start = () => { game.started = true; };

  game.serialize = () => JSON.stringify({
    tick: game.tick, rng: rng.state(), storyDone: game.storyDone,
    missionIndex: game.missionIndex, missionActive: game.missionActive,
    player: { ...player },
    crates: game.crates.map((c) => c.taken),
    cars: cars.map((c) => ({ id: c.id, kind: c.kind, x: c.x, z: c.z, angle: c.angle, target: c.target, color: c.color, hp: c.hp, player: c.player })),
    peds: game.peds.map((p) => ({ ...p })),
    cops: game.cops.map((c) => ({ ...c })),
    crimeTimer: game.crimeTimer,
  });
  game.deserialize = (str) => {
    const s = JSON.parse(str);
    game.tick = s.tick; rng.setState(s.rng);
    game.storyDone = s.storyDone;
    game.missionIndex = s.missionIndex; game.missionActive = s.missionActive;
    Object.assign(player, s.player);
    s.crates.forEach((t, i) => { if (game.crates[i]) game.crates[i].taken = t; });
    cars.length = 0;
    for (const c of s.cars) cars.push({ ...c, speed: 0 });
    game.peds.length = 0;
    for (const p of s.peds) game.peds.push({ ...p });
    game.cops.length = 0;
    for (const c of s.cops) game.cops.push({ ...c });
    game.crimeTimer = s.crimeTimer || 0;
    nextId = cars.reduce((m, c) => Math.max(m, c.id), 0) + 1;
  };
  game.save = (storage) => storage.setItem('caldera-heat-save', game.serialize());
  game.load = (storage) => {
    const s = storage.getItem('caldera-heat-save');
    if (s) game.deserialize(s);
    return !!s;
  };
  return game;
}
