import type { BlastId, HoleId } from '../model/types';

/**
 * Resumen de lo que cambió en una operación de documento. Los consumidores (engine, paneles)
 * lo usan para actualizarse de forma incremental.
 */
export interface ChangeSet {
  /** El proyecto se reemplazó por completo (nuevo/abrir): hay que reconstruir todo. */
  readonly reset: boolean;
  readonly holes: {
    readonly added: readonly HoleId[];
    readonly removed: readonly HoleId[];
    readonly updated: readonly HoleId[];
  };
  /** Cambió la lista de patrones de alguna voladura. */
  readonly patterns: boolean;
  /** Voladuras con cambios en sus campos propios (banco, perímetro, nombre…). */
  readonly blasts: readonly BlastId[];
}

type HoleChange = 'added' | 'removed' | 'updated';

/** Acumula cambios de varias operaciones colapsando secuencias (agregar+borrar = nada). */
export class ChangeSetBuilder {
  private readonly holes = new Map<HoleId, HoleChange>();
  private readonly blasts = new Set<BlastId>();
  private patterns = false;
  private reset = false;

  holeAdded(id: HoleId): void {
    this.holes.set(id, this.holes.get(id) === 'removed' ? 'updated' : 'added');
  }

  holeRemoved(id: HoleId): void {
    if (this.holes.get(id) === 'added') this.holes.delete(id);
    else this.holes.set(id, 'removed');
  }

  holeUpdated(id: HoleId): void {
    if (!this.holes.has(id)) this.holes.set(id, 'updated');
  }

  patternsChanged(): void {
    this.patterns = true;
  }

  blastChanged(id: BlastId): void {
    this.blasts.add(id);
  }

  markReset(): void {
    this.reset = true;
  }

  get isEmpty(): boolean {
    return !this.reset && !this.patterns && this.holes.size === 0 && this.blasts.size === 0;
  }

  build(): ChangeSet {
    const added: HoleId[] = [];
    const removed: HoleId[] = [];
    const updated: HoleId[] = [];
    for (const [id, change] of this.holes) {
      if (change === 'added') added.push(id);
      else if (change === 'removed') removed.push(id);
      else updated.push(id);
    }
    return {
      reset: this.reset,
      holes: { added, removed, updated },
      patterns: this.patterns,
      blasts: [...this.blasts],
    };
  }
}
