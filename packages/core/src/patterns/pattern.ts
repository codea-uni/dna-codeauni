import { azimuthToUnit } from '../geometry/vec';
import { pointInPolygon } from '../geometry/polygon';
import { createHole } from '../model/factories';
import type { Bench, Hole, Pattern, Vec2 } from '../model/types';

export interface PatternAxes {
  /** Dirección de la fila (a lo largo del espaciamiento). */
  u: Vec2;
  /** Dirección de avance entre filas (a lo largo del burden). */
  v: Vec2;
}

export function patternAxes(p: Pick<Pattern, 'rowAzimuth' | 'rowAdvance'>): PatternAxes {
  const u = azimuthToUnit(p.rowAzimuth);
  // Derecha de u (mirando en la dirección de la fila): (uy, −ux); izquierda: (−uy, ux).
  const v = p.rowAdvance === 'right' ? { x: u.y, y: -u.x } : { x: -u.y, y: u.x };
  return { u, v };
}

type PatternGeometry = Pick<
  Pattern,
  'kind' | 'burden' | 'spacing' | 'origin' | 'rowAzimuth' | 'rowAdvance'
>;

/** Desfase a lo largo de la fila (tresbolillo: filas impares desplazadas medio espaciamiento). */
function rowOffset(p: Pick<Pattern, 'kind' | 'spacing'>, row: number): number {
  return p.kind === 'staggered' && Math.abs(row % 2) === 1 ? p.spacing / 2 : 0;
}

/** Posición en planta del nodo (fila, columna) del patrón [m]. */
export function patternNodePosition(p: PatternGeometry, row: number, col: number): Vec2 {
  const { u, v } = patternAxes(p);
  const s = col * p.spacing + rowOffset(p, row);
  const b = row * p.burden;
  return { x: p.origin.x + s * u.x + b * v.x, y: p.origin.y + s * u.y + b * v.y };
}

/** Nodo de la red del patrón (extendida indefinidamente) más cercano a (x, y). */
export function nearestPatternNode(
  p: PatternGeometry,
  x: number,
  y: number,
): { row: number; col: number; position: Vec2 } {
  const { u, v } = patternAxes(p);
  const dx = x - p.origin.x;
  const dy = y - p.origin.y;
  const s = dx * u.x + dy * u.y;
  const b = dx * v.x + dy * v.y;
  const approxRow = Math.round(b / p.burden);
  let best = { row: approxRow, col: 0, position: p.origin };
  let bestD = Infinity;
  // En tresbolillo el nodo más cercano puede estar en la fila vecina.
  for (let row = approxRow - 1; row <= approxRow + 1; row++) {
    const col = Math.round((s - rowOffset(p, row)) / p.spacing);
    const position = patternNodePosition(p, row, col);
    const d = (position.x - x) ** 2 + (position.y - y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = { row, col, position };
    }
  }
  return best;
}

export interface GeneratePatternOptions {
  /** Número de la primera etiqueta; las siguientes son consecutivas. */
  startNumber: number;
}

/**
 * Genera los taladros de un patrón. Si `clipBoundary` existe, descarta los nodos fuera del polígono.
 * Orden: fila por fila, columnas en el sentido de la fila.
 */
export function generatePatternHoles(
  pattern: Pattern,
  bench: Bench,
  options: GeneratePatternOptions,
): Hole[] {
  if (!(pattern.burden > 0) || !(pattern.spacing > 0)) {
    throw new RangeError('burden y spacing deben ser positivos');
  }
  const holes: Hole[] = [];
  let label = options.startNumber;
  const clip =
    pattern.clipBoundary && pattern.clipBoundary.length >= 3 ? pattern.clipBoundary : null;
  for (let row = 0; row < pattern.rows; row++) {
    for (let col = 0; col < pattern.holesPerRow; col++) {
      const position = patternNodePosition(pattern, row, col);
      if (clip && !pointInPolygon(position.x, position.y, clip)) continue;
      holes.push(
        createHole({
          position,
          template: pattern.holeTemplate,
          bench,
          label: String(label++),
          patternId: pattern.id,
          row,
          col,
        }),
      );
    }
  }
  return holes;
}

/**
 * Origen, filas y columnas para que la red del patrón cubra por completo el polígono
 * (luego `clipBoundary` descarta los nodos exteriores). Conserva burden, espaciamiento y orientación.
 */
export function fitPatternToPolygon(
  p: Pick<Pattern, 'kind' | 'burden' | 'spacing' | 'rowAzimuth' | 'rowAdvance'>,
  polygon: readonly Vec2[],
  /** Distancia de la primera fila al borde del polígono en el sentido de avance [m]. */
  frontOffset = 0,
): { origin: Vec2; rows: number; holesPerRow: number } {
  const { u, v } = patternAxes(p);
  let minS = Infinity;
  let maxS = -Infinity;
  let minB = Infinity;
  let maxB = -Infinity;
  for (const q of polygon) {
    const s = q.x * u.x + q.y * u.y;
    const b = q.x * v.x + q.y * v.y;
    minS = Math.min(minS, s);
    maxS = Math.max(maxS, s);
    minB = Math.min(minB, b);
    maxB = Math.max(maxB, b);
  }
  if (!Number.isFinite(minS)) return { origin: { x: 0, y: 0 }, rows: 0, holesPerRow: 0 };
  // Media fila extra de margen para que el tresbolillo no deje huecos en los bordes.
  const s0 = minS - (p.kind === 'staggered' ? p.spacing / 2 : 0);
  const b0 = minB + Math.max(0, frontOffset);
  const rows = Math.max(0, Math.floor((maxB - b0) / p.burden) + 1);
  const holesPerRow = Math.floor((maxS - s0) / p.spacing) + 1;
  return {
    origin: { x: s0 * u.x + b0 * v.x, y: s0 * u.y + b0 * v.y },
    rows,
    holesPerRow,
  };
}

/** Origen para que un patrón de filas × columnas quede centrado en `center`. */
export function centeredPatternOrigin(
  p: Pick<
    Pattern,
    'kind' | 'burden' | 'spacing' | 'rowAzimuth' | 'rowAdvance' | 'rows' | 'holesPerRow'
  >,
  center: Vec2,
): Vec2 {
  const { u, v } = patternAxes(p);
  const halfS =
    ((p.holesPerRow - 1) * p.spacing + (p.kind === 'staggered' && p.rows > 1 ? p.spacing / 2 : 0)) /
    2;
  const halfB = ((p.rows - 1) * p.burden) / 2;
  return { x: center.x - halfS * u.x - halfB * v.x, y: center.y - halfS * u.y - halfB * v.y };
}
