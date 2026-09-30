import { describe, expect, it } from 'vitest';
import {
  createHole,
  DEFAULT_BENCH,
  DEFAULT_CALC_PARAMS,
  DEFAULT_HOLE_TEMPLATE,
} from '../model/factories';
import type { LineSetData } from './asset';
import {
  drapeHoles,
  freeFaceEdgesFromLines,
  linePolygon,
  LineSnapIndex,
  medianElevationInPolygon,
  summarizeLines,
} from './design';

// Fixtures armados a mano: geometría en planta con valores que se leen del propio dibujo.
const square = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 0, y: 10 },
];

/** Líneas de referencia a partir de polilíneas [x, y, z…] con su rol (0 contour, 1 crest, 2 toe). */
function lineSet(parts: { coords: number[]; role: number; closed?: boolean }[]): LineSetData {
  const offsets = [0];
  for (const p of parts) offsets.push((offsets[offsets.length - 1] ?? 0) + p.coords.length / 3);
  return {
    coords: Float64Array.from(parts.flatMap((p) => p.coords)),
    offsets: Uint32Array.from(offsets),
    roles: Uint8Array.from(parts.map((p) => p.role)),
    closed: Uint8Array.from(parts.map((p) => (p.closed ? 1 : 0))),
  };
}

describe('cara libre desde la cresta (S-15)', () => {
  // Cresta 0,5 m al Norte del borde Norte del perímetro; pie 0,3 m al Sur del borde Sur.
  const lines = lineSet([
    { coords: [-1, 10.5, 50, 11, 10.5, 50], role: 1 },
    { coords: [-1, -0.3, 35, 11, -0.3, 35], role: 2 },
  ]);

  it('marca la arista que sigue la cresta dentro de la tolerancia', () => {
    expect(freeFaceEdgesFromLines(square, [lines])).toEqual([2]);
    expect(freeFaceEdgesFromLines(square, [lines], 0.4)).toEqual([]);
  });

  it('los roles eligen qué líneas cuentan', () => {
    expect(freeFaceEdgesFromLines(square, [lines], 1, ['toe'])).toEqual([0]);
  });
});

describe('líneas de referencia', () => {
  const lines = lineSet([
    { coords: [0, 0, 5, 10, 0, 5, 10, 10, 5, 0, 10, 5], role: 1, closed: true },
    { coords: [0, 0, 1, 10, 0, 2], role: 0 },
    { coords: [0, 0, 0, 5, 0, 0, 5, 5, 0, 0, 0, 0], role: 2 },
  ]);

  it('una cerrada (o que repite su inicio) sirve de perímetro; una abierta no', () => {
    expect(linePolygon(lines, 0)).toEqual(square);
    expect(linePolygon(lines, 1)).toBeNull();
    expect(linePolygon(lines, 2)).toHaveLength(3);
  });

  it('resume largo, cota media y rol', () => {
    const [a, b] = summarizeLines(lines);
    expect(a).toMatchObject({ role: 'crest', closed: true, length: 40, elevation: 5 });
    expect(b).toMatchObject({ role: 'contour', closed: false, length: 10, elevation: 1.5 });
  });

  it('el ajuste prefiere un vértice y si no proyecta sobre el borde', () => {
    const built = LineSnapIndex.build(lines);
    // El índice se arma en el worker y viaja como buffer: se reconstruye sin volver a ordenar.
    const idx = LineSnapIndex.fromData(lines, built.data);
    expect(idx.nearest(9.6, 0.3, 1)).toEqual({ x: 10, y: 0, kind: 'lineVertex' });
    expect(idx.nearest(10.4, 6, 1)).toEqual({ x: 10, y: 6, kind: 'lineEdge' });
    expect(idx.nearest(20, 20, 1)).toBeNull();
  });
});

describe('collares y cota del banco sobre la topografía', () => {
  // Terreno plano inclinado z = 100 + 0,1·x, definido solo en x ≤ 50.
  const ground = (x: number) => (x <= 50 ? 100 + 0.1 * x : null);
  const elevationAt = (x: number) => ground(x);

  it('la boca toma la cota del terreno y el largo llega a piso + sobreperforación', () => {
    const bench = { ...DEFAULT_BENCH, floorElevation: 80, height: 20 };
    const inside = createHole({
      position: { x: 10, y: 0 },
      template: { ...DEFAULT_HOLE_TEMPLATE, inclination: 0, subdrill: 1 },
      bench,
      label: 'A1',
    });
    const outside = { ...inside, id: 'fuera' as typeof inside.id, collar: { x: 60, y: 0, z: 100 } };
    const r = drapeHoles([inside, outside], elevationAt, {
      bench,
      calcParams: DEFAULT_CALC_PARAMS,
    });
    // Boca a 101 m, piso a 80 m, 1 m de sobreperforación vertical: 21 + 1 = 22 m.
    expect(r.holes[0]?.collar.z).toBeCloseTo(101, 9);
    expect(r.holes[0]?.length).toBeCloseTo(22, 9);
    expect(r.outside).toEqual(['fuera']);
    expect(r.holes[1]).toBe(outside);
  });

  it('la mediana de la cota dentro del perímetro es la del centro en un plano', () => {
    expect(medianElevationInPolygon(square, elevationAt)).toBeCloseTo(100.5, 9);
    const far = square.map((p) => ({ x: p.x + 100, y: p.y }));
    expect(medianElevationInPolygon(far, elevationAt)).toBeNull();
  });
});
