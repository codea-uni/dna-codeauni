import type { Blast, BlastId, Hole, HoleId, Project } from '../model/types';
import { ChangeSetBuilder, type ChangeSet } from './changeset';
import { applyOp, type Op } from './ops';

export interface HistoryEntry {
  readonly label: string;
  readonly ops: readonly Op[];
  /** Inversas en orden de aplicación para deshacer (ya invertidas). */
  readonly inverse: readonly Op[];
}

export type DocumentListener = (changes: ChangeSet, store: DocumentStore) => void;

/** Recibe el nombre del cambio rechazado por estar el documento en solo lectura. */
export type ReadOnlyListener = (label: string) => void;

export interface HoleLocation {
  readonly blast: Blast;
  readonly hole: Hole;
  readonly index: number;
}

/** Lectura del documento que necesitan los comandos. */
export interface DocumentReader {
  readonly project: Project;
  findHole(id: HoleId): HoleLocation | undefined;
  getBlast(id: BlastId): Blast | undefined;
}

/**
 * Fuente de verdad del proyecto. TS puro: sin React, sin DOM.
 * Toda mutación pasa por `dispatch`, que registra la inversa para undo/redo
 * y notifica un ChangeSet incremental a los suscriptores (engine, UI).
 */
export class DocumentStore implements DocumentReader {
  private _project: Project;
  private _version = 0;
  private readonly undoStack: HistoryEntry[] = [];
  private readonly redoStack: HistoryEntry[] = [];
  private readonly listeners = new Set<DocumentListener>();
  private readonly readOnlyListeners = new Set<ReadOnlyListener>();
  private _readOnly = false;
  private locator: Map<HoleId, { blast: number; index: number }> | null = null;

  constructor(project: Project) {
    this._project = project;
  }

  get project(): Project {
    return this._project;
  }

  /** Aumenta con cada cambio; sirve de clave para selectores y cachés de resultados. */
  get version(): number {
    return this._version;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  get undoLabel(): string | undefined {
    return this.undoStack.at(-1)?.label;
  }

  get redoLabel(): string | undefined {
    return this.redoStack.at(-1)?.label;
  }

  getBlast(id: BlastId): Blast | undefined {
    return this._project.blasts.find((b) => b.id === id);
  }

  findHole(id: HoleId): HoleLocation | undefined {
    this.locator ??= this.buildLocator();
    const loc = this.locator.get(id);
    if (!loc) return undefined;
    const blast = this._project.blasts[loc.blast];
    const hole = blast?.holes[loc.index];
    if (!blast || !hole) return undefined;
    return { blast, hole, index: loc.index };
  }

  /**
   * Solo lectura (rol revisor, guía H-801, o una versión antigua abierta para consulta): el
   * documento se puede cargar y leer, pero no modificar.
   */
  get readOnly(): boolean {
    return this._readOnly;
  }

  setReadOnly(readOnly: boolean): void {
    this._readOnly = readOnly;
  }

  /** Avisa cada intento de cambio rechazado por la solo lectura (para explicárselo al usuario). */
  onReadOnlyAttempt(listener: ReadOnlyListener): () => void {
    this.readOnlyListeners.add(listener);
    return () => {
      this.readOnlyListeners.delete(listener);
    };
  }

  /**
   * Aplica un grupo de operaciones como un solo paso de undo. En solo lectura no aplica nada,
   * avisa a `onReadOnlyAttempt` y devuelve `false`.
   */
  dispatch(ops: Op | readonly Op[], label: string): boolean {
    const list = Array.isArray(ops) ? (ops as readonly Op[]) : [ops as Op];
    if (list.length === 0) return false;
    if (this._readOnly) {
      for (const listener of this.readOnlyListeners) listener(label);
      return false;
    }
    const changes = new ChangeSetBuilder();
    const inverse = this.applyAll(list, changes);
    this.undoStack.push({ label, ops: list, inverse });
    this.redoStack.length = 0;
    this.commit(changes);
    return true;
  }

  undo(): void {
    if (this._readOnly) return;
    const entry = this.undoStack.pop();
    if (!entry) return;
    const changes = new ChangeSetBuilder();
    this.applyAll(entry.inverse, changes);
    this.redoStack.push(entry);
    this.commit(changes);
  }

  redo(): void {
    if (this._readOnly) return;
    const entry = this.redoStack.pop();
    if (!entry) return;
    const changes = new ChangeSetBuilder();
    this.applyAll(entry.ops, changes);
    this.undoStack.push(entry);
    this.commit(changes);
  }

  /** Reemplaza el proyecto completo (nuevo/abrir) y limpia el historial. */
  load(project: Project): void {
    this._project = project;
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    const changes = new ChangeSetBuilder();
    changes.markReset();
    this.commit(changes);
  }

  subscribe(listener: DocumentListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Aplica las operaciones; si alguna falla, restaura el estado previo. Devuelve inversas listas para deshacer. */
  private applyAll(ops: readonly Op[], changes: ChangeSetBuilder): Op[] {
    const before = this._project;
    const inverse: Op[] = [];
    let project = before;
    try {
      for (const op of ops) {
        const r = applyOp(project, op, changes);
        project = r.project;
        inverse.push(r.inverse);
      }
    } catch (err) {
      this._project = before;
      throw err;
    }
    this._project = project;
    return inverse.reverse();
  }

  private commit(changes: ChangeSetBuilder): void {
    const cs = changes.build();
    if (cs.reset || cs.holes.added.length > 0 || cs.holes.removed.length > 0) this.locator = null;
    this._version++;
    for (const listener of this.listeners) listener(cs, this);
  }

  private buildLocator(): Map<HoleId, { blast: number; index: number }> {
    const map = new Map<HoleId, { blast: number; index: number }>();
    this._project.blasts.forEach((blast, b) => {
      blast.holes.forEach((hole, index) => map.set(hole.id, { blast: b, index }));
    });
    return map;
  }
}
