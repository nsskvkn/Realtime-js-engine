export function createLoop({ step = 1 / 60, simulate, render }) {
  let rafId = null;
  let running = false;
  let accumulator = 0;
  let last = 0;

  let stepCounter = 0;
  let frameCounter = 0;
  let metricsWindowStart = 0;

  const stats = {
    stepsPerSecond: 0,
    framesPerSecond: 0,
    frameTimeMs: 0,
  };

  function frame(now) {
    if (!running) return;

    const rawDtMs = now - last;
    last = now;
    stats.frameTimeMs = rawDtMs;

    const dt = Math.min(rawDtMs / 1000, 0.25);
    accumulator += dt;

    while (accumulator >= step) {
      simulate(step);
      accumulator -= step;
      stepCounter += 1;
    }

    frameCounter += 1;

    const elapsedWindow = now - metricsWindowStart;
    if (elapsedWindow >= 1000) {
      stats.stepsPerSecond = Math.round((stepCounter * 1000) / elapsedWindow);
      stats.framesPerSecond = Math.round((frameCounter * 1000) / elapsedWindow);
      stepCounter = 0;
      frameCounter = 0;
      metricsWindowStart = now;
    }

    const alpha = accumulator / step;
    render(alpha, stats);

    rafId = requestAnimationFrame(frame);
  }

  function start() {
    if (running) return;
    running = true;
    const now = performance.now();
    last = now;
    metricsWindowStart = now;
    accumulator = 0;
    rafId = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  return { start, stop, stats };
}