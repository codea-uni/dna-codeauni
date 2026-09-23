import type { HoleId } from '../model/types';

export type SelectionListener = (ids: ReadonlySet<HoleId>) => void;

/** Selección de taladros. TS puro, observada por el engine y por la UI. */
export class SelectionStore {
  private _ids: ReadonlySet<HoleId> = new Set();
  private _version = 0;
  private readonly listeners = new Set<SelectionListener>();

  get ids(): ReadonlySet<HoleId> {
    return this._ids;
  }

  get size(): number {
    return this._ids.size;
  }

  get version(): number {
    return this._version;
  }

  has(id: HoleId): boolean {
    return this._ids.has(id);
  }

  set(ids: Iterable<HoleId>): void {
    const next = new Set(ids);
    if (next.size === this._ids.size && [...next].every((id) => this._ids.has(id))) return;
    this.emit(next);
  }

  add(ids: Iterable<HoleId>): void {
    const next = new Set(this._ids);
    for (const id of ids) next.add(id);
    if (next.size !== this._ids.size) this.emit(next);
  }

  remove(ids: Iterable<HoleId>): void {
    const next = new Set(this._ids);
    for (const id of ids) next.delete(id);
    if (next.size !== this._ids.size) this.emit(next);
  }

  /** Invierte la pertenencia de cada id. */
  toggle(ids: Iterable<HoleId>): void {
    const next = new Set(this._ids);
    let changed = false;
    for (const id of ids) {
      if (next.has(id)) next.delete(id);
      else next.add(id);
      changed = true;
    }
    if (changed) this.emit(next);
  }

  clear(): void {
    if (this._ids.size > 0) this.emit(new Set());
  }

  subscribe(listener: SelectionListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(next: ReadonlySet<HoleId>): void {
    this._ids = next;
    this._version++;
    for (const listener of this.listeners) listener(next);
  }
}
