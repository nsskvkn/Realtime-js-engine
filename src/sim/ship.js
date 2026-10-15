export const SHIP_CONFIG = {
  turnSpeed: 4.2,
  acceleration: 420,
  drag: 1.8,
  maxSpeed: 480,
};

export function createShip(x, y) {
  return {
    x,
    y,
    vx: 0,
    vy: 0,
    angle: -Math.PI / 2,
    thrust: false,
  };
}

export function cloneShip(ship) {
  return {
    x: ship.x,
    y: ship.y,
    vx: ship.vx,
    vy: ship.vy,
    angle: ship.angle,
    thrust: ship.thrust,
  };
}

export function integrate(ship, input, dt) {
  const turnLeft = input.isDown("ArrowLeft") || input.isDown("KeyA");
  const turnRight = input.isDown("ArrowRight") || input.isDown("KeyD");
  const thrusting = input.isDown("ArrowUp") || input.isDown("KeyW");

  if (turnLeft) ship.angle -= SHIP_CONFIG.turnSpeed * dt;
  if (turnRight) ship.angle += SHIP_CONFIG.turnSpeed * dt;

  ship.angle = Math.atan2(Math.sin(ship.angle), Math.cos(ship.angle));
  ship.thrust = thrusting;

  if (thrusting) {
    ship.vx += Math.cos(ship.angle) * SHIP_CONFIG.acceleration * dt;
    ship.vy += Math.sin(ship.angle) * SHIP_CONFIG.acceleration * dt;
  }

  const damping = Math.max(0, 1 - SHIP_CONFIG.drag * dt);
  ship.vx *= damping;
  ship.vy *= damping;

  const speed = Math.hypot(ship.vx, ship.vy);
  if (speed > SHIP_CONFIG.maxSpeed) {
    const scale = SHIP_CONFIG.maxSpeed / speed;
    ship.vx *= scale;
    ship.vy *= scale;
  }

  ship.x += ship.vx * dt;
  ship.y += ship.vy * dt;
}