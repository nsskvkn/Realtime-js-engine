import { createServer } from "node:http";
import { WebSocketServer as WSServer } from "ws";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GameRoom } from "./gameRoom.js";
import { decodeInputBinary } from "../src/net/protocol.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logStream = fs.createWriteStream(path.join(__dirname, "gameLog.txt"), { flags: "a" });

const server = createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Dogfight WebSocket Server (Lab 05 Multiplayer) is running.\n");
});

const wss = new WSServer({ server });
const defaultRoom = new GameRoom("alpha");

defaultRoom.on("join", (player) => {
  const logMsg = `[${new Date().toISOString()}] JOIN: ${player.name} (${player.id})\n`;
  logStream.write(logMsg);
  console.log(logMsg.trim());
});

defaultRoom.on("leave", (player) => {
  const logMsg = `[${new Date().toISOString()}] LEAVE: ${player.name} (${player.id})\n`;
  logStream.write(logMsg);
  console.log(logMsg.trim());
});

// Ретранслюємо постріли іншим гравцям у кімнаті
defaultRoom.on("shoot", (shotData) => {
  const msg = JSON.stringify({ type: "remoteShoot", ...shotData });
  for (const [clientWs, player] of defaultRoom.clients) {
    if (player.id !== shotData.ownerId && clientWs.readyState === 1) {
      clientWs.send(msg);
    }
  }
});

wss.on("connection", (ws) => {
  ws.on("message", (message, isBinary) => {
    try {
      // 1. Якщо прийшов 14-байтний бінарний пакет телеметрії (Lab 05)
      if (isBinary) {
        const decoded = decodeInputBinary(message);
        if (decoded) {
          defaultRoom.updatePlayerInput(ws, decoded);
        }
        return;
      }

      // 2. Якщо прийшло керуюче JSON-повідомлення (join, ping, або старий input)
      const data = JSON.parse(message.toString());

      if (data.type === "join") {
        const playerId = defaultRoom.addPlayer(ws, data.name || "Pilot");
        ws.send(JSON.stringify({ type: "welcome", id: playerId }));
      } else if (data.type === "ping") {
        ws.send(JSON.stringify({ type: "pong", clientTime: data.clientTime }));
      } else if (data.type === "input") {
        defaultRoom.updatePlayerInput(ws, data);
      }
    } catch (err) {
      console.error("Packet error:", err.message);
    }
  });

  ws.on("close", () => {
    defaultRoom.removePlayer(ws);
  });
});

// Розсилка знімків світу (Snapshots) 20 разів на секунду (кожні 50 мс)
setInterval(() => {
  const stateMsg = defaultRoom.getStateMessage();
  for (const [ws] of defaultRoom.clients) {
    if (ws.readyState === 1) {
      ws.send(stateMsg);
    }
  }
}, 50);

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`🚀 Dogfight Multiplayer Server listening on ws://localhost:${PORT}`);
});