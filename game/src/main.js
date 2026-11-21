// Caldera Heat — boot and the one game loop. Input is read every frame,
// the world advances in fixed 1/60 s steps (several in a slow frame, none
// in a fast one) and the renderer paints what is there. Screens: title,
// play, paused, run-over (busted/wasted tally) and the story-complete win.
//
// ?seed=N fixes the city layout and traffic. ?shot=start|play|end (with
// &seed=N) stages that scene instead of running the loop, paints it twice
// and sets window.__shotReady for the screenshot harness.

import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_BUSTED, EVENT_COMPLETE, EVENT_WASTED } from './world.js';
import { ACTION_ACT, ACTION_CONFIRM, ACTION_PAUSE, createInput } from './input.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);

function readBest() {
  try { return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0; }
  catch { return 0; }
}
function saveBest(value) {
  try { window.localStorage.setItem(BEST_KEY, String(value)); }
  catch { /* private windows: the best take lasts this visit only */ }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, 0);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let flashTimer = 0;

  function announce(message) { status.textContent = message; }
  function noteTake() {
    if (world.state.player.money > best) { best = world.state.player.money; saveBest(best); }
  }
  function startGame() {
    world.reset();
    input.frame(); // flush any stale interact tap
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Playing Caldera Heat. Mission one: get in the sedan.');
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;

    const actions = input.takeActions();
    if (actions & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_OVER)) startGame();
    else if (actions & ACTION_CONFIRM && screen === SCREEN_WIN) screen = SCREEN_PLAY;
    else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) { screen = SCREEN_PAUSED; announce('Paused.'); }
    else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) { screen = SCREEN_PLAY; announce('Playing.'); }

    if (screen === SCREEN_PLAY) {
      let pendingAct = (actions & ACTION_ACT) !== 0;
      while (accumulator >= STEP && screen === SCREEN_PLAY) {
        const frameInput = input.frame();
        if (pendingAct) { frameInput.act = true; pendingAct = false; }
        const events = world.step(STEP, frameInput);
        accumulator -= STEP;
        if (events & EVENT_COMPLETE) { noteTake(); screen = SCREEN_WIN; announce('Story complete. You run Caldera Bay.'); }
        else if (events & (EVENT_BUSTED | EVENT_WASTED)) {
          noteTake();
          flashTimer = 1.6;
          announce(events & EVENT_BUSTED ? 'Busted.' : 'Wasted.');
        }
      }
    } else if (screen === SCREEN_TITLE) {
      while (accumulator >= STEP) { world.step(STEP, { mx: 0, my: 0, act: false }); accumulator -= STEP; }
    } else {
      accumulator = 0;
    }

    if (flashTimer > 0) {
      flashTimer -= 1 / 60;
      renderer.draw(world.state, SCREEN_OVER, best);
    } else {
      renderer.draw(world.state, screen, best);
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) { screen = SCREEN_PAUSED; announce('Paused.'); }
  });

  announce('Caldera Heat. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
