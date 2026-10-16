export class AssetManager {
  images = new Map<string, HTMLImageElement>();
  totalCount = 0;
  loadedCount = 0;

  loadImage(key: string, src: string): void {
    this.totalCount++;
    const img = new Image();
    img.src = src;
    img.onload = () => {
      this.loadedCount++;
      this.images.set(key, img);
    };
    img.onerror = () => {
      this.loadedCount++;
      console.warn(`Failed to load image: ${src}`);
    };
  }

  getImage(key: string): HTMLImageElement | null {
    return this.images.get(key) ?? null;
  }

  get progress(): number {
    if (this.totalCount === 0) return 1;
    return this.loadedCount / this.totalCount;
  }

  get isLoaded(): boolean {
    return this.loadedCount >= this.totalCount;
  }
}

export const assets = new AssetManager();