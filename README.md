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

---

# Dogfight — Lab 03: Assets, Web Audio API, and Game Lobby

## New Features & Architecture
- **AssetManager (`src/render/assets.js`)**: Asynchronously tracks image and asset loading, calculating a real-time progress ratio (`loadedCount / totalCount`) to drive the HTML progress bar.
- **Web Audio API Sound Engine (`src/render/audio.js`)**: Implements procedural audio synthesis entirely in the browser without external audio files:
  - **Laser Shots:** Sawtooth oscillator with exponential frequency drop-off (`880Hz → 110Hz`).
  - **Explosions:** White noise buffer routed through a low-pass biquad filter with linear frequency decay.
  - **Pickups:** Sine oscillator with rising frequency sweep (`440Hz → 880Hz`).
- **Game Lobby & Overlay (`index.html`, `style.css`)**: Blocks the simulation loop until the asset manager completes loading and the user explicitly clicks the "PLAY GAME" button (fulfilling browser autoplay policies requiring a user gesture before starting `AudioContext`).

---

## Milestone Technical Write-Up (Lab 03)

### 1. Handling Browser Autoplay Policies with Web Audio API
Modern browsers block `AudioContext` creation or automatic resumption until a direct user gesture (such as a click on the "PLAY GAME" button) occurs. In `src/main.js`, we initialize and resume the `AudioContext` only inside the `startBtn.addEventListener("click", ...)` callback. This ensures sound effects fire reliably without triggering `DOMException` errors in the console.

### 2. Procedural vs. Static Audio Assets
Rather than packing heavy `.mp3` or `.wav` files that introduce network latency and loading overhead, Lab 03 utilizes procedural synthesis via native oscillators and noise buffers. This guarantees instant asset readiness, zero memory bloat, and programmatic flexibility (e.g., dynamically shifting pitch and decay parameters based on game events).

---

# Dogfight — Lab 04: Node.js, EventEmitter, Streams, and WebSockets

## Server Architecture & New Features
- **Node.js WebSocket Server (`server/server.js`)**: Built using the `ws` library and native Node.js HTTP server to handle real-time bidirectional communication with clients.
- **Game Room Management (`server/gameRoom.js`)**: Extends Node's native `EventEmitter` class to emit and listen to custom events (`join`, `leave`), tracking client states and game entities inside an isolated room instance.
- **File System Streams (`server/server.js`)**: Utilizes `fs.createWriteStream()` to asynchronously log connection events (`gameLog.txt`) without blocking the event loop.
- **Client-Server Synchronization (`src/main.js`)**: Establishes a WebSocket connection (`ws://localhost:8080`) upon clicking "PLAY GAME", continuously streaming player input and ship positioning to the server.

---

## Milestone Technical Write-Up (Lab 04)

### 1. EventEmitter Pattern in Server Rooms
The `GameRoom` class inherits from `EventEmitter`, cleanly decoupling network transport from game event handling. When a client connects or disconnects, the room emits lifecycle events (`join`, `leave`), triggering asynchronous log writers and console notifications independently.

### 2. Non-Blocking File Logging via Streams
Using `fs.createWriteStream` instead of synchronous file writes (`fs.appendFileSync`) ensures that high-frequency client requests or heavy tick loops do not block the Node.js event loop, maintaining smooth server-side performance and efficient I/O handling.

---

# Dogfight — Lab 05: Real-Time Multiplayer, Binary Protocol (`ArrayBuffer`), and Network Interpolation

## New Multiplayer & Networking Features
- **Binary Telemetry Protocol (`src/net/protocol.js`)**: Encodes high-frequency player input/state into a fixed **14-byte `ArrayBuffer`** using `DataView` (`1B` message type, `1B` bitmask flags for thrust/fire, and `3 × Float32` for `x`, `y`, `angle` in little-endian format).
- **Live Protocol Toggle (`KeyB`)**: Press **B** during gameplay to dynamically switch between **Binary (14B)** and **JSON (~82B)** serialization and observe protocol state in the HUD.
- **Remote Player Interpolation (`src/main.js`, `src/render/draw.js`)**: Smoothly interpolates remote ships between 20 Hz server snapshots (`50 ms` intervals) up to the client's 144 Hz refresh rate using `lerp` and `lerpAngle`.
- **RTT Ping Telemetry**: Measures round-trip latency (`ping RTT ms`) via timestamped `ping`/`pong` control frames.

---

## Milestone Technical Write-Up & Measurements (Lab 05)

### 1. Binary (`ArrayBuffer` / `DataView`) vs. JSON Bandwidth Comparison
At a 60 Hz client send rate:
- **JSON Payload:** `{"type":"input","x":612.45,"y":398.12,"angle":-1.5708,"thrust":true,"firing":false}` averages **~82–90 bytes** per packet (`~5.1 KB/s` upstream per client).
- **Binary Payload:** Fixed **14 bytes** per packet (`0.84 KB/s` upstream per client).
- **Result:** Binary encoding achieves an **~83% reduction in payload size** and eliminates `JSON.stringify` / `JSON.parse` garbage-collection pressure on both client and server.

### 2. Why Remote Entities Need Interpolation
The server broadcasts room snapshots at `20 Hz` (every `50 ms`), while the local display renders at `144 Hz` (every `6.94 ms`). Rendering remote players directly at their latest snapshot coordinates causes visible 20 FPS stutter. By treating incoming snapshot coordinates as `targetX / targetY / targetAngle` and smoothly converging `renderX / renderY / renderAngle` each frame, remote ships move fluidly even under network jitter.