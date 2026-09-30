import { describe, expect, it } from 'vitest';
import {
  createHole,
  DEFAULT_BENCH,
  DEFAULT_CALC_PARAMS,
  DEFAULT_HOLE_TEMPLATE,
} from '../model/factories';
import type { LineSetData } from './asset';
import { DocumentStore } from '../document/DocumentStore';
import { addHoles, moveHoles } from '../document/commands';
import { createEmptyProject } from '../model/factories';
import {
  benchFloorFor,
  benchOffTopography,
  holesOffBench,
  drapeHoles,
  medianVertexElevation,
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

describe('taladros que respetan la topografía', () => {
  // Terreno z = 100 + 0,1·x; banco con piso en 80 m, sobreperforación 1 m, vertical.
  const ground = (x: number) => (x <= 50 ? 100 + 0.1 * x : null);
  const bench = { ...DEFAULT_BENCH, floorElevation: 80, height: 20 };
  const template = { ...DEFAULT_HOLE_TEMPLATE, inclination: 0, subdrill: 1 };

  it('al crearlo, la boca toma la cota del terreno y el largo llega a piso + J', () => {
    const h = createHole({ position: { x: 20, y: 0 }, template, bench, label: '1', collarZ: 102 });
    expect(h.collar.z).toBe(102);
    expect(h.length).toBeCloseTo(23, 9); // 102 − 80 + 1
  });

  it('al moverlo, la boca sigue al terreno; fuera de él conserva su cota', () => {
    const project = createEmptyProject('P');
    const blast = project.blasts[0];
    if (!blast) throw new Error('sin voladura');
    blast.bench = bench;
    const store = new DocumentStore(project);
    const h = createHole({ position: { x: 0, y: 0 }, template, bench, label: '1', collarZ: 100 });
    store.dispatch(addHoles(blast.id, [h]), 'Agregar');
    store.dispatch(
      moveHoles(store, [h.id], 30, 0, (x) => ground(x)),
      'Mover',
    );
    const moved = store.findHole(h.id)?.hole;
    expect(moved?.collar.z).toBeCloseTo(103, 9);
    expect(moved?.length).toBeCloseTo(24, 9);
    store.dispatch(
      moveHoles(store, [h.id], 40, 0, (x) => ground(x)),
      'Mover',
    );
    expect(store.findHole(h.id)?.hole.collar.z).toBeCloseTo(103, 9);
  });

  it('detecta un piso de banco lejos del terreno y la cota representativa del levantamiento', () => {
    const bounds = { minZ: 3340, maxZ: 3460 };
    expect(benchOffTopography({ floorElevation: 0, height: 15 }, bounds)).toBe(true);
    expect(benchOffTopography({ floorElevation: 3385, height: 15 }, bounds)).toBe(false);
    const tin = {
      vertices: Float64Array.from([0, 0, 5, 1, 0, 1, 0, 1, 9]),
      triangles: Uint32Array.from([0, 1, 2]),
    };
    expect(medianVertexElevation(tin)).toBe(5);
  });

  it('el piso sale de las bocas de la voladura, no de todo el tajo (S-18)', () => {
    // Bocas en el fondo del tajo (~3355 m) con el piso a 3385 m: quedan bajo el piso.
    const collars = [3354, 3355, 3356];
    expect(holesOffBench({ floorElevation: 3385, height: 15 }, collars)).toBe(true);
    expect(benchFloorFor(collars, 15)).toBe(3340);
    expect(holesOffBench({ floorElevation: 3340, height: 15 }, collars)).toBe(false);
    // Por encima de dos bancos también es incoherente.
    expect(holesOffBench({ floorElevation: 3300, height: 15 }, collars)).toBe(true);
    expect(holesOffBench({ floorElevation: 0, height: 15 }, [])).toBe(false);
  });
});
