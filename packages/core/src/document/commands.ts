import { lengthToFloor } from '../geometry/hole';
import type {
  Blast,
  BlastId,
  Hole,
  HoleId,
  Meters,
  Pattern,
  Polygon2,
  Radians,
} from '../model/types';
import type { DocumentReader } from './DocumentStore';
import type { Op } from './ops';

/**
 * Comandos de edición: traducen una intención del usuario a operaciones primitivas.
 * No mutan nada; el resultado se pasa a `DocumentStore.dispatch`.
 */

function groupByBlast(doc: DocumentReader, ids: Iterable<HoleId>): Map<BlastId, Hole[]> {
  const groups = new Map<BlastId, Hole[]>();
  for (const id of ids) {
    const loc = doc.findHole(id);
    if (!loc) continue;
    let list = groups.get(loc.blast.id);
    if (!list) groups.set(loc.blast.id, (list = []));
    list.push(loc.hole);
  }
  return groups;
}

export function addHoles(blastId: BlastId, holes: readonly Hole[]): Op[] {
  if (holes.length === 0) return [];
  return [{ type: 'holes/insert', blastId, entries: holes.map((item) => ({ item })) }];
}

export function deleteHoles(doc: DocumentReader, ids: Iterable<HoleId>): Op[] {
  return [...groupByBlast(doc, ids)].map(([blastId, holes]) => ({
    type: 'holes/remove',
    blastId,
    ids: holes.map((h) => h.id),
  }));
}

/** Desplaza taladros en planta (la cota de boca no cambia, así que la longitud tampoco). */
export function moveHoles(
  doc: DocumentReader,
  ids: Iterable<HoleId>,
  dx: Meters,
  dy: Meters,
): Op[] {
  if (dx === 0 && dy === 0) return [];
  return [...groupByBlast(doc, ids)].map(([blastId, holes]) => ({
    type: 'holes/replace',
    blastId,
    holes: holes.map((h) => ({
      ...h,
      collar: { x: h.collar.x + dx, y: h.collar.y + dy, z: h.collar.z },
    })),
  }));
}

/** Campos editables desde el panel de propiedades (SI). */
export interface HoleEdit {
  label?: string;
  x?: Meters;
  y?: Meters;
  z?: Meters;
  diameter?: Meters;
  length?: Meters;
  inclination?: Radians;
  azimuth?: Radians;
  subdrill?: Meters;
}

/**
 * Aplica una edición a cada taladro. Si cambian cota de boca, inclinación o sobreperforación
 * y no se indica longitud, la longitud se recalcula para llegar a piso + sobreperforación.
 */
export function applyHoleEdit(hole: Hole, edit: HoleEdit, blast: Pick<Blast, 'bench'>): Hole {
  const next: Hole = {
    ...hole,
    collar: { x: edit.x ?? hole.collar.x, y: edit.y ?? hole.collar.y, z: edit.z ?? hole.collar.z },
  };
  if (edit.label !== undefined) next.label = edit.label;
  if (edit.diameter !== undefined) next.diameter = edit.diameter;
  if (edit.inclination !== undefined) next.inclination = edit.inclination;
  if (edit.azimuth !== undefined) next.azimuth = edit.azimuth;
  if (edit.subdrill !== undefined) next.subdrill = edit.subdrill;
  if (edit.length !== undefined) {
    next.length = edit.length;
  } else if (
    edit.z !== undefined ||
    edit.inclination !== undefined ||
    edit.subdrill !== undefined
  ) {
    next.length = lengthToFloor(
      next.collar.z,
      blast.bench.floorElevation,
      next.subdrill,
      next.inclination,
    );
  }
  return next;
}

export function editHoles(doc: DocumentReader, ids: Iterable<HoleId>, edit: HoleEdit): Op[] {
  const ops: Op[] = [];
  for (const [blastId, holes] of groupByBlast(doc, ids)) {
    const blast = doc.getBlast(blastId);
    if (!blast) continue;
    ops.push({
      type: 'holes/replace',
      blastId,
      holes: holes.map((h) => applyHoleEdit(h, edit, blast)),
    });
  }
  return ops;
}

export function addPattern(blastId: BlastId, pattern: Pattern, holes: readonly Hole[]): Op[] {
  return [
    { type: 'patterns/insert', blastId, entries: [{ item: pattern }] },
    ...addHoles(blastId, holes),
  ];
}

export function setBlastBoundary(blastId: BlastId, boundary: Polygon2 | undefined): Op[] {
  return [{ type: 'blast/patch', blastId, patch: { boundary } }];
}
