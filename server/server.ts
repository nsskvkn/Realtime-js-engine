import { createServer } from "node:http";
import { WebSocketServer, type WebSocket, type RawData } from "ws";
import { performance } from "node:perf_hooks";
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

const defaultRoom = new GameRoom("alpha");
const tickSamples: number[] = [];

const server = createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.url === "/api/stats") {
    const sorted = [...tickSamples].sort((a, b) => a - b);
    const p99 = sorted[Math.floor(sorted.length * 0.99)] ?? 0;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        clients: defaultRoom.clients.size,
        bots: defaultRoom.bots.size,
        tickP99Ms: Number(p99.toFixed(3)),
        memoryRssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      })
    );
    return;
  }

  if (req.url === "/api/bots" && req.method === "POST") {
    const totalBots = defaultRoom.spawnBots(8);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, bots: totalBots }));
    return;
  }

  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Dogfight Server (Lab 07 Perf & Bots) is running.\n");
});

const wss = new WebSocketServer({ server });

defaultRoom.on("join", (player) => {
  const logMsg = `[${new Date().toISOString()}] JOIN: ${player.name} (${player.id})\n`;
  logStream.write(logMsg);
});

defaultRoom.on("leave", (player) => {
  const logMsg = `[${new Date().toISOString()}] LEAVE: ${player.name} (${player.id})\n`;
  logStream.write(logMsg);
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
  return Uint8Array.from(data).buffer;
}

wss.on("connection", (ws: WebSocket) => {
  ws.on("message", (message: RawData, isBinary: boolean) => {
    try {
      if (isBinary) {
        const ab = toArrayBuffer(message);
        const decoded = binaryTelemetryCodec.decode(ab);
        if (!decoded.ok) {
          ws.close(1003, "Invalid binary frame");
          return;
        }
        defaultRoom.updatePlayerInput(ws, decoded.data);
        return;
      }

      const raw: unknown = JSON.parse(message.toString());
      const parsed = parseClientMessage(raw);
      if (!parsed.ok) {
        ws.close(1003, "Schema validation failed");
        return;
      }

      handleClientMessage(ws, parsed.data);
    } catch {
      ws.close(1003, "Malformed payload");
    }
  });

  ws.on("close", () => {
    defaultRoom.removePlayer(ws);
  });
});

setInterval(() => {
  const t0 = performance.now();
  defaultRoom.stepBots(0.05);
  const stateMsg = defaultRoom.getStateMessage();
  for (const [ws] of defaultRoom.clients) {
    if (ws.readyState === 1) {
      ws.send(stateMsg);
    }
  }
  const elapsed = performance.now() - t0;
  tickSamples.push(elapsed);
  if (tickSamples.length > 200) tickSamples.shift();
}, 50);

server.listen(config.PORT, config.HOST, () => {
  console.log(`🚀 Dogfight Server listening on ws://${config.HOST}:${config.PORT}`);
});