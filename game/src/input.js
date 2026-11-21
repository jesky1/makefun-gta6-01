// Keyboard input for Caldera Heat. Held movement keys become a steering
// vector each frame; one-shot presses (get in / out of a car, confirm,
// pause) are queued as flags and taken exactly once by the loop, so a tap
// between frames is never lost and never fires twice.

export const ACTION_ACT = 1;
export const ACTION_CONFIRM = 2;
export const ACTION_PAUSE = 4;

const KEYS = {
  left: new Set(['ArrowLeft', 'KeyA']),
  right: new Set(['ArrowRight', 'KeyD']),
  up: new Set(['ArrowUp', 'KeyW']),
  down: new Set(['ArrowDown', 'KeyS']),
  act: new Set(['KeyE', 'KeyF']),
  confirm: new Set(['Space', 'Enter']),
  pause: new Set(['KeyP', 'Escape']),
};

export function createInput(target) {
  const held = { left: false, right: false, up: false, down: false };
  let actions = 0;
  let actQueued = false;

  function bucket(code) {
    for (const name of Object.keys(KEYS)) if (KEYS[name].has(code)) return name;
    return null;
  }

  window.addEventListener('keydown', (event) => {
    const name = bucket(event.code);
    if (name === null) return;
    if (name in held) held[name] = true;
    else if (!event.repeat) {
      if (name === 'act') { actions |= ACTION_ACT; actQueued = true; }
      if (name === 'confirm') actions |= ACTION_CONFIRM;
      if (name === 'pause') actions |= ACTION_PAUSE;
    }
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    const name = bucket(event.code);
    if (name !== null && name in held) held[name] = false;
  });
  window.addEventListener('blur', () => {
    held.left = held.right = held.up = held.down = false;
  });
  target.addEventListener('pointerdown', () => { actions |= ACTION_CONFIRM; });

  return {
    /** Steering vector plus whether the interact key was tapped. */
    frame() {
      const input = {
        mx: (held.right ? 1 : 0) - (held.left ? 1 : 0),
        my: (held.down ? 1 : 0) - (held.up ? 1 : 0),
        act: actQueued,
      };
      actQueued = false;
      return input;
    },
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
