// Caldera Heat bootstrap: wires the simulation to the WebGL renderer, the HUD
// canvas, procedural audio and input. The sim runs at a fixed 30 steps per
// second; rendering follows whenever the browser paints.
// ?seed=N fixes the world. ?shot=start|city|drive|chase&seed=N stages a
// deterministic scene, paints it, and sets window.__shotReady = true.
import { createGame, DT } from './sim.js';
import { createRenderer } from './render.js';
import { createHud } from './hud.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { stageShot, SHOT_NAMES } from './shots.js';

const params = new URLSearchParams(window.location.search);
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 7;
const shot = params.get('shot');

const glCanvas = document.getElementById('gl');
const hudCanvas = document.getElementById('hud');
const game = createGame(seed);
const renderer = createRenderer(glCanvas);
const hud = createHud(hudCanvas);
const input = createInput(glCanvas);
const audio = createAudio();
game.camAngle = Math.PI;

if (shot) {
  if (!SHOT_NAMES.includes(shot)) throw new Error('unknown shot: ' + shot);
  stageShot(game, shot);
  renderer.draw(game);
  hud.draw(game, 'shot');
  renderer.draw(game);
  window.__shotReady = true;
} else {
  let screen = 'title';
  let last = performance.now();
  let acc = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    let elapsed = (now - last) / 1000;
    last = now;
    if (elapsed > 0.25) elapsed = 0.25;
    if (input.take('mute')) audio.toggleMute();
    if (screen === 'title') {
      if (input.take('confirm')) { screen = 'play'; game.start(); audio.unlock(); }
      game.camAngle += 0.0016 * elapsed * 60;
      renderer.draw(game);
      hud.draw(game, 'title');
      return;
    }
    if (input.take('pause')) game.paused = !game.paused;
    if (input.take('save')) { try { game.save(window.localStorage); } catch {} }
    if (input.take('load')) { try { game.load(window.localStorage); } catch {} }
    // Camera follows behind the player's facing; mouse steers aim.
    const p = game.player;
    const targetAngle = p.inCar != null ? p.angle : (input.mouse().down ? p.angle : game.camAngle);
    let diff = targetAngle - game.camAngle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    game.camAngle += diff * Math.min(1, elapsed * 6);
    if (p.inCar == null && (input.mouse().down)) {
      const m = input.mouse();
      const dx = m.x - window.innerWidth / 2, dy = m.y - window.innerHeight / 2;
      if (Math.hypot(dx, dy) > 12) p.angle = Math.atan2(dx, -dy) + game.camAngle * 0; // aim toward cursor side
    }
    acc += elapsed;
    let steps = 0;
    while (acc >= DT && steps < 8) {
      const inp = input.poll(game.camAngle, p.angle);
      game.step(inp);
      for (const ev of game.events) {
        if (ev === 'shot') audio.shot();
        else if (ev === 'pickup') audio.pickup();
        else if (ev === 'cash') audio.cash();
        else if (ev === 'mission') audio.mission();
        else if (ev === 'busted') audio.bust();
      }
      acc -= DT;
      steps++;
    }
    const car = p.inCar != null ? game.cars.find((c) => c.id === p.inCar) : null;
    audio.setEngine(car ? car.speed / 30 : 0, !!car);
    audio.setSiren(game.getStars() > 0, game.tick);
    renderer.draw(game);
    hud.draw(game, game.paused ? 'paused' : 'play');
  }
  requestAnimationFrame(frame);
}
