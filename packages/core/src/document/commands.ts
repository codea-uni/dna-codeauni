import { applyChargeRule as chargeRuleDecks } from '../charging/charge';
import { lengthToFloor } from '../geometry/hole';
import { newId } from '../model/ids';
import type {
  Blast,
  BlastBoundary,
  BlastId,
  BoundaryId,
  ChargeRule,
  ConnectionId,
  Deck,
  DetonatorId,
  Hole,
  HoleId,
  InitiationPlan,
  Meters,
  MonitoringPoint,
  MonitoringPointId,
  NodeRef,
  Pattern,
  PatternId,
  Polygon2,
  ProductLibrary,
  Radians,
  RockMass,
  Scenario,
  ScenarioId,
  Seconds,
  SiteModels,
  SurfaceConnectorId,
  Vec3,
} from '../model/types';
import { withDownholeDetonator } from '../timing/tieUp';
import type { DocumentReader } from './DocumentStore';
import type { Op } from './ops';
import { holeBench, holeBoundary } from '../geometry/boundary';

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

const refersTo = (ref: NodeRef, ids: ReadonlySet<string>) =>
  ref.kind === 'hole' && ids.has(ref.holeId);

/** Borra taladros y, con ellos, las conexiones y puntos de inicio que los referencian. */
export function deleteHoles(doc: DocumentReader, ids: Iterable<HoleId>): Op[] {
  const ops: Op[] = [];
  for (const [blastId, holes] of groupByBlast(doc, ids)) {
    const removed = new Set<string>(holes.map((h) => h.id));
    const plan = doc.getBlast(blastId)?.initiation;
    if (plan) {
      const connections = plan.connections.filter(
        (c) => !refersTo(c.from, removed) && !refersTo(c.to, removed),
      );
      const initiationPoints = plan.initiationPoints.filter((p) => !refersTo(p.at, removed));
      if (
        connections.length !== plan.connections.length ||
        initiationPoints.length !== plan.initiationPoints.length
      ) {
        ops.push({
          type: 'blast/patch',
          blastId,
          patch: { initiation: { ...plan, connections, initiationPoints } },
        });
      }
    }
    ops.push({ type: 'holes/remove', blastId, ids: holes.map((h) => h.id) });
  }
  return ops;
}

/**
 * Desplaza taladros en planta. Sin `ground`, la cota de boca no cambia (ni la longitud); con
 * `ground` (banco sobre topografía), la boca toma la cota del terreno en su nuevo lugar y la
 * longitud se recalcula hasta piso + sobreperforación. Fuera del terreno, la cota se conserva.
 */
export function moveHoles(
  doc: DocumentReader,
  ids: Iterable<HoleId>,
  dx: Meters,
  dy: Meters,
  ground?: (x: number, y: number) => number | null,
): Op[] {
  if (dx === 0 && dy === 0) return [];
  return [...groupByBlast(doc, ids)].map(([blastId, holes]) => {
    const blast = doc.getBlast(blastId);
    return {
      type: 'holes/replace',
      blastId,
      holes: holes.map((h) => {
        const x = h.collar.x + dx;
        const y = h.collar.y + dy;
        const z = ground?.(x, y) ?? null;
        const moved = { ...h, collar: { x, y, z: h.collar.z } };
        return z !== null && blast ? applyHoleEdit(moved, { z }, blast) : moved;
      }),
    };
  });
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
export function applyHoleEdit(
  hole: Hole,
  edit: HoleEdit,
  blast: Pick<Blast, 'bench' | 'calcParams'> & Partial<Pick<Blast, 'boundaries' | 'patterns'>>,
): Hole {
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
    // El piso es el del perímetro del taladro (cada perímetro puede estar en otro banco).
    next.length = lengthToFloor(
      next.collar.z,
      holeBench(blast, next).floorElevation,
      next.subdrill,
      next.inclination,
      blast.calcParams.subdrillConvention,
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

/**
 * Borra mallas y sus taladros (con las conexiones y puntos de inicio que los referencian), en un
 * solo paso de deshacer. Los taladros sin malla no se tocan.
 */
export function removePatterns(
  doc: DocumentReader,
  blastId: BlastId,
  patternIds: readonly PatternId[],
): Op[] {
  const blast = doc.getBlast(blastId);
  if (!blast || patternIds.length === 0) return [];
  const ids = new Set<string>(patternIds);
  const holes = blast.holes.filter((h) => h.patternId !== undefined && ids.has(h.patternId));
  return [
    ...deleteHoles(
      doc,
      holes.map((h) => h.id),
    ),
    { type: 'patterns/remove', blastId, ids: [...patternIds] },
  ];
}

/** Reemplaza mallas por una nueva (observación 1 del ingeniero: generar no debe superponer). */
export function replacePatterns(
  doc: DocumentReader,
  blastId: BlastId,
  oldPatternIds: readonly PatternId[],
  pattern: Pattern,
  holes: readonly Hole[],
): Op[] {
  return [...removePatterns(doc, blastId, oldPatternIds), ...addPattern(blastId, pattern, holes)];
}

// ------------------------------------------------------------------ Perímetros

function patchBoundaries(
  doc: DocumentReader,
  blastId: BlastId,
  fn: (list: BlastBoundary[]) => BlastBoundary[],
): Op[] {
  const blast = doc.getBlast(blastId);
  if (!blast) return [];
  return [{ type: 'blast/patch', blastId, patch: { boundaries: fn(blast.boundaries) } }];
}

/** Agrega un perímetro nuevo (no reemplaza los existentes). */
export function addBoundary(doc: DocumentReader, blastId: BlastId, boundary: BlastBoundary): Op[] {
  return patchBoundaries(doc, blastId, (list) => [...list, boundary]);
}

export function removeBoundary(doc: DocumentReader, blastId: BlastId, id: BoundaryId): Op[] {
  return patchBoundaries(doc, blastId, (list) => list.filter((b) => b.id !== id));
}

export function renameBoundary(
  doc: DocumentReader,
  blastId: BlastId,
  id: BoundaryId,
  name: string,
): Op[] {
  return patchBoundaries(doc, blastId, (list) =>
    list.map((b) => (b.id === id ? { ...b, name } : b)),
  );
}

/** Marca o desmarca una arista como cara libre. */
export function toggleFreeFaceEdge(
  doc: DocumentReader,
  blastId: BlastId,
  id: BoundaryId,
  edge: number,
): Op[] {
  return patchBoundaries(doc, blastId, (list) =>
    list.map((b) => {
      if (b.id !== id) return b;
      const has = b.freeFaceEdges.includes(edge);
      const freeFaceEdges = has
        ? b.freeFaceEdges.filter((e) => e !== edge)
        : [...b.freeFaceEdges, edge].sort((x, y) => x - y);
      return { ...b, freeFaceEdges };
    }),
  );
}

/** Reemplaza las aristas de cara libre de un perímetro (p. ej. las que siguen la cresta). */
export function setFreeFaceEdges(
  doc: DocumentReader,
  blastId: BlastId,
  id: BoundaryId,
  edges: readonly number[],
): Op[] {
  const freeFaceEdges = [...new Set(edges)].sort((x, y) => x - y);
  return patchBoundaries(doc, blastId, (list) =>
    list.map((b) => (b.id === id ? { ...b, freeFaceEdges } : b)),
  );
}

/**
 * Piso propio de un perímetro [m]; `null` vuelve a usar el del banco. Los taladros de ese
 * perímetro recalculan su largo hasta el piso nuevo + sobreperforación (su boca no cambia); los de
 * otros perímetros no se tocan.
 */
/**
 * Ángulo y alto propios de la cara libre de un perímetro (A7b); `null` vuelve al valor del banco.
 * No mueve taladros: la cara solo cambia la geometría del talud y los cálculos que la usan.
 */
export function setBoundaryFace(
  doc: DocumentReader,
  blastId: BlastId,
  id: BoundaryId,
  face: { angle?: number | null; height?: number | null },
): Op[] {
  const blast = doc.getBlast(blastId);
  if (!blast) return [];
  const boundaries = blast.boundaries.map((b) => {
    if (b.id !== id) return b;
    const next = { ...b };
    if (face.angle === null) delete next.faceAngle;
    else if (face.angle !== undefined) next.faceAngle = face.angle;
    if (face.height === null) delete next.faceHeight;
    else if (face.height !== undefined) next.faceHeight = face.height;
    return next;
  });
  return [{ type: 'blast/patch', blastId, patch: { boundaries } }];
}

export function setBoundaryFloor(
  doc: DocumentReader,
  blastId: BlastId,
  id: BoundaryId,
  floor: number | null,
): Op[] {
  const blast = doc.getBlast(blastId);
  if (!blast) return [];
  const boundaries = blast.boundaries.map((b) => {
    if (b.id !== id) return b;
    const next = { ...b };
    if (floor === null) delete next.floorElevation;
    else next.floorElevation = floor;
    return next;
  });
  const after = { ...blast, boundaries };
  const holes = blast.holes
    .filter((h) => holeBoundary(after, h)?.id === id)
    .map((h) => ({
      ...h,
      length: lengthToFloor(
        h.collar.z,
        holeBench(after, h).floorElevation,
        h.subdrill,
        h.inclination,
        blast.calcParams.subdrillConvention,
      ),
    }));
  const ops: Op[] = [{ type: 'blast/patch', blastId, patch: { boundaries } }];
  if (holes.length > 0) ops.push({ type: 'holes/replace', blastId, holes });
  return ops;
}

/** Nombre libre "Perímetro N" para un perímetro nuevo. */
export function nextBoundaryName(blast: Pick<Blast, 'boundaries'>): string {
  const used = new Set(blast.boundaries.map((b) => b.name));
  for (let n = blast.boundaries.length + 1; ; n++)
    if (!used.has(`Perímetro ${n}`)) return `Perímetro ${n}`;
}

/** Crea un perímetro a partir de un polígono. */
export function makeBoundary(blast: Pick<Blast, 'boundaries'>, polygon: Polygon2): BlastBoundary {
  return {
    id: newId<'Boundary'>(),
    name: nextBoundaryName(blast),
    polygon: [...polygon],
    freeFaceEdges: [],
  };
}

// ------------------------------------------------------------------ Carguío

export function setLibrary(library: ProductLibrary): Op[] {
  return [{ type: 'project/patch', patch: { library } }];
}

export function setSiteModels(siteModels: SiteModels): Op[] {
  return [{ type: 'project/patch', patch: { siteModels } }];
}

export function setRockMasses(rockMasses: RockMass[]): Op[] {
  return [{ type: 'project/patch', patch: { rockMasses } }];
}

/** Aplica una regla de carga (decks + iniciador) a los taladros indicados. */
export function applyChargeRule(
  doc: DocumentReader,
  ids: Iterable<HoleId>,
  rule: ChargeRule,
): Op[] {
  const library = doc.project.library;
  return [...groupByBlast(doc, ids)].map(([blastId, holes]) => ({
    type: 'holes/replace',
    blastId,
    holes: holes.map((h) => ({ ...h, ...chargeRuleDecks(h, rule, library) })),
  }));
}

/** Reemplaza la columna de carga (decks de fondo a boca) de un taladro. */
export function setHoleDecks(doc: DocumentReader, id: HoleId, decks: Deck[]): Op[] {
  const loc = doc.findHole(id);
  if (!loc) return [];
  return [{ type: 'holes/replace', blastId: loc.blast.id, holes: [{ ...loc.hole, decks }] }];
}

/** Quita decks e iniciadores. */
export function clearCharge(doc: DocumentReader, ids: Iterable<HoleId>): Op[] {
  return [...groupByBlast(doc, ids)].map(([blastId, holes]) => ({
    type: 'holes/replace',
    blastId,
    holes: holes.map((h) => ({ ...h, decks: [], initiators: [] })),
  }));
}

// ------------------------------------------------------------------ Tiempos

/** Detonador en el taladro (y retardo) para cada taladro; `delays` permite un valor por taladro. */
export function setDownholeDetonator(
  doc: DocumentReader,
  ids: Iterable<HoleId>,
  detonatorId: DetonatorId,
  delay: Seconds | ((id: HoleId) => Seconds),
): Op[] {
  const delayOf = typeof delay === 'function' ? delay : () => delay;
  return [...groupByBlast(doc, ids)].map(([blastId, holes]) => ({
    type: 'holes/replace',
    blastId,
    holes: holes.map((h) => ({
      ...h,
      initiators: withDownholeDetonator(h, detonatorId, delayOf(h.id)),
    })),
  }));
}

export function setInitiation(blastId: BlastId, initiation: InitiationPlan): Op[] {
  return [{ type: 'blast/patch', blastId, patch: { initiation } }];
}

export function addConnection(
  doc: DocumentReader,
  blastId: BlastId,
  from: HoleId,
  to: HoleId,
  connectorId: SurfaceConnectorId,
): Op[] {
  const plan = doc.getBlast(blastId)?.initiation;
  if (!plan || from === to) return [];
  // Reemplaza una conexión existente entre el mismo par (en cualquier sentido).
  const connections = plan.connections.filter(
    (c) =>
      !(
        c.from.kind === 'hole' &&
        c.to.kind === 'hole' &&
        ((c.from.holeId === from && c.to.holeId === to) ||
          (c.from.holeId === to && c.to.holeId === from))
      ),
  );
  connections.push({
    id: newId<'Connection'>(),
    from: { kind: 'hole', holeId: from },
    to: { kind: 'hole', holeId: to },
    connectorId,
  });
  return setInitiation(blastId, { ...plan, connections });
}

export function removeConnections(
  doc: DocumentReader,
  blastId: BlastId,
  ids: Iterable<ConnectionId>,
): Op[] {
  const plan = doc.getBlast(blastId)?.initiation;
  if (!plan) return [];
  const remove = new Set<string>(ids);
  return setInitiation(blastId, {
    ...plan,
    connections: plan.connections.filter((c) => !remove.has(c.id)),
  });
}

/** Quita las conexiones que tocan alguno de los taladros. */
export function removeConnectionsOfHoles(
  doc: DocumentReader,
  blastId: BlastId,
  holeIds: Iterable<HoleId>,
): Op[] {
  const plan = doc.getBlast(blastId)?.initiation;
  if (!plan) return [];
  const ids = new Set<string>(holeIds);
  return setInitiation(blastId, {
    ...plan,
    connections: plan.connections.filter((c) => !refersTo(c.from, ids) && !refersTo(c.to, ids)),
  });
}

/** Agrega o quita un punto de inicio en el taladro. */
export function toggleInitiationPoint(doc: DocumentReader, blastId: BlastId, holeId: HoleId): Op[] {
  const plan = doc.getBlast(blastId)?.initiation;
  if (!plan) return [];
  const exists = plan.initiationPoints.some((p) => p.at.kind === 'hole' && p.at.holeId === holeId);
  const initiationPoints = exists
    ? plan.initiationPoints.filter((p) => !(p.at.kind === 'hole' && p.at.holeId === holeId))
    : [
        ...plan.initiationPoints,
        { id: newId<'InitiationPoint'>(), at: { kind: 'hole' as const, holeId }, time: 0 },
      ];
  return setInitiation(blastId, { ...plan, initiationPoints });
}

// ------------------------------------------------------------------ Puntos de control

export function addMonitoringPoint(
  doc: DocumentReader,
  position: Vec3,
  name?: string,
): { ops: Op[]; point: MonitoringPoint } {
  const list = doc.project.monitoringPoints ?? [];
  const used = new Set(list.map((p) => p.name));
  let n = list.length + 1;
  while (used.has(`PC${n}`)) n++;
  const point: MonitoringPoint = {
    id: newId<'MonitoringPoint'>(),
    name: name ?? `PC${n}`,
    position: { ...position },
  };
  return { ops: [{ type: 'project/patch', patch: { monitoringPoints: [...list, point] } }], point };
}

export function removeMonitoringPoint(doc: DocumentReader, id: MonitoringPointId): Op[] {
  const list = doc.project.monitoringPoints ?? [];
  return [{ type: 'project/patch', patch: { monitoringPoints: list.filter((p) => p.id !== id) } }];
}

/** Campos editables de un punto; `undefined` en un campo opcional lo borra (vuelve al del sitio). */
export type MonitoringPointPatch = {
  [K in Exclude<keyof MonitoringPoint, 'id'>]?: MonitoringPoint[K] | undefined;
};

export function updateMonitoringPoint(
  doc: DocumentReader,
  id: MonitoringPointId,
  patch: MonitoringPointPatch,
): Op[] {
  const list = doc.project.monitoringPoints ?? [];
  const apply = (p: MonitoringPoint): MonitoringPoint => {
    const next = { ...p };
    if (patch.name !== undefined) next.name = patch.name;
    if (patch.position !== undefined) next.position = patch.position;
    if ('ppvLimit' in patch) {
      if (patch.ppvLimit === undefined) delete next.ppvLimit;
      else next.ppvLimit = patch.ppvLimit;
    }
    if ('k' in patch) {
      if (patch.k === undefined) delete next.k;
      else next.k = patch.k;
    }
    if ('beta' in patch) {
      if (patch.beta === undefined) delete next.beta;
      else next.beta = patch.beta;
    }
    if ('structure' in patch) {
      if (patch.structure === undefined) delete next.structure;
      else next.structure = patch.structure;
    }
    return next;
  };
  return [
    {
      type: 'project/patch',
      patch: { monitoringPoints: list.map((p) => (p.id === id ? apply(p) : p)) },
    },
  ];
}

// ------------------------------------------------------------------ Escenarios (H-701, R-23)

/** Guarda una copia de la voladura como escenario. */
export function saveScenario(
  doc: DocumentReader,
  blastId: BlastId,
  name: string,
  now = new Date(),
): Op[] {
  const blast = doc.project.blasts.find((b) => b.id === blastId);
  if (!blast) return [];
  const scenario: Scenario = {
    id: newId<'Scenario'>(),
    name,
    savedAt: now.toISOString(),
    blast: structuredClone(blast),
  };
  return [
    { type: 'project/patch', patch: { scenarios: [...(doc.project.scenarios ?? []), scenario] } },
  ];
}

export function removeScenario(doc: DocumentReader, id: ScenarioId): Op[] {
  return [
    {
      type: 'project/patch',
      patch: { scenarios: (doc.project.scenarios ?? []).filter((s) => s.id !== id) },
    },
  ];
}

/**
 * Reemplaza el contenido de la voladura por el del escenario (malla, taladros, amarre y
 * parámetros), conservando su id. Un solo paso de deshacer.
 */
export function loadScenario(doc: DocumentReader, blastId: BlastId, id: ScenarioId): Op[] {
  const blast = doc.project.blasts.find((b) => b.id === blastId);
  const scenario = doc.project.scenarios?.find((s) => s.id === id);
  if (!blast || !scenario) return [];
  const snapshot = structuredClone(scenario.blast);
  const { holes, patterns } = snapshot;
  // El resto de los campos de la voladura (banco, amarre, grupos, parámetros…), sin id propio.
  const fields: Partial<Blast> = { ...snapshot };
  delete fields.id;
  delete fields.holes;
  delete fields.patterns;
  return [
    { type: 'holes/remove', blastId, ids: blast.holes.map((h) => h.id) },
    { type: 'patterns/remove', blastId, ids: blast.patterns.map((p) => p.id) },
    { type: 'patterns/insert', blastId, entries: patterns.map((item) => ({ item })) },
    { type: 'holes/insert', blastId, entries: holes.map((item) => ({ item })) },
    { type: 'blast/patch', blastId, patch: fields },
  ];
}
