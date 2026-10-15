import { createLoop } from "./loop.js";
import { createInput } from "./input.js";
import { createArena } from "./sim/arena.js";
import { Ship } from "./sim/ship.js";
import { World } from "./sim/world.js";
import { setupCanvas } from "./render/canvas.js";
import { drawGrid, drawWorld, drawHud } from "./render/draw.js";

const canvas = document.getElementById("game");
const arena = createArena(window.innerWidth || 1200, window.innerHeight || 800);
const world = new World(arena);

const ship = new Ship(arena.width / 2, arena.height / 2);
world.spawn(ship);

// Стартові астероїди (звичайні сірі та червоні самонавідні)
for (let i = 0; i < 6; i++) {
  world.spawnAsteroid({ radius: 32, homing: i % 2 === 0 });
}

const { ctx } = setupCanvas(canvas, (width, height) => {
  arena.width = width;
  arena.height = height;
});

const input = createInput(window);

// --- ДЕМОНСТРАЦІЯ ТА ВИПРАВЛЕННЯ БАГА З `this` (Lab 02 Section 2) ---
// Наївний виклик `canvas.addEventListener("mousedown", ship.fire)` зламається,
// тому що всередині `fire` контекст `this` вказуватиме на HTMLCanvasElement, а не на `ship`!
// Правильне рішення — обгортка у стрілкову функцію, яка зберігає лексичний контекст:
canvas.addEventListener("mousedown", () => ship.fire(world, false));

function simulate(dt) {
  if (input.justPressed("KeyR")) {
    ship.reset(arena.width / 2, arena.height / 2);
    if (!world.get(ship.id)) {
      world.spawn(ship);
    }
  }

  world.step(dt, input);
}

function render(alpha, stats) {
  ctx.clearRect(0, 0, arena.width, arena.height);
  drawGrid(ctx, arena);
  drawWorld(ctx, world, alpha);
  drawHud(ctx, stats, world);
}

const loop = createLoop({
  step: 1 / 60,
  simulate,
  render,
});

loop.start();