import { z } from "zod";

export const PROTOCOL_VERSION = 1 as const;
export const MSG_BINARY_INPUT = 1 as const;

// --- ZOD SCHEMAS FOR CLIENT -> SERVER MESSAGES (M2) ---
export const JoinMessageSchema = z.object({
  type: z.literal("join"),
  name: z.string().trim().min(1).max(24),
});

export const PingMessageSchema = z.object({
  type: z.literal("ping"),
  clientTime: z.number().finite(),
});

export const InputMessageSchema = z.object({
  type: z.literal("input"),
  x: z.number().finite(),
  y: z.number().finite(),
  angle: z.number().finite(),
  thrust: z.boolean(),
  firing: z.boolean(),
});

export const ClientMessageSchema = z.discriminatedUnion("type", [
  JoinMessageSchema,
  PingMessageSchema,
  InputMessageSchema,
]);

export type ClientMessage = z.infer<typeof ClientMessageSchema>;
export type TelemetryInput = z.infer<typeof InputMessageSchema>;

// --- ZOD SCHEMAS FOR SERVER -> CLIENT MESSAGES (M2) ---
export const PlayerStateSchema = z.object({
  id: z.string(),
  name: z.string(),
  x: z.number(),
  y: z.number(),
  angle: z.number(),
  thrust: z.boolean(),
  hp: z.number(),
});

export type PlayerSnapshot = z.infer<typeof PlayerStateSchema>;

export const ServerMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("welcome"),
    id: z.string(),
  }),
  z.object({
    type: z.literal("pong"),
    clientTime: z.number(),
  }),
  z.object({
    type: z.literal("remoteShoot"),
    ownerId: z.string(),
    x: z.number(),
    y: z.number(),
    angle: z.number(),
  }),
  z.object({
    type: z.literal("state"),
    room: z.string(),
    serverTime: z.number(),
    state: z.object({
      players: z.record(z.string(), PlayerStateSchema),
    }),
  }),
]);

export type ServerMessage = z.infer<typeof ServerMessageSchema>;

// --- RESULT TYPE FOR SAFE BOUNDARY VALIDATION ---
export type ParseResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: string };

export function parseClientMessage(raw: unknown): ParseResult<ClientMessage> {
  const parsed = ClientMessageSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.message };
  }
  return { ok: true, data: parsed.data };
}

export function parseServerMessage(raw: unknown): ParseResult<ServerMessage> {
  const parsed = ServerMessageSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.message };
  }
  return { ok: true, data: parsed.data };
}

// --- CODEC INTERFACE WITH BINARY & JSON IMPLEMENTATIONS (M2) ---
export interface TelemetryCodec<TWire> {
  readonly name: string;
  encode(input: TelemetryInput): TWire;
  decode(wire: TWire): ParseResult<TelemetryInput>;
}

/**
 * 15-byte Binary Telemetry Codec with version guard & finite range validation:
 * [0]     Uint8   - Protocol Version (1)
 * [1]     Uint8   - Message Type (1 = MSG_BINARY_INPUT)
 * [2]     Uint8   - Flags (bit 0: thrust, bit 1: firing)
 * [3..6]  Float32 - X
 * [7..10] Float32 - Y
 * [11..14] Float32 - Angle
 */
export const binaryTelemetryCodec: TelemetryCodec<ArrayBuffer> = {
  name: "Binary (15B)",
  encode(input: TelemetryInput): ArrayBuffer {
    const buffer = new ArrayBuffer(15);
    const view = new DataView(buffer);
    const flags = (input.thrust ? 1 : 0) | (input.firing ? 2 : 0);

    view.setUint8(0, PROTOCOL_VERSION);
    view.setUint8(1, MSG_BINARY_INPUT);
    view.setUint8(2, flags);
    view.setFloat32(3, input.x, true);
    view.setFloat32(7, input.y, true);
    view.setFloat32(11, input.angle, true);
    return buffer;
  },
  decode(buffer: ArrayBuffer): ParseResult<TelemetryInput> {
    if (buffer.byteLength !== 15) {
      return { ok: false, error: `Invalid binary length: ${buffer.byteLength}` };
    }
    const view = new DataView(buffer);
    const version = view.getUint8(0);
    if (version !== PROTOCOL_VERSION) {
      return { ok: false, error: `Unsupported protocol version: ${version}` };
    }
    const msgType = view.getUint8(1);
    if (msgType !== MSG_BINARY_INPUT) {
      return { ok: false, error: `Unknown binary message type: ${msgType}` };
    }

    const flags = view.getUint8(2);
    const x = view.getFloat32(3, true);
    const y = view.getFloat32(7, true);
    const angle = view.getFloat32(11, true);

    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(angle)) {
      return { ok: false, error: "Non-finite float in binary telemetry" };
    }

    return {
      ok: true,
      data: {
        type: "input",
        thrust: Boolean(flags & 1),
        firing: Boolean(flags & 2),
        x,
        y,
        angle,
      },
    };
  },
};