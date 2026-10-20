import { deckIntervals } from '../charging/charge';
import type { ChargeResult } from '../charging/chargeAnalysis';
import { rockFactor } from '../fragmentation/fragmentation';
import { holeToe } from '../geometry/hole';
import type { Blast, BlockModelMapping, Hole, Project, RockMass, Vec3 } from '../model/types';
import type { BlockColoring } from '../topography/blockModel';
import type { BlockModelData } from '../topography/asset';
import {
  competenceClass,
  cunninghamDescriptionFromRmr,
  gsiFromRmr,
  intactModulusFromUcs,
  qFromRmr,
  RMR_CLASSES,
  rmrFromGsi,
  rmrFromQ,
  rockMassModulus,
  tensileFromUcs,
  UCS_CLASSES,
  vpFromModulus,
  vpFromQ,
} from './derive';
import { lithologyTable } from './lithology';
import { columnScale } from './mapping';

/**
 * Modelo geotécnico listo para consultar: las propiedades de roca de cada bloque ya completadas
 * (columna del modelo → tabla de litologías → correlación → roca del proyecto) y un índice
 * espacial en el marco girado del modelo. Arreglos en SI: densidad kg/m³, UCS/E/tracción Pa,
 * Vp y VPPc m/s, RQD fracción; RMR y GSI 0–100 (NaN = sin dato).
 */
export interface GeotechModel {
  surveyId: string;
  count: number;
  rotation: number;
  density: Float64Array;
  ucs: Float64Array;
  youngModulus: Float64Array;
  /** Módulo de deformación del macizo [Pa] (Hoek–Diederichs 2006), NaN sin GSI. */
  deformationModulus: Float64Array;
  vp: Float64Array;
  tensileStrength: Float64Array;
  rmr: Float64Array;
  gsi: Float64Array;
  rqd: Float64Array;
  rockFactor: Float64Array;
  vppc: Float64Array;
  /** Índice en `lithologies` (−1 sin litología). */
  lithology: Int32Array;
  lithologies: string[];
  /** 1 = el bloque tiene algún dato propio (columna o litología reconocida). */
  own: Uint8Array;
  find(x: number, y: number, z: number): number;
  /** Tamaño mínimo de bloque [m] (paso de muestreo por defecto en `rockAlongPath`). */
  minSize: number;
}

/** Roca de cálculo: modelos geotécnicos activos y la roca del proyecto (fuera de los modelos). */
export interface RockProvider {
  models: readonly GeotechModel[];
  base: RockMass;
}

/** Roca en un punto. */
export interface RockSample extends RockMass {
  inModel: boolean;
  surveyId: string | null;
  block: number;
  lithology: string | null;
  rmr: number | null;
  gsi: number | null;
  /** Módulo del macizo [Pa]. */
  deformationModulus: number | null;
}

export const FALLBACK_ROCK: RockMass = {
  id: 'rock-default' as RockMass['id'],
  name: 'Roca',
  density: 2650,
  ucs: 150e6,
  youngModulus: 50e9,
};

/** Roca de la voladura en el proyecto (o una genérica). */
export function projectRock(
  project: Pick<Project, 'rockMasses'>,
  blast?: Pick<Blast, 'rockMassId'>,
): RockMass {
  return (
    project.rockMasses.find((r) => r.id === blast?.rockMassId) ??
    project.rockMasses[0] ??
    FALLBACK_ROCK
  );
}

/**
 * Completa las propiedades de cada bloque y arma el índice. O(n). `base` da lo que ni el modelo ni
 * las correlaciones pueden dar.
 */
export function buildGeotechModel(
  surveyId: string,
  blocks: BlockModelData,
  mapping: BlockModelMapping,
  base: RockMass = FALLBACK_ROCK,
): GeotechModel {
  const n = blocks.centers.length / 3;
  const column = (field: keyof BlockModelMapping['columns']) => {
    const name = mapping.columns[field];
    const attr = name ? blocks.numeric.find((a) => a.name === name) : undefined;
    if (!attr) return null;
    const k = columnScale(field, attr.values);
    return (i: number) => {
      const v = attr.values[i] ?? NaN;
      return Number.isFinite(v) && v >= 0 ? v * k : NaN;
    };
  };
  const cDensity = column('density');
  const cUcs = column('ucs');
  const cRmr = column('rmr');
  const cGsi = column('gsi');
  const cQ = column('q');
  const cRqd = column('rqd');
  const cE = column('youngModulus');
  const cVp = column('vp');
  const cSt = column('tensileStrength');
  const lithAttr = mapping.columns.lithology
    ? blocks.categorical.find((a) => a.name === mapping.columns.lithology)
    : undefined;
  const table = lithAttr ? lithologyTable(lithAttr.categories, mapping.lithologies) : [];
  const lithByCode = lithAttr
    ? lithAttr.categories.map((c) => table.find((t) => t.name === c))
    : [];
  const lithologies = table.map((t) => t.name);
  const lithIndexByCode = lithAttr ? lithAttr.categories.map((c) => lithologies.indexOf(c)) : [];

  const arr = () => new Float64Array(n).fill(NaN);
  const out = {
    density: arr(),
    ucs: arr(),
    youngModulus: arr(),
    deformationModulus: arr(),
    vp: arr(),
    tensileStrength: arr(),
    rmr: arr(),
    gsi: arr(),
    rqd: arr(),
    rockFactor: arr(),
    vppc: arr(),
    lithology: new Int32Array(n).fill(-1),
    own: new Uint8Array(n),
  };
  const baseA = rockFactor(base);
  const baseDescription = base.blastability
    ? base.blastability.rmd + base.blastability.jps + base.blastability.jpa
    : 50;
  const pick = (...v: number[]) => v.find((x) => Number.isFinite(x) && x > 0) ?? NaN;
  for (let i = 0; i < n; i++) {
    const code = lithAttr ? (lithAttr.codes[i] ?? 0) : -1;
    const L = code >= 0 ? lithByCode[code] : undefined;
    out.lithology[i] = code >= 0 ? (lithIndexByCode[code] ?? -1) : -1;
    const dens = pick(cDensity?.(i) ?? NaN, L?.density ?? NaN);
    const ucs = pick(cUcs?.(i) ?? NaN, L?.ucs ?? NaN);
    const qCol = cQ?.(i) ?? NaN;
    const gsiCol = cGsi?.(i) ?? NaN;
    const rmrOwn = pick(
      cRmr?.(i) ?? NaN,
      Number.isFinite(gsiCol) ? rmrFromGsi(gsiCol) : NaN,
      qCol > 0 ? rmrFromQ(qCol) : NaN,
    );
    const rmr = pick(rmrOwn, L?.rmr ?? NaN);
    const gsi = Number.isFinite(gsiCol) ? gsiCol : Number.isFinite(rmr) ? gsiFromRmr(rmr) : NaN;
    const q = qCol > 0 ? qCol : Number.isFinite(rmr) ? qFromRmr(rmr) : NaN;
    const ei = pick(
      cE?.(i) ?? NaN,
      L?.youngModulus ?? NaN,
      ucs > 0 ? intactModulusFromUcs(ucs) : NaN,
    );
    const vpCol = cVp?.(i) ?? NaN;
    const hasOwn =
      [dens, ucs, rmr, ei, vpCol].some((v) => Number.isFinite(v) && v > 0) || L !== undefined;
    out.own[i] = hasOwn ? 1 : 0;
    // Densidad, UCS y módulo: lo del bloque o, si falta, la roca del proyecto.
    const densKg = Number.isFinite(dens) ? dens * 1000 : base.density;
    const ucsPa = Number.isFinite(ucs) ? ucs * 1e6 : base.ucs;
    const ePa = Number.isFinite(ei) ? ei * 1e9 : base.youngModulus;
    const vp = pick(
      vpCol,
      Number.isFinite(rmrOwn) && Number.isFinite(ucs) ? vpFromQ(q, ucs) : NaN,
      L?.vp ?? NaN,
      Number.isFinite(q) && Number.isFinite(ucs) ? vpFromQ(q, ucs) : NaN,
      Number.isFinite(ei) ? vpFromModulus(ei, densKg / 1000) : NaN,
      base.vp ?? NaN,
    );
    const st = pick(
      cSt?.(i) ?? NaN,
      L?.tensileStrength ?? NaN,
      Number.isFinite(ucs) ? tensileFromUcs(ucs) : NaN,
    );
    const stPa = Number.isFinite(st) ? st * 1e6 : (base.tensileStrength ?? NaN);
    out.density[i] = densKg;
    out.ucs[i] = ucsPa;
    out.youngModulus[i] = ePa;
    out.deformationModulus[i] =
      Number.isFinite(gsi) && Number.isFinite(ei) ? rockMassModulus(ei, gsi) * 1e9 : NaN;
    out.vp[i] = vp;
    out.tensileStrength[i] = stPa;
    out.rmr[i] = rmr;
    out.gsi[i] = gsi;
    const rqd = cRqd?.(i) ?? NaN;
    out.rqd[i] = Number.isFinite(rqd) ? Math.min(1, rqd / 100) : NaN;
    // Factor de roca de Cunningham (1987) con la descripción aproximada desde el RMR (GE-08).
    if (!hasOwn) out.rockFactor[i] = baseA;
    else {
      const description = Number.isFinite(rmr)
        ? cunninghamDescriptionFromRmr(rmr)
        : baseDescription;
      const eGpa = ePa / 1e9;
      const hf = eGpa < 50 ? eGpa / 3 : ucsPa / 1e6 / 5;
      out.rockFactor[i] = 0.06 * (description + 0.025 * densKg - 50 + hf);
    }
    // VPPc = σt·Vp/E (FC de energía, RM-09).
    out.vppc[i] =
      hasOwn && Number.isFinite(stPa) && Number.isFinite(vp) && ePa > 0
        ? (stPa * vp) / ePa
        : (base.vppc ??
          (base.tensileStrength && base.vp
            ? (base.tensileStrength * base.vp) / base.youngModulus
            : NaN));
  }
  const { find, minSize } = blockIndex(blocks);
  return { surveyId, count: n, rotation: blocks.rotation, lithologies, find, minSize, ...out };
}

/**
 * Índice espacial de los bloques: hash 3D en el marco del modelo (girado `rotation` alrededor de Z)
 * con celdas del tamaño mediano de bloque; cada bloque se anota en las celdas que toca. Consulta
 * O(1): la celda del punto y la prueba de contención de sus pocos bloques.
 */
function blockIndex(b: BlockModelData): { find: GeotechModel['find']; minSize: number } {
  const n = b.centers.length / 3;
  if (n === 0) return { find: () => -1, minSize: 1 };
  const cos = Math.cos(b.rotation);
  const sin = Math.sin(b.rotation);
  const ox = b.centers[0] ?? 0;
  const oy = b.centers[1] ?? 0;
  const oz = b.centers[2] ?? 0;
  const local = new Float64Array(n * 3);
  const median = (axis: number) => {
    const s: number[] = [];
    const step = Math.max(1, Math.floor(n / 1000));
    for (let i = 0; i < n; i += step) s.push(b.sizes[i * 3 + axis] ?? 1);
    s.sort((x, y) => x - y);
    return Math.max(0.01, s[Math.floor(s.length / 2)] ?? 1);
  };
  const cell = [median(0), median(1), median(2)] as const;
  let minSize = Infinity;
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < n; i++) {
    const dx = (b.centers[i * 3] ?? 0) - ox;
    const dy = (b.centers[i * 3 + 1] ?? 0) - oy;
    local[i * 3] = dx * cos + dy * sin;
    local[i * 3 + 1] = -dx * sin + dy * cos;
    local[i * 3 + 2] = (b.centers[i * 3 + 2] ?? 0) - oz;
    for (let a = 0; a < 3; a++) {
      const h = (b.sizes[i * 3 + a] ?? 0) / 2;
      const c = local[i * 3 + a] ?? 0;
      minSize = Math.min(minSize, 2 * h || Infinity);
      lo[a] = Math.min(lo[a] ?? 0, Math.floor((c - h) / (cell[a] ?? 1)));
      hi[a] = Math.max(hi[a] ?? 0, Math.floor((c + h) / (cell[a] ?? 1)));
    }
  }
  const ni = (hi[0] ?? 0) - (lo[0] ?? 0) + 1;
  const nj = (hi[1] ?? 0) - (lo[1] ?? 0) + 1;
  const key = (i: number, j: number, k: number) =>
    ((k - (lo[2] ?? 0)) * nj + (j - (lo[1] ?? 0))) * ni + (i - (lo[0] ?? 0));
  const cells = new Map<number, number[]>();
  const eps = 1e-6;
  for (let q = 0; q < n; q++) {
    const r: [number, number][] = [0, 1, 2].map((a) => {
      const h = (b.sizes[q * 3 + a] ?? 0) / 2;
      const c = local[q * 3 + a] ?? 0;
      return [
        Math.floor((c - h + eps) / (cell[a] ?? 1)),
        Math.floor((c + h - eps) / (cell[a] ?? 1)),
      ];
    }) as [number, number][];
    const [ri, rj, rk] = r as [[number, number], [number, number], [number, number]];
    for (let k = rk[0]; k <= rk[1]; k++)
      for (let j = rj[0]; j <= rj[1]; j++)
        for (let i = ri[0]; i <= ri[1]; i++) {
          const kk = key(i, j, k);
          let list = cells.get(kk);
          if (!list) cells.set(kk, (list = []));
          list.push(q);
        }
  }
  const find = (x: number, y: number, z: number): number => {
    const dx = x - ox;
    const dy = y - oy;
    const u = dx * cos + dy * sin;
    const v = -dx * sin + dy * cos;
    const w = z - oz;
    const i = Math.floor(u / cell[0]);
    const j = Math.floor(v / cell[1]);
    const k = Math.floor(w / cell[2]);
    if (i < (lo[0] ?? 0) || i > (hi[0] ?? 0) || j < (lo[1] ?? 0) || j > (hi[1] ?? 0)) return -1;
    if (k < (lo[2] ?? 0) || k > (hi[2] ?? 0)) return -1;
    const list = cells.get(key(i, j, k));
    if (!list) return -1;
    for (const q of list) {
      if (
        Math.abs(u - (local[q * 3] ?? 0)) <= (b.sizes[q * 3] ?? 0) / 2 + eps &&
        Math.abs(v - (local[q * 3 + 1] ?? 0)) <= (b.sizes[q * 3 + 1] ?? 0) / 2 + eps &&
        Math.abs(w - (local[q * 3 + 2] ?? 0)) <= (b.sizes[q * 3 + 2] ?? 0) / 2 + eps
      )
        return q;
    }
    return -1;
  };
  return { find, minSize: Number.isFinite(minSize) ? minSize : 1 };
}

const finiteOrNull = (v: number | undefined) => (v !== undefined && Number.isFinite(v) ? v : null);

/** Roca del bloque `i` de un modelo, como `RockMass` efectivo. */
export function blockRock(m: GeotechModel, i: number, base: RockMass): RockSample {
  const lith = m.lithology[i] ?? -1;
  const lithology = lith >= 0 ? (m.lithologies[lith] ?? null) : null;
  const vp = finiteOrNull(m.vp[i]);
  const st = finiteOrNull(m.tensileStrength[i]);
  const vppc = finiteOrNull(m.vppc[i]);
  const rqd = finiteOrNull(m.rqd[i]);
  const { blastability: _b, swebrecB: _s, ...rest } = base;
  return {
    ...rest,
    ...(base.swebrecB !== undefined ? { swebrecB: base.swebrecB } : {}),
    name: lithology ?? base.name,
    density: m.density[i] ?? base.density,
    ucs: m.ucs[i] ?? base.ucs,
    youngModulus: m.youngModulus[i] ?? base.youngModulus,
    ...(vp !== null ? { vp } : {}),
    ...(st !== null ? { tensileStrength: st } : {}),
    ...(vppc !== null ? { vppc } : {}),
    ...(rqd !== null ? { rqd } : {}),
    rockFactor: m.rockFactor[i] ?? rockFactor(base),
    inModel: true,
    surveyId: m.surveyId,
    block: i,
    lithology,
    rmr: finiteOrNull(m.rmr[i]),
    gsi: finiteOrNull(m.gsi[i]),
    deformationModulus: finiteOrNull(m.deformationModulus[i]),
  };
}

function baseSample(base: RockMass): RockSample {
  return {
    ...base,
    inModel: false,
    surveyId: null,
    block: -1,
    lithology: null,
    rmr: null,
    gsi: null,
    deformationModulus: null,
  };
}

/**
 * Roca efectiva en (x, y, z): la del bloque del primer modelo geotécnico que contiene el punto
 * (con su giro); fuera de todos, la roca del proyecto.
 */
export function rockAt(provider: RockProvider, x: number, y: number, z: number): RockSample {
  for (const m of provider.models) {
    const i = m.find(x, y, z);
    if (i >= 0) return blockRock(m, i, provider.base);
  }
  return baseSample(provider.base);
}

export interface PathRock {
  length: number;
  /** Propiedades promedio ponderadas por largo; Vp como velocidad de tránsito (L / Σ ℓ/Vp). */
  rock: RockMass;
  /** Fracción del camino dentro de algún modelo [0–1]. */
  inModel: number;
  /** Largo por litología [m] (null = fuera del modelo o sin litología), de mayor a menor. */
  lithologies: { name: string | null; length: number }[];
  dominantLithology: string | null;
  /** RMR medio del tramo con dato (null si no hay). */
  rmr: number | null;
}

/**
 * Propiedades a lo largo del segmento a→b (lo que atraviesa la onda entre la carga y un receptor):
 * se muestrea cada `step` m (por defecto el bloque más chico, máx. 400 muestras).
 */
export function rockAlongPath(provider: RockProvider, a: Vec3, b: Vec3, step?: number): PathRock {
  const length = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  const minStep = step ?? Math.min(...provider.models.map((m) => m.minSize), 5);
  const n = Math.max(1, Math.min(400, Math.ceil(length / Math.max(minStep, 0.1) - 1e-9)));
  const dl = length / n;
  let inModel = 0;
  let dens = 0;
  let ucs = 0;
  let e = 0;
  let st = 0;
  let stLen = 0;
  let travel = 0;
  let vpLen = 0;
  let rmr = 0;
  let rmrLen = 0;
  let aSum = 0;
  const byLith = new Map<string | null, number>();
  for (let k = 0; k < n; k++) {
    const t = (k + 0.5) / n;
    const r = rockAt(provider, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
    if (r.inModel) inModel += dl;
    dens += r.density * dl;
    ucs += r.ucs * dl;
    e += r.youngModulus * dl;
    aSum += (r.rockFactor ?? rockFactor(r)) * dl;
    if (r.tensileStrength !== undefined) {
      st += r.tensileStrength * dl;
      stLen += dl;
    }
    if (r.vp !== undefined && r.vp > 0) {
      travel += dl / r.vp;
      vpLen += dl;
    }
    if (r.rmr !== null) {
      rmr += r.rmr * dl;
      rmrLen += dl;
    }
    byLith.set(r.lithology, (byLith.get(r.lithology) ?? 0) + dl);
  }
  const L = length > 0 ? length : 1;
  const lithologies = [...byLith.entries()]
    .map(([name, len]) => ({ name, length: len }))
    .sort((x, y) => y.length - x.length);
  const vp = travel > 0 ? vpLen / travel : undefined;
  const tensile = stLen > 0 ? st / stLen : undefined;
  const rock: RockMass = {
    ...provider.base,
    density: length > 0 ? dens / L : provider.base.density,
    ucs: length > 0 ? ucs / L : provider.base.ucs,
    youngModulus: length > 0 ? e / L : provider.base.youngModulus,
    ...(vp !== undefined ? { vp } : {}),
    ...(tensile !== undefined ? { tensileStrength: tensile } : {}),
    rockFactor: length > 0 ? aSum / L : rockFactor(provider.base),
  };
  return {
    length,
    rock,
    inModel: length > 0 ? inModel / L : 0,
    lithologies,
    dominantLithology: lithologies.find((l) => l.name !== null)?.name ?? null,
    rmr: rmrLen > 0 ? rmr / rmrLen : null,
  };
}

/** Centro de la carga explosiva del taladro (o el centro del taladro si no está cargado). */
export function chargeCenter(h: Hole): Vec3 {
  let s = 0;
  let len = 0;
  for (const d of deckIntervals(h)) {
    if (d.deck.kind !== 'explosive') continue;
    const l = d.bottom - Math.max(0, d.top);
    s += ((Math.max(0, d.top) + d.bottom) / 2) * l;
    len += l;
  }
  const depth = len > 0 ? s / len : h.length / 2;
  const toe = holeToe(h);
  const f = h.length > 0 ? depth / h.length : 0;
  return {
    x: h.collar.x + (toe.x - h.collar.x) * f,
    y: h.collar.y + (toe.y - h.collar.y) * f,
    z: h.collar.z + (toe.z - h.collar.z) * f,
  };
}

/** Roca de cada taladro: la del bloque donde está el centro de su carga (mismo orden). */
export function rockForHoles(blast: Pick<Blast, 'holes'>, provider: RockProvider): RockSample[] {
  return blast.holes.map((h) => {
    const c = chargeCenter(h);
    return rockAt(provider, c.x, c.y, c.z);
  });
}

/**
 * Factor de roca A de la voladura: el de cada taladro ponderado por su carga (kg). Sin carga, el
 * promedio simple. null si no hay taladros.
 */
export function weightedRockFactor(
  rocks: readonly RockMass[],
  kgPerHole?: ArrayLike<number>,
): number | null {
  let w = 0;
  let s = 0;
  rocks.forEach((r, i) => {
    const kg = kgPerHole ? (kgPerHole[i] ?? 0) : 1;
    if (!(kg > 0)) return;
    s += (r.rockFactor ?? rockFactor(r)) * kg;
    w += kg;
  });
  if (w > 0) return s / w;
  if (rocks.length === 0) return null;
  return rocks.reduce((a, r) => a + (r.rockFactor ?? rockFactor(r)), 0) / rocks.length;
}

/**
 * Cubicación con la densidad de cada taladro: tonelaje = volumen · (Σ Vᵢ·ρᵢ / Σ Vᵢ) y el factor de
 * potencia que resulta (FC-03 por bloque).
 */
export function applyHoleDensities<
  T extends Pick<
    ChargeResult,
    'volume' | 'volumePerHole' | 'tonnage' | 'powderFactor' | 'totalExplosive'
  >,
>(charge: T, densities: readonly number[]): T {
  let v = 0;
  let vr = 0;
  densities.forEach((rho, i) => {
    const vol = charge.volumePerHole[i] ?? 0;
    if (!(vol > 0) || !(rho > 0)) return;
    v += vol;
    vr += vol * rho;
  });
  if (!(v > 0)) return charge;
  const tonnage = charge.volume * (vr / v);
  const kg = charge.powderFactor * charge.tonnage;
  return { ...charge, tonnage, powderFactor: tonnage > 0 ? kg / tonnage : 0 };
}

export interface HoleRockSummary {
  /** Taladros por litología (null = fuera del modelo o sin litología). */
  byLithology: { name: string | null; holes: number; kg: number }[];
  /** Taladros por clase de competencia (RMR de Bieniawski o UCS de ISRM). */
  byClass: { id: string; holes: number }[];
  inModel: number;
  holes: number;
  rockFactor: number | null;
  /** Densidad media ponderada por volumen [kg/m³]. */
  density: number | null;
  ucs: { min: number; max: number } | null;
  rmr: { min: number; max: number } | null;
  vppc: { min: number; max: number } | null;
}

/** Resumen de la roca de los taladros de una voladura (para el panel y el asistente). */
export function summarizeHoleRocks(
  rocks: readonly RockSample[],
  kgPerHole?: ArrayLike<number>,
): HoleRockSummary {
  const lith = new Map<string | null, { holes: number; kg: number }>();
  const classes = new Map<string, number>();
  const range = (vals: number[]) =>
    vals.length > 0 ? { min: Math.min(...vals), max: Math.max(...vals) } : null;
  const ucs: number[] = [];
  const rmr: number[] = [];
  const vppc: number[] = [];
  let inModel = 0;
  let dens = 0;
  rocks.forEach((r, i) => {
    const kg = kgPerHole?.[i] ?? 0;
    const e = lith.get(r.lithology) ?? { holes: 0, kg: 0 };
    e.holes++;
    e.kg += kg;
    lith.set(r.lithology, e);
    if (r.inModel) inModel++;
    dens += r.density;
    ucs.push(r.ucs / 1e6);
    if (r.rmr !== null) rmr.push(r.rmr);
    if (r.vppc !== undefined) vppc.push(r.vppc);
    const c =
      r.rmr !== null
        ? RMR_CLASSES[competenceClass('rmr', r.rmr)]?.id
        : UCS_CLASSES[competenceClass('ucs', r.ucs / 1e6)]?.id;
    if (c) classes.set(c, (classes.get(c) ?? 0) + 1);
  });
  return {
    byLithology: [...lith.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.holes - a.holes),
    byClass: [...classes.entries()].map(([id, holes]) => ({ id, holes })),
    inModel,
    holes: rocks.length,
    rockFactor: weightedRockFactor(rocks, kgPerHole),
    density: rocks.length > 0 ? dens / rocks.length : null,
    ucs: range(ucs),
    rmr: range(rmr),
    vppc: range(vppc),
  };
}

// ===================== Color por competencia =====================

/** De dura (oscuro, rojo) a blanda (claro, amarillo): un color por clase. */
export const COMPETENCE_COLORS: readonly [number, number, number][] = [
  [127, 0, 0],
  [189, 0, 38],
  [240, 59, 32],
  [253, 141, 60],
  [254, 204, 92],
  [255, 255, 178],
];

/**
 * Colores de un modelo geotécnico por competencia: clase RMR (Bieniawski 1989, I–V) o clase de
 * resistencia por UCS (ISRM 1981, R6–R1), de dura a blanda. Leyenda por clase con su conteo.
 */
export function colorBlocksByCompetence(m: GeotechModel, by: 'rmr' | 'ucs'): BlockColoring {
  const n = m.count;
  const colors = new Uint8Array(n * 3);
  const visible = new Uint8Array(n).fill(1);
  const classes = by === 'rmr' ? RMR_CLASSES : UCS_CLASSES;
  const counts = new Array<number>(classes.length).fill(0);
  for (let i = 0; i < n; i++) {
    const v = by === 'rmr' ? (m.rmr[i] ?? NaN) : (m.ucs[i] ?? NaN) / 1e6;
    const c = m.own[i] ? competenceClass(by, v) : -1;
    if (c < 0) {
      visible[i] = 0;
      continue;
    }
    counts[c] = (counts[c] ?? 0) + 1;
    colors.set(COMPETENCE_COLORS[c] ?? [200, 200, 200], i * 3);
  }
  return {
    colors,
    visible,
    legend: {
      kind: 'category',
      attribute: by === 'rmr' ? 'RMR' : 'UCS',
      items: classes.map((c, k) => ({
        name: `${c.id} (${String(c.min)}${Number.isFinite(c.max) ? `–${String(c.max)}` : '+'})`,
        color: COMPETENCE_COLORS[k] ?? [200, 200, 200],
        count: counts[k] ?? 0,
      })),
    },
  };
}

/** Litologías y rangos del modelo (resumen del panel). */
export function geotechSummary(m: GeotechModel): {
  lithologies: { name: string; blocks: number }[];
  ucs: { min: number; max: number } | null;
  rmr: { min: number; max: number } | null;
} {
  const counts = new Array<number>(m.lithologies.length).fill(0);
  let ucsMin = Infinity;
  let ucsMax = -Infinity;
  let rmrMin = Infinity;
  let rmrMax = -Infinity;
  for (let i = 0; i < m.count; i++) {
    const l = m.lithology[i] ?? -1;
    if (l >= 0) counts[l] = (counts[l] ?? 0) + 1;
    if (!m.own[i]) continue;
    const u = (m.ucs[i] ?? NaN) / 1e6;
    if (Number.isFinite(u)) {
      ucsMin = Math.min(ucsMin, u);
      ucsMax = Math.max(ucsMax, u);
    }
    const r = m.rmr[i] ?? NaN;
    if (Number.isFinite(r)) {
      rmrMin = Math.min(rmrMin, r);
      rmrMax = Math.max(rmrMax, r);
    }
  }
  return {
    lithologies: m.lithologies.map((name, k) => ({ name, blocks: counts[k] ?? 0 })),
    ucs: Number.isFinite(ucsMin) ? { min: ucsMin, max: ucsMax } : null,
    rmr: Number.isFinite(rmrMin) ? { min: rmrMin, max: rmrMax } : null,
  };
}
