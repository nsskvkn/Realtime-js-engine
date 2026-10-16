import { EventEmitter } from "node:events";
import type { WebSocket } from "ws";
import type { PlayerSnapshot, TelemetryInput } from "../src/net/protocol.ts";

export interface RoomEvents {
  join: [player: PlayerSnapshot];
  leave: [player: PlayerSnapshot];
  shoot: [shot: { ownerId: string; x: number; y: number; angle: number }];
}

export class GameRoom extends EventEmitter<RoomEvents> {
  readonly roomId: string;
  readonly clients = new Map<WebSocket, PlayerSnapshot>();
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