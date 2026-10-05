import {
  computeDisplacement,
  rowFromFace,
  STANDARD_GRAVITY,
  type Displacement,
} from '../analysis/displacement';
import { deckIntervals, indexLibrary } from '../charging/charge';
import { computeCharges, type ChargeResult } from '../charging/chargeAnalysis';
import type { ScalarGrid } from '../energy/contours';
import {
  kuzRam,
  kuzRamInputsFromBlast,
  rosinRammlerSize,
  type KuzRamResult,
} from '../fragmentation/fragmentation';
import { holeToe } from '../geometry/hole';
import { holeBoundary } from '../geometry/boundary';
import {
  boundaryFace,
  faceEdges,
  faceOffsetAt,
  faceWedgeAt,
  type FaceGeometry,
} from '../geometry/face';
import { clipPolygonConvex } from '../charging/influence';
import { pointInPolygon, polygonBounds, polygonSignedArea } from '../geometry/polygon';
import { PointIndex } from '../geometry/spatialIndex';
import type {
  Blast,
  BlastId,
  MuckpileParams,
  ProductLibrary,
  Project,
  RockMass,
  Vec2,
  Vec3,
} from '../model/types';
import { effectiveBurden, freeFaceSegments, type EffectiveBurden } from '../timing/effectiveBurden';
import { computeTiming } from '../timing/timing';
import { Heightmap, type Lattice } from './heightmap';
import type {
  ElevationSource,
  MuckpileBlocks,
  MuckpileResult,
  MuckpileVectors,
  MuckpileStats,
  MuckpileWarning,
} from './types';
import { blockVelocityFactor, burdenExponent, launchAngle, velocityStrategy } from './velocity';

const G = STANDARD_GRAVITY;
/** Vuelo máximo que se sigue [s]; más allá el bloque cae donde esté. */
const MAX_FLIGHT = 30;
/** Alcance máximo que dimensiona la grilla [m] (un bloque más lejos se recorta al borde). */
const MAX_REACH = 400;
/** Espesor mínimo de material para contar una celda como parte de la pila [m] (throw, lateral). */
export const PILE_MIN_THICKNESS = 0.1;
/** Cortes de las clases de tamaño por defecto [m] (tabla de fragmentación de la pila). */
export const DEFAULT_SIZE_CLASSES: readonly number[] = [0.1, 0.2, 0.4, 0.6, 0.8, 1, 1.5];
const DEFAULT_ROCK_DENSITY = 2650;
/** Bloques depositados entre dos relajaciones de la pila (lote; ver `Heightmap.deposit`). */
const RELAX_BATCH = 16;

/** Entradas del modelo ya calculadas (el worker las arma una vez y puede iterar parámetros). */
export interface MuckpileInput {
  blast: Blast;
  library: ProductLibrary;
  rock: RockMass | undefined;
  charge: ChargeResult;
  fireTime: Float64Array;
  effectiveBurden: EffectiveBurden;
  displacement: Displacement;
  /** Terreno pre-voladura (topografía del banco); sin ella, banco plano y regla de caras libres. */
  surface?: ElevationSource | null;
}

export interface MuckpileOptions {
  /** Cortes ascendentes de las clases de tamaño [m]. */
  sizeClasses?: readonly number[];
  /** Máximo de celdas de la grilla de la pila (si se supera, la celda crece). */
  maxCells?: number;
}

/** Carga, tiempos, burden efectivo y velocidad de Zhang de una voladura del proyecto. */
export function muckpileInput(
  project: Project,
  blastId: BlastId,
  surface?: ElevationSource | null,
): MuckpileInput | null {
  const blast = project.blasts.find((b) => b.id === blastId);
  if (!blast) return null;
  const rock = project.rockMasses.find((r) => r.id === blast.rockMassId);
  const density = rock?.density ?? DEFAULT_ROCK_DENSITY;
  const charge = computeCharges(blast, project.library, density);
  const timing = computeTiming(
    blast,
    project.library,
    { coincidenceWindow: blast.calcParams.micWindow },
    charge.perHole,
  );
  const eb = effectiveBurden(blast, timing.fireTime, blast.calcParams.reliefRate);
  const displacement = computeDisplacement(
    blast,
    project.library,
    density,
    eb,
    blast.calcParams.displacement,
  );
  return {
    blast,
    library: project.library,
    rock,
    charge,
    fireTime: timing.fireTime,
    effectiveBurden: eb,
    displacement,
    surface: surface ?? null,
  };
}

/** Pila de material de una voladura del proyecto con sus parámetros guardados. */
export function computeMuckpile(
  project: Project,
  blastId: BlastId,
  surface?: ElevationSource | null,
  options: MuckpileOptions = {},
): MuckpileResult | null {
  const input = muckpileInput(project, blastId, surface);
  return input ? simulateMuckpile(input, input.blast.calcParams.muckpile, options) : null;
}

interface Footprint {
  polygon: readonly Vec2[];
  floor: number;
}

/** Columna in situ en (x, y): piso y techo [m] (perímetro o cuña del talud, A7b). */
interface Column {
  floor: number;
  top: number;
}

interface HoleKinematics {
  /** Velocidad inicial del taladro con la reducción por fila [m/s] (NaN = no vuela). */
  speed: number;
  ux: number;
  uy: number;
  /** Cota del tope de la carga [m] (NaN sin explosivo). */
  chargeTop: number;
  /** Extremos de la columna explosiva (para el tamaño de fragmento). */
  chargeA: Vec3 | null;
  chargeB: Vec3 | null;
  /** Burden de referencia para la atenuación por distancia [m]. */
  burden: number;
  collar: Vec3;
  /** Desplazamiento horizontal del eje por metro de bajada. */
  slopeX: number;
  slopeY: number;
  kuzRam: KuzRamResult | null;
  /** Burden efectivo en la boca [m] y si lo fija la cara libre (no el frente de un taladro previo). */
  effective: number;
  faceGoverned: boolean;
  /** Cara libre del perímetro del taladro (A7b): ángulo y alto. */
  face: FaceGeometry;
}

/**
 * Modelo cinemático de la pila (A7; Yang & Kavetsky, `docs/RULES.md` FC-39). El volumen in situ
 * entre el techo (topografía o banco plano) y el piso se discretiza en bloques, cada uno se asigna
 * al taladro más cercano a su cota (Voronoi), sale al detonar su taladro hacia la superficie libre
 * de ese instante (`effectiveBurden.toward`), vuela en tiro parabólico hasta la superficie actual
 * y se deposita esponjado; la pila se relaja al ángulo de reposo. Determinista. Supuestos de la
 * discretización en S-19 (`docs/QUESTIONS.md`).
 */
export function simulateMuckpile(
  input: MuckpileInput,
  params: MuckpileParams,
  options: MuckpileOptions = {},
): MuckpileResult {
  const t0 = performance.now();
  const { blast, charge, fireTime } = input;
  const eb = input.effectiveBurden;
  const warnings: MuckpileWarning[] = [];
  const cell = params.blockSize;
  const H = blast.bench.height;

  // ------------------------------------------------------------ Huella in situ
  const charged: number[] = [];
  blast.holes.forEach((_, i) => {
    if ((charge.perHole[i] ?? 0) > 0) charged.push(i);
  });
  // Solo se vuela un perímetro con taladros cargados dentro: uno sin ellos (p. ej. la próxima
  // voladura en el banco de abajo) es roca intacta y queda como terreno fijo.
  const drawn = blast.boundaries.filter((b) => b.polygon.length >= 3);
  const blasted = drawn.filter((b) =>
    charged.some((i) => {
      const c = blast.holes[i]?.collar;
      return c !== undefined && pointInPolygon(c.x, c.y, b.polygon);
    }),
  );
  const footprints: Footprint[] = blasted.map((b) => ({
    polygon: b.polygon,
    floor: b.floorElevation ?? blast.bench.floorElevation,
  }));
  // Caras libres de los perímetros volados: la roca bajo el talud (cuña) también sale (A7b).
  const edges = faceEdges({ bench: blast.bench, boundaries: blasted });
  if (drawn.length > footprints.length && footprints.length > 0)
    warnings.push({
      id: 'muckpile.unblastedBoundaries',
      params: { n: drawn.length - footprints.length },
    });
  if (footprints.length === 0 && charge.autoBoundary && charge.autoBoundary.length >= 3)
    footprints.push({ polygon: charge.autoBoundary, floor: blast.bench.floorElevation });
  if (footprints.length === 0) warnings.push({ id: 'muckpile.noFootprint' });
  if (charged.length === 0) warnings.push({ id: 'muckpile.noChargedHoles' });
  if (params.velocityModel === 'scaledBurden') warnings.push({ id: 'muckpile.powerLawR0' });
  if (params.velocityModel === 'richardsMoore')
    warnings.push({ id: 'muckpile.faceVelocityFlyrock' });
  if (footprints.length === 0 || charged.length === 0) return emptyResult(warnings, t0);

  const footprintAt = (x: number, y: number): Footprint | null => {
    for (const f of footprints) if (pointInPolygon(x, y, f.polygon)) return f;
    return null;
  };
  const topAt = (x: number, y: number, f: Footprint): number =>
    input.surface?.elevationAt(x, y) ?? f.floor + H;
  /**
   * Cuña del talud frente a la cresta (A7b, FC-46): entre el piso y la cara, que baja con el ángulo
   * del perímetro hasta su pie. Con topografía, el techo es el terreno.
   */
  const wedgeAt = (x: number, y: number): Column | null => {
    const w = faceWedgeAt(edges, x, y);
    if (!w) return null;
    const floor = w.edge.boundary.floorElevation ?? blast.bench.floorElevation;
    const analytic = Math.max(
      w.edge.face.toeZ,
      w.edge.face.crestZ - w.s * Math.tan(w.edge.face.angle),
    );
    const top = input.surface ? (input.surface.elevationAt(x, y) ?? analytic) : analytic;
    return top - floor > 0 ? { floor, top } : null;
  };

  // ------------------------------------------------------------ Cinemática por taladro
  const lib = indexLibrary(input.library);
  const strategy = velocityStrategy(params, input.displacement);
  const average = input.rock && kuzRamInputsFromBlast(blast, input.library, charge, input.rock);
  const kin: HoleKinematics[] = blast.holes.map((h, i) => {
    const cosI = Math.cos(h.inclination);
    let chargeTopDepth = Infinity;
    let chargeBottomDepth = -Infinity;
    let rwsLen = 0;
    let len = 0;
    let columnLength = 0;
    for (const iv of deckIntervals(h)) {
      if (iv.deck.kind !== 'explosive') continue;
      columnLength += iv.bottom - Math.max(0, iv.top);
      chargeTopDepth = Math.min(chargeTopDepth, Math.max(0, iv.top));
      chargeBottomDepth = Math.max(chargeBottomDepth, iv.bottom);
      const e = lib.explosives.get(iv.deck.explosiveId);
      if (e) {
        rwsLen += e.rws * (iv.bottom - iv.top);
        len += iv.bottom - iv.top;
      }
    }
    const toe = holeToe(h);
    const along = (d: number): Vec3 => {
      const t = h.length > 0 ? d / h.length : 0;
      return {
        x: h.collar.x + (toe.x - h.collar.x) * t,
        y: h.collar.y + (toe.y - h.collar.y) * t,
        z: h.collar.z + (toe.z - h.collar.z) * t,
      };
    };
    const hasCharge = Number.isFinite(chargeTopDepth);
    const q = charge.perHole[i] ?? 0;
    const effective = eb.effective[i] ?? NaN;
    const nominal = eb.nominal[i] ?? NaN;
    const ux = eb.toward[2 * i] ?? 0;
    const uy = eb.toward[2 * i + 1] ?? 0;
    const base = strategy.holeVelocity({
      index: i,
      charge: q,
      chargeLength: columnLength,
      effectiveBurden: effective,
    });
    const row = rowFromFace(eb.faceDistance[i] ?? Infinity, nominal);
    const speed =
      q > 0 && (ux !== 0 || uy !== 0)
        ? base * Math.pow(blast.calcParams.displacement.rowFactor, row - 1)
        : NaN;
    let kr: KuzRamResult | null = null;
    if (average && q > 0) {
      const lf = charge.loadingFactorPerHole[i] ?? 0;
      kr = kuzRam({
        ...average,
        chargePerHole: q,
        loadingFactor: lf > 0 ? lf : average.loadingFactor,
        rws: len > 0 ? rwsLen / len : average.rws,
      });
    }
    const drop = h.length * cosI;
    const fd = eb.faceDistance[i] ?? NaN;
    return {
      effective,
      faceGoverned: Number.isFinite(effective) && Math.abs(effective - fd) < 1e-6,
      face: boundaryFace(blast.bench, holeBoundary(blast, h)),
      speed,
      ux,
      uy,
      chargeTop: hasCharge ? h.collar.z - chargeTopDepth * cosI : NaN,
      chargeA: hasCharge ? along(chargeTopDepth) : null,
      chargeB: hasCharge ? along(chargeBottomDepth) : null,
      burden: Number.isFinite(nominal) ? nominal : effective,
      collar: h.collar,
      slopeX: drop > 1e-9 ? (toe.x - h.collar.x) / drop : 0,
      slopeY: drop > 1e-9 ? (toe.y - h.collar.y) / drop : 0,
      kuzRam: kr,
    };
  });

  // ------------------------------------------------------------ Bloques
  const holeIdx = new PointIndex(
    charged,
    Float64Array.from(charged, (i) => blast.holes[i]?.collar.x ?? 0),
    Float64Array.from(charged, (i) => blast.holes[i]?.collar.y ?? 0),
  );
  const ox: number[] = [];
  const oy: number[] = [];
  const oz: number[] = [];
  const bh: number[] = [];
  const bHole: number[] = [];
  const bVol: number[] = [];
  const bRel: number[] = [];
  const bFloorLayer: number[] = [];
  const bDist: number[] = [];
  const bSlope: number[] = [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let minFloor = Infinity;
  for (const f of footprints) {
    const b = polygonBounds(f.polygon);
    minX = Math.min(minX, b.minX);
    minY = Math.min(minY, b.minY);
    maxX = Math.max(maxX, b.maxX);
    maxY = Math.max(maxY, b.maxY);
    minFloor = Math.min(minFloor, f.floor);
  }
  const wedgeDone = new Set<number>();
  let wedgeVolume = 0;
  /** Pendiente del terreno en (x, y) por diferencias centradas a media celda (acotada a ±1,5). */
  const slopeAt = (x: number, y: number): [number, number] => {
    const s = input.surface;
    if (!s) return [0, 0];
    const h = cell / 2;
    const xa = s.elevationAt(x - h, y);
    const xb = s.elevationAt(x + h, y);
    const ya = s.elevationAt(x, y - h);
    const yb = s.elevationAt(x, y + h);
    if (xa === null || xb === null || ya === null || yb === null) return [0, 0];
    const clamp = (v: number) => Math.max(-1.5, Math.min(1.5, v));
    return [clamp((xb - xa) / (2 * h)), clamp((yb - ya) / (2 * h))];
  };
  /** Parte una columna (piso → techo) en capas de ≈ `cell` y asigna cada bloque a su taladro. */
  const addColumn = (
    cx: number,
    cy: number,
    area: number,
    floor: number,
    top: number,
    slope: [number, number] = [0, 0],
  ): void => {
    const thick = top - floor;
    if (!(thick > 0.1 * cell)) return;
    const nz = Math.max(1, Math.round(thick / cell));
    const dz = thick / nz;
    const near = holeIdx.neighbors(cx, cy, 6);
    for (let k = 0; k < nz; k++) {
      const z = floor + (k + 0.5) * dz;
      // Voronoi a la cota del bloque: distancia en planta al eje del taladro (inclinado o no).
      let best = -1;
      let bestD = Infinity;
      for (const hi of near) {
        const kh = kin[hi];
        if (!kh) continue;
        const down = kh.collar.z - z;
        const d = Math.hypot(
          cx - (kh.collar.x + kh.slopeX * down),
          cy - (kh.collar.y + kh.slopeY * down),
        );
        if (d < bestD) {
          bestD = d;
          best = hi;
        }
      }
      if (best < 0) continue;
      ox.push(cx);
      oy.push(cy);
      oz.push(z);
      bh.push(dz);
      bHole.push(best);
      bVol.push(area * dz);
      bRel.push((z - floor) / thick);
      bFloorLayer.push(k === 0 ? 1 : 0);
      bDist.push(bestD);
      bSlope.push(k === nz - 1 ? slope[0] : 0, k === nz - 1 ? slope[1] : 0);
    }
  };
  // Columnas: celdas de la retícula recortadas con cada perímetro (área exacta en el borde).
  for (const f of footprints) {
    const fb = polygonBounds(f.polygon);
    const i0 = Math.floor(fb.minX / cell);
    const j0 = Math.floor(fb.minY / cell);
    const i1 = Math.ceil(fb.maxX / cell);
    const j1 = Math.ceil(fb.maxY / cell);
    for (let j = j0; j < j1; j++)
      for (let i = i0; i < i1; i++) {
        const square: Vec2[] = [
          { x: i * cell, y: j * cell },
          { x: (i + 1) * cell, y: j * cell },
          { x: (i + 1) * cell, y: (j + 1) * cell },
          { x: i * cell, y: (j + 1) * cell },
        ];
        // Área y centroide en coordenadas locales de la celda (UTM: evita la cancelación).
        const piece = clipPolygonConvex(f.polygon, square).map((p) => ({
          x: p.x - i * cell,
          y: p.y - j * cell,
        }));
        const area = Math.abs(polygonSignedArea(piece));
        if (area < 1e-6 * cell * cell) continue;
        const local = polygonCentroid(piece) ?? { x: 0.5 * cell, y: 0.5 * cell };
        const c = { x: local.x + i * cell, y: local.y + j * cell };
        // Techo: promedio del terreno en 3 × 3 puntos de la celda dentro del perímetro (en un
        // plano es exacto con el centroide; en terreno rugoso el volumen sale más fiel).
        let top = 0;
        let samples = 0;
        if (input.surface)
          for (let q = 0; q < 3; q++)
            for (let r = 0; r < 3; r++) {
              const x = (i + (r + 0.5) / 3) * cell;
              const y = (j + (q + 0.5) / 3) * cell;
              if (!pointInPolygon(x, y, f.polygon)) continue;
              top += topAt(x, y, f);
              samples++;
            }
        addColumn(
          c.x,
          c.y,
          area,
          f.floor,
          samples > 0 ? top / samples : topAt(c.x, c.y, f),
          slopeAt(c.x, c.y),
        );
      }
  }
  // Cuña del talud: celdas fuera de los perímetros, frente a una cara libre, hasta su pie.
  for (const e of edges) {
    if (e.face.run <= 0) continue;
    const xs = [e.a.x, e.b.x, e.a.x + e.normal.x * e.face.run, e.b.x + e.normal.x * e.face.run];
    const ys = [e.a.y, e.b.y, e.a.y + e.normal.y * e.face.run, e.b.y + e.normal.y * e.face.run];
    const i0 = Math.floor(Math.min(...xs) / cell);
    const i1 = Math.ceil(Math.max(...xs) / cell);
    const j0 = Math.floor(Math.min(...ys) / cell);
    const j1 = Math.ceil(Math.max(...ys) / cell);
    for (let j = j0; j < j1; j++)
      for (let i = i0; i < i1; i++) {
        const key = j * 1_000_003 + i;
        if (wedgeDone.has(key)) continue;
        wedgeDone.add(key);
        // Se integra con 6 × 6 submuestras: el talud puede ser más angosto que una celda.
        const SUB = 6;
        const a = (cell / SUB) ** 2;
        let areaW = 0;
        let volW = 0;
        let sx = 0;
        let sy = 0;
        let floor = NaN;
        for (let q = 0; q < SUB; q++)
          for (let r = 0; r < SUB; r++) {
            const x = (i + (r + 0.5) / SUB) * cell;
            const y = (j + (q + 0.5) / SUB) * cell;
            if (footprintAt(x, y)) continue;
            const col = wedgeAt(x, y);
            if (!col) continue;
            areaW += a;
            volW += a * (col.top - col.floor);
            sx += a * x;
            sy += a * y;
            floor = col.floor;
          }
        if (areaW < 1e-6 * cell * cell || !Number.isFinite(floor)) continue;
        const cx = sx / areaW;
        const cy = sy / areaW;
        const top = floor + volW / areaW;
        addColumn(cx, cy, areaW, floor, top, slopeAt(cx, cy));
        if (top - floor > 0.1 * cell) wedgeVolume += volW;
        minX = Math.min(minX, cx - cell);
        minY = Math.min(minY, cy - cell);
        maxX = Math.max(maxX, cx + cell);
        maxY = Math.max(maxY, cy + cell);
      }
  }
  const n = ox.length;
  if (n === 0) {
    warnings.push({ id: 'muckpile.noFootprint' });
    return emptyResult(warnings, t0);
  }

  // ------------------------------------------------------------ Salida
  const velocity = new Float32Array(3 * n);
  const launchTime = new Float64Array(n);
  const flight = new Float64Array(n); // estimado contra el piso, para ordenar y dimensionar
  let gx0 = minX;
  let gy0 = minY;
  let gx1 = maxX;
  let gy1 = maxY;
  let staticBlocks = 0;
  const staticHoles = new Set<number>();
  for (let k = 0; k < n; k++) {
    const h = bHole[k] ?? 0;
    const kh = kin[h];
    const tf = fireTime[h] ?? NaN;
    launchTime[k] = tf;
    const z = oz[k] ?? 0;
    const factor = kh
      ? blockVelocityFactor(params, {
          aboveCharge: Number.isFinite(kh.chargeTop) && z > kh.chargeTop,
          floorLayer: bFloorLayer[k] === 1,
          distance: bDist[k] ?? 0,
          burden: kh.burden,
        })
      : 0;
    // Burden a la cota del bloque (FC-46): si lo fija la cara libre, crece hacia el pie con la
    // inclinación del talud y se corrige por la inclinación del eje del taladro.
    let burdenRatio = 1;
    if (kh?.faceGoverned) {
      const down = Math.max(0, kh.collar.z - z);
      const axis = (kh.slopeX * kh.ux + kh.slopeY * kh.uy) * down;
      const offset = faceOffsetAt(kh.face, kh.face.crestZ - Math.min(down, kh.face.height));
      const b = Math.max(kh.effective, kh.effective + offset - axis);
      burdenRatio = Math.pow(kh.effective / b, burdenExponent(params));
    }
    const speed = (kh?.speed ?? NaN) * factor * burdenRatio;
    if (!kh || !Number.isFinite(speed) || !Number.isFinite(tf) || speed <= 0) {
      staticBlocks++;
      staticHoles.add(h);
      flight[k] = 0;
      continue;
    }
    const a = launchAngle(params, bRel[k] ?? 0, kh.face.angle);
    const vx = speed * Math.cos(a) * kh.ux;
    const vy = speed * Math.cos(a) * kh.uy;
    const vz = speed * Math.sin(a);
    velocity[3 * k] = vx;
    velocity[3 * k + 1] = vy;
    velocity[3 * k + 2] = vz;
    const fall = Math.max(0, z - minFloor);
    const tfl = (vz + Math.sqrt(vz * vz + 2 * G * fall)) / G;
    flight[k] = tfl;
    const reach = Math.min(MAX_REACH, Math.hypot(vx, vy) * tfl);
    const hv = Math.hypot(vx, vy) || 1;
    const lx = (ox[k] ?? 0) + (vx / hv) * reach;
    const ly = (oy[k] ?? 0) + (vy / hv) * reach;
    gx0 = Math.min(gx0, lx);
    gy0 = Math.min(gy0, ly);
    gx1 = Math.max(gx1, lx);
    gy1 = Math.max(gy1, ly);
  }
  if (staticBlocks > 0)
    warnings.push({
      id: 'muckpile.staticBlocks',
      params: { blocks: staticBlocks, holes: staticHoles.size },
    });

  // ------------------------------------------------------------ Grilla de la pila
  // Margen: la pila se abre al ángulo de reposo (≈ alto / tan φ) más unas celdas.
  const margin = (1.5 * H) / Math.tan(params.reposeAngle) + 4 * cell;
  let gcell = cell;
  const maxCells = options.maxCells ?? 1_500_000;
  const span = (gx1 - gx0 + 2 * margin) * (gy1 - gy0 + 2 * margin);
  if (span / (gcell * gcell) > maxCells) {
    gcell = cell * Math.ceil(Math.sqrt(span / (cell * cell) / maxCells));
    warnings.push({ id: 'muckpile.gridLimit', params: { cell: gcell } });
  }
  const lattice: Lattice = {
    x0: Math.floor((gx0 - margin) / gcell) * gcell,
    y0: Math.floor((gy0 - margin) / gcell) * gcell,
    cell: gcell,
    nx: 0,
    ny: 0,
  };
  lattice.nx = Math.max(2, Math.ceil((gx1 + margin - lattice.x0) / gcell));
  lattice.ny = Math.max(2, Math.ceil((gy1 + margin - lattice.y0) / gcell));
  const cells = lattice.nx * lattice.ny;
  const base = new Float64Array(cells);
  const before = new Float64Array(cells);
  const inFootprint = new Uint8Array(cells);
  const outside = outsideTerrain(blast, footprints, H);
  /** Celdas fuera del levantamiento (con topografía): se completan desde su borde. */
  const unknown = new Uint8Array(cells);
  for (let j = 0; j < lattice.ny; j++) {
    const y = lattice.y0 + (j + 0.5) * gcell;
    for (let i = 0; i < lattice.nx; i++) {
      const x = lattice.x0 + (i + 0.5) * gcell;
      const k = j * lattice.nx + i;
      const f = footprintAt(x, y);
      const w = f ? null : wedgeAt(x, y);
      if (f) {
        base[k] = f.floor;
        before[k] = Math.max(f.floor, topAt(x, y, f));
        inFootprint[k] = 1;
      } else if (w) {
        base[k] = w.floor;
        before[k] = w.top;
        // 2 = talud: fuera del throw, pero su bajada no es la del techo del banco.
        inFootprint[k] = 2;
      } else {
        const z = input.surface ? input.surface.elevationAt(x, y) : outside(x, y);
        if (z === null) unknown[k] = 1;
        else {
          base[k] = z;
          before[k] = z;
        }
      }
    }
  }
  if (input.surface) extendSurvey(lattice, base, before, unknown, outside);
  const hm = new Heightmap(lattice, base, params.reposeAngle);

  // ------------------------------------------------------------ Vuelo y depósito
  const order = Array.from({ length: n }, (_, k) => k);
  const landing = Float64Array.from({ length: n }, (_, k) => {
    const t = launchTime[k] ?? NaN;
    return Number.isFinite(t) ? t + (flight[k] ?? 0) : Infinity;
  });
  order.sort((a, b) => (landing[a] ?? 0) - (landing[b] ?? 0) || a - b);
  const impact = new Float64Array(3 * n);
  const impactTime = new Float64Array(n);
  let clipped = 0;
  let batch = 0;
  for (const k of order) {
    const x0 = ox[k] ?? 0;
    const y0 = oy[k] ?? 0;
    const z0 = oz[k] ?? 0;
    const vx = velocity[3 * k] ?? 0;
    const vy = velocity[3 * k + 1] ?? 0;
    const vz = velocity[3 * k + 2] ?? 0;
    const hit = flyToImpact(hm, x0, y0, z0, vx, vy, vz);
    if (hit.clipped) clipped++;
    impact[3 * k] = hit.x;
    impact[3 * k + 1] = hit.y;
    impact[3 * k + 2] = hm.heightAt(hit.x, hit.y);
    impactTime[k] = (launchTime[k] ?? NaN) + hit.t;
    // Se relaja por lotes de bloques que llegan juntos: el resultado es el mismo en reposo y la
    // avalancha no se repite por cada bloque.
    batch++;
    hm.deposit(hit.x, hit.y, (bVol[k] ?? 0) * params.swell, batch % RELAX_BATCH === 0);
  }
  hm.relax();
  if (clipped > 0) warnings.push({ id: 'muckpile.clipped', params: { blocks: clipped } });

  // ------------------------------------------------------------ Posición final en la pila
  const destination = placeBlocks(hm, order, impact, bVol, params.swell);

  // ------------------------------------------------------------ Atributos
  const fragmentSize = fragmentSizes(n, bHole, ox, oy, oz, kin);
  const domains = blast.domains ?? [];
  const domain = new Int16Array(n).fill(-1);
  if (domains.length > 0)
    for (let k = 0; k < n; k++) {
      const x = ox[k] ?? 0;
      const y = oy[k] ?? 0;
      domain[k] = domains.findIndex(
        (d) => d.polygon.length >= 3 && pointInPolygon(x, y, d.polygon),
      );
    }

  const blocks: MuckpileBlocks = {
    count: n,
    origin: interleave(ox, oy, oz),
    impact,
    destination,
    velocity,
    launchTime,
    impactTime,
    hole: Int32Array.from(bHole),
    volume: Float32Array.from(bVol),
    height: Float32Array.from(bh),
    topSlope: Float32Array.from(bSlope),
    fragmentSize,
    domain,
  };
  const grids = cellAttributes(hm, before, blocks, domains.length);
  const stats = {
    ...pileStats(blast, blocks, hm, before, inFootprint, params.swell, staticBlocks),
    wedgeVolume,
  };
  const classes = options.sizeClasses ?? DEFAULT_SIZE_CLASSES;
  return {
    blocks,
    vectors: holeVectors(blocks),
    grids,
    stats,
    sizeClasses: sizeClassFractions(blocks, classes),
    warnings,
    elapsedMs: performance.now() - t0,
  };
}

/**
 * Terreno fuera del perímetro sin topografía (supuesto S-20): del lado de una cara libre (arista
 * marcada o cresta) el terreno está al piso del banco; del otro lado sigue el macizo a la cota del
 * techo. Decide la arista o cresta más cercana.
 */
function outsideTerrain(
  blast: Blast,
  footprints: readonly Footprint[],
  H: number,
): (x: number, y: number) => number {
  const segs: { a: Vec2; b: Vec2; free: boolean; floor: number }[] = [];
  const faces = freeFaceSegments(blast);
  const onFace = (a: Vec2, b: Vec2) =>
    faces.some(
      ([p, q]) =>
        (Math.hypot(p.x - a.x, p.y - a.y) < 1e-6 && Math.hypot(q.x - b.x, q.y - b.y) < 1e-6) ||
        (Math.hypot(p.x - b.x, p.y - b.y) < 1e-6 && Math.hypot(q.x - a.x, q.y - a.y) < 1e-6),
    );
  for (const f of footprints) {
    const m = f.polygon.length;
    for (let i = 0; i < m; i++) {
      const a = f.polygon[i];
      const b = f.polygon[(i + 1) % m];
      if (a && b) segs.push({ a, b, free: onFace(a, b), floor: f.floor });
    }
  }
  const floor0 = footprints[0]?.floor ?? blast.bench.floorElevation;
  for (const [a, b] of faces) if (!onFace(a, b)) segs.push({ a, b, free: true, floor: floor0 });
  return (x, y) => {
    let best = segs[0];
    let bestD = Infinity;
    for (const s of segs) {
      const d = segmentDistance(x, y, s.a, s.b);
      if (d < bestD - 1e-9) {
        bestD = d;
        best = s;
      }
    }
    if (!best) return floor0;
    return best.free ? best.floor : best.floor + H;
  };
}

/**
 * Fuera del levantamiento (supuesto S-20): el terreno sigue a la cota del borde más cercano del
 * levantamiento (búsqueda en anchura desde las celdas conocidas), no salta al piso ni al techo de la
 * voladura. Sin ninguna celda conocida se usa la regla de caras libres.
 */
function extendSurvey(
  l: Lattice,
  base: Float64Array,
  before: Float64Array,
  unknown: Uint8Array,
  outside: (x: number, y: number) => number,
): void {
  const queue = new Int32Array(unknown.length);
  let head = 0;
  let tail = 0;
  for (let k = 0; k < unknown.length; k++) if (!unknown[k]) queue[tail++] = k;
  if (tail === 0) {
    for (let k = 0; k < unknown.length; k++) {
      const i = k % l.nx;
      const j = (k - i) / l.nx;
      const z = outside(l.x0 + (i + 0.5) * l.cell, l.y0 + (j + 0.5) * l.cell);
      base[k] = z;
      before[k] = z;
    }
    return;
  }
  while (head < tail) {
    const k = queue[head++] ?? 0;
    const i = k % l.nx;
    const j = (k - i) / l.nx;
    for (const [di, dj] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const ii = i + di;
      const jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= l.nx || jj >= l.ny) continue;
      const n = jj * l.nx + ii;
      if (!unknown[n]) continue;
      unknown[n] = 0;
      // El borde se toma del terreno fijo (fuera del perímetro base = before).
      base[n] = base[k] ?? 0;
      before[n] = base[k] ?? 0;
      queue[tail++] = n;
    }
  }
}

function segmentDistance(x: number, y: number, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / len2)) : 0;
  return Math.hypot(a.x + dx * t - x, a.y + dy * t - y);
}

/**
 * Tiro parabólico desde (x0, y0, z0) con velocidad (vx, vy, vz) hasta cortar la superficie actual
 * mientras baja (paso ≤ media celda y refinamiento por bisección). Sin velocidad, cae en el lugar.
 */
function flyToImpact(
  hm: Heightmap,
  x0: number,
  y0: number,
  z0: number,
  vx: number,
  vy: number,
  vz: number,
): { x: number; y: number; t: number; clipped: boolean } {
  if (vx === 0 && vy === 0 && vz === 0) return { x: x0, y: y0, t: 0, clipped: false };
  const cell = hm.lattice.cell;
  const vh = Math.hypot(vx, vy);
  const at = (t: number) => ({
    x: x0 + vx * t,
    y: y0 + vy * t,
    z: z0 + vz * t - 0.5 * G * t * t,
  });
  let t = 0;
  while (t < MAX_FLIGHT) {
    const dt = (0.5 * cell) / Math.max(vh, Math.abs(vz - G * t), 1);
    const tn = t + dt;
    const p = at(tn);
    if (!hm.contains(p.x, p.y)) {
      const q = at(t);
      return { x: q.x, y: q.y, t, clipped: true };
    }
    if (vz - G * tn <= 0 && p.z <= hm.heightAt(p.x, p.y)) {
      // Bisección entre t (sobre la superficie, si lo estaba) y tn (debajo).
      const q = at(t);
      if (q.z > hm.heightAt(q.x, q.y)) {
        let lo = t;
        let hi = tn;
        for (let it = 0; it < 12; it++) {
          const mid = (lo + hi) / 2;
          const m = at(mid);
          if (m.z > hm.heightAt(m.x, m.y)) lo = mid;
          else hi = mid;
        }
        const e = at(hi);
        return { x: e.x, y: e.y, t: hi, clipped: false };
      }
      return { x: p.x, y: p.y, t: tn, clipped: false };
    }
    t = tn;
  }
  const e = at(t);
  return { x: e.x, y: e.y, t, clipped: false };
}

/**
 * Posición final de cada bloque (supuesto S-23): en orden de llegada, se apila en la columna libre más cercana a
 * su punto de impacto (búsqueda por anillos), hasta llenar el volumen suelto de la pila relajada.
 * Lo primero en llegar queda abajo. Devuelve el centro del bloque [x, y, z, …].
 */
function placeBlocks(
  hm: Heightmap,
  order: readonly number[],
  impact: Float64Array,
  volume: readonly number[],
  swell: number,
): Float64Array {
  const { nx, ny, cell, x0, y0 } = hm.lattice;
  const area = cell * cell;
  const capacity = new Float64Array(nx * ny);
  for (let k = 0; k < capacity.length; k++)
    capacity[k] = Math.max(0, ((hm.h[k] ?? 0) - (hm.base[k] ?? 0)) * area);
  const filled = new Float64Array(nx * ny);
  const out = new Float64Array(3 * order.length);
  const maxR = Math.max(nx, ny);
  for (const k of order) {
    const vs = (volume[k] ?? 0) * swell;
    const px = impact[3 * k] ?? 0;
    const py = impact[3 * k + 1] ?? 0;
    const [ci, cj] = hm.cellAt(px, py);
    let chosen = -1;
    for (let r = 0; r <= maxR && chosen < 0; r++) {
      let bestD = Infinity;
      for (let dj = -r; dj <= r; dj++) {
        const jj = cj + dj;
        if (jj < 0 || jj >= ny) continue;
        const ring = Math.abs(dj) === r;
        for (let di = -r; di <= r; di += ring ? 1 : 2 * r || 1) {
          const ii = ci + di;
          if (ii < 0 || ii >= nx) continue;
          const c = jj * nx + ii;
          if ((capacity[c] ?? 0) - (filled[c] ?? 0) < 0.5 * vs) continue;
          const d = Math.hypot(x0 + (ii + 0.5) * cell - px, y0 + (jj + 0.5) * cell - py);
          if (d < bestD) {
            bestD = d;
            chosen = c;
          }
        }
      }
    }
    if (chosen < 0) chosen = cj * nx + ci;
    const ii = chosen % nx;
    const jj = (chosen - ii) / nx;
    const below = filled[chosen] ?? 0;
    filled[chosen] = below + vs;
    out[3 * k] = x0 + (ii + 0.5) * cell;
    out[3 * k + 1] = y0 + (jj + 0.5) * cell;
    out[3 * k + 2] = (hm.base[chosen] ?? 0) + (below + vs / 2) / area;
  }
  return out;
}

/**
 * Tamaño de fragmento de cada bloque (FC-44, supuesto S-22): la curva de Kuz-Ram del taladro
 * (con su carga y su factor de carga) se reparte entre sus bloques por cuantiles, del más cercano
 * a la columna explosiva (fino) al más lejano (grueso, zona del taco). El conjunto reproduce la
 * curva del taladro; el orden espacial es el supuesto.
 */
function fragmentSizes(
  n: number,
  bHole: readonly number[],
  ox: readonly number[],
  oy: readonly number[],
  oz: readonly number[],
  kin: readonly HoleKinematics[],
): Float32Array {
  const out = new Float32Array(n).fill(NaN);
  const byHole = new Map<number, number[]>();
  for (let k = 0; k < n; k++) {
    const h = bHole[k] ?? -1;
    let list = byHole.get(h);
    if (!list) byHole.set(h, (list = []));
    list.push(k);
  }
  // Distancia de cada bloque a su columna explosiva (un solo arreglo para todos los taladros).
  const d = new Float64Array(n);
  for (const [h, list] of byHole) {
    const kh = kin[h];
    const kr = kh?.kuzRam;
    if (!kh || !kr || !kh.chargeA || !kh.chargeB) continue;
    const a = kh.chargeA;
    const b = kh.chargeB;
    const dist = (k: number) => {
      const px = ox[k] ?? 0;
      const py = oy[k] ?? 0;
      const pz = oz[k] ?? 0;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dz = b.z - a.z;
      const len2 = dx * dx + dy * dy + dz * dz;
      const t =
        len2 > 0
          ? Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy + (pz - a.z) * dz) / len2))
          : 0;
      return Math.hypot(a.x + dx * t - px, a.y + dy * t - py, a.z + dz * t - pz);
    };
    for (const k of list) d[k] = dist(k);
    list.sort((p, q) => (d[p] ?? 0) - (d[q] ?? 0) || p - q);
    list.forEach((k, rank) => {
      out[k] = rosinRammlerSize((rank + 0.5) / list.length, kr.xc, kr.n);
    });
  }
  return out;
}

/** Centroide de un polígono simple (null si es degenerado). */
function polygonCentroid(p: readonly Vec2[]): Vec2 | null {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < p.length; i++) {
    const u = p[i];
    const v = p[(i + 1) % p.length];
    if (!u || !v) continue;
    const cross = u.x * v.y - v.x * u.y;
    a += cross;
    cx += (u.x + v.x) * cross;
    cy += (u.y + v.y) * cross;
  }
  if (Math.abs(a) < 1e-12) return null;
  return { x: cx / (3 * a), y: cy / (3 * a) };
}

function interleave(
  x: readonly number[],
  y: readonly number[],
  z: readonly number[],
): Float64Array {
  const out = new Float64Array(3 * x.length);
  for (let k = 0; k < x.length; k++) {
    out[3 * k] = x[k] ?? 0;
    out[3 * k + 1] = y[k] ?? 0;
    out[3 * k + 2] = z[k] ?? 0;
  }
  return out;
}

function toGrid(l: Lattice, values: Float64Array): ScalarGrid {
  return {
    originX: l.x0,
    originY: l.y0,
    cellSize: l.cell,
    nx: l.nx,
    ny: l.ny,
    values: Float32Array.from(values),
  };
}

/** Atributos por columna de la pila, ponderados por volumen de los bloques que terminan en ella. */
function cellAttributes(
  hm: Heightmap,
  before: Float64Array,
  blocks: MuckpileBlocks,
  domainCount: number,
): MuckpileResult['grids'] {
  const l = hm.lattice;
  const cells = l.nx * l.ny;
  const vol = new Float64Array(cells);
  const disp = new Float64Array(cells);
  const sizeVol = new Float64Array(cells);
  const size = new Float64Array(cells);
  const dom = domainCount > 0 ? new Float64Array(cells * domainCount) : null;
  for (let k = 0; k < blocks.count; k++) {
    const [i, j] = hm.cellAt(blocks.destination[3 * k] ?? 0, blocks.destination[3 * k + 1] ?? 0);
    const c = j * l.nx + i;
    const v = blocks.volume[k] ?? 0;
    const dx = (blocks.destination[3 * k] ?? 0) - (blocks.origin[3 * k] ?? 0);
    const dy = (blocks.destination[3 * k + 1] ?? 0) - (blocks.origin[3 * k + 1] ?? 0);
    vol[c] = (vol[c] ?? 0) + v;
    disp[c] = (disp[c] ?? 0) + v * Math.hypot(dx, dy);
    const s = blocks.fragmentSize[k] ?? NaN;
    if (Number.isFinite(s)) {
      sizeVol[c] = (sizeVol[c] ?? 0) + v;
      size[c] = (size[c] ?? 0) + v * s;
    }
    const d = blocks.domain[k] ?? -1;
    if (dom && d >= 0) dom[c * domainCount + d] = (dom[c * domainCount + d] ?? 0) + v;
  }
  const displacement = new Float32Array(cells);
  const fragmentSize = new Float32Array(cells);
  const domain = new Int16Array(cells).fill(-1);
  const domainPurity = new Float32Array(cells).fill(NaN);
  for (let c = 0; c < cells; c++) {
    const v = vol[c] ?? 0;
    displacement[c] = v > 0 ? (disp[c] ?? 0) / v : NaN;
    const sv = sizeVol[c] ?? 0;
    fragmentSize[c] = sv > 0 ? (size[c] ?? 0) / sv : NaN;
    if (dom && v > 0) {
      let best = -1;
      let bestV = 0;
      let total = 0;
      for (let d = 0; d < domainCount; d++) {
        const dv = dom[c * domainCount + d] ?? 0;
        total += dv;
        if (dv > bestV) {
          bestV = dv;
          best = d;
        }
      }
      domain[c] = best;
      domainPurity[c] = total > 0 ? bestV / total : NaN;
    }
  }
  return {
    base: toGrid(l, hm.base),
    before: toGrid(l, before),
    after: toGrid(l, hm.h),
    displacement,
    fragmentSize,
    domain,
    domainPurity,
  };
}

function pileStats(
  blast: Blast,
  blocks: MuckpileBlocks,
  hm: Heightmap,
  before: Float64Array,
  inFootprint: Uint8Array,
  swell: number,
  staticBlocks: number,
): Omit<MuckpileStats, 'wedgeVolume'> {
  const l = hm.lattice;
  let inSitu = 0;
  let maxDisp = 0;
  let sumDisp = 0;
  let dirX = 0;
  let dirY = 0;
  let firstLaunch = Infinity;
  let lastLaunch = -Infinity;
  let lastImpact = -Infinity;
  for (let k = 0; k < blocks.count; k++) {
    const v = blocks.volume[k] ?? 0;
    inSitu += v;
    const dx = (blocks.destination[3 * k] ?? 0) - (blocks.origin[3 * k] ?? 0);
    const dy = (blocks.destination[3 * k + 1] ?? 0) - (blocks.origin[3 * k + 1] ?? 0);
    const d = Math.hypot(dx, dy);
    maxDisp = Math.max(maxDisp, d);
    sumDisp += v * d;
    dirX += v * dx;
    dirY += v * dy;
    const tl = blocks.launchTime[k] ?? NaN;
    if (Number.isFinite(tl)) {
      firstLaunch = Math.min(firstLaunch, tl);
      lastLaunch = Math.max(lastLaunch, tl);
    }
    const ti = blocks.impactTime[k] ?? NaN;
    if (Number.isFinite(ti)) lastImpact = Math.max(lastImpact, ti);
  }
  const dl = Math.hypot(dirX, dirY);
  const direction = dl > 0 ? { x: dirX / dl, y: dirY / dl } : { x: 0, y: 0 };
  const faces = freeFaceSegments(blast);
  let throwDist = faces.length > 0 ? 0 : NaN;
  let maxDrop = -Infinity;
  let sumDrop = 0;
  let footCells = 0;
  let maxElevation = -Infinity;
  let footMin = Infinity;
  let footMax = -Infinity;
  let pileMin = Infinity;
  let pileMax = -Infinity;
  const px = -direction.y;
  const py = direction.x;
  for (let j = 0; j < l.ny; j++)
    for (let i = 0; i < l.nx; i++) {
      const c = j * l.nx + i;
      const x = l.x0 + (i + 0.5) * l.cell;
      const y = l.y0 + (j + 0.5) * l.cell;
      const h = hm.h[c] ?? 0;
      const loose = h - (hm.base[c] ?? 0);
      const lateral = x * px + y * py;
      if (loose > 1e-9) maxElevation = Math.max(maxElevation, h);
      if (inFootprint[c] === 1) {
        const drop = (before[c] ?? 0) - h;
        maxDrop = Math.max(maxDrop, drop);
        sumDrop += drop;
        footCells++;
        footMin = Math.min(footMin, lateral);
        footMax = Math.max(footMax, lateral);
      } else if (!inFootprint[c] && loose >= PILE_MIN_THICKNESS) {
        if (faces.length > 0) {
          let d = Infinity;
          for (const [a, b] of faces) d = Math.min(d, segmentDistance(x, y, a, b));
          throwDist = Math.max(throwDist, d);
        }
      }
      if (loose >= PILE_MIN_THICKNESS) {
        pileMin = Math.min(pileMin, lateral);
        pileMax = Math.max(pileMax, lateral);
      }
    }
  const pileVolume = hm.looseVolume();
  const expected = inSitu * swell;
  const spread =
    Number.isFinite(pileMin) && Number.isFinite(footMin) && dl > 0
      ? Math.max(0, footMin - pileMin, pileMax - footMax)
      : 0;
  return {
    inSituVolume: inSitu,
    pileVolume,
    volumeError: expected > 0 ? pileVolume / expected - 1 : 0,
    maxReposeExcess: hm.maxReposeExcess(),
    maxDisplacement: maxDisp,
    meanDisplacement: inSitu > 0 ? sumDisp / inSitu : 0,
    throw: throwDist,
    maxDrop: Number.isFinite(maxDrop) ? maxDrop : 0,
    meanDrop: footCells > 0 ? sumDrop / footCells : 0,
    lateralSpread: Number.isFinite(spread) ? spread : 0,
    maxElevation: Number.isFinite(maxElevation) ? maxElevation : blast.bench.floorElevation,
    maxHeight: Number.isFinite(maxElevation) ? maxElevation - blast.bench.floorElevation : 0,
    direction,
    blocks: blocks.count,
    staticBlocks,
    firstLaunch: Number.isFinite(firstLaunch) ? firstLaunch : NaN,
    lastLaunch: Number.isFinite(lastLaunch) ? lastLaunch : NaN,
    lastImpact: Number.isFinite(lastImpact) ? lastImpact : NaN,
  };
}

/** Vector por taladro: centroides ponderados por volumen de sus bloques, antes y después. */
function holeVectors(blocks: MuckpileBlocks): MuckpileVectors {
  const acc = new Map<number, { v: number; f: number[]; t: number[]; d: number }>();
  for (let k = 0; k < blocks.count; k++) {
    const h = blocks.hole[k] ?? -1;
    const v = blocks.volume[k] ?? 0;
    let a = acc.get(h);
    if (!a) acc.set(h, (a = { v: 0, f: [0, 0, 0], t: [0, 0, 0], d: 0 }));
    a.v += v;
    for (let c = 0; c < 3; c++) {
      a.f[c] = (a.f[c] ?? 0) + v * (blocks.origin[3 * k + c] ?? 0);
      a.t[c] = (a.t[c] ?? 0) + v * (blocks.destination[3 * k + c] ?? 0);
    }
    a.d +=
      v *
      Math.hypot(
        (blocks.destination[3 * k] ?? 0) - (blocks.origin[3 * k] ?? 0),
        (blocks.destination[3 * k + 1] ?? 0) - (blocks.origin[3 * k + 1] ?? 0),
      );
  }
  const holes = [...acc.keys()].filter((h) => (acc.get(h)?.v ?? 0) > 0).sort((a, b) => a - b);
  const from = new Float64Array(3 * holes.length);
  const to = new Float64Array(3 * holes.length);
  const magnitude = new Float32Array(holes.length);
  holes.forEach((h, i) => {
    const a = acc.get(h);
    if (!a) return;
    for (let c = 0; c < 3; c++) {
      from[3 * i + c] = (a.f[c] ?? 0) / a.v;
      to[3 * i + c] = (a.t[c] ?? 0) / a.v;
    }
    magnitude[i] = a.d / a.v;
  });
  return { count: holes.length, hole: Int32Array.from(holes), from, to, magnitude };
}

function sizeClassFractions(
  blocks: MuckpileBlocks,
  cuts: readonly number[],
): MuckpileResult['sizeClasses'] {
  const uppers = [...cuts, Infinity];
  const vol = new Float64Array(uppers.length);
  let total = 0;
  for (let k = 0; k < blocks.count; k++) {
    const s = blocks.fragmentSize[k] ?? NaN;
    if (!Number.isFinite(s)) continue;
    const v = blocks.volume[k] ?? 0;
    let c = uppers.findIndex((u) => s <= u);
    if (c < 0) c = uppers.length - 1;
    vol[c] = (vol[c] ?? 0) + v;
    total += v;
  }
  return uppers.map((upper, c) => ({ upper, fraction: total > 0 ? (vol[c] ?? 0) / total : 0 }));
}

function emptyResult(warnings: MuckpileWarning[], t0: number): MuckpileResult {
  const empty: ScalarGrid = {
    originX: 0,
    originY: 0,
    cellSize: 1,
    nx: 0,
    ny: 0,
    values: new Float32Array(0),
  };
  return {
    vectors: {
      count: 0,
      hole: new Int32Array(0),
      from: new Float64Array(0),
      to: new Float64Array(0),
      magnitude: new Float32Array(0),
    },
    blocks: {
      count: 0,
      origin: new Float64Array(0),
      impact: new Float64Array(0),
      destination: new Float64Array(0),
      velocity: new Float32Array(0),
      launchTime: new Float64Array(0),
      impactTime: new Float64Array(0),
      hole: new Int32Array(0),
      volume: new Float32Array(0),
      height: new Float32Array(0),
      topSlope: new Float32Array(0),
      fragmentSize: new Float32Array(0),
      domain: new Int16Array(0),
    },
    grids: {
      base: empty,
      before: empty,
      after: empty,
      displacement: new Float32Array(0),
      fragmentSize: new Float32Array(0),
      domain: new Int16Array(0),
      domainPurity: new Float32Array(0),
    },
    stats: {
      inSituVolume: 0,
      pileVolume: 0,
      volumeError: 0,
      wedgeVolume: 0,
      maxReposeExcess: 0,
      maxDisplacement: 0,
      meanDisplacement: 0,
      throw: NaN,
      maxDrop: 0,
      meanDrop: 0,
      lateralSpread: 0,
      maxElevation: 0,
      maxHeight: 0,
      direction: { x: 0, y: 0 },
      blocks: 0,
      staticBlocks: 0,
      firstLaunch: NaN,
      lastLaunch: NaN,
      lastImpact: NaN,
    },
    sizeClasses: [],
    warnings,
    elapsedMs: performance.now() - t0,
  };
}
