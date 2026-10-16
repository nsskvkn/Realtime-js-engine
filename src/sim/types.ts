// --- BRANDED TYPES (Section 5: Zero runtime cost compile-time safety) ---
export type EntityId = number & { readonly __brand: "EntityId" };
export type Tick = number & { readonly __brand: "Tick" };
export type Seq = number & { readonly __brand: "Seq" };

export function asEntityId(n: number): EntityId {
  return n as EntityId; // Justified cast: brand constructor for EntityId
}

export function asTick(n: number): Tick {
  return n as Tick; // Justified cast: brand constructor for Tick
}

export function asSeq(n: number): Seq {
  return n as Seq; // Justified cast: brand constructor for Seq
}

// --- ENTITY KINDS (Literal Union instead of enum for Node type-stripping compatibility) ---
export const ENTITY_KINDS = ["ship", "bullet", "asteroid", "pickup", "explosion"] as const;
export type EntityKind = (typeof ENTITY_KINDS)[number];

// --- GENERIC TYPED EVENT BUS (Section 4) ---
export type GameEvents = {
  fired: { shooter: EntityId; homing: boolean };
  hit: { target: EntityId; damage: number };
  pickupCollected: { shipId: EntityId; pickupType: "shield" | "rapidFire" };
};

export class Bus<E extends Record<string, unknown>> {
  #listeners = new Map<keyof E, Set<(payload: never) => void>>();

  on<K extends keyof E>(name: K, fn: (payload: E[K]) => void): () => void {
    let set = this.#listeners.get(name);
    if (!set) {
      set = new Set();
      this.#listeners.set(name, set);
    }
    const typedFn = fn as (payload: never) => void; // Justified cast: internal heterogeneous listener storage
    set.add(typedFn);
    return () => {
      set?.delete(typedFn);
    };
  }

  emit<K extends keyof E>(name: K, payload: E[K]): void {
    const set = this.#listeners.get(name);
    if (!set) return;
    for (const fn of set) {
      (fn as (p: E[K]) => void)(payload); // Justified cast: restored K payload type from map
    }
  }
}

export const gameBus = new Bus<GameEvents>();