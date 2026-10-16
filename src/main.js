import { createLoop } from "./loop.js";
import { createInput } from "./input.js";
import { createArena } from "./sim/arena.js";
import { Ship, SHIP_CONFIG } from "./sim/ship.js";
import { Bullet } from "./sim/entities.js";
import { Vector2 } from "./sim/vector.js";
import { World } from "./sim/world.js";
import { setupCanvas } from "./render/canvas.js";
import {
  drawGrid,
  drawWorld,
  drawRemotePlayers,
  drawHud,
  lerp,
  lerpAngle,
} from "./render/draw.js";
import { assets } from "./render/assets.js";
import { audio } from "./render/audio.js";
import { encodeInputBinary } from "./net/protocol.js";

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

// --- МЕРЕЖЕВИЙ СТАН ТА ІНТЕРПОЛЯЦІЯ СУПЕРНИКІВ (Lab 05) ---
let socket = null;
let myPlayerId = null;
const remotePlayers = new Map();

const netStats = {
  connected: false,
  pingMs: 0,
  onlineCount: 1,
  useBinary: true, // Клавіша [B] перемикає Binary (14 байт) <-> JSON (~82 байти)
};

function connectWebSocket() {
  socket = new WebSocket("ws://localhost:8080");
  socket.binaryType = "arraybuffer";

  socket.onopen = () => {
    netStats.connected = true;
    const randomId = Math.floor(100 + Math.random() * 900);
    socket.send(JSON.stringify({ type: "join", name: `Pilot_${randomId}` }));
  };

  socket.onclose = () => {
    netStats.connected = false;
  };

  socket.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.type === "welcome") {
      myPlayerId = data.id;
    } else if (data.type === "pong") {
      netStats.pingMs = Math.round(performance.now() - data.clientTime);
    } else if (data.type === "remoteShoot") {
      // Створюємо кулю, яку випустив інший гравець по мережі
      const dir = Vector2.fromAngle(data.angle);
      const nose = new Vector2(data.x, data.y).add(dir.scale(20));
      const vel = dir.scale(SHIP_CONFIG.bulletSpeed);
      world.spawn(
        new Bullet({
          x: nose.x,
          y: nose.y,
          vx: vel.x,
          vy: vel.y,
          angle: data.angle,
          ownerId: data.ownerId,
        })
      );
    } else if (data.type === "state") {
      const players = data.state.players || {};
      const activeIds = new Set(Object.keys(players));
      netStats.onlineCount = activeIds.size || 1;

      // Видаляємо гравців, які вийшли
      for (const id of remotePlayers.keys()) {
        if (!activeIds.has(id)) remotePlayers.delete(id);
      }

      // Оновлюємо цільові координати інших пілотів для плавної інтерполяції
      for (const [id, p] of Object.entries(players)) {
        if (id === myPlayerId) continue;

        if (!remotePlayers.has(id)) {
          remotePlayers.set(id, {
            id,
            name: p.name,
            targetX: p.x,
            targetY: p.y,
            targetAngle: p.angle || 0,
            renderX: p.x,
            renderY: p.y,
            renderAngle: p.angle || 0,
            thrust: p.thrust,
          });
        } else {
          const remote = remotePlayers.get(id);
          remote.targetX = p.x;
          remote.targetY = p.y;
          remote.targetAngle = p.angle || 0;
          remote.thrust = p.thrust;
        }
      }
    }
  };

  // Вимірюємо RTT (Ping) кожну секунду
  setInterval(() => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "ping", clientTime: performance.now() }));
    }
  }, 1000);
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

  // Клавіша B перемикає бінарний протокол ArrayBuffer та текстовий JSON
  if (input.justPressed("KeyB")) {
    netStats.useBinary = !netStats.useBinary;
  }

  const prevBulletCount = [...world.ofKind("bullet")].length;
  world.step(dt, input);
  const newBulletCount = [...world.ofKind("bullet")].length;
  const firedThisStep = newBulletCount > prevBulletCount;

  // Плавне згладжування руху мережевих суперників (Entity Interpolation)
  const smoothing = Math.min(1, dt * 14);
  for (const [, remote] of remotePlayers) {
    remote.renderX = lerp(remote.renderX, remote.targetX, smoothing);
    remote.renderY = lerp(remote.renderY, remote.targetY, smoothing);
    remote.renderAngle = lerpAngle(remote.renderAngle, remote.targetAngle, smoothing);
  }

  // Надсилаємо телеметрію на сервер (Бінарний буфер 14B або JSON)
  if (socket && socket.readyState === WebSocket.OPEN) {
    const telemetry = {
      x: ship.pos.x,
      y: ship.pos.y,
      angle: ship.angle,
      thrust: ship.thrust,
      firing: firedThisStep,
    };

    if (netStats.useBinary) {
      socket.send(encodeInputBinary(telemetry));
    } else {
      socket.send(JSON.stringify({ type: "input", ...telemetry }));
    }
  }
}

function render(alpha, stats) {
  ctx.clearRect(0, 0, arena.width, arena.height);
  drawGrid(ctx, arena);
  drawWorld(ctx, world, alpha);
  drawRemotePlayers(ctx, remotePlayers);
  drawHud(ctx, stats, world, netStats);
}

const loop = createLoop({
  step: 1 / 60,
  simulate,
  render,
});