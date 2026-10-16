import type { Entity } from "./entity.ts";
import type { World } from "./world.ts";

export function detectCollisions(world: World): Array<[Entity, Entity]> {
  const active: Entity[] = [];
  for (const entity of world) {
    if (entity.alive && entity.radius > 0) {
      active.push(entity);
    }
  }

  const pairs: Array<[Entity, Entity]> = [];
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i];
      const b = active[j];
      if (!a || !b) continue;

      const dist = a.pos.sub(b.pos).length();
      if (dist < a.radius + b.radius) {
        pairs.push([a, b]);
      }
    }
  }

  return pairs;
}