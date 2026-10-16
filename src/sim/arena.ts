export interface Arena {
  width: number;
  height: number;
}

export function createArena(width: number, height: number): Arena {
  return { width, height };
}