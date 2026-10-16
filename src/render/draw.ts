import type { Arena } from "../sim/arena.ts";
import type { Entity } from "../sim/entity.ts";
import type { Asteroid, Bullet, Explosion, Pickup } from "../sim/entities.ts";
import type { Ship } from "../sim/ship.ts";
import type { World } from "../sim/world.ts";
import type { LoopStats } from "../loop.ts";

export interface RemotePlayerRender {
  id: string;
  name: string;
  targetX: number;
  targetY: number;
  targetAngle: number;
  renderX: number;
  renderY: number;
  renderAngle: number;
  thrust: boolean;
}

export interface NetStats {
  connected: boolean;
  pingMs: number;
  onlineCount: number;
  useBinary: boolean;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function lerpAngle(a: number, b: number, t: number): number {
  const diff = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + diff * t;
}

export function interpolateEntity(entity: Entity, alpha: number) {
  return {
    x: lerp(entity.prevPos.x, entity.pos.x, alpha),
    y: lerp(entity.prevPos.y, entity.pos.y, alpha),
    angle: lerpAngle(entity.prevAngle, entity.angle, alpha),
  };
}

export function drawGrid(ctx: CanvasRenderingContext2D, arena: Arena, step = 60): void {
  ctx.save();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
  ctx.lineWidth = 1;
  ctx.beginPath();

  for (let x = 0; x <= arena.width; x += step) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, arena.height);
  }
  for (let y = 0; y <= arena.height; y += step) {
    ctx.moveTo(0, y);
    ctx.lineTo(arena.width, y);
  }

  ctx.stroke();
  ctx.restore();
}

export function drawShip(ctx: CanvasRenderingContext2D, ship: Ship, alpha: number): void {
  const state = interpolateEntity(ship, alpha);
  ctx.save();
  ctx.translate(state.x, state.y);
  ctx.rotate(state.angle);

  if (ship.thrust) {
    ctx.beginPath();
    ctx.moveTo(-12, -5);
    ctx.lineTo(-24, 0);
    ctx.lineTo(-12, 5);
    ctx.closePath();
    ctx.fillStyle = "#ff7b00";
    ctx.fill();
  }

  ctx.beginPath();
  ctx.moveTo(18, 0);
  ctx.lineTo(-14, -11);
  ctx.lineTo(-9, 0);
  ctx.lineTo(-14, 11);
  ctx.closePath();

  ctx.fillStyle = ship.rapidFireTimer > 0 ? "#ffd166" : "#4cc9f0";
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  if (ship.shieldTimer > 0) {
    ctx.beginPath();
    ctx.arc(0, 0, ship.radius + 6, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(114, 239, 221, 0.75)";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  ctx.restore();
}

export function drawRemotePlayers(
  ctx: CanvasRenderingContext2D,
  remotePlayers: Map<string, RemotePlayerRender>
): void {
  for (const [, remote] of remotePlayers) {
    ctx.save();
    ctx.translate(remote.renderX, remote.renderY);
    ctx.rotate(remote.renderAngle);

    if (remote.thrust) {
      ctx.beginPath();
      ctx.moveTo(-12, -5);
      ctx.lineTo(-24, 0);
      ctx.lineTo(-12, 5);
      ctx.closePath();
      ctx.fillStyle = "#ffd166";
      ctx.fill();
    }

    ctx.beginPath();
    ctx.moveTo(18, 0);
    ctx.lineTo(-14, -11);
    ctx.lineTo(-9, 0);
    ctx.lineTo(-14, 11);
    ctx.closePath();

    ctx.fillStyle = "#ff5a5f";
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.font = "12px monospace";
    ctx.fillStyle = "#ffb703";
    ctx.textAlign = "center";
    ctx.fillText(remote.name, remote.renderX, remote.renderY - 24);
    ctx.restore();
  }
}

export function drawBullet(ctx: CanvasRenderingContext2D, bullet: Bullet, alpha: number): void {
  const state = interpolateEntity(bullet, alpha);
  ctx.save();
  ctx.translate(state.x, state.y);
  ctx.rotate(state.angle);

  ctx.beginPath();
  ctx.arc(0, 0, bullet.radius, 0, Math.PI * 2);
  ctx.fillStyle = bullet.isHoming ? "#ff006e" : "#ffd166";
  ctx.fill();
  ctx.restore();
}

export function drawAsteroid(
  ctx: CanvasRenderingContext2D,
  asteroid: Asteroid,
  alpha: number
): void {
  const state = interpolateEntity(asteroid, alpha);
  ctx.save();
  ctx.translate(state.x, state.y);
  ctx.rotate(state.angle);

  ctx.beginPath();
  const sides = 7;
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    const r = asteroid.radius * (i % 2 === 0 ? 1.0 : 0.82);
    const px = Math.cos(a) * r;
    const py = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();

  ctx.fillStyle = asteroid.isHoming ? "rgba(239, 71, 111, 0.28)" : "rgba(141, 153, 174, 0.25)";
  ctx.fill();
  ctx.strokeStyle = asteroid.isHoming ? "#ef476f" : "#8d99ae";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

export function drawPickup(ctx: CanvasRenderingContext2D, pickup: Pickup, alpha: number): void {
  const state = interpolateEntity(pickup, alpha);
  const isShield = pickup.pickup.type === "shield";
  ctx.save();
  ctx.translate(state.x, state.y);
  ctx.rotate(state.angle);

  ctx.beginPath();
  ctx.arc(0, 0, pickup.radius, 0, Math.PI * 2);
  ctx.fillStyle = isShield ? "rgba(114, 239, 221, 0.25)" : "rgba(255, 209, 102, 0.25)";
  ctx.fill();
  ctx.strokeStyle = isShield ? "#72efdd" : "#ffd166";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.font = "bold 11px monospace";
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(isShield ? "S" : "R", 0, 0);
  ctx.restore();
}

export function drawExplosion(ctx: CanvasRenderingContext2D, explosion: Explosion): void {
  const progress = Math.max(0, explosion.ttl / explosion.maxTtl);
  ctx.save();
  ctx.translate(explosion.pos.x, explosion.pos.y);
  ctx.globalAlpha = progress;
  ctx.fillStyle = explosion.color;

  for (const p of explosion.particles) {
    ctx.beginPath();
    ctx.arc(p.pos.x, p.pos.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function drawWorld(ctx: CanvasRenderingContext2D, world: World, alpha: number): void {
  for (const entity of world) {
    if (!entity.alive) continue;
    switch (entity.kind) {
      case "ship":
        drawShip(ctx, entity as Ship, alpha);
        break;
      case "bullet":
        drawBullet(ctx, entity as Bullet, alpha);
        break;
      case "asteroid":
        drawAsteroid(ctx, entity as Asteroid, alpha);
        break;
      case "pickup":
        drawPickup(ctx, entity as Pickup, alpha);
        break;
      case "explosion":
        drawExplosion(ctx, entity as Explosion);
        break;
      default: {
        const _exhaustive: never = entity.kind;
        return _exhaustive;
      }
    }
  }
}

export function drawHud(
  ctx: CanvasRenderingContext2D,
  stats: LoopStats,
  world: World,
  netStats?: NetStats
): void {
  ctx.save();
  ctx.font = "14px monospace";
  ctx.fillStyle = "#e0e6ed";
  ctx.fillText(`steps/s:  ${stats.stepsPerSecond}`, 16, 24);
  ctx.fillText(`frames/s: ${stats.framesPerSecond}`, 16, 44);
  ctx.fillText(`frame ms: ${stats.frameTimeMs.toFixed(2)}`, 16, 64);

  const hp = world.playerShip?.alive ? world.playerShip.hp : 0;
  ctx.fillStyle = "#ffd166";
  ctx.fillText(`score:    ${world.score}`, 16, 92);
  ctx.fillStyle = hp > 35 ? "#72efdd" : "#ef476f";
  ctx.fillText(`ship HP:  ${hp}`, 16, 112);
  ctx.fillStyle = "#8d99ae";
  ctx.fillText(`entities: ${world.size}`, 16, 132);

  if (netStats) {
    ctx.fillStyle = netStats.connected ? "#72efdd" : "#ef476f";
    ctx.fillText(
      `net:      ${netStats.connected ? "ONLINE" : "OFFLINE"} (${netStats.onlineCount} pilots)`,
      16,
      158
    );
    ctx.fillStyle = "#e0e6ed";
    ctx.fillText(
      `ping RTT: ${netStats.pingMs} ms | proto: ${
        netStats.useBinary ? "Binary (15B)" : "JSON (~82B)"
      }`,
      16,
      178
    );
  }

  ctx.fillStyle = "#8d99ae";
  ctx.fillText(`[Space] Fire | [E] Homing | [B] Toggle Binary/JSON (TS Strict)`, 16, 204);

  if (world.playerShip && !world.playerShip.alive) {
    ctx.font = "bold 20px monospace";
    ctx.fillStyle = "#ef476f";
    ctx.fillText(
      `RESPAWNING IN ${world.respawnTimer.toFixed(1)}s...`,
      world.arena.width / 2 - 120,
      world.arena.height / 2
    );
  }
  ctx.restore();
}