export interface LoopStats {
  stepsPerSecond: number;
  framesPerSecond: number;
  frameTimeMs: number;
}

export interface LoopOptions {
  step?: number;
  simulate: (dt: number) => void;
  render: (alpha: number, stats: LoopStats) => void;
}

export function createLoop({ step = 1 / 60, simulate, render }: LoopOptions) {
  let running = false;
  let rafId = 0;
  let lastTime = 0;
  let accumulator = 0;

  let stepCount = 0;
  let frameCount = 0;
  let statsTimer = 0;
  let stepsPerSecond = 60;
  let framesPerSecond = 60;
  let frameTimeMs = 16.67;

  function frame(now: number): void {
    if (!running) return;

    const rawDelta = (now - lastTime) / 1000;
    lastTime = now;
    frameTimeMs = rawDelta * 1000;

    const delta = Math.min(rawDelta, 0.25);
    accumulator += delta;

    while (accumulator >= step) {
      simulate(step);
      accumulator -= step;
      stepCount++;
    }

    frameCount++;
    statsTimer += rawDelta;
    if (statsTimer >= 1.0) {
      stepsPerSecond = stepCount;
      framesPerSecond = frameCount;
      stepCount = 0;
      frameCount = 0;
      statsTimer -= 1.0;
    }

    const alpha = accumulator / step;
    render(alpha, { stepsPerSecond, framesPerSecond, frameTimeMs });

    rafId = requestAnimationFrame(frame);
  }

  return {
    start(): void {
      if (running) return;
      running = true;
      lastTime = performance.now();
      accumulator = 0;
      rafId = requestAnimationFrame(frame);
    },
    stop(): void {
      running = false;
      cancelAnimationFrame(rafId);
    },
  };
}