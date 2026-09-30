import { applyHoleEdit } from '../document/commands';
import { holeBench } from '../geometry/boundary';
import { newId } from '../model/ids';
import type { BlastBoundary, Project, TopographySurvey, Vec2 } from '../model/types';
import { degToRad } from '../units/units';
import { packLines } from '../topography/assemble';
import type { OrthoImageData, TinData } from '../topography/asset';
import type { TopoLine } from '../topography/data';
import { freeFaceEdgesFromLines } from '../topography/design';
import { encodePngRgb } from '../topography/png';
import { SurfaceIndex } from '../topography/surfaceIndex';
import { buildSurvey, type SurveyParts } from '../topography/survey';
import { buildTin } from '../topography/tin';
import { buildCharge, buildExample, type ExampleSpec } from './examples';

/**
 * Proyectos de ejemplo sobre topografía (D-16). Terrenos sintéticos y deterministas (geometría de
 * demostración, no datos de una mina): la malla se apoya en el terreno, la cara libre sale de la
 * cresta y cada perímetro tiene su piso. Los binarios del levantamiento viajan como assets `CRTS`.
 */

export interface ExampleBuild {
  project: Project;
  /** Assets `CRTS` del levantamiento, para guardarlos antes de abrir el proyecto. */
  assets: { hash: string; bytes: Uint8Array }[];
}

/** Cara de banco de 15 m a 70°: ancho horizontal de la cara [m]. */
const BENCH = 15;
const FACE = BENCH / Math.tan(degToRad(70));

/** Roca de los ejemplos con topografía (valores de demostración, como los demás ejemplos). */
const ROCK = { name: 'Pórfido', density: 2650, ucsMPa: 120, eGPa: 45, tensileMPa: 8, vp: 4500 };

/**
 * Agrega el levantamiento al proyecto y apoya la voladura en él: el banco usa la topografía, cada
 * perímetro recibe su piso, y las bocas toman la cota del terreno con el largo y la carga
 * recalculados (la iniciación de la receta se conserva, con el detonador a su nueva profundidad).
 */
function onTopography(
  project: Project,
  spec: ExampleSpec,
  parts: SurveyParts & { tin: TinData },
  survey: { name: string; surveyDate: string; format: TopographySurvey['source']['format'] },
  boundaryFloor: number,
  nextBoundary: { name: string; polygon: Vec2[]; floor: number },
): ExampleBuild {
  const built = buildSurvey({ ...survey, files: [`${survey.name}.sintético`] }, parts);
  const topo: TopographySurvey = { ...built.survey, id: newId<'TopographySurvey'>() };
  const index = SurfaceIndex.build(parts.tin);
  const ground = (x: number, y: number, fallback: number) => index.elevationAt(x, y) ?? fallback;
  const base = project.blasts[0];
  if (!base) throw new Error('sin voladura');
  const boundaries: BlastBoundary[] = [
    ...base.boundaries.map((b, i) => (i === 0 ? { ...b, floorElevation: boundaryFloor } : b)),
    {
      id: newId<'Boundary'>(),
      name: nextBoundary.name,
      polygon: nextBoundary.polygon,
      freeFaceEdges: [],
      floorElevation: nextBoundary.floor,
    },
  ];
  const blast = { ...base, bench: { ...base.bench, topographyId: topo.id }, boundaries };
  const rows = Math.max(0, ...blast.holes.map((h) => h.row ?? 0)) + 1;
  const holes = blast.holes.map((h) => {
    const draped = applyHoleEdit(h, { z: ground(h.collar.x, h.collar.y, h.collar.z) }, blast);
    const { decks } = buildCharge(draped, spec.charge(h.row ?? 0, rows), project.library);
    const depth = Math.max(0, draped.length - 0.5);
    return { ...draped, decks, initiators: draped.initiators.map((i) => ({ ...i, depth })) };
  });
  const bench = holeBench(blast, holes[0] ?? { collar: { x: 0, y: 0, z: 0 } });
  return {
    project: {
      ...project,
      topography: [topo],
      coordinateSystem: {
        origin: { ...project.coordinateSystem.origin, z: bench.floorElevation + bench.height },
      },
      monitoringPoints: (project.monitoringPoints ?? []).map((m) => ({
        ...m,
        position: { ...m.position, z: ground(m.position.x, m.position.y, m.position.z) },
      })),
      blasts: [{ ...blast, holes }],
      // Los escenarios guardan la voladura: se actualizan con la misma geometría sobre el terreno.
      ...(project.scenarios
        ? {
            scenarios: project.scenarios.map((s) => ({
              ...s,
              blast: {
                ...s.blast,
                bench: blast.bench,
                boundaries,
                holes: s.blast.holes.map((h) => {
                  const on = holes.find((x) => x.id === h.id);
                  return on
                    ? {
                        ...h,
                        collar: on.collar,
                        length: on.length,
                        decks: on.decks,
                        initiators: h.initiators.map((i) => ({ ...i, depth: on.length - 0.5 })),
                      }
                    : h;
                }),
              },
            })),
          }
        : {}),
    },
    assets: built.assets,
  };
}

/** Triangulación desde puntos sueltos y líneas (las líneas se imponen como aristas). */
function tinFrom(points: number[], lines: readonly TopoLine[]): TinData {
  const all = [...points];
  const constraints: number[] = [];
  for (const l of lines) {
    const base = all.length / 3;
    const n = l.coords.length / 3;
    all.push(...l.coords);
    for (let i = 0; i + 1 < n; i++) constraints.push(base + i, base + i + 1);
    if (l.closed && n > 2) constraints.push(base + n - 1, base);
  }
  return buildTin(Float64Array.from(all), Uint32Array.from(constraints), { maxEdge: Infinity }).tin;
}

// ------------------------------------------------------------------ Tajo con topografía

const PIT = { x: 330_000, y: 8_100_150 };
const PIT_BOTTOM = 3340;
const PIT_BERM = 12;
const PIT_ASPECT = 1.3;
const pitRadius = (k: number) => 20 + k * (FACE + PIT_BERM);
const onEllipse = (r: number, deg: number): Vec2 => ({
  x: PIT.x + r * Math.cos(degToRad(deg)),
  y: PIT.y + (r / PIT_ASPECT) * Math.sin(degToRad(deg)),
});

/**
 * Tajo elíptico de 8 bancos de 15 m (pie, dos curvas intermedias y cresta de cada cara), como el
 * DXF de curvas de nivel de las pruebas. Voladura en el banco 3385 del lado Este, con la cara libre
 * en la cresta que da al tajo, y el próximo perímetro en el fondo del tajo con su propio piso.
 */
export function buildPitExample(): ExampleBuild {
  const lines: TopoLine[] = [];
  const ring = (r: number, z: number, role: TopoLine['role']): TopoLine => {
    const coords: number[] = [];
    for (let i = 0; i < 96; i++) {
      const p = onEllipse(r, (i * 360) / 96);
      coords.push(p.x, p.y, z);
    }
    return { coords, role, closed: true };
  };
  for (let k = 0; k < 8; k++) {
    const r = pitRadius(k);
    const z = PIT_BOTTOM + BENCH * k;
    lines.push(ring(r, z, 'toe'));
    for (const j of [1, 2]) lines.push(ring(r + (FACE * j) / 3, z + 5 * j, 'contour'));
    lines.push(ring(r + FACE, z + BENCH, 'crest'));
  }
  // Fondo del tajo: puntos sueltos para que la triangulación no quede con triángulos enormes.
  const bottom: number[] = [];
  for (let x = -16; x <= 16; x += 4)
    for (let y = -12; y <= 12; y += 4)
      if (Math.hypot(x, y * PIT_ASPECT) < 18) bottom.push(PIT.x + x, PIT.y + y, PIT_BOTTOM);
  const tin = tinFrom(bottom, lines);
  const lineSet = packLines(lines);

  // Banco 3385: entre la cresta de la cara 2 (hacia el tajo) y el pie de la cara 3 (menos 2 m).
  const crest = pitRadius(2) + FACE;
  const outer = pitRadius(3) - 2;
  const polygon: Vec2[] = [];
  for (let a = -25; a <= 25; a += 5) polygon.push(onEllipse(outer, a));
  for (let a = 25; a >= -25; a -= 5) polygon.push(onEllipse(crest, a));
  const freeFaceEdges = freeFaceEdgesFromLines(polygon, [lineSet], 1.0);
  const origin = { x: PIT.x, y: PIT.y };
  const spec: ExampleSpec = {
    projectName: 'Demo · Tajo con topografía',
    blastName: 'Banco 3385 · Lado Este',
    origin,
    floorElevation: 3370,
    benchHeight: BENCH,
    faceAngleDeg: 70,
    perimeter: polygon.map((p) => ({ x: p.x - origin.x, y: p.y - origin.y })),
    freeFaceEdges,
    pattern: { kind: 'staggered', burden: 4, spacing: 4.5, diameterMm: 165, subdrill: 1 },
    frontOffset: 2,
    charge: () => ({
      bottom: { explosive: 'ANFO pesado', length: 2 },
      column: 'ANFO',
      stemming: 3,
      primer: 'Booster 450',
      detonator: 'Nonel fondo 500',
    }),
    groups: () => ({ name: 'Producción', kind: 'production' }),
    timing: { mode: 'v', interHole: 'Nonel superficie 17', interRow: 'Nonel superficie 42' },
    monitoring: [{ name: 'Taller (borde del tajo)', dx: 170, dy: 40, structure: 'planta' }],
    rock: ROCK,
  };
  const next: Vec2[] = [-10, 10].flatMap((x) =>
    (x < 0 ? [-8, 8] : [8, -8]).map((y) => ({ x: PIT.x + x, y: PIT.y + y })),
  );
  return onTopography(
    buildExample(spec),
    spec,
    { tin, lines: lineSet },
    { name: 'Tajo sintético · curvas de nivel', surveyDate: '2026-09-15', format: 'dxf' },
    3370,
    { name: 'Próxima voladura · fondo 3340', polygon: next, floor: 3325 },
  );
}

// ------------------------------------------------------------------ Sector con ortofoto

const SECTOR = { x: 346_000, y: 8_511_600 };
/** Dominio del levantamiento [m] (Este u, Norte v, desde `SECTOR`). */
const SECTOR_W = 260;
const SECTOR_H = 200;
const LEVELS = [3400, 3385, 3370, 3355] as const;

/** Cresta de la cara k (baja hacia el Norte): curvas suaves y no paralelas. */
function crestV(k: number, u: number): number {
  const base = [40, 40 + FACE + 45, 40 + FACE + 45 + FACE + 15][k] ?? 0;
  return base + 5 * Math.sin((2 * Math.PI * u) / SECTOR_W + 0.3 * k);
}
const toeV = (k: number, u: number) => crestV(k, u) + FACE;

/** Ondulación natural del terreno (±0,4 m), determinista. */
function roughness(u: number, v: number): number {
  return (
    0.22 * Math.sin(u / 7.3 + v / 11.1) +
    0.13 * Math.sin(u / 3.1 - v / 5.7) +
    0.08 * Math.sin(0.9 * u + 0.4 * v)
  );
}

/**
 * Cota del sector: meseta a 3400 m que sube suave hacia el Sur, tres caras de 15 m a 70° y
 * bancos a 3385, 3370 y 3355 m con drenaje de 0,5 % y ondulaciones. El terreno queda entre 0,2 y
 * 0,9 m sobre la cota del banco y baja a ella en crestas y pies (las líneas quedan exactas y las
 * curvas de nivel de cada banco siguen su cresta, sin cruzar el banco).
 */
function sectorElevation(u: number, v: number): number {
  const edges = [0, 1, 2].flatMap((k) => [crestV(k, u), toeV(k, u)]);
  const near = Math.min(...edges.map((e) => Math.abs(v - e)));
  const fade = Math.min(1, near / 3);
  for (let k = 0; k < 3; k++) {
    const c = crestV(k, u);
    const t = toeV(k, u);
    if (v < c) {
      const top = LEVELS[k] ?? 3400;
      if (k === 0) return top + 0.02 * (c - v) + (0.45 + roughness(u, v)) * fade;
      // Bancos: drenaje hacia el pie (se apaga en crestas y pies, que quedan a su cota exacta).
      return top + (0.45 + 0.005 * (c - v) + roughness(u, v) * 0.6) * fade;
    }
    if (v <= t) return (LEVELS[k] ?? 0) - BENCH * ((v - c) / FACE);
  }
  return LEVELS[3] + (0.45 + roughness(u, v) * 0.6) * fade;
}

/** Ortofoto sintética (0,5 m/px): tonos por superficie, relieve, huellas, camino y equipos. */
function sectorImage(): OrthoImageData {
  const px = 0.5;
  const width = SECTOR_W / px;
  const height = SECTOR_H / px;
  const rgb = new Uint8Array(width * height * 3);
  const hash = (a: number, b: number) => {
    const s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
    return s - Math.floor(s);
  };
  // Luz desde el Noroeste a 45°.
  const light = [-Math.SQRT1_2 * Math.SQRT1_2, Math.SQRT1_2 * Math.SQRT1_2, Math.SQRT1_2];
  const equipment: {
    u: number;
    v: number;
    w: number;
    h: number;
    color: [number, number, number];
  }[] = [
    { u: 38, v: 70, w: 12, h: 7, color: [214, 120, 40] }, // pala
    { u: 58, v: 67, w: 9, h: 5, color: [226, 186, 40] }, // camión
    { u: 205, v: 76, w: 5, h: 3, color: [200, 70, 50] }, // perforadora
    { u: 90, v: 104, w: 9, h: 5, color: [226, 186, 40] }, // camión en el banco 3370
  ];
  for (let row = 0; row < height; row++)
    for (let col = 0; col < width; col++) {
      const u = (col + 0.5) * px;
      const v = SECTOR_H - (row + 0.5) * px;
      const z = sectorElevation(u, v);
      const dzdu = (sectorElevation(u + px, v) - sectorElevation(u - px, v)) / (2 * px);
      const dzdv = (sectorElevation(u, v + px) - sectorElevation(u, v - px)) / (2 * px);
      const n = [-dzdu, -dzdv, 1];
      const len = Math.hypot(n[0] ?? 0, n[1] ?? 0, 1);
      const shade = Math.max(
        0,
        ((n[0] ?? 0) * (light[0] ?? 0) + (n[1] ?? 0) * (light[1] ?? 0) + (light[2] ?? 0)) / len,
      );
      const slope = Math.hypot(dzdu, dzdv);
      let c: [number, number, number] =
        slope > 1.2 ? [112, 104, 98] : z > 3398 ? [138, 118, 94] : [162, 146, 118];
      // Huellas de camiones sobre los bancos, a lo largo de las crestas.
      if (slope < 0.2 && z < 3398) {
        const k = z > 3378 ? 0 : z > 3362 ? 1 : 2;
        const d = v - toeV(k, u);
        if (d > 0 && (d / 3.5) % 1 < 0.12) c = [c[0] + 12, c[1] + 11, c[2] + 9];
      }
      // Camino de acarreo sobre la meseta.
      if (v > 12 && v < 20) c = [170, 160, 144];
      for (const e of equipment)
        if (Math.abs(u - e.u) < e.w / 2 && Math.abs(v - e.v) < e.h / 2) c = e.color;
      const grain = (hash(col, row) - 0.5) * 18;
      const f = 0.55 + 0.6 * shade;
      const o = (row * width + col) * 3;
      rgb[o] = Math.max(0, Math.min(255, c[0] * f + grain));
      rgb[o + 1] = Math.max(0, Math.min(255, c[1] * f + grain));
      rgb[o + 2] = Math.max(0, Math.min(255, c[2] * f + grain));
    }
  return {
    mime: 'image/png',
    width,
    height,
    georef: {
      originX: SECTOR.x,
      originY: SECTOR.y + SECTOR_H,
      pixelSizeX: px,
      pixelSizeY: -px,
      rotation: 0,
    },
    bytes: encodePngRgb(rgb, width, height),
  };
}

/**
 * Sector de talud con ortofoto: meseta, tres caras de 15 m y bancos con ondulación natural. La
 * voladura de producción ocupa el banco 3385 entre el pie de la cara superior (6 m de resguardo)
 * y la cresta, que es su cara libre; el próximo perímetro está en el banco 3370 con su piso.
 */
export function buildSectorExample(): ExampleBuild {
  const at = (u: number, v: number): Vec2 => ({ x: SECTOR.x + u, y: SECTOR.y + v });
  // Puntos del terreno cada 2 m, lejos de crestas y pies (esas cotas las ponen las líneas).
  const points: number[] = [];
  for (let u = 0; u <= SECTOR_W; u += 2)
    for (let v = 0; v <= SECTOR_H; v += 2) {
      const near = [0, 1, 2].some(
        (k) => Math.abs(v - crestV(k, u)) < 0.6 || Math.abs(v - toeV(k, u)) < 0.6,
      );
      if (!near) points.push(SECTOR.x + u, SECTOR.y + v, sectorElevation(u, v));
    }
  const lines: TopoLine[] = [];
  for (let k = 0; k < 3; k++)
    for (const [role, vOf, z] of [
      ['crest', crestV, LEVELS[k]],
      ['toe', toeV, LEVELS[k + 1]],
    ] as const) {
      const coords: number[] = [];
      for (let u = 0; u <= SECTOR_W; u += 2) {
        const p = at(u, vOf(k, u));
        coords.push(p.x, p.y, z ?? 0);
      }
      lines.push({ coords, role, closed: false });
    }
  const tin = tinFrom(points, lines);
  const lineSet = packLines(lines);

  // Perímetro en el banco 3385: borde Sur a 6 m del pie superior, borde Norte en la cresta.
  const u0 = 70;
  const u1 = 190;
  const polygon: Vec2[] = [];
  for (let u = u0; u <= u1; u += 20) polygon.push(at(u, toeV(0, u) + 6));
  for (let u = u1; u >= u0; u -= 10) polygon.push(at(u, crestV(1, u)));
  const freeFaceEdges = freeFaceEdgesFromLines(polygon, [lineSet], 1.0);
  const origin = { x: SECTOR.x, y: SECTOR.y };
  const spec: ExampleSpec = {
    projectName: 'Demo · Banco sobre topografía',
    blastName: 'Banco 3385 · Sector Sur',
    origin,
    floorElevation: 3370,
    benchHeight: BENCH,
    faceAngleDeg: 70,
    perimeter: polygon.map((p) => ({ x: p.x - origin.x, y: p.y - origin.y })),
    freeFaceEdges,
    pattern: { kind: 'staggered', burden: 6, spacing: 7, diameterMm: 229, subdrill: 1.5 },
    frontOffset: 3,
    drillingCostPerMeter: 9,
    // Las dos filas junto al pie de la cara de arriba son buffer (cuidan el talud).
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
        ? { name: 'Buffer (talud)', kind: 'buffer' }
        : { name: 'Producción', kind: 'production' },
    timing: { mode: 'v', interHole: 'Nonel superficie 17', interRow: 'Nonel superficie 42' },
    scenarios: [
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
      { name: 'Chancador primario', dx: 130, dy: -380, structure: 'planta' },
      { name: 'Oficinas de mina', dx: -300, dy: -250, structure: 'vivienda' },
    ],
    ppvLimits: [
      {
        structure: 'vivienda',
        ppvMaxMmS: 10,
        source: 'Valor de demostración, no es norma: reemplazar por el del EIA de la operación',
      },
    ],
    rock: ROCK,
  };
  const next: Vec2[] = [];
  for (let u = 80; u <= 180; u += 20) next.push(at(u, toeV(1, u) + 2));
  for (let u = 180; u >= 80; u -= 20) next.push(at(u, crestV(2, u)));
  return onTopography(
    buildExample(spec),
    spec,
    { tin, lines: lineSet, image: sectorImage() },
    { name: 'Sector Sur · levantamiento con dron', surveyDate: '2026-09-20', format: 'image' },
    3370,
    { name: 'Próxima voladura · banco 3370', polygon: next, floor: 3355 },
  );
}
