import { Entity } from "./entity.ts";
import { Vector2 } from "./vector.ts";
import type { EntityId, EntityKind } from "./types.ts";
import type { World } from "./world.ts";

export interface HomingOptions {
  targetKind: EntityKind;
  turnRate?: number;
  speed?: number;
}

export function withHoming<T extends Entity>(
  entity: T,
  { targetKind, turnRate = 3.5, speed }: HomingOptions
): T {
  entity.isHoming = true;
  entity.attachBehavior((self, dt, world) => {
    let nearest: Entity | null = null;
    let minDist = Infinity;

    for (const candidate of world.ofKind(targetKind)) {
      if (!candidate.alive || candidate.id === self.id) continue;
      const dist = candidate.pos.sub(self.pos).length();
      if (dist < minDist) {
        minDist = dist;
        nearest = candidate;
      }
    }

    if (!nearest) return;

    const desiredDir = nearest.pos.sub(self.pos).normalize();
    const currentSpeed = speed ?? (self.vel.length() || 180);
    const currentDir =
      self.vel.length() > 0 ? self.vel.normalize() : Vector2.fromAngle(self.angle);

    const currentAngle = Math.atan2(currentDir.y, currentDir.x);
    const targetAngle = Math.atan2(desiredDir.y, desiredDir.x);
    const diff = Math.atan2(
      Math.sin(targetAngle - currentAngle),
      Math.cos(targetAngle - currentAngle)
    );

    const maxStep = turnRate * dt;
    const clampedDiff = Math.max(-maxStep, Math.min(maxStep, diff));
    const newAngle = currentAngle + clampedDiff;

    self.angle = newAngle;
    self.vel = Vector2.fromAngle(newAngle, currentSpeed);
  });

  return entity;
}

export class Bullet extends Entity {
  readonly ownerId: EntityId | string;
  ttl: number;
  readonly damage: number;

  constructor({
    x,
    y,
    vx,
    vy,
    angle,
    ownerId,
    ttl = 1.6,
    damage = 25,
  }: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    angle: number;
    ownerId: EntityId | string;
    ttl?: number;
    damage?: number;
  }) {
    super({ x, y, vx, vy, angle, radius: 4, kind: "bullet" });
    this.ownerId = ownerId;
    this.ttl = ttl;
    this.damage = damage;
  }

  override update(dt: number, world: World): void {
    this.ttl -= dt;
    if (this.ttl <= 0) {
      this.alive = false;
      return;
    }
    super.update(dt, world);
  }
}

export class Asteroid extends Entity {
  #hp: number;
  readonly spin: number;

  constructor({
    x,
    y,
    vx,
    vy,
    radius = 28,
    hp = 50,
  }: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    radius?: number;
    hp?: number;
  }) {
    super({ x, y, vx, vy, angle: 0, radius, kind: "asteroid" });
    this.#hp = hp;
    this.spin = (Math.random() - 0.5) * 2.2;
  }

  get hp(): number {
    return this.#hp;
  }

  takeDamage(amount: number): void {
    this.#hp = Math.max(0, this.#hp - amount);
    if (this.#hp === 0) {
      this.alive = false;
    }
  }

  override update(dt: number, world: World): void {
    this.angle += this.spin * dt;
    super.update(dt, world);
  }
}

export interface Particle {
  pos: Vector2;
  vel: Vector2;
  size: number;
}

export class Explosion extends Entity {
  ttl = 0.55;
  readonly maxTtl = 0.55;
  readonly color: string;
  readonly particles: Particle[];

  constructor({
    x,
    y,
    color = "#ff9f1c",
    count = 18,
  }: {
    x: number;
    y: number;
    color?: string;
    count?: number;
  }) {
    super({ x, y, radius: 0, kind: "explosion" });
    this.color = color;
    this.particles = Array.from({ length: count }, () => {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 160;
      return {
        pos: new Vector2(0, 0),
        vel: Vector2.fromAngle(angle, speed),
        size: 2 + Math.random() * 3,
      };
    });
  }

  override update(dt: number): void {
    this.ttl -= dt;
    if (this.ttl <= 0) {
      this.alive = false;
      return;
    }
    for (const p of this.particles) {
      p.pos = p.pos.add(p.vel.scale(dt));
    }
  }
}

export interface PickupData {
  type: "shield" | "rapidFire";
  duration: number;
  pulse: number;
}

export class Pickup extends Entity {
  readonly pickup: PickupData;

  constructor({
    x,
    y,
    pickupType = "shield",
  }: {
    x: number;
    y: number;
    pickupType?: "shield" | "rapidFire";
  }) {
    super({ x, y, vx: 0, vy: 0, radius: 13, kind: "pickup" });
    this.pickup = {
      type: pickupType,
      duration: 6.0,
      pulse: 0,
    };
    this.attachBehavior((self, dt) => {
      this.pickup.pulse += dt * 4;
      self.angle += dt * 1.5;
    });
  }
}

export function createPickup(opts: {
  x: number;
  y: number;
  pickupType?: "shield" | "rapidFire";
}): Pickup {
  return new Pickup(opts);
}