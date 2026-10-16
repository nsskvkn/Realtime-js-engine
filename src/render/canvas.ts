export function setupCanvas(
  canvas: HTMLCanvasElement,
  onResize?: (width: number, height: number) => void
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("2D context not available");
  }

  function resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const width = window.innerWidth || document.documentElement.clientWidth || 800;
    const height = window.innerHeight || document.documentElement.clientHeight || 600;

    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    ctx!.setTransform(1, 0, 0, 1, 0, 0);
    ctx!.scale(dpr, dpr);

    if (onResize) {
      onResize(width, height);
    }
  }

  window.addEventListener("resize", resize);
  resize();

  return { ctx, resize };
}