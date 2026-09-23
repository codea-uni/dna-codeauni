import type { Blast, HoleId, NodeRef, PatternId, ProductLibrary, Seconds } from '../model/types';
import { MinHeap } from './heap';

export interface TimingOptions {
  /** Ventana de coincidencia [s] (práctica habitual: 8 ms). */
  coincidenceWindow: Seconds;
}

export const DEFAULT_TIMING_OPTIONS: TimingOptions = { coincidenceWindow: 0.008 };

export interface InterRowDelay {
  patternId: PatternId | null;
  rowA: number;
  rowB: number;
  /** Diferencia de tiempo entre cada taladro de la fila B y su vecino más cercano de la fila A [s]. */
  min: Seconds;
  max: Seconds;
  mean: Seconds;
  count: number;
}

/** Resultados de tiempos. Arreglos indexados como `holeIds`. NaN = no iniciado. */
export interface TimingResult {
  holeIds: HoleId[];
  /** Llegada de la señal de superficie a la boca [s]. */
  surfaceTime: Float64Array;
  /** Tiempo de detonación del taladro [s]. */
  fireTime: Float64Array;
  initiated: number;
  notInitiated: number;
  /** Taladros sin detonador en el taladro (se toma el tiempo de superficie). */
  withoutDetonator: number;
  firstTime: Seconds;
  lastTime: Seconds;
  /** Grupos de taladros encadenados a menos de la ventana entre sí (≥ 2 taladros). */
  coincidentGroups: HoleId[][];
  /** Máximo de taladros dentro de cualquier ventana. */
  maxHolesPerWindow: number;
  /** Máxima carga dentro de cualquier ventana [kg] (0 si no se pasó la carga). */
  maxChargePerWindow: number;
  maxChargeWindowStart: Seconds;
  interRowDelays: InterRowDelay[];
}

/**
 * Tiempos de detonación.
 * - Superficie: camino más corto (Dijkstra) desde los puntos de inicio por las conexiones dirigidas.
 * - Taladro con detonador nonel/eléctrico: t = t_superficie + retardo en taladro.
 * - Taladro con detonador electrónico: t = t_superficie (o el t0 del primer punto de inicio si no
 *   hay red de superficie) + tiempo programado.
 * - Con varios iniciadores manda el más temprano. Sin iniciadores: t = t_superficie.
 */
export function computeTiming(
  blast: Blast,
  library: ProductLibrary,
  options: TimingOptions = DEFAULT_TIMING_OPTIONS,
  chargePerHole?: Float64Array,
): TimingResult {
  const holes = blast.holes;
  const n = holes.length;
  const plan = blast.initiation;
  const holeIndex = new Map<string, number>();
  holes.forEach((h, i) => holeIndex.set(h.id, i));
  const nodeIndex = new Map<string, number>();
  plan.nodes.forEach((node, i) => nodeIndex.set(node.id, n + i));
  const total = n + plan.nodes.length;
  const indexOf = (ref: NodeRef): number | undefined =>
    ref.kind === 'hole' ? holeIndex.get(ref.holeId) : nodeIndex.get(ref.nodeId);

  // Grafo en formato CSR.
  const connectorDelay = new Map(library.surfaceConnectors.map((c) => [c.id, c.delay]));
  const from: number[] = [];
  const to: number[] = [];
  const weight: number[] = [];
  for (const c of plan.connections) {
    const a = indexOf(c.from);
    const b = indexOf(c.to);
    if (a === undefined || b === undefined) continue;
    from.push(a);
    to.push(b);
    weight.push(c.delayOverride ?? connectorDelay.get(c.connectorId) ?? 0);
  }
  const offsets = new Int32Array(total + 1);
  for (const a of from) offsets[a + 1] = (offsets[a + 1] ?? 0) + 1;
  for (let i = 0; i < total; i++) offsets[i + 1] = (offsets[i + 1] ?? 0) + (offsets[i] ?? 0);
  const adjTo = new Int32Array(from.length);
  const adjW = new Float64Array(from.length);
  const fill = offsets.slice(0, total);
  from.forEach((a, e) => {
    const slot = fill[a] ?? 0;
    adjTo[slot] = to[e] ?? 0;
    adjW[slot] = weight[e] ?? 0;
    fill[a] = slot + 1;
  });

  const dist = new Float64Array(total).fill(Infinity);
  const heap = new MinHeap();
  let firstStart = Infinity;
  for (const ip of plan.initiationPoints) {
    const i = indexOf(ip.at);
    firstStart = Math.min(firstStart, ip.time);
    if (i === undefined || ip.time >= (dist[i] ?? Infinity)) continue;
    dist[i] = ip.time;
    heap.push(ip.time, i);
  }
  for (let top = heap.pop(); top; top = heap.pop()) {
    const [d, u] = top;
    if (d > (dist[u] ?? Infinity)) continue;
    for (let e = offsets[u] ?? 0; e < (offsets[u + 1] ?? 0); e++) {
      const v = adjTo[e] ?? 0;
      const nd = d + (adjW[e] ?? 0);
      if (nd < (dist[v] ?? Infinity)) {
        dist[v] = nd;
        heap.push(nd, v);
      }
    }
  }
  const electronicT0 = Number.isFinite(firstStart) ? firstStart : 0;

  const detonatorType = new Map(library.detonators.map((d) => [d.id, d.type]));
  const surfaceTime = new Float64Array(n);
  const fireTime = new Float64Array(n);
  let withoutDetonator = 0;
  holes.forEach((hole, i) => {
    const s = dist[i] ?? Infinity;
    surfaceTime[i] = Number.isFinite(s) ? s : NaN;
    if (hole.initiators.length === 0) {
      withoutDetonator++;
      fireTime[i] = Number.isFinite(s) ? s : NaN;
      return;
    }
    let best = Infinity;
    for (const init of hole.initiators) {
      const electronic = detonatorType.get(init.detonatorId) === 'electronic';
      const base = Number.isFinite(s) ? s : electronic ? electronicT0 : Infinity;
      best = Math.min(best, base + init.delay);
    }
    fireTime[i] = Number.isFinite(best) ? best : NaN;
  });

  // Orden de disparo para ventanas y coincidencias.
  const order: number[] = [];
  for (let i = 0; i < n; i++) if (!Number.isNaN(fireTime[i])) order.push(i);
  order.sort((a, b) => (fireTime[a] ?? 0) - (fireTime[b] ?? 0));
  const t = (k: number) => fireTime[order[k] ?? 0] ?? 0;
  // Tolerancia de 1 ns: diferencias de exactamente la ventana (p.ej. 42 − 34 ms) no son coincidencia.
  const w = options.coincidenceWindow - 1e-9;

  const coincidentGroups: HoleId[][] = [];
  let group: number[] = [];
  for (let k = 0; k < order.length; k++) {
    if (k > 0 && t(k) - t(k - 1) < w) {
      group.push(order[k] ?? 0);
    } else {
      if (group.length > 1) coincidentGroups.push(group.map((i) => holes[i]?.id as HoleId));
      group = [order[k] ?? 0];
    }
  }
  if (group.length > 1) coincidentGroups.push(group.map((i) => holes[i]?.id as HoleId));

  let maxHolesPerWindow = order.length > 0 ? 1 : 0;
  let maxChargePerWindow = 0;
  let maxChargeWindowStart = 0;
  let windowCharge = 0;
  for (let hi = 0, lo = 0; hi < order.length; hi++) {
    windowCharge += chargePerHole?.[order[hi] ?? 0] ?? 0;
    while (t(hi) - t(lo) >= w) {
      windowCharge -= chargePerHole?.[order[lo] ?? 0] ?? 0;
      lo++;
    }
    maxHolesPerWindow = Math.max(maxHolesPerWindow, hi - lo + 1);
    if (windowCharge > maxChargePerWindow) {
      maxChargePerWindow = windowCharge;
      maxChargeWindowStart = t(lo);
    }
  }

  return {
    holeIds: holes.map((h) => h.id),
    surfaceTime,
    fireTime,
    initiated: order.length,
    notInitiated: n - order.length,
    withoutDetonator,
    firstTime: order.length > 0 ? t(0) : NaN,
    lastTime: order.length > 0 ? t(order.length - 1) : NaN,
    coincidentGroups,
    maxHolesPerWindow,
    maxChargePerWindow,
    maxChargeWindowStart,
    interRowDelays: interRowDelays(blast, fireTime),
  };
}

/** Para cada taladro de la fila r+1, diferencia con su vecino más cercano de la fila r (mismo patrón). */
function interRowDelays(blast: Blast, fireTime: Float64Array): InterRowDelay[] {
  const rows = new Map<
    string,
    { patternId: PatternId | null; row: number; idx: number[]; byCol: Map<number, number> }
  >();
  blast.holes.forEach((h, i) => {
    if (h.row === undefined || Number.isNaN(fireTime[i])) return;
    const key = `${h.patternId ?? ''}|${h.row}`;
    let entry = rows.get(key);
    if (!entry)
      rows.set(
        key,
        (entry = { patternId: h.patternId ?? null, row: h.row, idx: [], byCol: new Map() }),
      );
    entry.idx.push(i);
    if (h.col !== undefined) entry.byCol.set(h.col, i);
  });
  const out: InterRowDelay[] = [];
  for (const b of rows.values()) {
    const a = rows.get(`${b.patternId ?? ''}|${b.row - 1}`);
    if (!a) continue;
    let min = Infinity;
    let max = -Infinity;
    let sum = 0;
    for (const i of b.idx) {
      const hb = blast.holes[i];
      if (!hb) continue;
      // Vecinos candidatos por columna (c−1, c, c+1 cubren rectangular y tresbolillo);
      // si no hay columna o no existen (malla recortada), se recorre la fila completa.
      const c = hb.col;
      let candidates: number[] = [];
      if (c !== undefined) {
        for (const cc of [c - 1, c, c + 1]) {
          const j = a.byCol.get(cc);
          if (j !== undefined) candidates.push(j);
        }
      }
      if (candidates.length === 0) candidates = a.idx;
      let best = -1;
      let bestD = Infinity;
      for (const j of candidates) {
        const ha = blast.holes[j];
        if (!ha) continue;
        const d = (ha.collar.x - hb.collar.x) ** 2 + (ha.collar.y - hb.collar.y) ** 2;
        if (d < bestD) {
          bestD = d;
          best = j;
        }
      }
      const dt = (fireTime[i] ?? 0) - (fireTime[best] ?? 0);
      min = Math.min(min, dt);
      max = Math.max(max, dt);
      sum += dt;
    }
    out.push({
      patternId: b.patternId,
      rowA: a.row,
      rowB: b.row,
      min,
      max,
      mean: sum / b.idx.length,
      count: b.idx.length,
    });
  }
  return out.sort(
    (x, y) => (x.patternId ?? '').localeCompare(y.patternId ?? '') || x.rowA - y.rowA,
  );
}
