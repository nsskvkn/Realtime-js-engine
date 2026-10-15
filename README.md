# Dogfight — Lab 01: The Event Loop Is the Game Loop

A 2D browser spaceship simulation built with Vanilla JavaScript (ESM) and HTML5 Canvas, driven by a deterministic fixed-timestep game loop (`step = 1/60s`) with state interpolation.

## Controls
- **W / ArrowUp** — Thrust
- **A / D or ArrowLeft / ArrowRight** — Rotate ship
- **R** — Reset ship to center (`justPressed` edge-triggered input)

## Physics Tuning (`src/sim/ship.js`)
- `turnSpeed: 4.2 rad/s` — responsive dogfighting without over-rotating on short taps.
- `acceleration: 420 px/s²` & `maxSpeed: 480 px/s` — reaches max speed in ~1.2s, preserving inertia.
- `drag: 1.8` — smooth exponential damping (`1 - drag * dt`).

---

## Milestone 4 — Experiments & Measurements

### Experiment 1: Synchronous 100 ms Busy-Wait in `render`
**Setup:** Added `const t = performance.now(); while (performance.now() < t + 100) {}` inside `render` on every 60th frame.
- **Observations:** Once per second, the screen visibly freezes. `frame ms` spikes to `~107 ms`, `frames/s` drops from `144` to `~55`, while `steps/s` catches up to `60` via accumulator loops.
- **Explanation:** JavaScript is single-threaded. Synchronous code blocks the Call Stack completely, preventing the browser from draining queues or running layout/paint steps.

### Experiment 2: `setInterval(frame, 16)` vs `requestAnimationFrame`
**Setup:** Replaced `rAF` with `setInterval(..., 16)`.
- **Observations:** On a 144 Hz monitor, `rAF` produces a locked `144 fps` with `~6.94 ms` frame time. `setInterval` gives `~62 fps` with severe jitter (`12–22 ms`) and continues wasting CPU cycles in background tabs.
- **Explanation:** `setInterval` queues macrotasks unaligned with display VSync, whereas `rAF` is a dedicated rendering phase.

### Experiment 3: Variable Timestep vs Fixed Timestep under 6× CPU Throttling
**Setup:** 5.0 seconds of holding thrust comparing variable `dt` vs fixed `1/60s` accumulator under CPU 6× slowdown.
- **Observations:** Variable `dt` results in noticeable positional drift (`>50 px`) due to larger Euler integration steps. Fixed timestep produces bit-identical trajectories (`0.00 px` drift).
- **Explanation:** Fixed timestep ensures determinism regardless of client hardware or frame drops.

---

# Dogfight — Lab 02: Objects, Prototypes, `this`, and the Entity Model

## New Controls & Mechanics
- **Space / Mouse Click** — Fire standard cannon (`Bullet`)
- **E** — Fire homing missile (`Bullet` + `withHoming` composition)
- **Pickups:**
  - `S` (Cyan) — Temporary energy shield (absorbs asteroid impacts)
  - `R` (Gold) — Rapid-fire weapon boost
- **Asteroids:** Gray asteroids drift and bounce; Red asteroids use the `withHoming` behavior to slowly track the player ship.

## The `this` Binding Bug & Fix (Milestone 2)
When wiring mouse shooting via `canvas.addEventListener("mousedown", ship.fire)`, passing the unbound method reference causes the browser's event dispatcher to invoke `fire` with `this` bound to the `canvas` DOM element (Rule 3/Default binding), throwing a `TypeError` when accessing private field `#hp` or `this.cooldown`.

### Three Possible Fixes & Trade-offs:
1. **Arrow wrapper `() => ship.fire(world)` (Chosen):** Cleanest when arguments like `world` need to be passed; creates a tiny closure once at setup time.
2. **Explicit `.bind(ship)` (`ship.fire.bind(ship, world)`):** Permanently binds `this` via a new function exotic object; slightly less readable when mixing event arguments with game arguments.
3. **Class field arrow `fire = (world) => { ... }`:** Allocates a separate closure on *every* `Ship` instance rather than sharing one method on `Ship.prototype` (wasteful if hundreds of entities use it).

## Composition over Inheritance Write-Up (Milestone 4)
If we attempted a deep class hierarchy (`Entity → MovingEntity → HomingEntity → HomingBullet` and `HomingAsteroid`), we would hit the classic diamond/duplication problem: `Bullet` (has TTL, ownerId, high speed) and `Asteroid` (has private `#hp`, spin, splitting logic) have completely different state and lifecycles, yet both need **homing** target-tracking behavior. Similarly, a stationary `Pickup` needs collision detection and lifetime updates without thruster or projectile physics.

Instead, we limited inheritance to **one level** (`Ship`, `Bullet`, `Asteroid`, `Explosion` extend `Entity`) and implemented cross-cutting features via **composition**:
- `withHoming(entity, config)` attaches a target-seeking steering function into `entity.behaviors[]`, allowing both player missiles (`KeyE`) and red hunter asteroids to share the exact same homing code.
- `createPickup({ x, y, pickupType })` composes a `pickup` data component onto a base `Entity` without creating a rigid `Pickup` subclass tree.