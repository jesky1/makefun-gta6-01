// The screenshot scenes behind ?shot=start|play|end. Each one plays the
// real simulation forward from a fresh world, steered by the autopilot,
// so a frame is what an actual run looks like and a seed always gives
// the same frame: start idles at the spawn plaza, play is mid-first-job,
// end is the moment the sixth mission lands.

import { STEP } from './config.js';
import { pilotInput } from './pilot.js';
import { SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';

const IDLE = { mx: 0, my: 0, act: false };

export function stageShot(name, world) {
  world.reset();
  const state = world.state;
  if (name === 'play') {
    // Drive the first job for a while: in the sedan, streets busy around.
    for (let i = 0; i < 60 * 22 && state.mission === 0; i += 1) world.step(STEP, pilotInput(state));
    for (let i = 0; i < 60 * 3; i += 1) world.step(STEP, pilotInput(state));
    return { screen: SCREEN_PLAY };
  }
  if (name === 'end') {
    // Play the whole story with the autopilot (bounded; it finishes).
    const LIMIT = 60 * 60 * 25;
    for (let i = 0; i < LIMIT && state.status !== 'complete'; i += 1) world.step(STEP, pilotInput(state));
    for (let i = 0; i < 40; i += 1) world.step(STEP, IDLE);
    return { screen: SCREEN_WIN };
  }
  for (let i = 0; i < 60 * 4; i += 1) world.step(STEP, IDLE);
  return { screen: SCREEN_TITLE };
}
