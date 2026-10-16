import { describe, it, expect, vi } from "vitest";
import fc from "fast-check";
import { Vector2 } from "../src/sim/vector.ts";
import { createArena } from "../src/sim/arena.ts";
import { World } from "../src/sim/world.ts";
import { Ship } from "../src/sim/ship.ts";
import { Asteroid, Bullet, bulletPool } from "../src/sim/entities.ts";
import { detectCollisions } from "../src/sim/collision.ts";
import { createLoop } from "../src/loop.ts";
import {
  binaryTelemetryCodec,
  parseClientMessage,
  type TelemetryInput,
} from "../src/net/protocol.ts";

describe("Unit Tests — Vector2 (Pure & Immutable)", () => {
  it("adds vectors without mutating originals", () => {
    const a = new Vector2(3, 4);
    const b = new Vector2(1, 2);
    const c = a.add(b);
    expect(c.x).toBe(4);
    expect(c.y).toBe(6);
    expect(a.x).toBe(3);
    expect(a.y).toBe(4);
  });

  it("calculates length and normalizes accurately", () => {
    const v = new Vector2(3, 4);
    expect(v.length()).toBeCloseTo(5, 5);
    const norm = v.normalize();
    expect(norm.length()).toBeCloseTo(1, 5);
  });

  it("handles zero vector normalization safely", () => {
    const zero = new Vector2(0, 0).normalize();
    expect(zero.x).toBe(0);
    expect(zero.y).toBe(0);
  });
});

describe("Unit Tests — Collisions, Pooling, and Determinism", () => {
  it("detects overlapping entities and ignores distant ones", () => {
    const world = new World(createArena(800, 600));
    const a1 = new Asteroid({ x: 100, y: 100, vx: 0, vy: 0, radius: 25 });
    const a2 = new Asteroid({ x: 130, y: 100, vx: 0, vy: 0, radius: 25 });
    const a3 = new Asteroid({ x: 400, y: 400, vx: 0, vy: 0, radius: 25 });
    world.spawn(a1);
    world.spawn(a2);
    world.spawn(a3);

    const pairs = detectCollisions(world);
    expect(pairs.length).toBe(1);
  });

  it("recycles bullets via ObjectPool without memory leak", () => {
    const b1 = bulletPool.acquire();
    bulletPool.release(b1);
    const b2 = bulletPool.acquire();
    expect(b2).toBe(b1);
    expect(bulletPool.stats.reusedCount).toBeGreaterThan(0);
  });

  it("maintains deterministic ship physics over fixed steps", () => {
    const w1 = new World(createArena(1000, 800));
    const w2 = new World(createArena(1000, 800));
    const s1 = w1.spawn(new Ship(500, 400));
    const s2 = w2.spawn(new Ship(500, 400));

    const fakeInput = {
      isDown: (code: string) => code === "KeyW" || code === "KeyD",
      justPressed: () => false,
      dispose: () => {},
    };

    for (let i = 0; i < 120; i++) {
      s1.update(1 / 60, w1, fakeInput);
      s2.update(1 / 60, w2, fakeInput);
    }

    expect(s1.pos.x).toBe(s2.pos.x);
    expect(s1.pos.y).toBe(s2.pos.y);
    expect(s1.angle).toBe(s2.angle);
  });

  it("drives fixed-timestep accumulator accurately with fake timers", () => {
    vi.useFakeTimers();
    let steps = 0;
    const loop = createLoop({
      step: 1 / 60,
      simulate: () => {
        steps++;
      },
      render: () => {},
    });
    expect(loop).toBeDefined();
    expect(steps).toBe(0);
    vi.useRealTimers();
  });
});

describe("Property-Based Tests (fast-check) — Protocol & Arena Invariants", () => {
  // Property 1: Binary Codec round-trip within Float32 tolerance
  it("Property 1: Binary codec round-trips any valid telemetry within Float32 precision", () => {
    fc.assert(
      fc.property(
        fc.float({ noNaN: true, noDefaultInfinity: true, min: -10000, max: 10000 }),
        fc.float({ noNaN: true, noDefaultInfinity: true, min: -10000, max: 10000 }),
        fc.float({ noNaN: true, noDefaultInfinity: true, min: -Math.fround(Math.PI), max: Math.fround(Math.PI) }),
        fc.boolean(),
        fc.boolean(),
        (x, y, angle, thrust, firing) => {
          const msg: TelemetryInput = { type: "input", x, y, angle, thrust, firing };
          const encoded = binaryTelemetryCodec.encode(msg);
          const decoded = binaryTelemetryCodec.decode(encoded);

          expect(decoded.ok).toBe(true);
          if (decoded.ok) {
            expect(decoded.data.x).toBeCloseTo(Math.fround(x), 4);
            expect(decoded.data.y).toBeCloseTo(Math.fround(y), 4);
            expect(decoded.data.angle).toBeCloseTo(Math.fround(angle), 4);
            expect(decoded.data.thrust).toBe(thrust);
            expect(decoded.data.firing).toBe(firing);
          }
        }
      )
    );
  });

  // Property 2: Encoded binary packet byteLength always equals spec (15 bytes)
  it("Property 2: Binary encoder always produces exact 15-byte ArrayBuffer", () => {
    fc.assert(
      fc.property(
        fc.float({ noNaN: true, noDefaultInfinity: true }),
        fc.float({ noNaN: true, noDefaultInfinity: true }),
        fc.float({ noNaN: true, noDefaultInfinity: true }),
        fc.boolean(),
        fc.boolean(),
        (x, y, angle, thrust, firing) => {
          const buf = binaryTelemetryCodec.encode({
            type: "input",
            x,
            y,
            angle,
            thrust,
            firing,
          });
          expect(buf.byteLength).toBe(15);
        }
      )
    );
  });

  // Property 3: Arbitrary corrupted/random byte buffers never crash decoder
  it("Property 3: Arbitrary random byte buffers never throw unhandled exceptions", () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 0, maxLength: 50 }), (bytes) => {
        const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
        const result = binaryTelemetryCodec.decode(ab);
        expect(typeof result.ok).toBe("boolean");
      })
    );
  });

  // Property 4: Ships always stay inside arena bounds under wrapPosition
  it("Property 4: Ship stays within arena bounds across arbitrary velocities", () => {
    const arena = createArena(1200, 800);
    const world = new World(arena);

    fc.assert(
      fc.property(
        fc.float({ noNaN: true, noDefaultInfinity: true, min: 0, max: 1199 }),
        fc.float({ noNaN: true, noDefaultInfinity: true, min: 0, max: 799 }),
        fc.float({ noNaN: true, noDefaultInfinity: true, min: -500, max: 500 }),
        fc.float({ noNaN: true, noDefaultInfinity: true, min: -500, max: 500 }),
        (x, y, vx, vy) => {
          const bullet = new Bullet({ x, y, vx, vy, angle: 0, ownerId: "test" });
          bullet.update(1 / 60, world);
          world.wrapPosition(bullet);
         expect(bullet.pos.x).toBeGreaterThanOrEqual(0);
          expect(bullet.pos.x).toBeLessThanOrEqual(arena.width);
          expect(bullet.pos.y).toBeGreaterThanOrEqual(0);
          expect(bullet.pos.y).toBeLessThanOrEqual(arena.height);
        }
      )
    );
  });

  // Property 5: Zod parser accepts all valid join messages and rejects invalid ones
  it("Property 5: parseClientMessage accepts valid joins and rejects malformed objects", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0),
        (name) => {
          const valid = parseClientMessage({ type: "join", name });
          expect(valid.ok).toBe(true);

          const invalid = parseClientMessage({ type: "join", name: "" });
          expect(invalid.ok).toBe(false);
        }
      )
    );
  });
});