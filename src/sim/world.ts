import { Vector2 } from "./vector.ts";
import { Entity } from "./entity.ts";
import {
  Asteroid,
  Bullet,
  bulletPool,
  Explosion,
  Pickup,
  createPickup,
  withHoming,
} from "./entities.ts";
import { Ship } from "./ship.ts";
import { detectCollisions } from "./collision.ts";
import { audio } from "../render/audio.ts";
import type { Arena } from "./arena.ts";
import type { EntityId, EntityKind } from "./types.ts";
import type { InputController } from "../input.ts";

export class World {
  #entities = new Map<EntityId, Entity>();
  #pendingRemoval = new Set<EntityId>();

  arena: Arena;
  score = 0;
  playerShip: Ship | null = null;
  respawnTimer = 0;
  pickupSpawnTimer = 4.0;

  constructor(arena: Arena) {
    this.arena = arena;
  }

  spawn<T extends Entity>(entity: T): T {
    this.#entities.set(entity.id, entity);
    if (entity instanceof Ship) {
      this.playerShip = entity;
    }
    if (entity.kind === "bullet") {
      audio.playLaser();
    }
    return entity;
  }

  despawn(id: EntityId): void {
    const entity = this.#entities.get(id);
    if (entity !== undefined) {
      entity.alive = false;
      this.#pendingRemoval.add(id);
    }
  }

  get(id: EntityId): Entity | undefined {
    return this.#entities.get(id);
  }

  get size(): number {
    return this.#entities.size;
  }

  *[Symbol.iterator](): IterableIterator<Entity> {
    yield* this.#entities.values();
  }

  *ofKind(kind: EntityKind): IterableIterator<Entity> {
    for (const e of this) {
      if (e.kind === kind && e.alive) {
        yield e;
      }
    }
  }

  wrapPosition(entity: Entity): void {
    let dx = 0;
    let dy = 0;

    if (entity.pos.x < 0) dx = this.arena.width;
    else if (entity.pos.x >= this.arena.width) dx = -this.arena.width;

    if (entity.pos.y < 0) dy = this.arena.height;
    else if (entity.pos.y >= this.arena.height) dy = -this.arena.height;

    if (dx !== 0 || dy !== 0) {
      entity.pos = new Vector2(entity.pos.x + dx, entity.pos.y + dy);
      entity.shiftPreviousState(dx, dy);
    }
  }

  spawnAsteroid({
    x,
    y,
    radius = 32,
    homing = false,
  }: {
    x?: number;
    y?: number;
    radius?: number;
    homing?: boolean;
  } = {}): Asteroid {
    const posX = x ?? (Math.random() < 0.5 ? 40 : this.arena.width - 40);
    const posY = y ?? Math.random() * this.arena.height;
    const angle = Math.random() * Math.PI * 2;
    const speed = 55 + Math.random() * 85;
    const vel = Vector2.fromAngle(angle, speed);

    const asteroid = new Asteroid({
      x: posX,
      y: posY,
      vx: vel.x,
      vy: vel.y,
      radius,
      hp: radius > 20 ? 50 : 25,
    });

    if (homing) {
      withHoming(asteroid, { targetKind: "ship", turnRate: 1.1, speed: 95 });
    }

    return this.spawn(asteroid);
  }

  findSafeSpot(): Vector2 {
    for (let attempt = 0; attempt < 25; attempt++) {
      const x = 120 + Math.random() * Math.max(100, this.arena.width - 240);
      const y = 120 + Math.random() * Math.max(100, this.arena.height - 240);
      const candidate = new Vector2(x, y);

      let safe = true;
      for (const ast of this.ofKind("asteroid")) {
        if (ast.pos.sub(candidate).length() < ast.radius + 110) {
          safe = false;
          break;
        }
      }
      if (safe) return candidate;
    }
    return new Vector2(this.arena.width / 2, this.arena.height / 2);
  }

  step(dt: number, input?: InputController): void {
    for (const entity of this) {
      if (!entity.alive) continue;
      entity.savePreviousState();

      if (entity instanceof Ship) {
        entity.update(dt, this, input);
      } else {
        entity.update(dt, this);
      }

      if (entity.kind !== "explosion") {
        this.wrapPosition(entity);
      }
    }

    const pairs = detectCollisions(this);
    for (const [a, b] of pairs) {
      if (!a.alive || !b.alive) continue;
      this.#resolvePair(a, b);
    }

    if (this.playerShip && !this.playerShip.alive) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) {
        const spot = this.findSafeSpot();
        this.playerShip.reset(spot.x, spot.y);
        this.spawn(this.playerShip);
      }
    }

    let asteroidCount = 0;
    for (const _ of this.ofKind("asteroid")) asteroidCount++;
    if (asteroidCount < 5) {
      this.spawnAsteroid({ radius: 32, homing: Math.random() < 0.35 });
    }

    this.pickupSpawnTimer -= dt;
    if (this.pickupSpawnTimer <= 0) {
      let pickupCount = 0;
      for (const _ of this.ofKind("pickup")) pickupCount++;
      if (pickupCount < 2) {
        const spot = this.findSafeSpot();
        const type = Math.random() < 0.5 ? "shield" : "rapidFire";
        this.spawn(createPickup({ x: spot.x, y: spot.y, pickupType: type }));
      }
      this.pickupSpawnTimer = 8.0;
    }

    // Повертаємо мертві кулі в ObjectPool замість відправлення в Garbage Collector
    for (const [id, entity] of this.#entities) {
      if (!entity.alive || this.#pendingRemoval.has(id)) {
        if (entity instanceof Bullet) {
          bulletPool.release(entity);
        }
        this.#entities.delete(id);
      }
    }
    this.#pendingRemoval.clear();
  }

  #resolvePair(a: Entity, b: Entity): void {
    if (
      (a instanceof Bullet && b instanceof Asteroid) ||
      (b instanceof Bullet && a instanceof Asteroid)
    ) {
      const bullet = a instanceof Bullet ? a : (b as Bullet);
      const asteroid = a instanceof Asteroid ? a : (b as Asteroid);

      bullet.alive = false;
      asteroid.takeDamage(bullet.damage);
      this.spawn(new Explosion({ x: bullet.pos.x, y: bullet.pos.y, color: "#ffd166", count: 8 }));
      audio.playExplosion();

      if (!asteroid.alive) {
        this.score += asteroid.isHoming ? 150 : 100;
        this.spawn(
          new Explosion({ x: asteroid.pos.x, y: asteroid.pos.y, color: "#ff7b00", count: 22 })
        );
        if (asteroid.radius > 22) {
          this.spawnAsteroid({ x: asteroid.pos.x, y: asteroid.pos.y, radius: 16, homing: false });
          this.spawnAsteroid({ x: asteroid.pos.x, y: asteroid.pos.y, radius: 16, homing: false });
        }
      }
      return;
    }

    if (
      (a instanceof Ship && b instanceof Asteroid) ||
      (b instanceof Ship && a instanceof Asteroid)
    ) {
      const ship = a instanceof Ship ? a : (b as Ship);
      const asteroid = a instanceof Asteroid ? a : (b as Asteroid);

      asteroid.alive = false;
      ship.takeDamage(35);
      this.spawn(
        new Explosion({ x: asteroid.pos.x, y: asteroid.pos.y, color: "#ef476f", count: 16 })
      );
      audio.playExplosion();

      if (!ship.alive) {
        this.spawn(new Explosion({ x: ship.pos.x, y: ship.pos.y, color: "#4cc9f0", count: 35 }));
        this.respawnTimer = 2.0;
      }
      return;
    }

    if (
      (a instanceof Ship && b instanceof Pickup) ||
      (b instanceof Ship && a instanceof Pickup)
    ) {
      const ship = a instanceof Ship ? a : (b as Ship);
      const pickup = a instanceof Pickup ? a : (b as Pickup);

      ship.applyPickup(pickup.pickup);
      pickup.alive = false;
      this.score += 50;
      audio.playPickup();
      return;
    }

    if (a instanceof Asteroid && b instanceof Asteroid) {
      const normal = b.pos.sub(a.pos).normalize();
      const overlap = a.radius + b.radius - a.pos.sub(b.pos).length();
      if (overlap > 0) {
        a.pos = a.pos.sub(normal.scale(overlap * 0.5));
        b.pos = b.pos.add(normal.scale(overlap * 0.5));
      }
      const relVel = a.vel.sub(b.vel);
      const sepVel = relVel.dotProduct(normal);
      if (sepVel > 0) {
        const impulse = normal.scale(sepVel);
        a.vel = a.vel.sub(impulse);
        b.vel = b.vel.add(impulse);
      }
    }
  }
}