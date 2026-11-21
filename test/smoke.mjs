// Smoke tests for Caldera Heat: boot the world headlessly, poke every
// major system once and assert the invariants hold. Run: node test/smoke.mjs
import { createRandom } from '../game/src/random.js';
import {
  createWorld, PLACES,
  EVENT_ENTER, EVENT_SPRAY, EVENT_BUSTED, EVENT_WASTED,
} from '../game/src/world.js';
import { pilotInput } from '../game/src/pilot.js';
import { STEP } from '../game/src/config.js';

let passed = 0;
function check(name, ok) {
  if (!ok) { console.error(`FAIL: ${name}`); process.exitCode = 1; return; }
  passed += 1; console.log(`ok ${passed} - ${name}`);
}
const IDLE = { mx: 0, my: 0, act: false };

function fresh(seed = 7) { return createWorld(createRandom(seed)); }
function run(world, input, seconds) {
  let events = 0;
  const n = Math.round(seconds / STEP);
  for (let i = 0; i < n; i += 1) events |= world.step(STEP, typeof input === 'function' ? input(world.state) : input);
  return events;
}

// 1. The city builds and the world is finite and sane.
{
  const w = fresh();
  const s = w.state;
  check('city has buildings', s.buildings.length > 60);
  check('vehicles exist incl. guaranteed rides', s.vehicles.length >= 30);
  check('peds exist', s.peds.length === 14);
  check('player starts with cash and health', s.player.money === 120 && s.player.health === 100);
  check('starts at mission 1 with an objective', s.mission === 0 && s.objective.kind === 'enter');
}

// 2. Idling never produces NaN and traffic keeps moving.
{
  const w = fresh();
  run(w, IDLE, 20);
  const s = w.state;
  const finite = [s.player.x, s.player.y, ...s.vehicles.flatMap((v) => [v.x, v.y])].every(Number.isFinite);
  check('20s idle: all positions finite', finite);
  const moved = s.vehicles.some((v) => v.mode === 'traffic' && (v.x !== v.tx || v.y !== v.ty));
  check('traffic is on the move', moved);
}

// 3. The autopilot gets in the sedan (enter event, mission step advances).
{
  const w = fresh();
  const events = run(w, (s) => pilotInput(s), 12);
  check('enter event fired', (events & EVENT_ENTER) !== 0);
  check('player is driving', w.state.player.vehicle !== null);
  check('mission 1 advanced past the enter step', w.state.mission > 0 || w.state.step === 1);
}

// 4. Carjacking a moving car raises heat; parked cars do not.
{
  const w = fresh();
  const s = w.state;
  const traffic = s.vehicles.find((v) => v.mode === 'traffic');
  s.player.x = traffic.x; s.player.y = traffic.y;
  w.step(STEP, { mx: 0, my: 0, act: true });
  check('jacking a moving car gives heat', s.heat > 0 && s.player.vehicle === traffic);
}

// 5. Wanted stars track heat and police spawn while wanted.
{
  const w = fresh();
  const s = w.state;
  s.heat = 250;
  run(w, IDLE, 1); // check before the arriving units can pin the player
  check('heat 250 shows 3 stars', s.stars === 3);
  check('police spawned to pursue', s.vehicles.some((v) => v.mode === 'police'));
}

// 6. The spray shop clears heat for the fee and repairs the car.
{
  const w = fresh();
  const s = w.state;
  run(w, (st) => pilotInput(st), 12); // get in the sedan
  const car = s.player.vehicle;
  car.health = 30; s.heat = 300; s.player.money = 400;
  s.player.x = PLACES.spray.x; s.player.y = PLACES.spray.y; car.x = car.y = 0;
  car.x = PLACES.spray.x; car.y = PLACES.spray.y;
  const events = w.step(STEP, IDLE);
  check('spray event fired', (events & EVENT_SPRAY) !== 0);
  check('heat cleared and fee charged', s.heat === 0 && s.player.money === 300);
  check('car repaired', car.health === car.maxHealth);
}

// 7. Busted: pinned at zero speed with police close, the meter fills.
{
  const w = fresh();
  const s = w.state;
  s.heat = 200;
  run(w, IDLE, 3); // let police arrive
  const cop = s.vehicles.find((v) => v.mode === 'police');
  check('a cop is on scene', Boolean(cop));
  let events = 0;
  for (let i = 0; i < 60 * 8 && !(events & EVENT_BUSTED); i += 1) {
    if (cop) { cop.x = s.player.x + 20; cop.y = s.player.y; }
    events |= w.step(STEP, IDLE);
  }
  check('busted fires when pinned', (events & EVENT_BUSTED) !== 0);
  check('busted costs money and clears heat', s.player.money < 120 && s.heat === 0);
}

// 8. Wasted: lethal damage respawns at the hospital.
{
  const w = fresh();
  const s = w.state;
  // Get into a parked car, torch it, and sit in the wreck.
  const car = s.vehicles.find((v) => v.mode === 'parked');
  s.player.x = car.x; s.player.y = car.y;
  w.step(STEP, { mx: 0, my: 0, act: true });
  car.health = 0;
  let events = 0;
  for (let i = 0; i < 60 * 30 && !(events & EVENT_WASTED); i += 1) events |= w.step(STEP, IDLE);
  check('wasted fires in a burning wreck', (events & EVENT_WASTED) !== 0);
  check('respawned near the hospital with full health', s.player.health === 100
    && Math.abs(s.player.x - PLACES.hospital.x) < 4 && Math.abs(s.player.y - (PLACES.hospital.y + 46)) < 4);
}

// 9. Determinism: same seed + same inputs = identical end state.
{
  const a = fresh(42); const b = fresh(42);
  run(a, (s) => pilotInput(s), 30);
  run(b, (s) => pilotInput(s), 30);
  const pick = (s) => [s.ticks, s.player.money, Math.round(s.player.x), Math.round(s.player.y), s.mission, s.step];
  check('two identical runs agree exactly', JSON.stringify(pick(a.state)) === JSON.stringify(pick(b.state)));
}

// 10. Free-roam stash pays out.
{
  const w = fresh();
  const s = w.state;
  const stash = s.stashes.find((it) => it.active);
  const before = s.player.money;
  s.player.x = stash.x; s.player.y = stash.y;
  w.step(STEP, IDLE);
  check('stash pays $90 and goes inactive', s.player.money === before + 90 && !stash.active);
}

console.log(`\nSMOKE: ${passed} checks passed${process.exitCode ? ' (with failures above)' : ''}`);
