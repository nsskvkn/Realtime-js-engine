import { EventEmitter } from "node:events";
import type { WebSocket } from "ws";
import type { PlayerSnapshot, TelemetryInput } from "../src/net/protocol.ts";

export interface RoomEvents {
  join: [player: PlayerSnapshot];
  leave: [player: PlayerSnapshot];
  shoot: [shot: { ownerId: string; x: number; y: number; angle: number }];
}

interface BotState {
  id: string;
  name: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  turnDir: number;
  shootCooldown: number;
}

export class GameRoom extends EventEmitter<RoomEvents> {
  readonly roomId: string;
  readonly clients = new Map<WebSocket, PlayerSnapshot>();
  readonly bots = new Map<string, BotState>();
  readonly state: { players: Record<string, PlayerSnapshot> } = {
    players: {},
  };

  constructor(roomId: string) {
    super();
    this.roomId = roomId;
  }

  addPlayer(ws: WebSocket, playerName: string): string {
    const id = Math.random().toString(36).substring(2, 9);
    const player: PlayerSnapshot = {
      id,
      name: playerName,
      x: 400 + Math.random() * 400,
      y: 250 + Math.random() * 300,
      angle: -Math.PI / 2,
      thrust: false,
      hp: 100,
    };

    this.clients.set(ws, player);
    this.state.players[id] = player;

    this.emit("join", player);
    return id;
  }

  spawnBots(count = 8): number {
    for (let i = 0; i < count; i++) {
      const id = `bot_${Math.random().toString(36).substring(2, 7)}`;
      const angle = Math.random() * Math.PI * 2;
      const bot: BotState = {
        id,
        name: `Bot_${this.bots.size + 1}`,
        x: 200 + Math.random() * 800,
        y: 150 + Math.random() * 500,
        vx: Math.cos(angle) * 140,
        vy: Math.sin(angle) * 140,
        angle,
        turnDir: Math.random() < 0.5 ? 1 : -1,
        shootCooldown: 0.5 + Math.random() * 1.5,
      };
      this.bots.set(id, bot);
      this.state.players[id] = {
        id: bot.id,
        name: bot.name,
        x: bot.x,
        y: bot.y,
        angle: bot.angle,
        thrust: true,
        hp: 100,
      };
    }
    return this.bots.size;
  }

  stepBots(dt: number): void {
    for (const bot of this.bots.values()) {
      bot.angle += bot.turnDir * 1.4 * dt;
      bot.x = (bot.x + Math.cos(bot.angle) * 165 * dt + 1200) % 1200;
      bot.y = (bot.y + Math.sin(bot.angle) * 165 * dt + 800) % 800;

      bot.shootCooldown -= dt;
      if (bot.shootCooldown <= 0) {
        bot.shootCooldown = 1.2 + Math.random() * 1.5;
        this.emit("shoot", {
          ownerId: bot.id,
          x: bot.x,
          y: bot.y,
          angle: bot.angle,
        });
      }

      const snap = this.state.players[bot.id];
      if (snap) {
        snap.x = bot.x;
        snap.y = bot.y;
        snap.angle = bot.angle;
        snap.thrust = true;
      }
    }
  }

  removePlayer(ws: WebSocket): void {
    const player = this.clients.get(ws);
    if (player !== undefined) {
      delete this.state.players[player.id];
      this.clients.delete(ws);
      this.emit("leave", player);
    }
  }

  updatePlayerInput(ws: WebSocket, inputData: TelemetryInput): void {
    const player = this.clients.get(ws);
    if (!player) return;

    const target = this.state.players[player.id];
    if (target !== undefined) {
      target.x = inputData.x;
      target.y = inputData.y;
      target.angle = inputData.angle;
      target.thrust = inputData.thrust;

      if (inputData.firing) {
        this.emit("shoot", {
          ownerId: player.id,
          x: target.x,
          y: target.y,
          angle: target.angle,
        });
      }
    }
  }

  getStateMessage(): string {
    return JSON.stringify({
      type: "state",
      room: this.roomId,
      serverTime: Date.now(),
      state: this.state,
    });
  }
}