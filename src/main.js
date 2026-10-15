import { createLoop } from "./loop.js";
import { createInput } from "./input.js";
import { createArena, wrapShip } from "./sim/arena.js";
import { createShip, cloneShip, integrate } from "./sim/ship.js";
import { setupCanvas } from "./render/canvas.js";
import { interpolateShip, drawGrid, drawShip, drawHud } from "./render/draw.js";

const canvas = document.getElementById("game");

// Початкові дефолтні розміри арени
const arena = createArena(
  window.innerWidth || 1200,
  window.innerHeight || 800
);

const currentShip = createShip(arena.width / 2, arena.height / 2);
let previousShip = cloneShip(currentShip);

const { ctx } = setupCanvas(canvas, (width, height) => {
  arena.width = width;
  arena.height = height;
  // Якщо корабель ще не рухався, тримаємо його в центрі
  if (currentShip.vx === 0 && currentShip.vy === 0) {
    currentShip.x = width / 2;
    currentShip.y = height / 2;
    previousShip = cloneShip(currentShip);
  }
});

const input = createInput(window);

function simulate(dt) {
  if (input.justPressed("KeyR")) {
    Object.assign(currentShip, createShip(arena.width / 2, arena.height / 2));
    previousShip = cloneShip(currentShip);
    return;
  }

  previousShip = cloneShip(currentShip);
  integrate(currentShip, input, dt);
  wrapShip(currentShip, previousShip, arena);
}

function render(alpha, stats) {
  ctx.clearRect(0, 0, arena.width, arena.height);
  drawGrid(ctx, arena);

  const renderState = interpolateShip(previousShip, currentShip, alpha);
  drawShip(ctx, renderState);
  drawHud(ctx, stats);
}

const loop = createLoop({
  step: 1 / 60,
  simulate,
  render,
});

loop.start();