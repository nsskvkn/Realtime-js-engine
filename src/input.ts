export interface InputController {
  isDown(code: string): boolean;
  justPressed(code: string): boolean;
  dispose(): void;
}

export function createInput(target: Window): InputController {
  const down = new Set<string>();
  const pressed = new Set<string>();

  function onKeyDown(e: KeyboardEvent): void {
    if (!down.has(e.code)) {
      pressed.add(e.code);
    }
    down.add(e.code);
  }

  function onKeyUp(e: KeyboardEvent): void {
    down.delete(e.code);
    pressed.delete(e.code);
  }

  function onBlur(): void {
    down.clear();
    pressed.clear();
  }

  target.addEventListener("keydown", onKeyDown);
  target.addEventListener("keyup", onKeyUp);
  target.addEventListener("blur", onBlur);

  return {
    isDown(code: string): boolean {
      return down.has(code);
    },
    justPressed(code: string): boolean {
      if (pressed.has(code)) {
        pressed.delete(code);
        return true;
      }
      return false;
    },
    dispose(): void {
      target.removeEventListener("keydown", onKeyDown);
      target.removeEventListener("keyup", onKeyUp);
      target.removeEventListener("blur", onBlur);
    },
  };
}