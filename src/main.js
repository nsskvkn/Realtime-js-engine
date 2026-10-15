import { createLoop } from "./loop.js";
import { createInput } from "./input.js";
import { createArena } from "./sim/arena.js";
import { Ship } from "./sim/ship.js";
import { World } from "./sim/world.js";
import { setupCanvas } from "./render/canvas.js";
import { drawGrid, drawWorld, drawHud } from "./render/draw.js";
import { assets } from "./render/assets.js";
import { audio } from "./render/audio.js";

const canvas = document.getElementById("game");
const arena = createArena(window.innerWidth || 1200, window.innerHeight || 800);
const world = new World(arena);

const ship = new Ship(arena.width / 2, arena.height / 2);
world.spawn(ship);

for (let i = 0; i < 6; i++) {
  world.spawnAsteroid({ radius: 32, homing: i % 2 === 0 });
}

const { ctx } = setupCanvas(canvas, (width, height) => {
  arena.width = width;
  arena.height = height;
});

const input = createInput(window);
canvas.addEventListener("mousedown", () => {
  if (gameStarted) ship.fire(world, false);
});

// --- WEBSOCKET CLIENT ---
let socket = null;
function connectWebSocket() {
  socket = new WebSocket("ws://localhost:8080");
  socket.onopen = () => {
    console.log("Connected to Dogfight Server!");
    socket.send(JSON.stringify({ type: "join", name: "Player_" + Math.floor(Math.random() * 1000) }));
  };
  socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === "state") {
      // Тут можна синхронізувати інших гравців за потреби
    }
  };
}

let gameStarted = false;
const startBtn = document.getElementById("start-btn");
const loaderBar = document.getElementById("loader-bar");
const uiOverlay = document.getElementById("ui-overlay");

assets.loadImage("ship", "/favicon.svg");

function checkLoading() {
  const progress = assets.progress * 100;
  loaderBar.style.width = `${progress}%`;

  if (assets.isLoaded || progress >= 100) {
    startBtn.textContent = "PLAY GAME";
    startBtn.disabled = false;
  } else {
    requestAnimationFrame(checkLoading);
  }
}
requestAnimationFrame(checkLoading);

startBtn.addEventListener("click", () => {
  audio.init();
  connectWebSocket();
  gameStarted = true;
  uiOverlay.classList.add("hidden");
  loop.start();
});

function simulate(dt) {
  if (!gameStarted) return;

  if (input.justPressed("KeyR")) {
    ship.reset(arena.width / 2, arena.height / 2);
    if (!world.get(ship.id)) {
      world.spawn(ship);
    }
  }

  world.step(dt, input);

  // Відправляємо позицію на сервер через WebSocket
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({
      type: "input",
      x: ship.pos.x,
      y: ship.pos.y,
      angle: ship.angle
    }));
  }
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