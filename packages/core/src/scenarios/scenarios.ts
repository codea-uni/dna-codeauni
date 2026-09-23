import { newId } from '../model/ids';
import { createEmptyProject } from '../model/factories';
import { freeFaceAlignment, outwardNormal } from '../geometry/boundary';
import { unitToAzimuth } from '../geometry/vec';
import { fitPatternToPolygon, generatePatternHoles } from '../patterns/pattern';
import { electronicTimes, rowTieUp, withDownholeDetonator } from '../timing/tieUp';
import { degToRad } from '../units/units';
import type {
  BlastBoundary,
  Deck,
  Hole,
  InHoleInitiator,
  Pattern,
  PatternKind,
  ProductLibrary,
  Project,
  Vec2,
} from '../model/types';

/** Productos de la librería por defecto, por nombre (evita depender del orden). */
function product<T extends { name: string }>(list: readonly T[], prefix: string): T {
  const p = list.find((x) => x.name.startsWith(prefix));
  if (!p) throw new Error(`Producto "${prefix}" no está en la librería`);
  return p;
}

/** Columna de carga de fondo a boca. Largos en metros; el explosivo de columna completa lo que falte. */
export interface ChargePlan {
  bottom?: { explosive: string; length: number };
  column: string;
  airDeck?: number;
  stemming: number;
  stemmingMaterial?: string;
  primer?: string;
  detonator: string;
  /** Retardo en taladro [s] (nonel); en electrónicos lo define la secuencia. */
  delay?: number;
}

function buildCharge(
  hole: Hole,
  plan: ChargePlan,
  lib: ProductLibrary,
): Pick<Hole, 'decks' | 'initiators'> {
  const decks: Deck[] = [];
  const L = hole.length;
  const stem = Math.min(plan.stemming, L);
  const air = Math.min(plan.airDeck ?? 0, L - stem);
  const bottomLen = Math.min(plan.bottom?.length ?? 0, L - stem - air);
  const columnLen = Math.max(0, L - stem - air - bottomLen);
  if (plan.bottom && bottomLen > 0) {
    decks.push({
      id: newId<'Deck'>(),
      kind: 'explosive',
      explosiveId: product(lib.explosives, plan.bottom.explosive).id,
      length: bottomLen,
    });
  }
  if (columnLen > 0)
    decks.push({
      id: newId<'Deck'>(),
      kind: 'explosive',
      explosiveId: product(lib.explosives, plan.column).id,
      length: columnLen,
    });
  if (air > 0) decks.push({ id: newId<'Deck'>(), kind: 'air', length: air });
  if (stem > 0) {
    decks.push({
      id: newId<'Deck'>(),
      kind: 'stemming',
      materialId: product(lib.stemmingMaterials, plan.stemmingMaterial ?? 'Gravilla').id,
      length: stem,
    });
  }
  const det = product(lib.detonators, plan.detonator);
  const init: InHoleInitiator = {
    id: newId<'InHoleInitiator'>(),
    detonatorId: det.id,
    depth: Math.max(0, L - 0.5),
    delay: plan.delay ?? det.nominalDelay,
  };
  if (plan.primer) init.primerId = product(lib.primers, plan.primer).id;
  return { decks, initiators: [init] };
}

export interface ScenarioSpec {
  projectName: string;
  blastName: string;
  /** Esquina de referencia en coordenadas de proyecto (UTM ficticio). */
  origin: Vec2;
  floorElevation: number;
  benchHeight: number;
  /** Ángulo de cara del banco [°]. */
  faceAngleDeg: number;
  /** Perímetro relativo a `origin` [m] y aristas de cara libre. */
  perimeter: Vec2[];
  freeFaceEdges: number[];
  pattern: {
    kind: PatternKind;
    burden: number;
    spacing: number;
    diameterMm: number;
    subdrill: number;
    inclinationDeg?: number;
  };
  /** Distancia de la primera fila a la cara libre [m]. */
  frontOffset: number;
  /** Plan de carga por fila (0 = junto a la cara libre). */
  charge: (row: number, rows: number) => ChargePlan;
  timing:
    | { mode: 'v' | 'line'; interHole: string; interRow: string }
    | { mode: 'electronic'; interHoleMs: number; interRowMs: number };
  monitoring: { name: string; dx: number; dy: number }[];
  rock: { name: string; density: number; ucsMPa: number; eGPa: number };
}

/** Construye un proyecto completo (malla, carga, iniciación y puntos de control) a partir de la receta. */
export function buildScenario(spec: ScenarioSpec): Project {
  const project = createEmptyProject(spec.projectName);
  const lib = project.library;
  const base = project.blasts[0];
  const rock = project.rockMasses[0];
  if (!base || !rock) throw new Error('Proyecto base incompleto');
  const o = spec.origin;
  const top = spec.floorElevation + spec.benchHeight;
  const polygon = spec.perimeter.map((p) => ({ x: o.x + p.x, y: o.y + p.y }));
  const boundary: BlastBoundary = {
    id: newId<'Boundary'>(),
    name: 'Perímetro 1',
    polygon,
    freeFaceEdges: spec.freeFaceEdges,
  };
  const bench = {
    floorElevation: spec.floorElevation,
    height: spec.benchHeight,
    faceAngle: degToRad(spec.faceAngleDeg),
  };

  const alignment = freeFaceAlignment(boundary) ?? {
    rowAzimuth: Math.PI / 2,
    rowAdvance: 'right' as const,
  };
  // Taladros inclinados: hacia la cara libre (normal exterior de la primera arista libre).
  const face =
    spec.freeFaceEdges[0] !== undefined ? outwardNormal(polygon, spec.freeFaceEdges[0]) : null;
  const holeAzimuth = face ? unitToAzimuth(face.x, face.y) : 0;
  const geometry = {
    kind: spec.pattern.kind,
    burden: spec.pattern.burden,
    spacing: spec.pattern.spacing,
    ...alignment,
  };
  const layout = fitPatternToPolygon(geometry, polygon, spec.frontOffset);
  const pattern: Pattern = {
    id: newId<'Pattern'>(),
    name: 'Malla 1',
    ...geometry,
    ...layout,
    clipBoundary: polygon,
    boundaryId: boundary.id,
    holeTemplate: {
      diameter: spec.pattern.diameterMm / 1000,
      inclination: degToRad(spec.pattern.inclinationDeg ?? 0),
      azimuth: spec.pattern.inclinationDeg ? holeAzimuth : 0,
      subdrill: spec.pattern.subdrill,
    },
  };
  const rows = layout.rows;
  let holes = generatePatternHoles(pattern, bench, { startNumber: 1 }).map((h) => ({
    ...h,
    ...buildCharge(h, spec.charge(h.row ?? 0, rows), lib),
  }));

  // Iniciación.
  let blast = {
    ...base,
    name: spec.blastName,
    bench,
    boundaries: [boundary],
    patterns: [pattern],
    holes,
  };
  const firstRow = holes.filter((h) => h.row === 0);
  const cols = firstRow.map((h) => h.col ?? 0);
  const centerCol = cols.length ? Math.round((Math.min(...cols) + Math.max(...cols)) / 2) : 0;
  const t = spec.timing;
  if (t.mode === 'electronic') {
    const det = product(lib.detonators, 'Electrónico');
    const allCols = holes.map((h) => h.col ?? 0);
    const minCol = allCols.length ? Math.min(...allCols) : 0;
    const maxCol = allCols.length ? Math.max(...allCols) : 0;
    // Taladro a taladro: la fila siguiente empieza un intervalo después del último de la anterior,
    // así ningún par queda dentro de la ventana de coincidencia.
    const interRowMs = Math.max(
      t.interRowMs,
      (maxCol - minCol + 1) * t.interHoleMs + t.interHoleMs,
    );
    const times = electronicTimes(blast, {
      patternId: pattern.id,
      startRow: 0,
      startCol: minCol,
      interHole: t.interHoleMs / 1000,
      interRow: interRowMs / 1000,
      offset: 0.01,
      detonatorId: det.id,
    });
    holes = holes.map((h) => ({
      ...h,
      initiators: withDownholeDetonator(h, det.id, times.get(h.id) ?? 0),
    }));
    blast = { ...blast, holes, initiation: { ...blast.initiation, system: 'electronic' } };
  } else {
    const plan = rowTieUp(blast, {
      patternId: pattern.id,
      startRow: 0,
      startCol: t.mode === 'v' ? centerCol : cols.length ? Math.min(...cols) : 0,
      interHoleConnectorId: product(lib.surfaceConnectors, t.interHole).id,
      interRowConnectorId: product(lib.surfaceConnectors, t.interRow).id,
    });
    blast = { ...blast, initiation: { ...blast.initiation, ...plan } };
  }

  return {
    ...project,
    coordinateSystem: { origin: { x: o.x, y: o.y, z: top } },
    rockMasses: [
      {
        ...rock,
        name: spec.rock.name,
        density: spec.rock.density,
        ucs: spec.rock.ucsMPa * 1e6,
        youngModulus: spec.rock.eGPa * 1e9,
      },
    ],
    monitoringPoints: spec.monitoring.map((m) => ({
      id: newId<'MonitoringPoint'>(),
      name: m.name,
      position: { x: o.x + m.dx, y: o.y + m.dy, z: top },
    })),
    blasts: [blast],
  };
}

// ------------------------------------------------------------------ Escenarios de ejemplo

const ORIGIN = { x: 345_200, y: 8_512_400 };
const ROCK = { name: 'Pórfido', density: 2650, ucsMPa: 120, eGPa: 45 };

/**
 * Rectángulo w × h con la esquina Noreste recortada. Aristas: 0 Sur, 1 Este, 2 chaflán, 3 Norte, 4 Oeste.
 * La cara libre de los ejemplos es la Norte.
 */
const NORTH = 3;
function perimeter(w: number, h: number, chamfer: number): Vec2[] {
  return [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h - chamfer },
    { x: w - chamfer, y: h },
    { x: 0, y: h },
  ];
}

export interface ScenarioInfo {
  id: string;
  name: string;
  description: string;
  build: () => Project;
}

/** Recetas de los ejemplos (exportadas para tests y variantes). */
export const SCENARIO_SPECS = {
  production: {
    projectName: 'Demo · Producción estándar',
    blastName: 'Banco 3435 · Fase 2',
    origin: ORIGIN,
    floorElevation: 3435,
    benchHeight: 15,
    faceAngleDeg: 75,
    perimeter: perimeter(150, 72, 18),
    freeFaceEdges: [NORTH],
    pattern: { kind: 'staggered', burden: 6, spacing: 7, diameterMm: 229, subdrill: 1.5 },
    frontOffset: 3,
    charge: () => ({
      bottom: { explosive: 'ANFO pesado', length: 3 },
      column: 'ANFO',
      stemming: 4.5,
      primer: 'Booster 450',
      detonator: 'Nonel fondo 500',
    }),
    timing: { mode: 'v', interHole: 'Nonel superficie 17', interRow: 'Nonel superficie 42' },
    monitoring: [
      { name: 'Campamento', dx: 75, dy: -620 },
      { name: 'Línea eléctrica', dx: 480, dy: 40 },
    ],
    rock: ROCK,
  } satisfies ScenarioSpec,
  wet: {
    projectName: 'Demo · Frente con agua',
    blastName: 'Banco 3420 · Rampa',
    origin: ORIGIN,
    floorElevation: 3420,
    benchHeight: 15,
    faceAngleDeg: 70,
    perimeter: perimeter(110, 60, 12),
    freeFaceEdges: [NORTH],
    pattern: { kind: 'staggered', burden: 5.5, spacing: 6.5, diameterMm: 200, subdrill: 1.5 },
    frontOffset: 2.75,
    charge: (row, rows) =>
      row >= rows - 3
        ? {
            column: 'Emulsión bombeable',
            stemming: 4,
            primer: 'Booster 450',
            detonator: 'Nonel fondo 500',
          }
        : { column: 'ANFO', stemming: 4, primer: 'Booster 450', detonator: 'Nonel fondo 500' },
    timing: { mode: 'line', interHole: 'Nonel superficie 25', interRow: 'Nonel superficie 65' },
    monitoring: [{ name: 'Chancador', dx: -350, dy: 30 }],
    rock: ROCK,
  } satisfies ScenarioSpec,
  electronic: {
    projectName: 'Demo · Cerca de infraestructura',
    blastName: 'Banco 3450 · Borde planta',
    origin: ORIGIN,
    floorElevation: 3450,
    benchHeight: 12,
    faceAngleDeg: 72,
    perimeter: perimeter(80, 45, 8),
    freeFaceEdges: [NORTH],
    pattern: { kind: 'rectangular', burden: 4, spacing: 5, diameterMm: 165, subdrill: 1 },
    frontOffset: 2,
    charge: () => ({
      column: 'Emulsión bombeable',
      airDeck: 1.5,
      stemming: 3.5,
      primer: 'Booster 450',
      detonator: 'Electrónico',
    }),
    timing: { mode: 'electronic', interHoleMs: 9, interRowMs: 160 },
    monitoring: [
      { name: 'Planta', dx: 40, dy: -180 },
      { name: 'Taller', dx: -150, dy: 60 },
    ],
    rock: { ...ROCK, name: 'Andesita' },
  } satisfies ScenarioSpec,
  inclined: {
    projectName: 'Demo · Taladros inclinados',
    blastName: 'Banco 3405 · Talud final',
    origin: ORIGIN,
    floorElevation: 3405,
    benchHeight: 15,
    faceAngleDeg: 65,
    perimeter: perimeter(90, 40, 10),
    freeFaceEdges: [NORTH],
    pattern: {
      kind: 'staggered',
      burden: 5,
      spacing: 6,
      diameterMm: 200,
      subdrill: 1.2,
      inclinationDeg: 15,
    },
    frontOffset: 2.5,
    charge: () => ({
      bottom: { explosive: 'ANFO pesado', length: 2.5 },
      column: 'ANFO',
      stemming: 4,
      primer: 'Booster 450',
      detonator: 'Nonel fondo 500',
    }),
    timing: { mode: 'v', interHole: 'Nonel superficie 25', interRow: 'Nonel superficie 65' },
    monitoring: [{ name: 'Mirador', dx: 45, dy: 300 }],
    rock: ROCK,
  } satisfies ScenarioSpec,
};

export const SCENARIOS: ScenarioInfo[] = [
  {
    id: 'production',
    name: 'Producción estándar',
    description:
      '≈250 taladros Ø 229 mm · ANFO pesado de fondo + ANFO · salida en V desde la cara libre',
    build: () => buildScenario(SCENARIO_SPECS.production),
  },
  {
    id: 'wet',
    name: 'Frente con agua',
    description:
      'Filas del fondo con agua cargadas con emulsión · resto con ANFO · amarre línea a línea',
    build: () => buildScenario(SCENARIO_SPECS.wet),
  },
  {
    id: 'electronic',
    name: 'Cerca de infraestructura',
    description:
      'Electrónicos taladro a taladro (sin coincidencias) · cámara de aire · planta a 180 m',
    build: () => buildScenario(SCENARIO_SPECS.electronic),
  },
  {
    id: 'inclined',
    name: 'Taladros inclinados',
    description: 'Inclinados 15° hacia la cara libre · ideal para la vista 3D (tecla 3)',
    build: () => buildScenario(SCENARIO_SPECS.inclined),
  },
  {
    id: 'problems',
    name: 'Problemas típicos',
    description:
      'Taco corto, sin carga, sin detonador, fila sin amarre, retardos que coinciden, duplicados',
    build: buildProblems,
  },
];

/** Escenario con errores frecuentes de terreno, para practicar la revisión (Resultados → Alertas). */
function buildProblems(): Project {
  const project = buildScenario({
    projectName: 'Demo · Problemas típicos',
    blastName: 'Banco 3435 · Revisión',
    origin: ORIGIN,
    floorElevation: 3435,
    benchHeight: 15,
    faceAngleDeg: 75,
    perimeter: perimeter(100, 50, 10),
    freeFaceEdges: [NORTH],
    pattern: { kind: 'staggered', burden: 5, spacing: 6, diameterMm: 200, subdrill: 1.5 },
    frontOffset: 2.5,
    charge: () => ({
      column: 'ANFO',
      stemming: 4,
      primer: 'Booster 450',
      detonator: 'Nonel fondo 500',
    }),
    // Entre filas se reemplaza luego por 17 ms (error típico, ver abajo).
    timing: { mode: 'line', interHole: 'Nonel superficie 17', interRow: 'Nonel superficie 25' },
    monitoring: [{ name: 'Campamento', dx: 50, dy: -400 }],
    rock: ROCK,
  });
  const blast = project.blasts[0];
  if (!blast) return project;
  const lib = project.library;
  // Error típico: el mismo conector (17 ms) entre filas que entre taladros → el taladro de la fila
  // siguiente dispara junto a su vecino de la fila anterior.
  const c17 = product(lib.surfaceConnectors, 'Nonel superficie 17');
  const holes = [...blast.holes];
  const rows = Math.max(...holes.map((h) => h.row ?? 0));
  const stemmingId = product(lib.stemmingMaterials, 'Gravilla').id;
  holes.forEach((h, i) => {
    if (i % 23 === 5) {
      // Taco corto (1.5 m < 0.7 × 5 m): se agranda la columna de explosivo.
      const decks = h.decks.map((d): Deck =>
        d.kind === 'stemming'
          ? { id: d.id, kind: 'stemming', materialId: stemmingId, length: 1.5 }
          : { ...d, length: h.length - 1.5 },
      );
      holes[i] = { ...h, decks };
    } else if (i % 29 === 7)
      holes[i] = { ...h, decks: [], initiators: [] }; // sin carga
    else if (i === 3) holes[i] = { ...h, initiators: [] }; // cargado sin detonador
  });
  // Duplicado: un taladro a 0.2 m de otro.
  const dupOf = holes[10];
  if (dupOf)
    holes.push({
      ...dupOf,
      id: newId<'Hole'>(),
      label: `${dupOf.label}b`,
      collar: { ...dupOf.collar, x: dupOf.collar.x + 0.2 },
    });
  // Fila del fondo sin amarre; retardo entre filas de 34 ms → coincidencias.
  const lastRow = new Set<string>(holes.filter((h) => h.row === rows).map((h) => h.id));
  const connections = blast.initiation.connections
    .filter((c) => !(c.to.kind === 'hole' && lastRow.has(c.to.holeId)))
    .map((c) => {
      const from = c.from;
      const to = c.to;
      const a = from.kind === 'hole' ? holes.find((h) => h.id === from.holeId) : undefined;
      const b = to.kind === 'hole' ? holes.find((h) => h.id === to.holeId) : undefined;
      return a && b && a.row !== b.row ? { ...c, connectorId: c17.id } : c;
    });
  return {
    ...project,
    blasts: [{ ...blast, holes, initiation: { ...blast.initiation, connections } }],
  };
}
