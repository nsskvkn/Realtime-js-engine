export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function lerpAngle(a, b, t) {
  const diff = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + diff * t;
}

export function interpolateShip(prev, curr, alpha) {
  return {
    x: lerp(prev.x, curr.x, alpha),
    y: lerp(prev.y, curr.y, alpha),
    angle: lerpAngle(prev.angle, curr.angle, alpha),
    thrust: curr.thrust,
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

export function drawShip(ctx, ship) {
  ctx.save();
  ctx.translate(ship.x, ship.y);
  ctx.rotate(ship.angle);

  // Полум'я двигуна
  if (ship.thrust) {
    ctx.beginPath();
    ctx.moveTo(-12, -5);
    ctx.lineTo(-24, 0);
    ctx.lineTo(-12, 5);
    ctx.closePath();
    ctx.fillStyle = "#ff7b00";
    ctx.fill();
  }

  // Корпус корабля
  ctx.beginPath();
  ctx.moveTo(18, 0);
  ctx.lineTo(-14, -11);
  ctx.lineTo(-9, 0);
  ctx.lineTo(-14, 11);
  ctx.closePath();

  ctx.fillStyle = "#4cc9f0";
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.restore();
}

export function drawHud(ctx, stats) {
  ctx.save();
  ctx.font = "14px monospace";
  ctx.fillStyle = "#e0e6ed";
  ctx.fillText(`steps/s:  ${stats.stepsPerSecond}`, 16, 24);
  ctx.fillText(`frames/s: ${stats.framesPerSecond}`, 16, 44);
  ctx.fillText(`frame ms: ${stats.frameTimeMs.toFixed(2)}`, 16, 64);
  ctx.restore();
}