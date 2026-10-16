import { Vector2 } from "./vector.ts";
import { asEntityId, type EntityId, type EntityKind } from "./types.ts";
import type { World } from "./world.ts";

export interface EntityInit {
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  angle?: number;
  radius?: number;
  kind: EntityKind;
}

export type BehaviorFn = (self: Entity, dt: number, world: World) => void;

export class Entity {
  static #nextId = 1;
  readonly #id: EntityId = asEntityId(Entity.#nextId++);

  pos: Vector2;
  prevPos: Vector2;
  vel: Vector2;
  angle: number;
  prevAngle: number;
  readonly radius: number;
  alive = true;
  readonly kind: EntityKind;
  behaviors: BehaviorFn[] = [];
  isHoming = false;

  constructor({
    x = 0,
    y = 0,
    vx = 0,
    vy = 0,
    angle = 0,
    radius = 10,
    kind,
  }: EntityInit) {
    this.pos = new Vector2(x, y);
    this.prevPos = this.pos.clone();
    this.vel = new Vector2(vx, vy);
    this.angle = angle;
    this.prevAngle = angle;
    this.radius = radius;
    this.kind = kind;
  }

  get id(): EntityId {
    return this.#id;
  }

  savePreviousState(): void {
    this.prevPos = this.pos.clone();
    this.prevAngle = this.angle;
  }

  shiftPreviousState(dx: number, dy: number): void {
    this.prevPos = new Vector2(this.prevPos.x + dx, this.prevPos.y + dy);
  }

  attachBehavior(behaviorFn: BehaviorFn): this {
    this.behaviors.push(behaviorFn);
    return this;
  }

  update(dt: number, world: World): void {
    for (const behavior of this.behaviors) {
      behavior(this, dt, world);
    }
    this.pos = this.pos.add(this.vel.scale(dt));
  }
}