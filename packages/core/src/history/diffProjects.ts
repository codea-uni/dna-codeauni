import type { Blast, BlastId, Hole, HoleId, Project } from '../model/types';

/**
 * Diferencias entre dos versiones de un proyecto (historial de la mina, D-14). No es un cálculo
 * minero: compara datos del diseño. Los taladros y voladuras se emparejan por `id`, que es estable
 * (uuidv7) al mover o editar.
 */

export interface DiffOptions {
  /**
   * Desplazamiento mínimo del collar para contar un taladro como movido [m]. Supuesto S-12
   * (`docs/QUESTIONS.md` §2): 0,01 m, bajo la precisión del replanteo en campo.
   */
  moveTolerance: number;
}

export const DEFAULT_DIFF_OPTIONS: DiffOptions = { moveTolerance: 0.01 };

/** Grupos de campos de un taladro que pueden cambiar entre versiones. */
export type HoleChangeKind = 'moved' | 'geometry' | 'charge' | 'timing' | 'other';

export interface HoleDiff {
  id: HoleId;
  label: string;
  kind: 'added' | 'removed' | 'changed';
  /** Distancia entre collares [m] si se movió más que la tolerancia; si no, 0. */
  moved: number;
  changes: HoleChangeKind[];
}

export interface BlastDiff {
  id: BlastId;
  name: string;
  kind: 'added' | 'removed' | 'changed' | 'unchanged';
  /** Campos propios de la voladura que cambiaron (banco, perímetros, amarre…). */
  fields: string[];
  /** Solo los taladros agregados, quitados o con cambios. */
  holes: HoleDiff[];
}

/** Conteos para listar el historial sin cargar las versiones. */
export interface DiffSummary {
  blastsAdded: number;
  blastsRemoved: number;
  holesAdded: number;
  holesRemoved: number;
  holesMoved: number;
  /** Diámetro, largo, inclinación, azimut o sobreperforación. */
  holesGeometry: number;
  /** Tramos de carga. */
  holesCharge: number;
  /** Iniciadores dentro del taladro (detonadores, retardos de fondo). */
  holesTiming: number;
  /** Otros datos del taladro: etiqueta, grupo, agua, estado… */
  holesOther: number;
  /** Campos de voladura cambiados en alguna voladura (sin repetir). */
  blastFields: string[];
  /** Campos del proyecto cambiados (nombre, CRS, librería…). */
  projectFields: string[];
}

export interface ProjectDiff {
  blasts: BlastDiff[];
  projectFields: string[];
  summary: DiffSummary;
}

/** Igualdad estructural de valores JSON (objetos planos, arreglos y primitivos). */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
    return true;
  }
  const ka = Object.keys(a).filter((k) => (a as Record<string, unknown>)[k] !== undefined);
  const kb = Object.keys(b).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
  if (ka.length !== kb.length) return false;
  for (const k of ka)
    if (!deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
      return false;
  return true;
}

const PROJECT_FIELDS = [
  'name',
  'description',
  'currency',
  'coordinateSystem',
  'library',
  'rockMasses',
  'siteModels',
  'surfaces',
  'monitoringPoints',
  'ppvLimits',
  'scenarios',
  'displayUnits',
] as const satisfies readonly (keyof Project)[];

const BLAST_FIELDS = [
  'name',
  'status',
  'bench',
  'rockMassId',
  'boundaries',
  'freeFaces',
  'groups',
  'patterns',
  'initiation',
  'calcParams',
  'notes',
] as const satisfies readonly (keyof Blast)[];

const GEOMETRY_FIELDS = [
  'diameter',
  'length',
  'inclination',
  'azimuth',
  'subdrill',
] as const satisfies readonly (keyof Hole)[];

const OTHER_HOLE_FIELDS = [
  'label',
  'patternId',
  'row',
  'col',
  'groupId',
  'water',
  'status',
  'actual',
  'tags',
] as const satisfies readonly (keyof Hole)[];

function changedFields<T, K extends keyof T>(a: T, b: T, fields: readonly K[]): K[] {
  return fields.filter((f) => !deepEqual(a[f], b[f]));
}

function diffHole(before: Hole, after: Hole, options: DiffOptions): HoleDiff | null {
  const dx = after.collar.x - before.collar.x;
  const dy = after.collar.y - before.collar.y;
  const dz = after.collar.z - before.collar.z;
  const distance = Math.hypot(dx, dy, dz);
  const moved = distance > options.moveTolerance ? distance : 0;
  const changes: HoleChangeKind[] = [];
  if (moved > 0) changes.push('moved');
  if (changedFields(before, after, GEOMETRY_FIELDS).length) changes.push('geometry');
  if (!deepEqual(before.decks, after.decks)) changes.push('charge');
  if (!deepEqual(before.initiators, after.initiators)) changes.push('timing');
  if (changedFields(before, after, OTHER_HOLE_FIELDS).length) changes.push('other');
  if (changes.length === 0) return null;
  return { id: after.id, label: after.label, kind: 'changed', moved, changes };
}

const added = (h: Hole): HoleDiff => ({
  id: h.id,
  label: h.label,
  kind: 'added',
  moved: 0,
  changes: [],
});
const removed = (h: Hole): HoleDiff => ({ ...added(h), kind: 'removed' });

function diffBlast(before: Blast, after: Blast, options: DiffOptions): BlastDiff {
  const fields: string[] = changedFields(before, after, BLAST_FIELDS);
  const holes: HoleDiff[] = [];
  const old = new Map(before.holes.map((h) => [h.id, h]));
  for (const h of after.holes) {
    const prev = old.get(h.id);
    if (!prev) holes.push(added(h));
    else {
      old.delete(h.id);
      const d = diffHole(prev, h, options);
      if (d) holes.push(d);
    }
  }
  for (const h of old.values()) holes.push(removed(h));
  const kind = fields.length || holes.length ? 'changed' : 'unchanged';
  return { id: after.id, name: after.name, kind, fields, holes };
}

/** Qué cambió de `before` a `after`. O(n) sobre taladros: en el navegador va en el worker. */
export function diffProjects(
  before: Project,
  after: Project,
  options: DiffOptions = DEFAULT_DIFF_OPTIONS,
): ProjectDiff {
  const blasts: BlastDiff[] = [];
  const old = new Map(before.blasts.map((b) => [b.id, b]));
  for (const b of after.blasts) {
    const prev = old.get(b.id);
    if (!prev)
      blasts.push({ id: b.id, name: b.name, kind: 'added', fields: [], holes: b.holes.map(added) });
    else {
      old.delete(b.id);
      blasts.push(diffBlast(prev, b, options));
    }
  }
  for (const b of old.values())
    blasts.push({
      id: b.id,
      name: b.name,
      kind: 'removed',
      fields: [],
      holes: b.holes.map(removed),
    });

  const projectFields: string[] = changedFields(before, after, PROJECT_FIELDS);
  const holes = blasts.flatMap((b) => b.holes);
  const count = (kind: HoleChangeKind) => holes.filter((h) => h.changes.includes(kind)).length;
  const summary: DiffSummary = {
    blastsAdded: blasts.filter((b) => b.kind === 'added').length,
    blastsRemoved: blasts.filter((b) => b.kind === 'removed').length,
    holesAdded: holes.filter((h) => h.kind === 'added').length,
    holesRemoved: holes.filter((h) => h.kind === 'removed').length,
    holesMoved: count('moved'),
    holesGeometry: count('geometry'),
    holesCharge: count('charge'),
    holesTiming: count('timing'),
    holesOther: count('other'),
    blastFields: [...new Set(blasts.flatMap((b) => b.fields))].sort(),
    projectFields,
  };
  return { blasts, projectFields, summary };
}

/** `true` si el resumen no registra ningún cambio. */
export function isEmptyDiff(s: DiffSummary): boolean {
  return (
    s.blastsAdded + s.blastsRemoved + s.holesAdded + s.holesRemoved === 0 &&
    s.holesMoved + s.holesGeometry + s.holesCharge + s.holesTiming + s.holesOther === 0 &&
    s.blastFields.length === 0 &&
    s.projectFields.length === 0
  );
}
