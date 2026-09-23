import { newId } from '../model/ids';
import type {
  Blast,
  DetonatorId,
  Hole,
  HoleId,
  InHoleInitiator,
  InitiationPlan,
  PatternId,
  Seconds,
  SurfaceConnection,
  SurfaceConnectorId,
} from '../model/types';

/** Filas de un patrón: fila → taladros ordenados por columna. */
function patternRows(blast: Blast, patternId: PatternId): Map<number, Hole[]> {
  const rows = new Map<number, Hole[]>();
  for (const h of blast.holes) {
    if (h.patternId !== patternId || h.row === undefined || h.col === undefined) continue;
    let list = rows.get(h.row);
    if (!list) rows.set(h.row, (list = []));
    list.push(h);
  }
  for (const list of rows.values()) list.sort((a, b) => (a.col ?? 0) - (b.col ?? 0));
  return rows;
}

/** Taladro de la fila con columna más cercana a `col`. */
function pivotOf(list: readonly Hole[], col: number): number {
  let best = 0;
  let bestD = Infinity;
  list.forEach((h, i) => {
    const d = Math.abs((h.col ?? 0) - col);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

export interface RowTieUpOptions {
  patternId: PatternId;
  /** Fila y columna del punto de inicio. Columna en un extremo = línea a línea; al centro = en V. */
  startRow: number;
  startCol: number;
  interHoleConnectorId: SurfaceConnectorId;
  interRowConnectorId: SurfaceConnectorId;
}

/**
 * Amarre de superficie por filas: en cada fila se encadena desde el taladro pivote (columna de
 * inicio) hacia ambos lados con el conector entre taladros; los pivotes de filas consecutivas se
 * unen con el conector entre filas, avanzando desde la fila de inicio hacia ambos lados.
 */
export function rowTieUp(
  blast: Blast,
  o: RowTieUpOptions,
): Pick<InitiationPlan, 'connections' | 'initiationPoints'> {
  const rows = patternRows(blast, o.patternId);
  const connections: SurfaceConnection[] = [];
  const link = (a: HoleId, b: HoleId, connectorId: SurfaceConnectorId) => {
    connections.push({
      id: newId<'Connection'>(),
      from: { kind: 'hole', holeId: a },
      to: { kind: 'hole', holeId: b },
      connectorId,
    });
  };
  const pivots = new Map<number, Hole>();
  for (const [row, list] of rows) {
    const p = pivotOf(list, o.startCol);
    const pivot = list[p];
    if (!pivot) continue;
    pivots.set(row, pivot);
    for (let i = p; i < list.length - 1; i++)
      link((list[i] as Hole).id, (list[i + 1] as Hole).id, o.interHoleConnectorId);
    for (let i = p; i > 0; i--)
      link((list[i] as Hole).id, (list[i - 1] as Hole).id, o.interHoleConnectorId);
  }
  const rowNumbers = [...pivots.keys()].sort((a, b) => a - b);
  const startIdx = Math.max(
    0,
    rowNumbers.findIndex((r) => r >= o.startRow),
  );
  for (let k = startIdx; k < rowNumbers.length - 1; k++) {
    link(
      (pivots.get(rowNumbers[k] ?? 0) as Hole).id,
      (pivots.get(rowNumbers[k + 1] ?? 0) as Hole).id,
      o.interRowConnectorId,
    );
  }
  for (let k = startIdx; k > 0; k--) {
    link(
      (pivots.get(rowNumbers[k] ?? 0) as Hole).id,
      (pivots.get(rowNumbers[k - 1] ?? 0) as Hole).id,
      o.interRowConnectorId,
    );
  }
  const start = pivots.get(rowNumbers[startIdx] ?? 0);
  return {
    connections,
    initiationPoints: start
      ? [{ id: newId<'InitiationPoint'>(), at: { kind: 'hole', holeId: start.id }, time: 0 }]
      : [],
  };
}

export interface ElectronicTimingOptions {
  patternId: PatternId;
  startRow: number;
  startCol: number;
  interHole: Seconds;
  interRow: Seconds;
  /** Tiempo del primer taladro [s]. */
  offset: Seconds;
  detonatorId: DetonatorId;
}

/** Tiempos programados: offset + |fila − fila0|·entre filas + |col − col0|·entre taladros. */
export function electronicTimes(blast: Blast, o: ElectronicTimingOptions): Map<HoleId, Seconds> {
  const out = new Map<HoleId, Seconds>();
  for (const h of blast.holes) {
    if (h.patternId !== o.patternId || h.row === undefined || h.col === undefined) continue;
    out.set(
      h.id,
      o.offset +
        Math.abs(h.row - o.startRow) * o.interRow +
        Math.abs(h.col - o.startCol) * o.interHole,
    );
  }
  return out;
}

/**
 * Detonador en el taladro: reemplaza detonador y retardo de los iniciadores existentes o,
 * si no hay, agrega uno a 0.5 m del fondo.
 */
export function withDownholeDetonator(
  hole: Hole,
  detonatorId: DetonatorId,
  delay: Seconds,
): InHoleInitiator[] {
  if (hole.initiators.length === 0) {
    return [
      { id: newId<'InHoleInitiator'>(), detonatorId, depth: Math.max(0, hole.length - 0.5), delay },
    ];
  }
  return hole.initiators.map((init) => ({ ...init, detonatorId, delay }));
}
