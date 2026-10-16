import { createLoop } from "./loop.ts";
import { createInput } from "./input.ts";
import { createArena } from "./sim/arena.ts";
import { Ship, SHIP_CONFIG } from "./sim/ship.ts";
import { Bullet } from "./sim/entities.ts";
import { Vector2 } from "./sim/vector.ts";
import { World } from "./sim/world.ts";
import { setupCanvas } from "./render/canvas.ts";
import {
  drawGrid,
  drawWorld,
  drawRemotePlayers,
  drawHud,
  lerp,
  lerpAngle,
  type RemotePlayerRender,
  type NetStats,
} from "./render/draw.ts";
import { assets } from "./render/assets.ts";
import { audio } from "./render/audio.ts";
import {
  binaryTelemetryCodec,
  parseServerMessage,
  type ServerMessage,
  type TelemetryInput,
} from "./net/protocol.ts";

const canvasEl = document.getElementById("game");
if (!(canvasEl instanceof HTMLCanvasElement)) {
  throw new Error("Canvas #game not found");
}

const arena = createArena(window.innerWidth || 1200, window.innerHeight || 800);
const world = new World(arena);

const ship = new Ship(arena.width / 2, arena.height / 2);
world.spawn(ship);

for (let i = 0; i < 6; i++) {
  world.spawnAsteroid({ radius: 32, homing: i % 2 === 0 });
}

const { ctx } = setupCanvas(canvasEl, (width, height) => {
  arena.width = width;
  arena.height = height;
});

const input = createInput(window);
canvasEl.addEventListener("mousedown", () => {
  if (gameStarted) ship.fire(world, false);
});

let socket: WebSocket | null = null;
let myPlayerId: string | null = null;
const remotePlayers = new Map<string, RemotePlayerRender>();

const netStats: NetStats = {
  connected: false,
  pingMs: 0,
  onlineCount: 1,
  useBinary: true,
};

function handleServerMessage(msg: ServerMessage): void {
  switch (msg.type) {
    case "welcome": {
      myPlayerId = msg.id;
      return;
    }
    case "pong": {
      netStats.pingMs = Math.round(performance.now() - msg.clientTime);
      return;
    }
    case "remoteShoot": {
      const dir = Vector2.fromAngle(msg.angle);
      const nose = new Vector2(msg.x, msg.y).add(dir.scale(20));
      const vel = dir.scale(SHIP_CONFIG.bulletSpeed);
      world.spawn(
        new Bullet({
          x: nose.x,
          y: nose.y,
          vx: vel.x,
          vy: vel.y,
          angle: msg.angle,
          ownerId: msg.ownerId,
        })
      );
      return;
    }
    case "state": {
      const players = msg.state.players;
      const activeIds = new Set(Object.keys(players));
      netStats.onlineCount = activeIds.size || 1;

      for (const id of remotePlayers.keys()) {
        if (!activeIds.has(id)) remotePlayers.delete(id);
      }

      for (const [id, p] of Object.entries(players)) {
        if (id === myPlayerId) continue;

        const existing = remotePlayers.get(id);
        if (!existing) {
          remotePlayers.set(id, {
            id,
            name: p.name,
            targetX: p.x,
            targetY: p.y,
            targetAngle: p.angle,
            renderX: p.x,
            renderY: p.y,
            renderAngle: p.angle,
            thrust: p.thrust,
          });
        } else {
          existing.targetX = p.x;
          existing.targetY = p.y;
          existing.targetAngle = p.angle;
          existing.thrust = p.thrust;
        }
      }
      return;
    }
    default: {
      const _exhaustive: never = msg;
      return _exhaustive;
    }
  }
}

function connectWebSocket(): void {
  socket = new WebSocket("ws://localhost:8080");
  socket.binaryType = "arraybuffer";

  socket.onopen = () => {
    netStats.connected = true;
    const randomId = Math.floor(100 + Math.random() * 900);
    socket?.send(JSON.stringify({ type: "join", name: `Pilot_${randomId}` }));
  };

  socket.onclose = () => {
    netStats.connected = false;
  };

  socket.onmessage = (event: MessageEvent< unknown >) => {
    if (typeof event.data !== "string") return;
    try {
      const raw: unknown = JSON.parse(event.data);
      const parsed = parseServerMessage(raw);
      if (parsed.ok) {
        handleServerMessage(parsed.data);
      }
    } catch {
      // Ignore malformed JSON frames safely
    }
  };

  setInterval(() => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "ping", clientTime: performance.now() }));
    }
  }, 1000);
}

let gameStarted = false;
const startBtn = document.getElementById("start-btn") as HTMLButtonElement | null;
const loaderBar = document.getElementById("loader-bar");
const uiOverlay = document.getElementById("ui-overlay");

assets.loadImage("ship", "/favicon.svg");

function checkLoading(): void {
  const progress = assets.progress * 100;
  if (loaderBar) loaderBar.style.width = `${progress}%`;

  if (assets.isLoaded || progress >= 100) {
    if (startBtn) {
      startBtn.textContent = "PLAY GAME";
      startBtn.disabled = false;
    }
  } else {
    requestAnimationFrame(checkLoading);
  }
}
requestAnimationFrame(checkLoading);

startBtn?.addEventListener("click", () => {
  audio.init();
  connectWebSocket();
  gameStarted = true;
  uiOverlay?.classList.add("hidden");
  loop.start();
});

function simulate(dt: number): void {
  if (!gameStarted) return;

  if (input.justPressed("KeyR")) {
    ship.reset(arena.width / 2, arena.height / 2);
    if (!world.get(ship.id)) {
      world.spawn(ship);
    }
  }

  if (input.justPressed("KeyB")) {
    netStats.useBinary = !netStats.useBinary;
  }

  const prevBulletCount = [...world.ofKind("bullet")].length;
  world.step(dt, input);
  const newBulletCount = [...world.ofKind("bullet")].length;
  const firedThisStep = newBulletCount > prevBulletCount;

  const smoothing = Math.min(1, dt * 14);
  for (const [, remote] of remotePlayers) {
    remote.renderX = lerp(remote.renderX, remote.targetX, smoothing);
    remote.renderY = lerp(remote.renderY, remote.targetY, smoothing);
    remote.renderAngle = lerpAngle(remote.renderAngle, remote.targetAngle, smoothing);
  }

  if (socket && socket.readyState === WebSocket.OPEN) {
    const telemetry: TelemetryInput = {
      type: "input",
      x: ship.pos.x,
      y: ship.pos.y,
      angle: ship.angle,
      thrust: ship.thrust,
      firing: firedThisStep,
    };

    if (netStats.useBinary) {
      socket.send(binaryTelemetryCodec.encode(telemetry));
    } else {
      socket.send(JSON.stringify(telemetry));
    }
  }
}

function render(alpha: number, stats: Parameters<typeof drawHud>[1]): void {
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