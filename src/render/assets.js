export class AssetManager {
  constructor() {
    this.images = new Map();
    this.audioBuffers = new Map();
    this.totalCount = 0;
    this.loadedCount = 0;
  }

  loadImage(key, src) {
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

  getImage(key) {
    return this.images.get(key) || null;
  }

  get progress() {
    if (this.totalCount === 0) return 1;
    return this.loadedCount / this.totalCount;
  }

  get isLoaded() {
    return this.loadedCount >= this.totalCount;
  }
}

export const assets = new AssetManager();