import type { DesignCheck, DesignCheckOptions } from '../diagnostics/designChecks';
import type { Blast, CalcParams, HoleId, NodeRef } from '../model/types';
import { frontMargin, holeIndex, type EffectiveBurden } from './effectiveBurden';

const key = (r: NodeRef) => (r.kind === 'hole' ? `h:${r.holeId}` : `n:${r.nodeId}`);

/**
 * Taladros que forman parte de un ciclo del amarre (H-504: error). Dijkstra no se cuelga con
 * ciclos, pero un ciclo indica un amarre mal armado.
 */
export function cycleHoles(blast: Pick<Blast, 'initiation'>): HoleId[] {
  const adj = new Map<string, string[]>();
  for (const c of blast.initiation.connections) {
    const a = key(c.from);
    const list = adj.get(a) ?? [];
    list.push(key(c.to));
    adj.set(a, list);
  }
  const state = new Map<string, 1 | 2>(); // 1 = en la pila, 2 = terminado
  const inCycle = new Set<string>();
  const stack: string[] = [];
  const visit = (u: string) => {
    state.set(u, 1);
    stack.push(u);
    for (const v of adj.get(u) ?? []) {
      if (state.get(v) === 1) {
        // Arista hacia atrás: los nodos desde v hasta u forman el ciclo.
        for (let k = stack.lastIndexOf(v); k < stack.length; k++) inCycle.add(stack[k] ?? '');
      } else if (!state.has(v)) visit(v);
    }
    stack.pop();
    state.set(u, 2);
  };
  // ponytail: DFS recursivo; con amarres de decenas de miles de conexiones en cadena, pasar a pila explícita.
  for (const u of adj.keys()) if (!state.has(u)) visit(u);
  return [...inCycle].filter((k) => k.startsWith('h:')).map((k) => k.slice(2) as HoleId);
}

/**
 * Revisión de tiempos (G5): ciclos (error), burden efectivo (FC-22, CR-05), orden invertido
 * respecto de la cara libre (CK-10) y guía de retardos por metro (H-505, P-11; informativa).
 */
export function timingChecks(
  blast: Blast,
  fireTime: Float64Array,
  eb: EffectiveBurden,
  options: DesignCheckOptions,
  guide: CalcParams['delayGuide'],
): DesignCheck[] {
  const holes = blast.holes;
  const unrelieved: HoleId[] = [];
  const partialRelief: HoleId[] = [];
  const closeRelief: HoleId[] = [];
  const inverted: HoleId[] = [];
  const ejection: HoleId[] = [];
  const spacingOf = new Map(blast.patterns.map((p) => [p.id, p.spacing]));
  const index = holeIndex(holes);
  holes.forEach((h, i) => {
    const e = eb.effective[i] ?? NaN;
    const b = eb.nominal[i] ?? NaN;
    if (!Number.isFinite(e) || !Number.isFinite(b)) return;
    if (e >= options.maxEffectiveBurdenRatio * b - 1e-6) unrelieved.push(h.id);
    else if (e >= options.midEffectiveBurdenRatio * b - 1e-6) partialRelief.push(h.id);
    else if (e < options.minEffectiveBurdenRatio * b) closeRelief.push(h.id);
    // Orden invertido: un vecino más cerca de la cara libre detona después.
    const ti = fireTime[i] ?? NaN;
    const di = eb.faceDistance[i] ?? Infinity;
    if (!Number.isFinite(di)) return;
    const s = h.patternId ? (spacingOf.get(h.patternId) ?? b) : b;
    const radius = options.neighborFactor * Math.max(b, s);
    const { x, y } = h.collar;
    // Vecinos de la fila de adelante (más cerca de la cara libre).
    const front = index.inBox(x - radius, y - radius, x + radius, y + radius).filter((j) => {
      const hj = holes[j];
      return (
        hj !== undefined &&
        (eb.faceDistance[j] ?? Infinity) < di - frontMargin(b) &&
        Math.hypot(x - hj.collar.x, y - hj.collar.y) <= radius
      );
    });
    if (front.some((j) => (fireTime[j] ?? NaN) > ti)) inverted.push(h.id);
    // Eyección del taco (`R1` F27, `P5 p77`): la fila de adelante salió hace menos del mínimo.
    const lastFront = Math.max(...front.map((j) => fireTime[j] ?? NaN).filter((t) => t < ti));
    if (Number.isFinite(lastFront) && ti - lastFront < options.minInterRowDelay - 1e-9)
      ejection.push(h.id);
  });

  // Guía de retardos por metro entre vecinos de la misma malla (fila y columna).
  const at = new Map<string, number>();
  holes.forEach((h, i) => {
    if (h.patternId && h.row !== undefined && h.col !== undefined)
      at.set(`${h.patternId}:${String(h.row)}:${String(h.col)}`, i);
  });
  const offGuide = new Set<HoleId>();
  const patternOf = new Map(blast.patterns.map((p) => [p.id, p]));
  holes.forEach((h, i) => {
    const p = h.patternId ? patternOf.get(h.patternId) : undefined;
    if (!p || h.row === undefined || h.col === undefined) return;
    const ti = fireTime[i] ?? NaN;
    const check = (row: number, col: number, dist: number, r: { min: number; max: number }) => {
      const j = at.get(`${p.id}:${String(row)}:${String(col)}`);
      const tj = j === undefined ? NaN : (fireTime[j] ?? NaN);
      if (!Number.isFinite(ti) || !Number.isFinite(tj)) return;
      const perM = Math.abs(ti - tj) / dist;
      if (perM < r.min || perM > r.max) offGuide.add(h.id);
    };
    check(h.row, h.col + 1, p.spacing, guide.interHole);
    check(h.row + 1, h.col, p.burden, guide.interRow);
  });

  const ms = (v: number) => (v * 1000).toFixed(0);
  const checks: DesignCheck[] = [
    {
      id: 'tieCycle',
      severity: 'error',
      title: 'Amarre con ciclos',
      detail:
        'Hay conexiones que forman un circuito cerrado: revisa el sentido del amarre (H-504).',
      holes: cycleHoles(blast),
    },
    {
      id: 'unrelievedBurden',
      severity: 'warning',
      title: 'Cara libre no despejada',
      detail: `Burden efectivo ≥ ${String(options.maxEffectiveBurdenRatio)} × nominal al detonar: la cara hacia la que sale todavía no se abrió (RM-07, CR-05).`,
      params: { value: options.maxEffectiveBurdenRatio },
      holes: unrelieved,
    },
    {
      id: 'partialRelief',
      severity: 'warning',
      title: 'Alivio insuficiente',
      detail: `Burden efectivo ≥ ${String(options.midEffectiveBurdenRatio)} × nominal al detonar: sale con más burden que el de diseño (P-16).`,
      params: { value: options.midEffectiveBurdenRatio },
      holes: partialRelief,
    },
    {
      id: 'invertedOrder',
      severity: 'warning',
      title: 'Orden invertido respecto de la cara libre',
      detail:
        'Detonan antes que un vecino que está más cerca de la cara libre: salen contra roca sin alivio (CK-10).',
      holes: inverted,
    },
    {
      id: 'stemmingEjection',
      // Nota (R1, sin caso): en salidas en V las «filas» efectivas son diagonales (S-07).
      severity: 'info',
      title: 'Intervalo corto con la fila de adelante',
      detail: `La fila de adelante detonó hace menos de ${String(options.minInterRowDelay * 1000)} ms: riesgo de eyección del taco (R1 F27).`,
      params: { value: options.minInterRowDelay * 1000 },
      holes: ejection,
    },
    {
      id: 'closeRelief',
      severity: 'info',
      title: 'Alivio muy cercano',
      detail: `Burden efectivo < ${String(options.minEffectiveBurdenRatio)} × nominal: el alivio viene de un taladro muy próximo.`,
      params: { value: options.minEffectiveBurdenRatio },
      holes: closeRelief,
    },
    {
      id: 'delayGuide',
      severity: 'info',
      title: 'Retardo fuera de la guía por metro',
      detail: `Entre taladros ${ms(guide.interHole.min)}–${ms(guide.interHole.max)} ms/m de espaciamiento y entre filas ${ms(guide.interRow.min)}–${ms(guide.interRow.max)} ms/m de burden (guía de diseño, P-11; configurable).`,
      params: {
        holeMin: ms(guide.interHole.min),
        holeMax: ms(guide.interHole.max),
        rowMin: ms(guide.interRow.min),
        rowMax: ms(guide.interRow.max),
      },
      holes: [...offGuide],
    },
  ];
  return checks.filter((c) => c.holes.length > 0);
}
