import { createServer } from "node:http";
import { WebSocketServer as WSServer } from "ws";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GameRoom } from "./gameRoom.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logStream = fs.createWriteStream(path.join(__dirname, "gameLog.txt"), { flags: "a" });

const server = createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Dogfight WebSocket Server is running.\n");
});

const wss = new WSServer({ server });
const rooms = new Map();

// Створюємо кімнату за замовчуванням "alpha"
const defaultRoom = new GameRoom("alpha");
rooms.set("alpha", defaultRoom);

defaultRoom.on("join", (player) => {
  const logMsg = `[${new Date().toISOString()}] Player joined: ${player.name} (${player.id})\n`;
  logStream.write(logMsg);
  console.log(logMsg.trim());
});

defaultRoom.on("leave", (player) => {
  const logMsg = `[${new Date().toISOString()}] Player left: ${player.name} (${player.id})\n`;
  logStream.write(logMsg);
  console.log(logMsg.trim());
});

wss.on("connection", (ws) => {
  let playerId = null;

  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message);

      if (data.type === "join") {
        playerId = defaultRoom.addPlayer(ws, data.name || "Pilot");
        ws.send(JSON.stringify({ type: "welcome", id: playerId }));
      }

      if (data.type === "input") {
        defaultRoom.updatePlayerInput(ws, data);
      }
    } catch (err) {
      console.error("Invalid JSON received:", err);
    }
  });

  ws.on("close", () => {
    defaultRoom.removePlayer(ws);
  });
});

// Ігровий цикл сервера (20 кадрів на секунду розсилає стан клієнтам)
setInterval(() => {
  const stateMsg = defaultRoom.getStateMessage();
  for (const [ws] of defaultRoom.clients) {
    if (ws.readyState === 1) { // OPEN
      ws.send(stateMsg);
    }
  }
}, 50);

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`🚀 WebSocket server is listening on ws://localhost:${PORT}`);
});