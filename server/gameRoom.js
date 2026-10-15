import { EventEmitter } from "node:events";

export class GameRoom extends EventEmitter {
  constructor(roomId) {
    super();
    this.roomId = roomId;
    this.clients = new Map(); // ws -> player state
    this.state = {
      players: {},
      asteroids: [],
    };
  }

  addPlayer(ws, playerName) {
    const id = Math.random().toString(36).substring(2, 9);
    this.clients.set(ws, { id, name: playerName, x: 600, y: 400 });
    this.state.players[id] = { id, name: playerName, x: 600, y: 400, hp: 100 };

    this.emit("join", { id, name: playerName });
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
    if (player && this.state.players[player.id]) {
      this.state.players[player.id].x = inputData.x;
      this.state.players[player.id].y = inputData.y;
      this.state.players[player.id].angle = inputData.angle;
    }
  }

  getStateMessage() {
    return JSON.stringify({
      type: "state",
      room: this.roomId,
      state: this.state,
    });
  }
}