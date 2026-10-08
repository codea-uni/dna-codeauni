import { newId } from '../model/ids';
import { createEmptyProject } from '../model/factories';
import { makeGroup } from '../io/csv';
import { freeFaceAlignment, outwardNormal } from '../geometry/boundary';
import { unitToAzimuth } from '../geometry/vec';
import { fitPatternToPolygon, generatePatternHoles } from '../patterns/pattern';
import { electronicTimes, rowTieUp, withDownholeDetonator } from '../timing/tieUp';
import { degToRad } from '../units/units';
import {
  buildFinalWallExample,
  buildMineExample,
  buildMuckpileTopoExample,
  buildPitExample,
  buildQuarryExample,
  buildSectorExample,
  type ExampleBuild,
} from './topographyExamples';
import type {
  Blast,
  BlastBoundary,
  Deck,
  Hole,
  HoleGroupKind,
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

export function buildCharge(
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

export interface ExampleSpec {
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
  /** Dirección de las filas; por defecto, la de la arista libre más larga. */
  alignment?: Pick<Pattern, 'rowAzimuth' | 'rowAdvance'>;
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
  timing: ExampleTiming;
  monitoring: {
    name: string;
    dx: number;
    dy: number;
    /** Tipo de estructura (elige las filas de la tabla de límites, P-12). */
    structure?: string;
    /** Límite propio del punto [mm/s]. */
    ppvLimitMmS?: number;
  }[];
  rock: {
    name: string;
    density: number;
    ucsMPa: number;
    eGPa: number;
    /** Resistencia a tracción [MPa] y Vp [m/s] (precorte y VPPc = RT·Vp/E, F2). */
    tensileMPa?: number;
    vp?: number;
  };
  /** Costo de perforación [US$/m] (`R1` F28). */
  drillingCostPerMeter?: number;
  /** Grupo de cada fila (RM-18): precorte, buffer, producción… */
  groups?: (row: number, rows: number) => { name: string; kind: HoleGroupKind };
  /** Variantes guardadas como escenarios para compararlas (R-23): otro amarre. */
  scenarios?: { name: string; timing: ExampleTiming }[];
  /** Filas extra de la tabla de límites de PPV, por tipo de estructura (P-12). */
  ppvLimits?: { structure: string; ppvMaxMmS: number; source: string }[];
}

export type ExampleTiming =
  | { mode: 'v' | 'line' | 'echelon'; interHole: string; interRow: string }
  | {
      mode: 'electronic';
      interHoleMs: number;
      interRowMs: number;
      /**
       * Intervalos tal cual, aunque las filas se superpongan (p. ej. 25 ms entre taladros y 67 ms
       * entre filas); por defecto la fila siguiente espera al último taladro de la anterior.
       */
      exact?: boolean;
      /** Taladro de salida de cada fila: el de menor columna (defecto) o el de mayor. */
      from?: 'first' | 'last';
    };

/** Construye un proyecto completo (malla, carga, iniciación y puntos de control) a partir de la receta. */
export function buildExample(spec: ExampleSpec): Project {
  const project = createEmptyProject(spec.projectName);
  const lib = project.library;
  const base = project.blasts[0];
  const rock = project.rockMasses[0];
  if (!base || !rock) throw new Error('Proyecto base incompleto');
  const o = spec.origin;
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

  const alignment = spec.alignment ??
    freeFaceAlignment(boundary) ?? {
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
  // Grupos por fila (RM-18).
  const groups = new Map<string, ReturnType<typeof makeGroup>>();
  const groupOf = (row: number) => {
    const g = spec.groups?.(row, rows);
    if (!g) return undefined;
    let group = groups.get(g.name);
    if (!group) {
      group = { ...makeGroup(g.name, groups.size), kind: g.kind };
      groups.set(g.name, group);
    }
    return group.id;
  };
  const holes = generatePatternHoles(pattern, bench, { startNumber: 1 }).map((h) => {
    const row = h.row ?? 0;
    const hole: Hole = { ...h, ...buildCharge(h, spec.charge(row, rows), lib) };
    const groupId = groupOf(row);
    if (groupId) hole.groupId = groupId;
    return hole;
  });

  const blast = applyTiming(
    {
      ...base,
      name: spec.blastName,
      bench,
      calcParams: {
        ...base.calcParams,
        drillingCostPerMeter: spec.drillingCostPerMeter ?? base.calcParams.drillingCostPerMeter,
      },
      boundaries: [boundary],
      groups: [...groups.values()],
      patterns: [pattern],
      holes,
    },
    pattern,
    spec.timing,
    lib,
  );
  const now = new Date().toISOString();
  const scenarios = (spec.scenarios ?? []).map((sc) => ({
    id: newId<'Scenario'>(),
    name: sc.name,
    savedAt: now,
    blast: applyTiming(blast, pattern, sc.timing, lib),
  }));
  const top = spec.floorElevation + spec.benchHeight;

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
        ...(spec.rock.tensileMPa ? { tensileStrength: spec.rock.tensileMPa * 1e6 } : {}),
        ...(spec.rock.vp ? { vp: spec.rock.vp } : {}),
      },
    ],
    monitoringPoints: spec.monitoring.map((m) => ({
      id: newId<'MonitoringPoint'>(),
      name: m.name,
      position: { x: o.x + m.dx, y: o.y + m.dy, z: top },
      ...(m.structure ? { structure: m.structure } : {}),
      ...(m.ppvLimitMmS ? { ppvLimit: m.ppvLimitMmS / 1000 } : {}),
    })),
    ppvLimits: [
      ...(project.ppvLimits ?? []),
      ...(spec.ppvLimits ?? []).map((l) => ({
        structure: l.structure,
        from: 0,
        ppvMax: l.ppvMaxMmS / 1000,
        source: l.source,
      })),
    ],
    blasts: [blast],
    ...(scenarios.length ? { scenarios } : {}),
  };
}

/** Amarre o tiempos electrónicos de la receta sobre la voladura (reemplaza la iniciación). */
function applyTiming(blast: Blast, pattern: Pattern, t: ExampleTiming, lib: ProductLibrary): Blast {
  let holes = blast.holes;
  const firstRow = holes.filter((h) => h.row === 0);
  const cols = firstRow.map((h) => h.col ?? 0);
  const centerCol = cols.length ? Math.round((Math.min(...cols) + Math.max(...cols)) / 2) : 0;
  const clean = {
    ...blast,
    initiation: { system: 'nonel' as const, nodes: [], connections: [], initiationPoints: [] },
  };
  if (t.mode === 'electronic') {
    const det = product(lib.detonators, 'Electrónico');
    const allCols = holes.map((h) => h.col ?? 0);
    const minCol = allCols.length ? Math.min(...allCols) : 0;
    const maxCol = allCols.length ? Math.max(...allCols) : 0;
    // Taladro a taladro: la fila siguiente empieza un intervalo después del último de la anterior,
    // así ningún par queda dentro de la ventana de coincidencia.
    const interRowMs = t.exact
      ? t.interRowMs
      : Math.max(t.interRowMs, (maxCol - minCol + 1) * t.interHoleMs + t.interHoleMs);
    const times = electronicTimes(clean, {
      patternId: pattern.id,
      startRow: 0,
      startCol: t.from === 'last' ? maxCol : minCol,
      interHole: t.interHoleMs / 1000,
      interRow: interRowMs / 1000,
      offset: 0.01,
      detonatorId: det.id,
    });
    holes = holes.map((h) => ({
      ...h,
      initiators: withDownholeDetonator(h, det.id, times.get(h.id) ?? 0),
    }));
    return { ...clean, holes, initiation: { ...clean.initiation, system: 'electronic' } };
  }
  const det = product(lib.detonators, 'Nonel fondo 500');
  // Si la receta cambia de electrónico a nonel, los taladros vuelven al detonador de fondo.
  holes = holes.map((h) =>
    h.initiators.some((i) => i.detonatorId === det.id)
      ? h
      : { ...h, initiators: withDownholeDetonator(h, det.id, det.nominalDelay) },
  );
  const plan = rowTieUp(
    { ...clean, holes },
    {
      patternId: pattern.id,
      startRow: 0,
      startCol: t.mode === 'v' ? centerCol : cols.length ? Math.min(...cols) : 0,
      interHoleConnectorId: product(lib.surfaceConnectors, t.interHole).id,
      interRowConnectorId: product(lib.surfaceConnectors, t.interRow).id,
      mode: t.mode === 'echelon' ? 'echelon' : 'rows',
    },
  );
  return { ...clean, holes, initiation: { ...clean.initiation, ...plan } };
}

// ------------------------------------------------------------------ Proyectos de ejemplo

const ORIGIN = { x: 345_200, y: 8_512_400 };
// RT y Vp típicos de un pórfido competente (valores de ejemplo): VPPc = 8 MPa · 4500 m/s / 45 GPa
// = 0,8 m/s, dentro de los 700–1000 mm/s de roca dura (P-17). Perforación 9 US$/m (`R1` F28).
const ROCK = { name: 'Pórfido', density: 2650, ucsMPa: 120, eGPa: 45, tensileMPa: 8, vp: 4500 };

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

export interface ExampleInfo {
  id: string;
  name: string;
  description: string;
  /** Proyecto con los binarios de su topografía (D-16); un levantamiento real se carga al pedirlo. */
  build: () => Promise<ExampleBuild>;
}

/** Recetas de los ejemplos (exportadas para tests y variantes). */
export const EXAMPLE_SPECS = {
  production: {
    drillingCostPerMeter: 9,
    projectName: 'Demo · Producción estándar',
    blastName: 'Banco 3435 · Fase 2',
    origin: ORIGIN,
    floorElevation: 3435,
    benchHeight: 15,
    faceAngleDeg: 75,
    // Chaflán de 12 m: con 18 m el recorte dejaba un taladro de esquina sin vecino delante y sin
    // alivio al detonar (burden efectivo > 2·B, revisión de G5).
    perimeter: perimeter(150, 72, 12),
    freeFaceEdges: [NORTH],
    pattern: { kind: 'staggered', burden: 6, spacing: 7, diameterMm: 229, subdrill: 1.5 },
    frontOffset: 3,
    // Las dos filas del fondo (junto a la pared final) son buffer: sin carga de fondo y más taco.
    charge: (row, rows) =>
      row >= rows - 2
        ? { column: 'ANFO', stemming: 5, primer: 'Booster 450', detonator: 'Nonel fondo 500' }
        : {
            bottom: { explosive: 'ANFO pesado', length: 3 },
            column: 'ANFO',
            stemming: 4.5,
            primer: 'Booster 450',
            detonator: 'Nonel fondo 500',
          },
    groups: (row, rows) =>
      row >= rows - 2
        ? { name: 'Buffer', kind: 'buffer' }
        : { name: 'Producción', kind: 'production' },
    timing: { mode: 'v', interHole: 'Nonel superficie 17', interRow: 'Nonel superficie 42' },
    scenarios: [
      {
        name: 'Salida en fila (línea a línea)',
        timing: { mode: 'line', interHole: 'Nonel superficie 17', interRow: 'Nonel superficie 42' },
      },
      {
        name: 'En escalón',
        timing: {
          mode: 'echelon',
          interHole: 'Nonel superficie 25',
          interRow: 'Nonel superficie 42',
        },
      },
    ],
    monitoring: [
      { name: 'Campamento', dx: 75, dy: -620, structure: 'vivienda' },
      { name: 'Línea eléctrica', dx: 480, dy: 40, structure: 'línea eléctrica' },
    ],
    ppvLimits: [
      {
        structure: 'vivienda',
        ppvMaxMmS: 10,
        source: 'Valor de demostración, no es norma: reemplazar por el del EIA de la operación',
      },
    ],
    rock: ROCK,
  } satisfies ExampleSpec,
  /** Cantera en ladera con electrónicos junto a la planta (sobre terreno: `buildQuarryExample`). */
  electronic: {
    projectName: 'Demo · Cantera en ladera',
    blastName: 'Banco 3462 · Frente de cantera',
    origin: ORIGIN,
    floorElevation: 3450,
    benchHeight: 12,
    faceAngleDeg: 72,
    // Chaflán de 6 m: con 8 m el taladro de esquina de la 2ª fila salía con 1,6·B (aviso de P-16).
    perimeter: perimeter(80, 45, 6),
    freeFaceEdges: [NORTH],
    pattern: { kind: 'rectangular', burden: 4, spacing: 5, diameterMm: 165, subdrill: 1 },
    frontOffset: 2,
    charge: () => ({
      column: 'Emulsión bombeable',
      stemming: 3.5,
      primer: 'Booster 450',
      detonator: 'Electrónico',
    }),
    timing: { mode: 'electronic', interHoleMs: 9, interRowMs: 160 },
    groups: () => ({ name: 'Producción controlada', kind: 'production' }),
    monitoring: [
      // Límite propio del punto (valor de demostración, no es norma).
      { name: 'Planta de chancado', dx: 40, dy: 170, structure: 'planta', ppvLimitMmS: 25 },
      { name: 'Taller', dx: -80, dy: 120, structure: 'planta' },
    ],
    rock: { ...ROCK, name: 'Andesita' },
  } satisfies ExampleSpec,
  /** Último banco junto a la pared final, inclinados (sobre terreno: `buildFinalWallExample`). */
  inclined: {
    projectName: 'Demo · Talud final',
    blastName: 'Banco 3420 · Pared final',
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
    // Las dos filas junto a la pared final son buffer: sin carga de fondo y más taco.
    charge: (row, rows) =>
      row >= rows - 2
        ? { column: 'ANFO', stemming: 5, primer: 'Booster 450', detonator: 'Nonel fondo 500' }
        : {
            bottom: { explosive: 'ANFO pesado', length: 2.5 },
            column: 'ANFO',
            stemming: 4,
            primer: 'Booster 450',
            detonator: 'Nonel fondo 500',
          },
    groups: (row, rows) =>
      row >= rows - 2
        ? { name: 'Buffer (pared final)', kind: 'buffer' }
        : { name: 'Producción', kind: 'production' },
    timing: { mode: 'v', interHole: 'Nonel superficie 25', interRow: 'Nonel superficie 65' },
    monitoring: [{ name: 'Mirador (borde del tajo)', dx: 45, dy: -60 }],
    rock: ROCK,
  } satisfies ExampleSpec,
  /**
   * Caso de ejemplo de la pila de material (A7, pedido del usuario; demostración y regresión, no
   * es un CR): banco de 10 m, malla 4 × 5 m, 3 filas × 8 taladros, 25 ms entre taladros y 67 ms
   * entre filas (electrónicos), cara libre al Norte.
   */
  muckpile: {
    projectName: 'Demo · Pila de material',
    blastName: 'Banco 3500 · Desplazamiento',
    origin: ORIGIN,
    floorElevation: 3500,
    benchHeight: 10,
    faceAngleDeg: 75,
    // Rectángulo de 40 × 14 m; la arista 2 (Norte) es la cara libre (primera fila a un burden).
    perimeter: [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 14 },
      { x: 0, y: 14 },
    ],
    freeFaceEdges: [2],
    pattern: { kind: 'rectangular', burden: 4, spacing: 5, diameterMm: 127, subdrill: 1 },
    frontOffset: 4,
    charge: () => ({
      column: 'Emulsión bombeable',
      stemming: 2.5,
      primer: 'Booster 450',
      detonator: 'Electrónico',
    }),
    timing: { mode: 'electronic', interHoleMs: 25, interRowMs: 67, exact: true },
    scenarios: [
      {
        name: 'Salida desde el Este',
        timing: { mode: 'electronic', interHoleMs: 25, interRowMs: 67, exact: true, from: 'last' },
      },
    ],
    groups: () => ({ name: 'Producción', kind: 'production' }),
    monitoring: [{ name: 'Oficina de mina', dx: 20, dy: -300 }],
    rock: ROCK,
  } satisfies ExampleSpec,
};

/** Ejemplo sin levantamiento: el proyecto solo, sin binarios. */
const plain = (spec: ExampleSpec) => () =>
  Promise.resolve({ project: buildExample(spec), assets: [] });

/**
 * Ejemplos del menú: el primero es el banco plano de referencia (2D, completo); los demás están
 * sobre topografía, en escenarios distintos.
 */
export const EXAMPLES: ExampleInfo[] = [
  {
    id: 'production',
    name: 'Producción estándar (2D)',
    description: 'Banco plano completo · producción y buffer · salida en V · 2 escenarios',
    build: plain(EXAMPLE_SPECS.production),
  },
  {
    id: 'topoMine',
    name: 'Mina sobre levantamiento DXF',
    description: 'Tajo real (TIN de un DXF) · pared Norte, banco 3465',
    build: buildMineExample,
  },
  {
    id: 'topoSector',
    name: 'Banco con ortofoto',
    description: 'Talud de tres bancos con vuelo de dron · producción y buffer',
    build: () => Promise.resolve(buildSectorExample()),
  },
  {
    id: 'topoPit',
    name: 'Tajo con topografía',
    description: 'Tajo de 8 bancos · voladura en el banco 3385',
    build: () => Promise.resolve(buildPitExample()),
  },
  {
    id: 'electronic',
    name: 'Cantera en ladera',
    description: 'Electrónicos taladro a taladro · planta a 170 m',
    build: () => Promise.resolve(buildQuarryExample()),
  },
  {
    id: 'inclined',
    name: 'Talud final',
    description: 'Inclinados 15° · buffer junto a la pared final',
    build: () => Promise.resolve(buildFinalWallExample()),
  },
  {
    id: 'muckpile',
    name: 'Pila sobre el banco inferior',
    description: 'Banco de 10 m · el material cae al banco de abajo',
    build: () => Promise.resolve(buildMuckpileTopoExample()),
  },
];

/**
 * Errores frecuentes de terreno, para probar la revisión (Resultados → Alertas). No está en el
 * menú de ejemplos: lo usan los tests del diagnóstico.
 */
export function buildProblems(): Project {
  const project = buildExample({
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
    else if (i === 3)
      holes[i] = { ...h, initiators: [] }; // cargado sin detonador
    else if (i === 12)
      holes[i] = { ...h, water: 'dynamic' }; // ANFO con agua dinámica (P-09)
    else if (i === 14)
      // Columna abierta: el taco no llega a la boca (1 m sin asignar).
      holes[i] = {
        ...h,
        decks: h.decks.map((d) => (d.kind === 'stemming' ? { ...d, length: d.length - 1 } : d)),
      };
    else if (i === 16)
      // Detonador sin booster: el ANFO no se inicia bien (RM-05).
      holes[i] = {
        ...h,
        initiators: h.initiators.map((init) => {
          const copy = { ...init };
          delete copy.primerId;
          return copy;
        }),
      };
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
