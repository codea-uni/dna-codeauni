import { describe, expect, it } from 'vitest';
import { assembleTopography, mergeTopo, packLines } from './assemble';
import type { TopoData } from './data';
import { SurfaceIndex } from './surfaceIndex';
import { checkTopography } from './validate';

// Plano z = 0,1·x + 0,2·y + 4000 muestreado en una grilla: la TIN debe reproducirlo exactamente.
const plane = (x: number, y: number) => 0.1 * x + 0.2 * y + 4000;
function gridPoints(e0: number, n0: number): number[] {
  const out: number[] = [];
  for (let i = 0; i <= 4; i++)
    for (let j = 0; j <= 4; j++) out.push(e0 + i * 10, n0 + j * 10, plane(i * 10, j * 10));
  return out;
}

describe('assembleTopography', () => {
  it('puntos → TIN; la cota interpolada coincide con el plano', () => {
    const data: TopoData = { points: gridPoints(345_000, 8_512_000), lines: [], warnings: [] };
    const r = assembleTopography(data, { fromEpsg: 32718, projectEpsg: 32718 });
    expect(r.stats.points).toBe(25);
    expect(r.stats.triangles).toBe(32);
    expect(r.warnings).toEqual([]);
    const idx = SurfaceIndex.build(
      r.parts.tin ?? { vertices: new Float64Array(0), triangles: new Uint32Array(0) },
    );
    expect(idx.elevationAt(345_013, 8_512_027)).toBeCloseTo(plane(13, 27), 9);
    expect(r.bounds).toMatchObject({ minX: 345_000, maxX: 345_040, minZ: 4000 });
  });

  it('Norte y Este intercambiados: se avisa, y con `swapNE` se corrige', () => {
    const swapped = gridPoints(345_000, 8_512_000);
    for (let i = 0; i < swapped.length; i += 3)
      [swapped[i], swapped[i + 1]] = [swapped[i + 1] ?? 0, swapped[i] ?? 0];
    const warn = assembleTopography({ points: [...swapped], lines: [], warnings: [] });
    expect(warn.warnings.map((w) => w.code)).toContain('topo.swappedNE');
    const fixed = assembleTopography(
      { points: [...swapped], lines: [], warnings: [] },
      { swapNE: true },
    );
    expect(fixed.warnings.map((w) => w.code)).not.toContain('topo.swappedNE');
    expect(fixed.bounds.minX).toBe(345_000);
  });

  it('usa la triangulación del archivo tal cual y empaqueta las líneas', () => {
    const data: TopoData = {
      points: [],
      lines: [
        { coords: [0, 0, 1, 10, 0, 1], role: 'crest', closed: false },
        { coords: [0, 5, 2, 10, 5, 2, 10, 10, 2], role: 'contour', closed: true },
      ],
      faces: {
        vertices: Float64Array.from([0, 0, 1, 10, 0, 1, 0, 10, 3]),
        triangles: Uint32Array.from([0, 1, 2]),
      },
      warnings: [],
    };
    const r = assembleTopography(data);
    expect(r.stats.triangles).toBe(1);
    expect(Array.from(r.parts.lines?.offsets ?? [])).toEqual([0, 2, 5]);
    expect(Array.from(r.parts.lines?.roles ?? [])).toEqual([1, 0]); // crest = 1, contour = 0
    expect(Array.from(r.parts.lines?.closed ?? [])).toEqual([0, 1]);
  });

  it('solo curvas de nivel: se triangulan sus vértices', () => {
    const contour = (z: number, r: number) => {
      const c: number[] = [];
      for (let k = 0; k < 8; k++)
        c.push(r * Math.cos((k * Math.PI) / 4), r * Math.sin((k * Math.PI) / 4), z);
      return { coords: c, role: 'contour' as const, closed: true };
    };
    const r = assembleTopography(
      { points: [0, 0, 30], lines: [contour(20, 10), contour(10, 20)], warnings: [] },
      { tin: { maxEdge: Infinity } },
    );
    expect(r.stats.points).toBe(17);
    expect(r.stats.triangles).toBeGreaterThan(0);
    expect(r.stats.skippedConstraints).toBe(0);
  });
});

describe('checkTopography (trampas de 03 §5)', () => {
  const b = (minX: number, minY: number, maxX: number, maxY: number, minZ = 4000, maxZ = 4100) => ({
    minX,
    minY,
    minZ,
    maxX,
    maxY,
    maxZ,
  });

  it('coordenadas en grados sin declarar 4326', () => {
    expect(checkTopography(b(-75.2, -12.1, -75.1, -12), 10).map((w) => w.code)).toEqual([
      'topo.degrees',
    ]);
  });

  it('cotas en cero, sin CRS y lejos del proyecto', () => {
    const codes = checkTopography(b(345_000, 8_512_000, 345_100, 8_512_100, 0, 0), 10, {
      projectBounds: b(400_000, 8_512_000, 400_100, 8_512_100),
    });
    expect(codes).toEqual([
      { code: 'topo.noCrs' },
      { code: 'topo.noZ' },
      { code: 'topo.farFromProject', params: { km: 55 } },
    ]);
  });

  it('CRS distinto del proyecto', () => {
    expect(
      checkTopography(b(345_000, 8_512_000, 345_100, 8_512_100), 10, {
        sourceEpsg: 24878,
        targetEpsg: 32718,
      }),
    ).toEqual([{ code: 'topo.crsDiffers', params: { from: 24878, to: 32718 } }]);
  });

  it('vacío', () => {
    expect(checkTopography(b(0, 0, 0, 0), 0)).toEqual([{ code: 'topo.empty' }]);
  });
});

describe('mergeTopo y packLines', () => {
  it('une caras de varios archivos desplazando los índices', () => {
    const face = (x: number) => ({
      vertices: Float64Array.from([x, 0, 0, x + 1, 0, 0, x, 1, 0]),
      triangles: Uint32Array.from([0, 1, 2]),
    });
    const m = mergeTopo([
      { points: [], lines: [], faces: face(0), warnings: [], epsg: 32718 },
      { points: [1, 2, 3], lines: [], faces: face(5), warnings: [{ code: 'x' }] },
    ]);
    expect(Array.from(m.faces?.triangles ?? [])).toEqual([0, 1, 2, 3, 4, 5]);
    expect(m.points).toEqual([1, 2, 3]);
    expect(m.epsg).toBe(32718);
    expect(m.warnings).toHaveLength(1);
  });

  it('sin líneas', () => {
    expect(packLines([]).offsets).toEqual(Uint32Array.from([0]));
  });
});
