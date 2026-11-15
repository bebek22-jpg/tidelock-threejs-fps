// Input: pointer lock, mouse look deltas, held keys and one-shot presses.
// The sim reads `state` (keys, firing, locked) and drains `takeLook` and
// `drainPressed` once a frame, so no event is ever read twice or lost.
export function createInput(canvas, onLockChange) {
  const state = {
    keys: new Set(),
    pressed: [],
    lookX: 0,
    lookY: 0,
    firing: false,
    locked: false,
  };

  document.addEventListener('pointerlockchange', () => {
    state.locked = document.pointerLockElement === canvas;
    if (!state.locked) {
      state.keys.clear();
      state.firing = false;
    }
    onLockChange(state.locked);
  });

  document.addEventListener('mousemove', (event) => {
    if (!state.locked) return;
    state.lookX += event.movementX;
    state.lookY += event.movementY;
  });

  document.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    state.keys.add(event.code);
    state.pressed.push(event.code);
  });

  document.addEventListener('keyup', (event) => {
    state.keys.delete(event.code);
  });

  canvas.addEventListener('mousedown', (event) => {
    if (event.button === 0) state.firing = true;
  });

  document.addEventListener('mouseup', (event) => {
    if (event.button === 0) state.firing = false;
  });

  // The browser drops the lock when the tab loses focus; clear the keys so
  // a stuck W never walks the player off the pier on return.
  window.addEventListener('blur', () => {
    state.keys.clear();
    state.firing = false;
  });

  return {
    state,
    requestLock() {
      if (state.locked) return;
      try {
        const result = canvas.requestPointerLock();
        if (result && result.catch) result.catch(() => {});
      } catch {
        // Pointer lock can refuse outside a user gesture; the click handler
        // on the canvas retries it on the next click.
      }
    },
    releaseLock() {
      if (state.locked) document.exitPointerLock();
    },
    takeLook() {
      const look = { x: state.lookX, y: state.lookY };
      state.lookX = 0;
      state.lookY = 0;
      return look;
    },
    drainPressed() {
      const pressed = state.pressed;
      state.pressed = [];
      return pressed;
    },
  };
}
