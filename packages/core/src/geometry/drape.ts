import { clipPolygonConvex } from '../charging/influence';
import type { Bench, BlastBoundary, Vec2, Vec3 } from '../model/types';
import { outwardNormal, polygonEdge } from './boundary';
import { boundaryFace } from './face';
import { polygonBounds, polygonSignedArea } from './polygon';

/**
 * Geometría apoyada en el terreno (drapeada): líneas, caras libres y superficies que siguen el
 * levantamiento en vez de una cota constante. `ground(x, y)` da la cota del terreno (p. ej.
 * `SurfaceIndex.elevationAt`) o `null` fuera de él; sin terreno se usa la geometría analítica de
 * siempre. Es geometría pura (sin constantes de dominio) y corre en cualquier hilo.
 */
export type Ground = (x: number, y: number) => number | null;

/** Malla de triángulos en coordenadas de proyecto: x, y, z intercalados e índices. */
export interface DrapedMesh {
  positions: Float64Array;
  indices: Uint32Array;
}

/** Paso [m] para que una superficie de `area` m² no pase de `maxCells` celdas. */
export function drapeStep(area: number, base: number, maxCells: number): number {
  return Math.max(base, Math.sqrt(Math.max(0, area) / maxCells));
}

/**
 * Densifica una polilínea cada `step` m y pone cada punto en el terreno. Donde no hay terreno
 * conserva la cota interpolada de la línea. `offset` [m] la levanta en ambos casos (sobre el relleno). `closed` une el último punto con el primero.
 */
export function drapePolyline(
  points: readonly Vec3[],
  ground: Ground | null,
  step: number,
  offset = 0,
  closed = false,
): Vec3[] {
  const out: Vec3[] = [];
  const n = points.length;
  const segments = closed ? n : n - 1;
  const at = (x: number, y: number, z: number): Vec3 => ({
    x,
    y,
    z: (ground?.(x, y) ?? z) + offset,
  });
  for (let i = 0; i < segments; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    if (!a || !b) continue;
    const parts = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step));
    for (let k = 0; k < parts; k++) {
      const t = k / parts;
      out.push(at(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t));
    }
  }
  const last = closed ? points[0] : points[n - 1];
  if (last) out.push(at(last.x, last.y, last.z));
  return out;
}

/** Cadenas de aristas libres consecutivas (el polígono es cíclico). */
function freeChains(edges: number, free: readonly number[]): number[][] {
  const set = new Set(free.filter((i) => i >= 0 && i < edges));
  if (set.size === edges) return [Array.from({ length: edges }, (_, i) => i)];
  const chains: number[][] = [];
  for (const i of [...set].sort((a, b) => a - b)) {
    if (set.has((i - 1 + edges) % edges)) continue; // no empieza una cadena
    const chain = [i];
    for (let k = (i + 1) % edges; set.has(k) && k !== i; k = (k + 1) % edges) chain.push(k);
    chains.push(chain);
  }
  return chains;
}

const unit = (x: number, y: number): Vec2 => {
  const l = Math.hypot(x, y);
  return l > 1e-12 ? { x: x / l, y: y / l } : { x: 0, y: 0 };
};

/**
 * Caras libres de un perímetro apoyadas en el terreno: por cada tramo de aristas libres seguidas,
 * una cinta continua desde la cresta hacia afuera hasta el avance de la cara (`run` de
 * `boundaryFace`). En cada vértice la cinta sale por la bisectriz de las normales de sus aristas,
 * así una cresta trazada en tramos cortos no deja aletas superpuestas. Cada punto toma la cota del
 * terreno; sin terreno, el perfil analítico de siempre (cresta − s·tan β, sin bajar del pie). Una
 * cara vertical (run = 0) es una pared de la cresta (en el terreno) al pie.
 */
export function drapedFaceStrips(
  boundary: BlastBoundary,
  bench: Bench,
  ground: Ground | null,
  step = 1,
): DrapedMesh {
  const face = boundaryFace(bench, boundary);
  const positions: number[] = [];
  const indices: number[] = [];
  const tan = Math.tan(face.angle);
  const analytic = (s: number) => Math.max(face.toeZ, face.crestZ - s * tan);
  const vertical = face.run <= 1e-6;
  const across = vertical ? 1 : Math.max(1, Math.ceil(face.run / step));
  const poly = boundary.polygon;
  for (const chain of freeChains(poly.length, boundary.freeFaceEdges)) {
    const normals = chain.map((i) => outwardNormal(poly, i));
    if (normals.some((n) => !n)) continue;
    const edgeN = normals as Vec2[];
    // Normal en cada vértice de la cadena: la de su arista en los extremos, la bisectriz adentro.
    const vertexN: Vec2[] = edgeN.map((n, j) => {
      const prev = edgeN[j - 1];
      if (!prev) return n;
      const b = unit(prev.x + n.x, prev.y + n.y);
      return b.x === 0 && b.y === 0 ? n : b;
    });
    vertexN.push(edgeN[edgeN.length - 1] ?? { x: 0, y: 0 });
    // Columnas de la cinta: puntos de la cresta cada `step` con su dirección hacia afuera.
    const cols: { x: number; y: number; n: Vec2 }[] = [];
    chain.forEach((i, j) => {
      const e = polygonEdge(poly, i);
      const n0 = vertexN[j];
      const n1 = vertexN[j + 1];
      if (!e || !n0 || !n1) return;
      const [a, b] = e;
      const along = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step));
      const last = j === chain.length - 1;
      for (let k = 0; k <= along; k++) {
        if (k === along && !last) break; // el vértice compartido lo pone la arista siguiente
        const u = k / along;
        cols.push({
          x: a.x + (b.x - a.x) * u,
          y: a.y + (b.y - a.y) * u,
          n: unit(n0.x + (n1.x - n0.x) * u, n0.y + (n1.y - n0.y) * u),
        });
      }
    });
    if (cols.length < 2) continue;
    const base = positions.length / 3;
    for (let r = 0; r <= across; r++) {
      const s = vertical ? 0 : (face.run * r) / across;
      for (const c of cols) {
        const x = c.x + c.n.x * s;
        const y = c.y + c.n.y * s;
        const z = vertical && r === 1 ? face.toeZ : (ground?.(x, y) ?? analytic(s));
        positions.push(x, y, z);
      }
    }
    const row = cols.length;
    for (let r = 0; r < across; r++)
      for (let k = 0; k + 1 < row; k++) {
        const p = base + r * row + k;
        indices.push(p, p + 1, p + row, p + 1, p + row + 1, p + row);
      }
  }
  return { positions: Float64Array.from(positions), indices: Uint32Array.from(indices) };
}

/**
 * Superficie del polígono apoyada en el terreno (techo del banco dentro del perímetro): retícula de
 * `step` m recortada al polígono, cada pieza en abanico, con la cota del terreno o `fallbackZ`.
 */
export function drapedPolygonSurface(
  polygon: readonly Vec2[],
  ground: Ground | null,
  step: number,
  fallbackZ: number,
): DrapedMesh {
  const positions: number[] = [];
  const indices: number[] = [];
  if (polygon.length < 3 || Math.abs(polygonSignedArea(polygon)) < 1e-9)
    return { positions: new Float64Array(0), indices: new Uint32Array(0) };
  const bb = polygonBounds(polygon);
  const z = (x: number, y: number) => ground?.(x, y) ?? fallbackZ;
  for (let y0 = bb.minY; y0 < bb.maxY; y0 += step)
    for (let x0 = bb.minX; x0 < bb.maxX; x0 += step) {
      const square = [
        { x: x0, y: y0 },
        { x: x0 + step, y: y0 },
        { x: x0 + step, y: y0 + step },
        { x: x0, y: y0 + step },
      ];
      const piece = clipPolygonConvex(polygon, square);
      if (piece.length < 3 || Math.abs(polygonSignedArea(piece)) < 1e-9) continue;
      const base = positions.length / 3;
      for (const p of piece) positions.push(p.x, p.y, z(p.x, p.y));
      // Mismo sentido para todas las piezas (normales hacia arriba).
      const ccw = polygonSignedArea(piece) > 0;
      for (let k = 1; k + 1 < piece.length; k++)
        if (ccw) indices.push(base, base + k, base + k + 1);
        else indices.push(base, base + k + 1, base + k);
    }
  return { positions: Float64Array.from(positions), indices: Uint32Array.from(indices) };
}
