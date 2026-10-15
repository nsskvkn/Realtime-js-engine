import { Entity } from "./entity.js";
import { Vector2 } from "./vector.js";

// --- КОМПОЗИЦІЯ (M4): Поведінка самонаведення (можна прикріпити до Будь-якої сутності) ---
export function withHoming(entity, { targetKind, turnRate = 3.5, speed = null }) {
  entity.isHoming = true;
  entity.attachBehavior((self, dt, world) => {
    if (!world) return;
    let nearest = null;
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
    const currentDir = self.vel.length() > 0 ? self.vel.normalize() : Vector2.fromAngle(self.angle);

    const currentAngle = Math.atan2(currentDir.y, currentDir.x);
    const targetAngle = Math.atan2(desiredDir.y, desiredDir.x);
    const diff = Math.atan2(Math.sin(targetAngle - currentAngle), Math.cos(targetAngle - currentAngle));

    const maxStep = turnRate * dt;
    const clampedDiff = Math.max(-maxStep, Math.min(maxStep, diff));
    const newAngle = currentAngle + clampedDiff;

    self.angle = newAngle;
    self.vel = Vector2.fromAngle(newAngle, currentSpeed);
  });

  return entity;
}

// --- КУЛЯ (Bullet extends Entity — 1 рівень наслідування) ---
export class Bullet extends Entity {
  constructor({ x, y, vx, vy, angle, ownerId, ttl = 1.6, damage = 25 }) {
    super({ x, y, vx, vy, angle, radius: 4, kind: "bullet" });
    this.ownerId = ownerId;
    this.ttl = ttl;
    this.damage = damage;
  }

  update(dt, world) {
    this.ttl -= dt;
    if (this.ttl <= 0) {
      this.alive = false;
      return;
    }
    super.update(dt, world);
  }
}

// --- АСТЕРОЇД (Asteroid extends Entity — 1 рівень наслідування) ---
export class Asteroid extends Entity {
  #hp;

  constructor({ x, y, vx, vy, radius = 28, hp = 50 }) {
    super({ x, y, vx, vy, angle: 0, radius, kind: "asteroid" });
    this.#hp = hp;
    this.spin = (Math.random() - 0.5) * 2.2;
  }

  get hp() {
    return this.#hp;
  }

  takeDamage(amount) {
    this.#hp = Math.max(0, this.#hp - amount);
    if (this.#hp === 0) {
      this.alive = false;
    }
  }

  update(dt, world) {
    this.angle += this.spin * dt;
    super.update(dt, world);
  }
}

// --- ВИБУХ (Explosion extends Entity — система частинок, M3) ---
export class Explosion extends Entity {
  constructor({ x, y, color = "#ff9f1c", count = 18 }) {
    super({ x, y, radius: 0, kind: "explosion" });
    this.ttl = 0.55;
    this.maxTtl = 0.55;
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

  update(dt) {
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

// --- БОНУС / PICKUP (Композиція через дані поверх базового Entity, M4) ---
export function createPickup({ x, y, pickupType = "shield" }) {
  const entity = new Entity({
    x,
    y,
    vx: 0,
    vy: 0,
    radius: 13,
    kind: "pickup",
  });

  entity.pickup = {
    type: pickupType, // "shield" або "rapidFire"
    duration: 6.0,
    pulse: 0,
  };

  entity.attachBehavior((self, dt) => {
    self.pickup.pulse += dt * 4;
    self.angle += dt * 1.5;
  });

  return entity;
}