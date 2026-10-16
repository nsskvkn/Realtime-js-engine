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
  NODE_ENV: z.string().default("development"),
});

const config = ServerConfigSchema.parse({
  PORT: process.env.PORT,
  HOST: process.env.HOST,
  NODE_ENV: process.env.NODE_ENV,
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logStream = fs.createWriteStream(path.join(__dirname, "gameLog.txt"), { flags: "a" });

const defaultRoom = new GameRoom("alpha");
const tickSamples: number[] = [];
const GIT_SHA = process.env.GIT_SHA || "v1.0.0-local";

const server = createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");

  // Liveness probe
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "healthy", sha: GIT_SHA, uptime: process.uptime() }));
    return;
  }

  // Readiness probe
  if (req.url === "/ready") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ready", clients: defaultRoom.clients.size }));
    return;
  }

  // Metrics / Stats
  if (req.url === "/metrics" || req.url === "/api/stats") {
    const sorted = [...tickSamples].sort((a, b) => a - b);
    const p99 = sorted[Math.floor(sorted.length * 0.99)] ?? 0;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        clients: defaultRoom.clients.size,
        bots: defaultRoom.bots.size,
        tickP99Ms: Number(p99.toFixed(3)),
        memoryRssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
        env: config.NODE_ENV,
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
  res.end("Dogfight Production WebSocket Server (Lab 08) is running.\n");
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
  const buffer = new ArrayBuffer(data.byteLength);
  new Uint8Array(buffer).set(data);
  return buffer;
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

const tickInterval = setInterval(() => {
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
  console.log(`🚀 Dogfight Production Server listening on ws://${config.HOST}:${config.PORT}`);
});

// --- GRACEFUL SHUTDOWN (Lab 08 M1) ---
function shutdown(signal: string) {
  console.log(`\n[${signal}] Received shutdown signal. Closing gracefully...`);
  clearInterval(tickInterval);

  // Notify all connected clients
  for (const [ws] of defaultRoom.clients) {
    if (ws.readyState === 1) {
      ws.close(1001, "Server shutting down");
    }
  }

  server.close(() => {
    console.log("HTTP server closed. Flushing logs...");
    logStream.end(() => {
      console.log("Log stream flushed. Exiting 0.");
      process.exit(0);
    });
  });

  // Force exit if things hang
  setTimeout(() => {
    console.error("Forcing shutdown after timeout.");
    process.exit(1);
  }, 10000);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));