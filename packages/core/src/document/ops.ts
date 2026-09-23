import type { Blast, BlastId, Hole, HoleId, Pattern, PatternId, Project } from '../model/types';
import type { ChangeSetBuilder } from './changeset';

/** Elemento a insertar. `index` es la posición final en la lista; sin índice se agrega al final. */
export interface IndexedEntry<T> {
  readonly index?: number;
  readonly item: T;
}

/** Campos del proyecto modificables con `project/patch` (las voladuras tienen sus propias ops). */
export type ProjectFields = Pick<
  Project,
  | 'name'
  | 'description'
  | 'currency'
  | 'library'
  | 'rockMasses'
  | 'siteModels'
  | 'displayUnits'
  | 'coordinateSystem'
>;
export type ProjectPatch = { readonly [K in keyof ProjectFields]?: ProjectFields[K] | undefined };

/** Campos propios de una voladura modificables con `blast/patch`. */
export type BlastFields = Omit<Blast, 'id' | 'holes' | 'patterns'>;
/** `undefined` en un campo opcional significa eliminarlo. */
export type BlastPatch = { readonly [K in keyof BlastFields]?: BlastFields[K] | undefined };

/**
 * Operaciones primitivas del documento. Cada una tiene inversa exacta,
 * lo que da undo/redo sin copiar el proyecto entero.
 */
export type Op =
  | {
      readonly type: 'holes/insert';
      readonly blastId: BlastId;
      readonly entries: readonly IndexedEntry<Hole>[];
    }
  | { readonly type: 'holes/remove'; readonly blastId: BlastId; readonly ids: readonly HoleId[] }
  | { readonly type: 'holes/replace'; readonly blastId: BlastId; readonly holes: readonly Hole[] }
  | {
      readonly type: 'patterns/insert';
      readonly blastId: BlastId;
      readonly entries: readonly IndexedEntry<Pattern>[];
    }
  | {
      readonly type: 'patterns/remove';
      readonly blastId: BlastId;
      readonly ids: readonly PatternId[];
    }
  | { readonly type: 'blast/patch'; readonly blastId: BlastId; readonly patch: BlastPatch }
  | { readonly type: 'project/patch'; readonly patch: ProjectPatch };

export interface OpResult {
  readonly project: Project;
  readonly inverse: Op;
}

interface WithId {
  readonly id: string;
}

/** Inserta respetando las posiciones finales indicadas (entradas indexadas en orden ascendente). O(n). */
function insertEntries<T>(list: readonly T[], entries: readonly IndexedEntry<T>[]): T[] {
  const indexed = entries
    .filter((e) => e.index !== undefined)
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const appended = entries.filter((e) => e.index === undefined).map((e) => e.item);
  const total = list.length + indexed.length;
  const out: T[] = [];
  let src = 0;
  let k = 0;
  for (let i = 0; i < total; i++) {
    const next = indexed[k];
    if (next?.index === i) {
      out.push(next.item);
      k++;
    } else if (src < list.length) {
      out.push(list[src++] as T);
    } else if (next) {
      // Índice mayor que la longitud final: se agrega al final en orden.
      out.push(next.item);
      k++;
    }
  }
  return out.concat(appended);
}

/** Quita por id devolviendo las entradas removidas con su índice original (para la inversa). */
function removeIds<T extends WithId>(
  list: readonly T[],
  ids: readonly string[],
): { list: T[]; removed: IndexedEntry<T>[] } {
  const set = new Set(ids);
  const kept: T[] = [];
  const removed: IndexedEntry<T>[] = [];
  list.forEach((item, index) => {
    if (set.has(item.id)) removed.push({ index, item });
    else kept.push(item);
  });
  return { list: kept, removed };
}

function replaceById<T extends WithId>(
  list: readonly T[],
  items: readonly T[],
): { list: T[]; previous: T[] } {
  const byId = new Map(items.map((it) => [it.id, it]));
  const previous: T[] = [];
  const out = list.map((old) => {
    const next = byId.get(old.id);
    if (!next) return old;
    previous.push(old);
    return next;
  });
  return { list: out, previous };
}

/** Aplica un parche de campos (`undefined` elimina la clave) y devuelve el parche inverso. */
function patchObject<T extends object, P extends object>(
  obj: T,
  patch: P,
): { next: T; inverse: P } {
  const keys = new Set(Object.keys(patch));
  const next: Record<string, unknown> = {};
  const inverse: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) if (!keys.has(key)) next[key] = value;
  for (const key of keys) {
    inverse[key] = (obj as Record<string, unknown>)[key];
    const value = (patch as Record<string, unknown>)[key];
    if (value !== undefined) next[key] = value;
  }
  return { next: next as T, inverse: inverse as P };
}

function withBlast(project: Project, blastId: BlastId, fn: (blast: Blast) => Blast): Project {
  const index = project.blasts.findIndex((b) => b.id === blastId);
  const blast = project.blasts[index];
  if (!blast) throw new Error(`Voladura inexistente: ${blastId}`);
  const blasts = project.blasts.slice();
  blasts[index] = fn(blast);
  return { ...project, blasts };
}

/** Aplica una operación de forma inmutable y devuelve el proyecto nuevo y la operación inversa. */
export function applyOp(project: Project, op: Op, changes: ChangeSetBuilder): OpResult {
  if (op.type === 'project/patch') {
    const r = patchObject(project, op.patch);
    changes.projectChanged();
    return { project: r.next, inverse: { type: 'project/patch', patch: r.inverse } };
  }
  let inverse: Op | undefined;
  const next = withBlast(project, op.blastId, (blast) => {
    switch (op.type) {
      case 'holes/insert': {
        const existing = new Set(blast.holes.map((h) => h.id));
        for (const e of op.entries) {
          if (existing.has(e.item.id)) throw new Error(`Taladro duplicado: ${e.item.id}`);
          changes.holeAdded(e.item.id);
        }
        inverse = {
          type: 'holes/remove',
          blastId: op.blastId,
          ids: op.entries.map((e) => e.item.id),
        };
        return { ...blast, holes: insertEntries(blast.holes, op.entries) };
      }
      case 'holes/remove': {
        const { list, removed } = removeIds(blast.holes, op.ids);
        for (const e of removed) changes.holeRemoved(e.item.id);
        inverse = { type: 'holes/insert', blastId: op.blastId, entries: removed };
        return { ...blast, holes: list };
      }
      case 'holes/replace': {
        const { list, previous } = replaceById(blast.holes, op.holes);
        for (const h of previous) changes.holeUpdated(h.id);
        inverse = { type: 'holes/replace', blastId: op.blastId, holes: previous };
        return { ...blast, holes: list };
      }
      case 'patterns/insert': {
        changes.patternsChanged();
        inverse = {
          type: 'patterns/remove',
          blastId: op.blastId,
          ids: op.entries.map((e) => e.item.id),
        };
        return { ...blast, patterns: insertEntries(blast.patterns, op.entries) };
      }
      case 'patterns/remove': {
        const { list, removed } = removeIds(blast.patterns, op.ids);
        changes.patternsChanged();
        inverse = { type: 'patterns/insert', blastId: op.blastId, entries: removed };
        return { ...blast, patterns: list };
      }
      case 'blast/patch': {
        const r = patchObject(blast, op.patch);
        changes.blastChanged(op.blastId);
        inverse = { type: 'blast/patch', blastId: op.blastId, patch: r.inverse };
        return r.next;
      }
    }
  });
  if (!inverse) throw new Error('Operación sin inversa');
  return { project: next, inverse };
}
