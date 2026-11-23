// Keyboard + mouse input for Caldera Heat. Held keys form the movement axes;
// one-shot actions (interact, reload, pause, confirm, save, load, mute) are
// queued as edges so a press between frames is never lost or doubled.
export function createInput(canvas) {
  const keys = new Set();
  const edges = { interact: false, reload: false, pause: false, confirm: false, save: false, load: false, mute: false };
  let mouseDown = false, mouseX = 0, mouseY = 0;
  const EDGE_KEYS = {
    KeyE: 'interact', KeyF: null, KeyR: 'reload', KeyP: 'pause', Escape: 'pause',
    Enter: 'confirm', F6: 'save', F9: 'load', KeyM: 'mute',
  };
  window.addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    if (e.code === 'KeyF') edges.interact = true; // F is the alt interact / fire is mouse
    const edge = EDGE_KEYS[e.code];
    if (edge && !e.repeat) edges[edge] = true;
    keys.add(e.code);
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => { keys.clear(); mouseDown = false; });
  canvas.addEventListener('mousedown', (e) => { if (e.button === 0) { mouseDown = true; edges.confirm = true; } });
  window.addEventListener('mouseup', (e) => { if (e.button === 0) mouseDown = false; });
  canvas.addEventListener('mousemove', (e) => { mouseX = e.clientX; mouseY = e.clientY; });
  const held = (...codes) => codes.some((c) => keys.has(c));
  return {
    // camAngle/aimAngle are filled in by main.js, which owns the camera.
    poll(camAngle, aimAngle) {
      const x = (held('KeyD', 'ArrowRight') ? 1 : 0) - (held('KeyA', 'ArrowLeft') ? 1 : 0);
      const z = (held('KeyW', 'ArrowUp') ? 1 : 0) - (held('KeyS', 'ArrowDown') ? 1 : 0);
      const out = {
        x, z,
        sprint: held('ShiftLeft', 'ShiftRight'),
        interact: edges.interact,
        reload: edges.reload,
        fire: mouseDown || held('Space'),
        camAngle, aim: aimAngle,
      };
      edges.interact = false; edges.reload = false;
      return out;
    },
    take(name) { const v = edges[name]; edges[name] = false; return v; },
    mouse() { return { x: mouseX, y: mouseY, down: mouseDown }; },
  };
}
