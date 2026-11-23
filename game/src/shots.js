// Deterministic screenshot scenes for ?shot=start|city|drive|chase&seed=N.
// Each stages the real simulation: fixed steps, scripted input, then a fixed
// camera. Same seed, same frame, every time.
export const SHOT_NAMES = ['start', 'city', 'drive', 'chase'];
function seekInput(game, tx, tz, sprint = true) {
  const p = game.player;
  const a = Math.atan2(tx - p.x, tz - p.z);
  if (p.inCar != null) {
    const car = game.cars.find((c) => c.id === p.inCar);
    let diff = a - car.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return { x: Math.max(-1, Math.min(1, diff * 2)), z: Math.abs(diff) < 1.1 ? 1 : 0.2, camAngle: car.angle };
  }
  return { x: Math.sin(a), z: -Math.cos(a), sprint, camAngle: 0 };
}
export function stageShot(game, name) {
  game.start();
  const p = game.player;
  if (name === 'start') {
    for (let i = 0; i < 40; i++) game.step({ x: 0, z: 0 });
    game.camera = { x: p.x, z: p.z, angle: 2.4, dist: 13, height: 5 };
    return;
  }
  if (name === 'city') {
    p.x = -30; p.z = 0;
    for (let i = 0; i < 90; i++) game.step({ x: 0, z: 0 });
    game.camera = { x: -30, z: 0, angle: 0.7, dist: 85, height: 55 };
    return;
  }
  if (name === 'drive') {
    // Walk to the nearest parked car, get in, and drive up the avenue.
    let car = null, bd = Infinity;
    for (const c of game.cars) {
      if (c.kind !== 'parked') continue;
      const d = (c.x - p.x) ** 2 + (c.z - p.z) ** 2;
      if (d < bd) { bd = d; car = c; }
    }
    p.x = car.x + 2.5; p.z = car.z;
    game.step({ interact: true });
    for (let i = 0; i < 110; i++) game.step({ x: 0, z: 1, camAngle: car.angle });
    game.camera = null;
    game.camAngle = car.angle;
    return;
  }
  if (name === 'chase') {
    let car = null, bd = Infinity;
    for (const c of game.cars) {
      if (c.kind !== 'parked') continue;
      const d = (c.x - p.x) ** 2 + (c.z - p.z) ** 2;
      if (d < bd) { bd = d; car = c; }
    }
    p.x = car.x + 2.5; p.z = car.z;
    game.step({ interact: true });
    game.addHeat(3.2);
    for (let i = 0; i < 100; i++) game.step({ x: 0, z: 1, camAngle: car.angle });
    // Fixed offset camera behind the player's car: the plain follow cam can
    // end up behind a roadside palm trunk and hide the chase entirely.
    game.camera = { x: car.x, z: car.z, angle: car.angle + Math.PI + 0.55, dist: 17, height: 8 };
    return;
  }
  throw new Error('unknown shot: ' + name);
}
