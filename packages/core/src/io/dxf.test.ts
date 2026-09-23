import { describe, expect, it } from 'vitest';
import { holeToe } from '../geometry/hole';
import { createBlast, DEFAULT_BENCH, DEFAULT_HOLE_TEMPLATE } from '../model/factories';
import { newId } from '../model/ids';
import type { Blast, DxfLayerRole } from '../index';
import { generatePatternHoles } from '../patterns/pattern';
import { DXF_LAYERS, exportDxf, importDxf, inspectDxf } from './dxf';

const defaults = { diameter: 0.2, subdrill: 1.5, bench: DEFAULT_BENCH, startNumber: 1 };

function sampleBlast(): Blast {
  const pattern = {
    id: newId<'Pattern'>(),
    name: 'P',
    kind: 'staggered' as const,
    burden: 6,
    spacing: 7,
    origin: { x: 345_678.25, y: 8_512_345.5 },
    rowAzimuth: 0.4,
    rowAdvance: 'right' as const,
    rows: 3,
    holesPerRow: 4,
    holeTemplate: { ...DEFAULT_HOLE_TEMPLATE, diameter: 0.2699, inclination: 0.18, azimuth: 2.2 },
  };
  const holes = generatePatternHoles(pattern, DEFAULT_BENCH, { startNumber: 1 });
  const boundary = {
    id: newId<'Boundary'>(),
    name: 'Perímetro 1',
    polygon: [
      { x: 345_660, y: 8_512_360 },
      { x: 345_720, y: 8_512_360 },
      { x: 345_720, y: 8_512_320 },
      { x: 345_660, y: 8_512_320 },
    ],
    freeFaceEdges: [0, 2],
  };
  return {
    ...createBlast('V', newId<'RockMass'>()),
    patterns: [pattern],
    holes,
    boundaries: [boundary],
  };
}

const rolesFrom = (text: string): Record<string, DxfLayerRole> =>
  Object.fromEntries(inspectDxf(text).layers.map((l) => [l.name, l.suggested]));

describe('DXF', () => {
  it('ida y vuelta sin pérdida de geometría (bocas, fondos, diámetro, etiquetas, perímetros, caras libres)', () => {
    const blast = sampleBlast();
    const text = exportDxf(blast, { ties: true });
    expect(text.startsWith('0\r\nSECTION')).toBe(true);
    expect(text.trimEnd().endsWith('EOF')).toBe(true);
    const info = inspectDxf(text);
    expect(info.layers.map((l) => [l.name, l.suggested])).toEqual(
      expect.arrayContaining([
        [DXF_LAYERS.traces, 'holeLines'],
        [DXF_LAYERS.collars, 'holePoints'],
        [DXF_LAYERS.labels, 'labels'],
        [DXF_LAYERS.boundaries, 'boundaries'],
        [DXF_LAYERS.freeFaces, 'freeFaces'],
      ]),
    );
    const r = importDxf(text, rolesFrom(text), defaults);
    expect(r.warnings).toEqual([]);
    expect(r.holes).toHaveLength(blast.holes.length);
    for (const o of blast.holes) {
      const h = r.holes.find((x) => x.label === o.label);
      if (!h) throw new Error(`falta ${o.label}`);
      expect(h.collar.x).toBeCloseTo(o.collar.x, 5);
      expect(h.collar.y).toBeCloseTo(o.collar.y, 5);
      expect(h.collar.z).toBeCloseTo(o.collar.z, 5);
      expect(h.length).toBeCloseTo(o.length, 5);
      expect(h.inclination).toBeCloseTo(o.inclination, 5);
      expect(h.azimuth).toBeCloseTo(o.azimuth, 5);
      expect(h.diameter).toBeCloseTo(0.2699, 6);
      expect(holeToe(h).z).toBeCloseTo(holeToe(o).z, 5);
    }
    expect(r.boundaries).toHaveLength(1);
    expect(r.boundaries[0]?.polygon).toEqual(blast.boundaries[0]?.polygon);
    expect(r.boundaries[0]?.freeFaceEdges).toEqual([0, 2]);
  });

  it('DXF externo: LWPOLYLINE, puntos sin cota, círculos y etiquetas cercanas', () => {
    // DXF mínimo "de terreno": capa POZOS con círculos (Ø 229 mm) y un POINT, capa NUM con textos
    // desplazados 0.5 m, capa LIMITE con una LWPOLYLINE cerrada.
    const g = (...pairs: (string | number)[]) => pairs.join('\n');
    const circle = (x: number, y: number) =>
      g(0, 'CIRCLE', 8, 'POZOS', 10, x, 20, y, 30, 0, 40, 0.1145);
    const txt = (x: number, y: number, t: string) =>
      g(0, 'TEXT', 8, 'NUM', 10, x + 0.5, 20, y + 0.3, 30, 0, 40, 0.5, 1, t);
    const text = [
      g(0, 'SECTION', 2, 'ENTITIES'),
      circle(100, 200),
      circle(107, 200),
      g(0, 'POINT', 8, 'POZOS', 10, 114, 20, 200, 30, 0),
      txt(100, 200, 'A-1'),
      txt(107, 200, 'A-2'),
      g(
        0,
        'LWPOLYLINE',
        8,
        'LIMITE',
        90,
        4,
        70,
        1,
        10,
        95,
        20,
        195,
        10,
        120,
        20,
        195,
        10,
        120,
        20,
        205,
        10,
        95,
        20,
        205,
      ),
      g(0, 'ENDSEC', 0, 'EOF'),
    ].join('\n');
    const info = inspectDxf(text);
    const roles = Object.fromEntries(info.layers.map((l) => [l.name, l.suggested]));
    expect(roles).toEqual({ LIMITE: 'boundaries', NUM: 'labels', POZOS: 'holePoints' });
    const r = importDxf(text, roles, { ...defaults, startNumber: 50 });
    expect(r.holes.map((h) => h.label)).toEqual(['A-1', 'A-2', '50']);
    expect(r.holes[0]?.diameter).toBeCloseTo(0.229, 6);
    expect(r.holes[2]?.diameter).toBe(0.2); // POINT sin círculo → diámetro por defecto
    // Sin cota → superficie del banco (15 m); longitud hasta piso + sobreperforación = 16.5 m
    expect(r.holes[0]?.collar.z).toBe(15);
    expect(r.holes[0]?.length).toBeCloseTo(16.5, 9);
    expect(r.warnings.join(' ')).toContain('3 bocas sin cota');
    expect(r.boundaries[0]?.polygon).toHaveLength(4);
  });

  it('líneas 2D se toman como bocas verticales, con aviso', () => {
    const text = [
      '0',
      'SECTION',
      '2',
      'ENTITIES',
      '0',
      'LINE',
      '8',
      'T',
      '10',
      '1',
      '20',
      '2',
      '30',
      '0',
      '11',
      '5',
      '21',
      '2',
      '31',
      '0',
      '0',
      'ENDSEC',
      '0',
      'EOF',
    ].join('\n');
    const r = importDxf(text, { T: 'holeLines' }, defaults);
    expect(r.holes).toHaveLength(1);
    expect(r.holes[0]?.inclination).toBe(0);
    expect(r.warnings[0]).toContain('sin diferencia de cota');
  });

  it('topografía 3DFACE → TIN con vértices compartidos', () => {
    const face = (pts: number[][]) =>
      [
        '0',
        '3DFACE',
        '8',
        'TOPO',
        ...pts.flatMap((p, i) => [
          String(10 + i),
          String(p[0]),
          String(20 + i),
          String(p[1]),
          String(30 + i),
          String(p[2]),
        ]),
      ].join('\n');
    const text = [
      '0\nSECTION\n2\nENTITIES',
      // Cuadrilátero (se divide en 2 triángulos) + triángulo (4.º vértice repetido)
      face([
        [0, 0, 10],
        [10, 0, 11],
        [10, 10, 12],
        [0, 10, 11],
      ]),
      face([
        [10, 0, 11],
        [20, 0, 12],
        [10, 10, 12],
        [10, 10, 12],
      ]),
      '0\nENDSEC\n0\nEOF',
    ].join('\n');
    expect(inspectDxf(text).layers[0]?.suggested).toBe('topography');
    const r = importDxf(text, { TOPO: 'topography' }, defaults);
    expect(r.surfaces).toHaveLength(1);
    expect(r.surfaces[0]?.triangles).toHaveLength(9); // 3 triángulos
    expect(r.surfaces[0]?.vertices).toHaveLength(5 * 3); // 5 vértices únicos
  });

  it('exporta topografía y la vuelve a leer igual', () => {
    const blast = sampleBlast();
    const surface = {
      id: newId<'Surface'>(),
      name: 'T',
      kind: 'topography' as const,
      vertices: [0, 0, 1, 10, 0, 2, 0, 10, 3],
      triangles: [0, 1, 2],
    };
    const text = exportDxf(blast, { surfaces: [surface] });
    const r = importDxf(text, rolesFrom(text), defaults);
    expect(r.surfaces[0]).toEqual({ vertices: surface.vertices, triangles: surface.triangles });
  });

  it('DXF inválido da un error claro', () => {
    expect(() => inspectDxf('esto no es dxf')).toThrow();
  });
});
