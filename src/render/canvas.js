export function setupCanvas(canvas, onResize) {
  const ctx = canvas.getContext("2d");

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const width = window.innerWidth || document.documentElement.clientWidth || 800;
    const height = window.innerHeight || document.documentElement.clientHeight || 600;

    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    // Скидаємо трансформацію перед новим масштабуванням
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);

    if (onResize) {
      onResize(width, height);
    }
  }

  window.addEventListener("resize", resize);
  // Викликаємо resize одразу після підключення
  resize();

  return { ctx, resize };
}