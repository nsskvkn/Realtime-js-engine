export class ObjectPool<T> {
  readonly #free: T[] = [];
  readonly #factory: () => T;
  readonly #reset: (item: T) => void;
  #totalAllocated = 0;
  #reusedCount = 0;

  constructor(factory: () => T, reset: (item: T) => void, initialSize = 64) {
    this.#factory = factory;
    this.#reset = reset;
    for (let i = 0; i < initialSize; i++) {
      this.#free.push(this.#factory());
      this.#totalAllocated++;
    }
  }

  acquire(): T {
    const item = this.#free.pop();
    if (item !== undefined) {
      this.#reusedCount++;
      this.#reset(item);
      return item;
    }
    this.#totalAllocated++;
    return this.#factory();
  }

  release(item: T): void {
    this.#free.push(item);
  }

  get stats() {
    return {
      available: this.#free.length,
      totalAllocated: this.#totalAllocated,
      reusedCount: this.#reusedCount,
    };
  }
}