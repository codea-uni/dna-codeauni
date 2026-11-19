import { swebrecPassing, swebrecSize } from '../fragmentation/fragmentation';
import type { Meters } from '../model/types';
import type { MuckpileBlocks } from './types';

/**
 * Discretización de la roca volada en fragmentos (FC-47, skill `cronos-fragmentos-fisica`).
 *
 * La curva de tamaños no cambia (Kuz-Ram + Swebrec por taladro o zona, `MuckpileBlocks.curve`):
 * cambia cómo se muestrea. Cada bloque del modelo cinemático se reparte en una población de
 * fragmentos que conserva su volumen:
 *
 * - Clases logarítmicas (12 por década) entre el corte de render x_c y x_max. Volumen de la clase
 *   V_i = V·[P(x_{i+1}) − P(x_i)] (P = fracción de VOLUMEN pasante, Swebrec). Número
 *   N_i = V_i / (k_v·x̄_i³) con arrastre del resto a la clase siguiente; los tamaños se sortean con
 *   la inversa de P dentro de la clase y se reescalan para que Σ k_v·x³ = V_i exactamente.
 * - Lo que queda bajo x_c es fino: no se dibuja piedra por piedra (cama de grava del bloque y
 *   partículas proxy en vuelo). V_dibujado + V_fino = V_bloque (error < 1e-6).
 * - x_c se elige por bisección para que el total no pase el presupuesto de instancias.
 * - Forma: ejes L ≥ I ≥ S con I = x (tamaño de criba), I/L ~ N(0,72; 0,10) y S/I ~ N(0,50; 0,12)
 *   truncadas [M] Sun et al. 2014; caja escalada para volumen k_v·x³; orientación uniforme
 *   (cuaternión de Shoemake); una de las formas base de la biblioteca del engine.
 * - Velocidad: |v_i| = |v_bloque|·exp(σ·z − σ²/2)·clamp((x/x50)^−β; 0,6; 1,6), dirección en un cono
 *   de 1σ = 12° (banco) o 18° (subterránea) alrededor de la del bloque [S]. Se entrega como
 *   diferencia con la del bloque (el engine la suma a la trayectoria del bloque padre).
 * - Giro: ω = κ_ω·|v_i|/L con eje ⊥ a la velocidad, acotado a 1–20 rad/s [S].
 *
 * Determinista: hash sin estado por (bloque, fragmento, canal); no depende del orden ni de workers.
 * Los indicadores de la pila NO salen de aquí (siguen saliendo de los bloques y de la curva).
 */

/** Parámetros de la discretización (procedencia en `docs/RULES.md` FC-47). */
export interface FragmentParams {
  /** Máximo de fragmentos dibujados (piedras + proxies de finos). */
  budget: number;
  /** Corte mínimo de render [m] (piso del corte adaptativo). */
  minCut: Meters;
  /** Factor de volumen k_v: volumen = k_v·x³ con x = tamaño de criba [S] (0,4–0,6). */
  volumeFactor: number;
  /** I/L y S/I: media y desviación [M] Sun et al. 2014. */
  ilMean: number;
  ilSd: number;
  siMean: number;
  siSd: number;
  /** Dispersión lognormal de la velocidad σ [S] (0,2–0,4). */
  speedSigma: number;
  /** Exponente de tamaño β de la velocidad [S] (0–0,3). */
  sizeExponent: number;
  /** Desviación (1σ) de la dirección alrededor de la del bloque [rad] [S]. */
  coneSigma: number;
  /** κ_ω del giro [S]. */
  spinFactor: number;
  /** Fracción del presupuesto para partículas proxy de finos en vuelo. */
  fineProxyShare: number;
  /** Clases por década. */
  classesPerDecade: number;
  /**
   * Separación máxima de una piedra respecto de su bloque por su velocidad propia [m]: la
   * dispersión no choca con nada, así que en subterránea se acota al ancho de la labor.
   */
  spreadLimit: Meters;
}

export const DEFAULT_FRAGMENT_PARAMS: FragmentParams = {
  budget: 40000,
  minCut: 0.03,
  volumeFactor: 0.45,
  ilMean: 0.72,
  ilSd: 0.1,
  siMean: 0.5,
  siSd: 0.12,
  speedSigma: 0.3,
  sizeExponent: 0.15,
  coneSigma: (12 * Math.PI) / 180,
  spinFactor: 0.25,
  fineProxyShare: 0.15,
  classesPerDecade: 12,
  spreadLimit: 4,
};

/** Formas base de la biblioteca del engine (`FragmentsLayer`). */
export const FRAGMENT_SHAPES = 16;

/** Bandera: partícula proxy de finos (no conserva volumen propio; se funde en la grava). */
export const FRAGMENT_FINE = 1;

/**
 * Fragmentos en arreglos planos (índice j). Desfases relativos al centro del bloque padre: in situ
 * al salir (`offset`) y en la pila (`rest`, sobre la cama de grava).
 */
export interface MuckpileFragments {
  count: number;
  parent: Int32Array;
  /** Tamaño de criba x [m]. */
  size: Float32Array;
  /** Ejes de la caja (L, I, S) [m] con volumen k_v·x³. */
  axes: Float32Array;
  /** Orientación inicial [x, y, z, w]. */
  quat: Float32Array;
  shape: Uint8Array;
  offset: Float32Array;
  rest: Float32Array;
  /** Velocidad propia menos la del bloque [m/s]. */
  spread: Float32Array;
  /** Velocidad angular (eje·rad/s). */
  omega: Float32Array;
  flags: Uint8Array;
  /** Por bloque: fracción de su volumen bajo el corte (fino); NaN = bloque sin curva (vóxel). */
  fineFraction: Float32Array;
  /**
   * Punto donde aterriza cada piedra [x, y, z, …] (coordenadas de proyecto): el aterrizaje de su
   * bloque + su desfase + su separación propia acotada al momento del impacto.
   */
  land: Float64Array;
  /**
   * Lugar final de cada piedra en la pila [x, y, z, …]: el hueco libre de su clase de tamaño más
   * cercano a donde aterrizó, por orden de llegada (no vuelve hacia atrás). Los huecos son los
   * lugares de las piedras sobre la cama de grava de cada bloque: la pila conserva su forma y su
   * volumen. Las partículas de finos se quedan donde aterrizan y se funden en la grava.
   */
  restPos: Float64Array;
  /** Corte de render usado [m]. */
  cut: Meters;
  /** Separación máxima respecto del bloque [m] (`FragmentParams.spreadLimit`). */
  spreadLimit: Meters;
  /** Volúmenes [m³]: in situ de los bloques con curva, dibujado (piedras) y fino. */
  volume: { total: number; drawn: number; fine: number };
}

/** Hash determinista en [0, 1) de (a, b, canal). */
export function fragHash(a: number, b: number, channel: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h = Math.imul(h ^ (channel * 0x27d4eb2f), 0x165667b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

function normal(a: number, b: number, c1: number, c2: number): number {
  const u1 = Math.max(1e-12, fragHash(a, b, c1));
  const u2 = fragHash(a, b, c2);
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

interface Curve {
  x50: number;
  xmax: number;
  b: number;
}

function curveOf(blocks: MuckpileBlocks, k: number, fp: FragmentParams): Curve | null {
  const c = blocks.curve;
  if (!c) return null;
  const x50 = c[3 * k] ?? NaN;
  const xmax0 = c[3 * k + 1] ?? NaN;
  const b = c[3 * k + 2] ?? NaN;
  if (!(x50 > 0) || !(xmax0 > x50) || !(b > 0)) return null;
  // Ninguna piedra es más grande que su bloque: lo de arriba se junta en la clase del tope.
  const vol = blocks.volume[k] ?? 0;
  const cap = Math.cbrt(Math.max(vol, 1e-9) / fp.volumeFactor);
  return { x50, xmax: Math.min(xmax0, Math.max(cap, x50 * 1.05)), b };
}

/** Bordes de clase entre el corte y x_max (log, `per` por década). */
function classEdges(cut: number, xmax: number, per: number): number[] {
  if (!(xmax > cut)) return [cut, Math.max(cut * 1.0001, xmax)];
  const n = Math.max(1, Math.ceil(Math.log10(xmax / cut) * per));
  const edges: number[] = [];
  for (let i = 0; i <= n; i++) edges.push(cut * Math.pow(xmax / cut, i / n));
  return edges;
}

/** Volumen por clase (con la masa por sobre el tope en la última) y número de piedras. */
function classes(
  V: number,
  cv: Curve,
  cut: number,
  fp: FragmentParams,
): { lo: number; hi: number; vol: number; n: number }[] {
  if (cut >= cv.xmax) return [];
  const edges = classEdges(cut, cv.xmax, fp.classesPerDecade);
  const out: { lo: number; hi: number; vol: number; n: number }[] = [];
  let carryV = 0;
  for (let i = 0; i + 1 < edges.length; i++) {
    const lo = edges[i] ?? cut;
    const hi = edges[i + 1] ?? cv.xmax;
    const last = i + 2 === edges.length;
    const pHi = last ? 1 : swebrecPassing(hi, cv.x50, cv.xmax, cv.b);
    const vol = V * (pHi - swebrecPassing(lo, cv.x50, cv.xmax, cv.b)) + carryV;
    const xm = Math.sqrt(lo * hi);
    const unit = fp.volumeFactor * xm * xm * xm;
    let n = Math.floor(vol / unit);
    if (last && n === 0 && vol > 0) n = 1;
    if (n === 0) {
      carryV = vol;
      continue;
    }
    carryV = 0;
    out.push({ lo, hi, vol, n });
  }
  return out;
}

function countAt(
  blocks: MuckpileBlocks,
  curves: (Curve | null)[],
  cut: number,
  fp: FragmentParams,
) {
  let n = 0;
  for (let k = 0; k < blocks.count; k++) {
    const cv = curves[k];
    if (!cv) continue;
    for (const c of classes(blocks.volume[k] ?? 0, cv, cut, fp)) n += c.n;
  }
  return n;
}

/**
 * Población de fragmentos de la pila. `cone` por defecto: 12° (banco); la pila subterránea pasa 18°.
 * Bloques sin curva (sin Kuz-Ram) quedan como vóxel (`fineFraction` = NaN) y no tienen piedras.
 */
export function discretizeFragments(
  blocks: MuckpileBlocks,
  overrides: Partial<FragmentParams> = {},
): MuckpileFragments {
  const fp: FragmentParams = { ...DEFAULT_FRAGMENT_PARAMS, ...overrides };
  const curves = Array.from({ length: blocks.count }, (_, k) => curveOf(blocks, k, fp));
  const stones = Math.max(0, Math.floor(fp.budget * (1 - fp.fineProxyShare)));
  // Corte adaptativo: el menor corte (≥ piso) cuyo número de piedras entra en el presupuesto.
  let maxX = fp.minCut;
  for (const cv of curves) if (cv) maxX = Math.max(maxX, cv.xmax);
  let cut = fp.minCut;
  if (countAt(blocks, curves, cut, fp) > stones) {
    let lo = Math.log(fp.minCut);
    let hi = Math.log(maxX);
    for (let it = 0; it < 30; it++) {
      const mid = (lo + hi) / 2;
      if (countAt(blocks, curves, Math.exp(mid), fp) > stones) lo = mid;
      else hi = mid;
    }
    cut = Math.exp(hi);
  }

  const parent: number[] = [];
  const size: number[] = [];
  const axes: number[] = [];
  const quat: number[] = [];
  const shape: number[] = [];
  const offset: number[] = [];
  const rest: number[] = [];
  const spread: number[] = [];
  const omega: number[] = [];
  const flags: number[] = [];
  const fineFraction = new Float32Array(blocks.count).fill(NaN);
  let total = 0;
  let drawn = 0;
  let fine = 0;
  const cell = (k: number) => Math.cbrt(Math.max(blocks.volume[k] ?? 0, 1e-9));

  const push = (k: number, j: number, x: number, fineProxy: boolean, x50: number) => {
    const il = clamp(fp.ilMean + fp.ilSd * normal(k, j, 1, 17), 0.45, 0.98);
    const si = clamp(fp.siMean + fp.siSd * normal(k, j, 2, 18), 0.2, 0.95);
    // Caja L·I·S con I = x, reescalada a volumen k_v·x³.
    let L = x / il;
    let I = x;
    let S = x * si;
    const c = Math.cbrt((fp.volumeFactor * x * x * x) / (L * I * S));
    L *= c;
    I *= c;
    S *= c;
    parent.push(k);
    size.push(x);
    axes.push(L, I, S);
    // Cuaternión uniforme (Shoemake).
    const u1 = fragHash(k, j, 4);
    const u2 = 2 * Math.PI * fragHash(k, j, 5);
    const u3 = 2 * Math.PI * fragHash(k, j, 6);
    const a = Math.sqrt(1 - u1);
    const b = Math.sqrt(u1);
    quat.push(a * Math.sin(u2), a * Math.cos(u2), b * Math.sin(u3), b * Math.cos(u3));
    shape.push(Math.min(FRAGMENT_SHAPES - 1, Math.floor(fragHash(k, j, 3) * FRAGMENT_SHAPES)));
    // Posición dentro del bloque al salir y en la pila (sobre la cama de grava).
    const s = cell(k);
    const h = blocks.height[k] ?? s;
    const half = Math.max(0, s / 2 - x / 2);
    const hz = Math.max(0, h / 2 - x / 2);
    offset.push(
      (2 * fragHash(k, j, 13) - 1) * half,
      (2 * fragHash(k, j, 14) - 1) * half,
      (2 * fragHash(k, j, 15) - 1) * hz,
    );
    const ff = fineFraction[k] ?? 0;
    const zBed = -h / 2 + (Number.isFinite(ff) ? ff : 0) * h;
    rest.push(
      (2 * fragHash(k, j, 19) - 1) * half,
      (2 * fragHash(k, j, 20) - 1) * half,
      Math.min(h / 2, zBed + S / 2 + fragHash(k, j, 21) * Math.max(0, h / 2 - zBed - S / 2)),
    );
    // Velocidad propia alrededor de la del bloque.
    const vx = blocks.velocity[3 * k] ?? 0;
    const vy = blocks.velocity[3 * k + 1] ?? 0;
    const vz = blocks.velocity[3 * k + 2] ?? 0;
    const sp = Math.hypot(vx, vy, vz);
    if (sp > 1e-6 && Number.isFinite(blocks.launchTime[k] ?? NaN)) {
      const z = normal(k, j, 7, 8);
      const sizeF = clamp(Math.pow(x / Math.max(x50, 1e-6), -fp.sizeExponent), 0.6, 1.6);
      const mag =
        sp *
        Math.exp(fp.speedSigma * z - (fp.speedSigma * fp.speedSigma) / 2) *
        (fineProxy ? 1 : sizeF);
      // Cono: base ortonormal alrededor de la dirección del bloque.
      const ex = vx / sp;
      const ey = vy / sp;
      const ez = vz / sp;
      const [px, py, pz] = Math.abs(ez) < 0.9 ? [-ey, ex, 0] : [0, -ez, ey];
      const pn = Math.hypot(px, py, pz) || 1;
      const ax = px / pn;
      const ay = py / pn;
      const az = pz / pn;
      const bx = ey * az - ez * ay;
      const by = ez * ax - ex * az;
      const bz = ex * ay - ey * ax;
      const theta = Math.min(Math.PI / 3, Math.abs(fp.coneSigma * normal(k, j, 9, 22)));
      const phi = 2 * Math.PI * fragHash(k, j, 10);
      const ct = Math.cos(theta);
      const st = Math.sin(theta);
      const dx = ex * ct + (ax * Math.cos(phi) + bx * Math.sin(phi)) * st;
      const dy = ey * ct + (ay * Math.cos(phi) + by * Math.sin(phi)) * st;
      const dz = ez * ct + (az * Math.cos(phi) + bz * Math.sin(phi)) * st;
      spread.push(dx * mag - vx, dy * mag - vy, dz * mag - vz);
      // Giro: eje ⊥ a la velocidad.
      const w = clamp((fp.spinFactor * mag) / Math.max(L, 1e-3), 1, 20);
      const psi = 2 * Math.PI * fragHash(k, j, 11);
      const sx = ax * Math.cos(psi) + bx * Math.sin(psi);
      const sy = ay * Math.cos(psi) + by * Math.sin(psi);
      const sz = az * Math.cos(psi) + bz * Math.sin(psi);
      omega.push(sx * w, sy * w, sz * w);
    } else {
      spread.push(0, 0, 0);
      omega.push(0, 0, 0);
    }
    flags.push(fineProxy ? FRAGMENT_FINE : 0);
  };

  for (let k = 0; k < blocks.count; k++) {
    const cv = curves[k];
    if (!cv) continue;
    const V = blocks.volume[k] ?? 0;
    if (!(V > 0)) continue;
    total += V;
    const cls = classes(V, cv, cut, fp);
    const drawnK = cls.reduce((s, c) => s + c.vol, 0);
    fineFraction[k] = clamp(1 - drawnK / V, 0, 1);
    fine += V - drawnK;
    let j = 0;
    for (const c of cls) {
      const pLo = swebrecPassing(c.lo, cv.x50, cv.xmax, cv.b);
      const pHi = Math.min(1 - 1e-9, swebrecPassing(c.hi, cv.x50, cv.xmax, cv.b));
      const xs: number[] = [];
      for (let m = 0; m < c.n; m++) {
        const p = pLo + (pHi - pLo) * fragHash(k, j + m, 0);
        const x = p > 0 && p < 1 ? swebrecSize(p, cv.x50, cv.xmax, cv.b) : Math.sqrt(c.lo * c.hi);
        xs.push(clamp(x, c.lo, c.hi));
      }
      // Reescala para que la clase conserve su volumen exacto.
      const sum = xs.reduce((s, x) => s + fp.volumeFactor * x * x * x, 0);
      const f = sum > 0 ? Math.cbrt(c.vol / sum) : 1;
      for (const x of xs) {
        const xx = x * f;
        drawn += fp.volumeFactor * xx * xx * xx;
        push(k, j++, xx, false, cv.x50);
      }
    }
  }

  // Proxies de finos en vuelo: reparto por volumen fino (largest remainder, determinista).
  const proxies = Math.max(0, fp.budget - parent.length);
  if (proxies > 0 && fine > 0) {
    const want: { k: number; n: number; r: number }[] = [];
    let used = 0;
    for (let k = 0; k < blocks.count; k++) {
      const ff = fineFraction[k] ?? NaN;
      if (!(ff > 0) || !Number.isFinite(blocks.launchTime[k] ?? NaN)) continue;
      const exact = (proxies * ff * (blocks.volume[k] ?? 0)) / fine;
      const n = Math.floor(exact);
      used += n;
      want.push({ k, n, r: exact - n });
    }
    want.sort((a, b) => b.r - a.r || a.k - b.k);
    for (let i = 0; i < want.length && used < proxies; i++, used++) {
      const w = want[i];
      if (w) w.n++;
    }
    want.sort((a, b) => a.k - b.k);
    for (const w of want)
      for (let m = 0; m < w.n; m++) {
        const cv = curves[w.k];
        const x = cut * (0.35 + 0.5 * fragHash(w.k, 1e6 + m, 0));
        push(w.k, 1_000_000 + m, x, true, cv?.x50 ?? cut);
      }
  }

  const { land, restPos } = settleFragments(
    blocks,
    parent,
    size,
    offset,
    rest,
    spread,
    flags,
    cut,
    fp,
  );

  return {
    count: parent.length,
    land,
    restPos,
    parent: Int32Array.from(parent),
    size: Float32Array.from(size),
    axes: Float32Array.from(axes),
    quat: Float32Array.from(quat),
    shape: Uint8Array.from(shape),
    offset: Float32Array.from(offset),
    rest: Float32Array.from(rest),
    spread: Float32Array.from(spread),
    omega: Float32Array.from(omega),
    flags: Uint8Array.from(flags),
    fineFraction,
    cut,
    spreadLimit: fp.spreadLimit,
    volume: { total, drawn, fine },
  };
}

/** Buffers transferibles de los fragmentos (worker → hilo principal). */
export function fragmentBuffers(f: MuckpileFragments): ArrayBuffer[] {
  return [
    f.parent,
    f.size,
    f.axes,
    f.quat,
    f.shape,
    f.offset,
    f.rest,
    f.land,
    f.restPos,
    f.spread,
    f.omega,
    f.flags,
    f.fineFraction,
  ].map((a) => a.buffer as ArrayBuffer);
}

const G = 9.80665;

/**
 * Aterrizaje y duración del vuelo de un bloque, igual que el engine (`BlocksLayer`): trayectoria
 * muestreada (subterránea), tiro parabólico hasta cruzar la cota de su lugar en la pila (banco) o
 * sin vuelo (se desliza desde su lugar in situ).
 */
export function blockLanding(
  b: MuckpileBlocks,
  k: number,
): { x: number; y: number; z: number; flight: number } {
  const ox = b.origin[3 * k] ?? 0;
  const oy = b.origin[3 * k + 1] ?? 0;
  const oz = b.origin[3 * k + 2] ?? 0;
  const P = b.pathPoints ?? 0;
  if (b.path && P >= 2) {
    const pl = (k * P + P - 1) * 4;
    return {
      x: ox + (b.path[pl] ?? 0),
      y: oy + (b.path[pl + 1] ?? 0),
      z: oz + (b.path[pl + 2] ?? 0),
      flight: b.path[pl + 3] ?? 0,
    };
  }
  const vx = b.velocity[3 * k] ?? 0;
  const vy = b.velocity[3 * k + 1] ?? 0;
  const vz = b.velocity[3 * k + 2] ?? 0;
  const dz = b.destination[3 * k + 2] ?? 0;
  const disc = vz * vz + 2 * G * (oz - dz);
  const tLand = disc >= 0 ? (vz + Math.sqrt(disc)) / G : NaN;
  if (Number.isFinite(tLand) && tLand > 0)
    return { x: ox + vx * tLand, y: oy + vy * tLand, z: dz, flight: tLand };
  return { x: ox, y: oy, z: oz, flight: 0 };
}

/** Ver `MuckpileFragments.land` y `restPos`. */
function settleFragments(
  blocks: MuckpileBlocks,
  parent: readonly number[],
  size: readonly number[],
  offset: readonly number[],
  rest: readonly number[],
  spread: readonly number[],
  flags: readonly number[],
  cut: number,
  fp: FragmentParams,
): { land: Float64Array; restPos: Float64Array } {
  const n = parent.length;
  const land = new Float64Array(3 * n);
  const restPos = new Float64Array(3 * n);
  const landing = Array.from({ length: blocks.count }, (_, k) => blockLanding(blocks, k));
  const arrival = new Float64Array(n);
  for (let j = 0; j < n; j++) {
    const k = parent[j] ?? 0;
    const L = landing[k];
    if (!L) continue;
    const F = L.flight;
    let ex = (spread[3 * j] ?? 0) * F;
    let ey = (spread[3 * j + 1] ?? 0) * F;
    let ez = (spread[3 * j + 2] ?? 0) * F;
    const em = Math.hypot(ex, ey, ez);
    if (em > fp.spreadLimit) {
      const f = fp.spreadLimit / em;
      ex *= f;
      ey *= f;
      ez *= f;
    }
    land[3 * j] = L.x + (offset[3 * j] ?? 0) + ex;
    land[3 * j + 1] = L.y + (offset[3 * j + 1] ?? 0) + ey;
    land[3 * j + 2] = L.z + (offset[3 * j + 2] ?? 0) + ez;
    // Hueco propio (sobre la cama de grava de su bloque): punto de partida del reparto.
    restPos[3 * j] = (blocks.destination[3 * k] ?? 0) + (rest[3 * j] ?? 0);
    restPos[3 * j + 1] = (blocks.destination[3 * k + 1] ?? 0) + (rest[3 * j + 1] ?? 0);
    restPos[3 * j + 2] = (blocks.destination[3 * k + 2] ?? 0) + (rest[3 * j + 2] ?? 0);
    arrival[j] = (blocks.launchTime[k] ?? NaN) + F;
  }
  // Reparto de huecos por clase de tamaño (6 por década), en orden de llegada: cada piedra toma
  // el hueco libre más cercano a donde cayó. Grilla en planta para buscar por anillos.
  const CELL = 0.5;
  const bins = new Map<number, number[]>();
  for (let j = 0; j < n; j++) {
    if ((flags[j] ?? 0) & FRAGMENT_FINE || !Number.isFinite(arrival[j] ?? NaN)) continue;
    const b = Math.floor((Math.log10(Math.max(size[j] ?? cut, cut) / cut) * 6) | 0);
    let list = bins.get(b);
    if (!list) bins.set(b, (list = []));
    list.push(j);
  }
  const slotX = new Float64Array(restPos);
  for (const ids of bins.values()) {
    // Grilla densa sobre la caja de los huecos de esta clase; cada celda guarda sus huecos libres
    // (se sacan al ocuparse) y la búsqueda arranca en la celda de la caja más cercana a la caída.
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const j of ids) {
      x0 = Math.min(x0, slotX[3 * j] ?? 0);
      x1 = Math.max(x1, slotX[3 * j] ?? 0);
      y0 = Math.min(y0, slotX[3 * j + 1] ?? 0);
      y1 = Math.max(y1, slotX[3 * j + 1] ?? 0);
    }
    const nx = Math.max(1, Math.floor((x1 - x0) / CELL) + 1);
    const ny = Math.max(1, Math.floor((y1 - y0) / CELL) + 1);
    const cells: number[][] = Array.from({ length: nx * ny }, () => []);
    const cellOf = (x: number, y: number) => {
      const ix = Math.min(nx - 1, Math.max(0, Math.floor((x - x0) / CELL)));
      const iy = Math.min(ny - 1, Math.max(0, Math.floor((y - y0) / CELL)));
      return [ix, iy] as const;
    };
    ids.forEach((j, s) => {
      const [ix, iy] = cellOf(slotX[3 * j] ?? 0, slotX[3 * j + 1] ?? 0);
      cells[iy * nx + ix]?.push(s);
    });
    const order = ids.map((j) => j).sort((a, b) => (arrival[a] ?? 0) - (arrival[b] ?? 0) || a - b);
    const maxR = Math.max(nx, ny);
    for (const j of order) {
      const lx = land[3 * j] ?? 0;
      const ly = land[3 * j + 1] ?? 0;
      const lz = land[3 * j + 2] ?? 0;
      const [cx, cy] = cellOf(lx, ly);
      // Distancia de la caída a la caja: los anillos se miden desde la celda de entrada.
      const gap = Math.hypot(
        Math.max(0, x0 - lx, lx - (x0 + nx * CELL)),
        Math.max(0, y0 - ly, ly - (y0 + ny * CELL)),
      );
      let best = -1;
      let bestCell = -1;
      let bestIdx = -1;
      let bestD = Infinity;
      const visit = (ix: number, iy: number) => {
        if (ix < 0 || iy < 0 || ix >= nx || iy >= ny) return;
        const c = cells[iy * nx + ix];
        if (!c) return;
        for (let i = 0; i < c.length; i++) {
          const q = ids[c[i] ?? 0] ?? 0;
          const dx = (slotX[3 * q] ?? 0) - lx;
          const dy = (slotX[3 * q + 1] ?? 0) - ly;
          // La cota pesa menos: caer sobre la pila y quedar un poco más abajo es lo normal.
          const dz = 0.3 * ((slotX[3 * q + 2] ?? 0) - lz);
          const d = dx * dx + dy * dy + dz * dz;
          if (d < bestD) {
            bestD = d;
            best = c[i] ?? 0;
            bestCell = iy * nx + ix;
            bestIdx = i;
          }
        }
      };
      for (let r = 0; r <= maxR; r++) {
        if (best >= 0 && gap + (r - 1) * CELL > Math.sqrt(bestD)) break;
        if (r === 0) visit(cx, cy);
        else {
          for (let d = -r; d <= r; d++) {
            visit(cx + d, cy - r);
            visit(cx + d, cy + r);
          }
          for (let d = -r + 1; d <= r - 1; d++) {
            visit(cx - r, cy + d);
            visit(cx + r, cy + d);
          }
        }
      }
      if (best < 0) continue;
      const c = cells[bestCell];
      if (c) {
        c[bestIdx] = c[c.length - 1] ?? 0;
        c.pop();
      }
      const q = ids[best] ?? 0;
      restPos[3 * j] = slotX[3 * q] ?? 0;
      restPos[3 * j + 1] = slotX[3 * q + 1] ?? 0;
      restPos[3 * j + 2] = slotX[3 * q + 2] ?? 0;
    }
  }
  // Finos: se quedan donde caen.
  for (let j = 0; j < n; j++)
    if ((flags[j] ?? 0) & FRAGMENT_FINE) {
      restPos[3 * j] = land[3 * j] ?? 0;
      restPos[3 * j + 1] = land[3 * j + 1] ?? 0;
      restPos[3 * j + 2] = land[3 * j + 2] ?? 0;
    }
  return { land, restPos };
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}
