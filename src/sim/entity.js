import { Vector2 } from "./vector.js";

export class Entity {
  static #nextId = 1;
  #id = Entity.#nextId++;

  constructor({
    x = 0,
    y = 0,
    vx = 0,
    vy = 0,
    angle = 0,
    radius = 10,
    kind = "entity",
  } = {}) {
    this.pos = new Vector2(x, y);
    this.prevPos = this.pos.clone();
    this.vel = new Vector2(vx, vy);
    this.angle = angle;
    this.prevAngle = angle;
    this.radius = radius;
    this.alive = true;
    this.kind = kind;
    this.behaviors = []; // Для композиції (M4: homing тощо)
  }

  get id() {
    return this.#id;
  }

  savePreviousState() {
    this.prevPos = this.pos.clone();
    this.prevAngle = this.angle;
  }

  // Коригуємо попередню позицію при перельоті через край екрана, щоб не було ривка інтерполяції
  shiftPreviousState(dx, dy) {
    this.prevPos = new Vector2(this.prevPos.x + dx, this.prevPos.y + dy);
  }

  attachBehavior(behaviorFn) {
    this.behaviors.push(behaviorFn);
    return this;
  }

  update(dt, world) {
    for (const behavior of this.behaviors) {
      behavior(this, dt, world);
    }
    this.pos = this.pos.add(this.vel.scale(dt));
  }
}