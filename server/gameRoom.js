import { EventEmitter } from "node:events";

export class GameRoom extends EventEmitter {
  constructor(roomId) {
    super();
    this.roomId = roomId;
    this.clients = new Map(); // ws -> player object
    this.state = {
      players: {},
    };
  }

  addPlayer(ws, playerName) {
    const id = Math.random().toString(36).substring(2, 9);
    const player = {
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

  removePlayer(ws) {
    const player = this.clients.get(ws);
    if (player) {
      delete this.state.players[player.id];
      this.clients.delete(ws);
      this.emit("leave", player);
    }
  }

  updatePlayerInput(ws, inputData) {
    const player = this.clients.get(ws);
    if (!player) return;

    const target = this.state.players[player.id];
    if (target) {
      target.x = inputData.x;
      target.y = inputData.y;
      target.angle = inputData.angle;
      target.thrust = Boolean(inputData.thrust);

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

  getStateMessage() {
    return JSON.stringify({
      type: "state",
      room: this.roomId,
      serverTime: Date.now(),
      state: this.state,
    });
  }
}