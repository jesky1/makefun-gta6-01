// Story test for Caldera Heat: the autopilot plays all six missions
// end-to-end through the real rules. The run must complete, and two runs
// with the same seed must agree on ticks and money exactly.
// Run: node test/story.mjs
import { createRandom } from '../game/src/random.js';
import { createWorld } from '../game/src/world.js';
import { pilotInput } from '../game/src/pilot.js';
import { STEP } from '../game/src/config.js';

const LIMIT = 60 * 60 * 25; // 25 in-game minutes, hard bound

function playthrough(seed) {
  const world = createWorld(createRandom(seed));
  const s = world.state;
  let ticks = 0;
  const seenMissions = new Set();
  while (s.status !== 'complete' && ticks < LIMIT) {
    world.step(STEP, pilotInput(s));
    ticks += 1;
    seenMissions.add(s.mission);
  }
  return {
    done: s.status === 'complete',
    ticks, money: s.player.money, earned: s.totalEarned,
    missionsSeen: seenMissions.size, health: Math.round(s.player.health),
  };
}

const a = playthrough(1);
console.log('run A:', JSON.stringify(a));
const b = playthrough(1);
console.log('run B:', JSON.stringify(b));

let failed = false;
if (!a.done) { console.error('FAIL: story did not complete'); failed = true; }
if (a.ticks !== b.ticks || a.money !== b.money) { console.error('FAIL: runs disagree (not deterministic)'); failed = true; }
if (a.missionsSeen < 6) { console.error('FAIL: not all missions were visited'); failed = true; }
if (!failed) console.log(`STORY: PASS — completed in ${a.ticks} ticks, final money $${a.money}, earned $${a.earned}, deterministic across 2 runs`);
process.exit(failed ? 1 : 0);
