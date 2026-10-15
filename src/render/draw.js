export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function lerpAngle(a, b, t) {
  const diff = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + diff * t;
}

export function interpolateEntity(entity, alpha) {
  return {
    x: lerp(entity.prevPos.x, entity.pos.x, alpha),
    y: lerp(entity.prevPos.y, entity.pos.y, alpha),
    angle: lerpAngle(entity.prevAngle, entity.angle, alpha),
  };
}

export function drawGrid(ctx, arena, step = 60) {
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

export function drawShip(ctx, ship, alpha) {
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

  // Візуальне кільце щита
  if (ship.shieldTimer > 0) {
    ctx.beginPath();
    ctx.arc(0, 0, ship.radius + 6, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(114, 239, 221, 0.75)";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  ctx.restore();
}

export function drawBullet(ctx, bullet, alpha) {
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

export function drawAsteroid(ctx, asteroid, alpha) {
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

export function drawPickup(ctx, pickup, alpha) {
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

export function drawExplosion(ctx, explosion) {
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

export function drawWorld(ctx, world, alpha) {
  for (const entity of world) {
    if (!entity.alive) continue;
    switch (entity.kind) {
      case "ship":
        drawShip(ctx, entity, alpha);
        break;
      case "bullet":
        drawBullet(ctx, entity, alpha);
        break;
      case "asteroid":
        drawAsteroid(ctx, entity, alpha);
        break;
      case "pickup":
        drawPickup(ctx, entity, alpha);
        break;
      case "explosion":
        drawExplosion(ctx, entity);
        break;
    }
  }
}

export function drawHud(ctx, stats, world) {
  ctx.save();
  ctx.font = "14px monospace";
  ctx.fillStyle = "#e0e6ed";
  ctx.fillText(`steps/s:  ${stats.stepsPerSecond}`, 16, 24);
  ctx.fillText(`frames/s: ${stats.framesPerSecond}`, 16, 44);
  ctx.fillText(`frame ms: ${stats.frameTimeMs.toFixed(2)}`, 16, 64);

  if (world) {
    const hp = world.playerShip?.alive ? world.playerShip.hp : 0;
    ctx.fillStyle = "#ffd166";
    ctx.fillText(`score:    ${world.score}`, 16, 92);
    ctx.fillStyle = hp > 35 ? "#72efdd" : "#ef476f";
    ctx.fillText(`ship HP:  ${hp}`, 16, 112);
    ctx.fillStyle = "#8d99ae";
    ctx.fillText(`entities: ${world.size}`, 16, 132);
    ctx.fillText(`[Space] Fire | [E] Homing Missile | [Click] Fire`, 16, 156);

    if (world.playerShip && !world.playerShip.alive) {
      ctx.font = "bold 20px monospace";
      ctx.fillStyle = "#ef476f";
      ctx.fillText(
        `RESPAWNING IN ${world.respawnTimer.toFixed(1)}s...`,
        world.arena.width / 2 - 120,
        world.arena.height / 2
      );
    }
  }
  ctx.restore();
}