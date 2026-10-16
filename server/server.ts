import { createServer } from "node:http";
import { WebSocketServer, type WebSocket, type RawData } from "ws";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { GameRoom } from "./gameRoom.ts";
import {
  binaryTelemetryCodec,
  parseClientMessage,
  type ClientMessage,
} from "../src/net/protocol.ts";

// --- ZOD-VALIDATED SERVER CONFIG (M3) ---
const ServerConfigSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8080),
  HOST: z.string().default("0.0.0.0"),
});

export type ServerConfig = z.infer<typeof ServerConfigSchema>;

const config = ServerConfigSchema.parse({
  PORT: process.env.PORT,
  HOST: process.env.HOST,
}) satisfies ServerConfig;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logStream = fs.createWriteStream(path.join(__dirname, "gameLog.txt"), { flags: "a" });

const server = createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Dogfight Typed WebSocket Server (Lab 06) is running.\n");
});

const wss = new WebSocketServer({ server });
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

defaultRoom.on("shoot", (shotData) => {
  const msg = JSON.stringify({ type: "remoteShoot", ...shotData });
  for (const [clientWs, player] of defaultRoom.clients) {
    if (player.id !== shotData.ownerId && clientWs.readyState === 1) {
      clientWs.send(msg);
    }
  }
});

function handleClientMessage(ws: WebSocket, msg: ClientMessage): void {
  switch (msg.type) {
    case "join": {
      const playerId = defaultRoom.addPlayer(ws, msg.name);
      ws.send(JSON.stringify({ type: "welcome", id: playerId }));
      return;
    }
    case "ping": {
      ws.send(JSON.stringify({ type: "pong", clientTime: msg.clientTime }));
      return;
    }
    case "input": {
      defaultRoom.updatePlayerInput(ws, msg);
      return;
    }
    default: {
      const _exhaustive: never = msg;
      return _exhaustive;
    }
  }
}

function toArrayBuffer(data: RawData): ArrayBuffer {
  if (data instanceof ArrayBuffer) return data;
  if (Array.isArray(data)) {
    const buf = Buffer.concat(data);
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  }
  
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  return copy.buffer;
}

wss.on("connection", (ws: WebSocket) => {
  ws.on("message", (message: RawData, isBinary: boolean) => {
    try {
      if (isBinary) {
        const ab = toArrayBuffer(message);
        const decoded = binaryTelemetryCodec.decode(ab);
        if (!decoded.ok) {
          console.warn("Rejected binary packet:", decoded.error);
          ws.close(1003, "Invalid binary frame");
          return;
        }
        defaultRoom.updatePlayerInput(ws, decoded.data);
        return;
      }

      const raw: unknown = JSON.parse(message.toString());
      const parsed = parseClientMessage(raw);
      if (!parsed.ok) {
        console.warn("Rejected JSON packet:", parsed.error);
        ws.close(1003, "Schema validation failed");
        return;
      }

      handleClientMessage(ws, parsed.data);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error("Boundary parse error:", errMsg);
      ws.close(1003, "Malformed payload");
    }
  });

  ws.on("close", () => {
    defaultRoom.removePlayer(ws);
  });
});

setInterval(() => {
  const stateMsg = defaultRoom.getStateMessage();
  for (const [ws] of defaultRoom.clients) {
    if (ws.readyState === 1) {
      ws.send(stateMsg);
    }
  }
}, 50);

server.listen(config.PORT, config.HOST, () => {
  console.log(`🚀 Typed Dogfight Server listening on ws://${config.HOST}:${config.PORT}`);
});