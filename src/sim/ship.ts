import { Entity } from "./entity.ts";
import { Vector2 } from "./vector.ts";
import { Bullet, withHoming, type PickupData } from "./entities.ts";
import { gameBus } from "./types.ts";
import type { World } from "./world.ts";
import type { InputController } from "../input.ts";

export interface ShipConfig {
  readonly turnSpeed: number;
  readonly acceleration: number;
  readonly drag: number;
  readonly maxSpeed: number;
  readonly bulletSpeed: number;
  readonly fireCooldown: number;
}

export const SHIP_CONFIG = {
  turnSpeed: 4.2,
  acceleration: 420,
  drag: 1.8,
  maxSpeed: 480,
  bulletSpeed: 560,
  fireCooldown: 0.22,
} satisfies ShipConfig;

export class Ship extends Entity {
  #hp = 100;
  readonly #maxHp = 100;

  thrust = false;
  cooldown = 0;
  shieldTimer = 0;
  rapidFireTimer = 0;

  constructor(x: number, y: number) {
    super({
      x,
      y,
      angle: -Math.PI / 2,
      radius: 15,
      kind: "ship",
    });
  }

  get hp(): number {
    return this.#hp;
  }

  get maxHp(): number {
    return this.#maxHp;
  }

  takeDamage(amount: number): void {
    if (this.shieldTimer > 0) return;
    this.#hp = Math.max(0, this.#hp - amount);
    if (this.#hp === 0) {
      this.alive = false;
    }
  }

  reset(x: number, y: number): void {
    this.pos = new Vector2(x, y);
    this.prevPos = this.pos.clone();
    this.vel = new Vector2(0, 0);
    this.angle = -Math.PI / 2;
    this.prevAngle = this.angle;
    this.#hp = this.#maxHp;
    this.alive = true;
    this.shieldTimer = 2.0;
    this.rapidFireTimer = 0;
  }

  applyPickup(pickupData: PickupData): void {
    if (pickupData.type === "shield") {
      this.shieldTimer = pickupData.duration;
    } else {
      this.rapidFireTimer = pickupData.duration;
    }
    gameBus.emit("pickupCollected", { shipId: this.id, pickupType: pickupData.type });
  }

  fire(world: World, homing = false): Bullet | null {
    if (!this.alive || this.cooldown > 0) return null;

    const baseCooldown =
      this.rapidFireTimer > 0 ? SHIP_CONFIG.fireCooldown * 0.4 : SHIP_CONFIG.fireCooldown;
    this.cooldown = homing ? baseCooldown * 1.8 : baseCooldown;

    const dir = Vector2.fromAngle(this.angle);
    const nose = this.pos.add(dir.scale(this.radius + 6));
    const bulletVel = this.vel.add(dir.scale(SHIP_CONFIG.bulletSpeed));

    const bullet = new Bullet({
      x: nose.x,
      y: nose.y,
      vx: bulletVel.x,
      vy: bulletVel.y,
      angle: this.angle,
      ownerId: this.id,
      ttl: homing ? 2.8 : 1.5,
      damage: homing ? 35 : 25,
    });

    if (homing) {
      withHoming(bullet, {
        targetKind: "asteroid",
        turnRate: 4.5,
        speed: SHIP_CONFIG.bulletSpeed,
      });
    }

    world.spawn(bullet);
    gameBus.emit("fired", { shooter: this.id, homing });
    return bullet;
  }

  override update(dt: number, world: World, input?: InputController): void {
    if (this.cooldown > 0) this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.shieldTimer > 0) this.shieldTimer = Math.max(0, this.shieldTimer - dt);
    if (this.rapidFireTimer > 0) this.rapidFireTimer = Math.max(0, this.rapidFireTimer - dt);

    if (input) {
      const turnLeft = input.isDown("ArrowLeft") || input.isDown("KeyA");
      const turnRight = input.isDown("ArrowRight") || input.isDown("KeyD");
      const thrusting = input.isDown("ArrowUp") || input.isDown("KeyW");

      if (turnLeft) this.angle -= SHIP_CONFIG.turnSpeed * dt;
      if (turnRight) this.angle += SHIP_CONFIG.turnSpeed * dt;
      this.angle = Math.atan2(Math.sin(this.angle), Math.cos(this.angle));

      this.thrust = thrusting;

      if (thrusting) {
        const accel = Vector2.fromAngle(this.angle, SHIP_CONFIG.acceleration * dt);
        this.vel = this.vel.add(accel);
      }

      if (input.isDown("Space")) {
        this.fire(world, false);
      }
      if (input.justPressed("KeyE")) {
        this.fire(world, true);
      }
    }

    const damping = Math.max(0, 1 - SHIP_CONFIG.drag * dt);
    this.vel = this.vel.scale(damping);

    if (this.vel.length() > SHIP_CONFIG.maxSpeed) {
      this.vel = this.vel.normalize().scale(SHIP_CONFIG.maxSpeed);
    }

    super.update(dt, world);
  }
}