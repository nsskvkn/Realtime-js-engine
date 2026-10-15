export function createInput(target = window) {
  const down = new Set();
  const pressed = new Set();

  function onKeyDown(e) {
    if (e.repeat) return;
    down.add(e.code);
    pressed.add(e.code);
  }

  function onKeyUp(e) {
    down.delete(e.code);
    pressed.delete(e.code);
  }

  function onBlur() {
    down.clear();
    pressed.clear();
  }

  target.addEventListener("keydown", onKeyDown);
  target.addEventListener("keyup", onKeyUp);
  target.addEventListener("blur", onBlur);

  return {
    isDown: (code) => down.has(code),
    justPressed: (code) => {
      if (pressed.has(code)) {
        pressed.delete(code);
        return true;
      }
      return false;
    },
    destroy: () => {
      target.removeEventListener("keydown", onKeyDown);
      target.removeEventListener("keyup", onKeyUp);
      target.removeEventListener("blur", onBlur);
    },
  };
}