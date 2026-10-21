import { describe, expect, it } from 'vitest';
import { decodeAsset, encodeAsset } from '../topography/asset';
import { buildSurvey } from '../topography/survey';
import { planeFrame } from './transform';
import {
  axisLength,
  buildWorkings,
  estimateSolidAxis,
  inspectWorkingsDxf,
  nearestStation,
  parseWorkingsDxf,
  parseWorkingsSurpac,
  readWorkingsFiles,
  sectionWorkings,
  stationOnAxis,
  tunnelMesh,
  workingAxisPoints,
  workingProfile,
} from './workings';

const deg = Math.PI / 180;
const g = (...pairs: (string | number)[]) => pairs.join('\n');
const dxf = (...entities: string[]) =>
  [g(0, 'SECTION', 2, 'ENTITIES'), ...entities, g(0, 'ENDSEC', 0, 'EOF')].join('\n');

/** 3DFACE con 4 vértices (el cuarto igual al tercero = triángulo). */
const face = (layer: string, p: number[][]) =>
  g(
    0,
    '3DFACE',
    8,
    layer,
    ...p.flatMap((q, i) => [10 + i, q[0] ?? 0, 20 + i, q[1] ?? 0, 30 + i, q[2] ?? 0]),
  );

/**
 * Caja de 4 m de ancho (X), 20 m de largo (Y) y 4 m de alto (Z), piso en z = 100, solo paredes,
 * techo y piso (sin tapas): un tramo recto de galería hacia el Norte con centro en x = 500.
 */
function boxGallery(layer: string, dx = 0): string[] {
  const x0 = 498 + dx;
  const x1 = 502 + dx;
  const z0 = 100;
  const z1 = 104;
  const quads: number[][][] = [];
  for (let y = 0; y < 20; y += 5) {
    const y1 = y + 5;
    quads.push(
      [
        [x0, y, z0],
        [x1, y, z0],
        [x1, y1, z0],
        [x0, y1, z0],
      ],
      [
        [x0, y, z1],
        [x1, y, z1],
        [x1, y1, z1],
        [x0, y1, z1],
      ],
      [
        [x0, y, z0],
        [x0, y1, z0],
        [x0, y1, z1],
        [x0, y, z1],
      ],
      [
        [x1, y, z0],
        [x1, y1, z0],
        [x1, y1, z1],
        [x1, y, z1],
      ],
    );
  }
  return quads.map((q) => face(layer, q));
}

describe('DXF de labores: 3DFACE', () => {
  const src = parseWorkingsDxf(dxf(...boxGallery('GAL_420')));

  it('un sólido por capa, con vértices compartidos y 2 triángulos por cuadrilátero', () => {
    expect(src.solids).toHaveLength(1);
    const s = src.solids[0];
    expect(s?.name).toBe('GAL_420');
    expect(s?.triangles.length).toBe(16 * 2 * 3);
    // 5 secciones × 4 esquinas.
    expect((s?.vertices.length ?? 0) / 3).toBe(20);
    expect(src.axes).toHaveLength(0);
  });

  it('eje estimado: al centro del ancho, a la cota del piso, a lo largo de los 20 m', () => {
    const w = buildWorkings(src, { profile: { kind: 'arched', width: 4, height: 4 } });
    expect(w.axes).toHaveLength(1);
    const meta = w.axes[0];
    expect(meta?.source).toBe('solid');
    expect(meta?.estimated).toBe(true);
    expect(meta?.profile?.width).toBeCloseTo(4, 6);
    expect(meta?.profile?.height).toBeCloseTo(4, 6);
    const pts = workingAxisPoints(w, 0);
    expect(axisLength(pts)).toBeCloseTo(20, 6);
    for (const p of pts) {
      expect(p.x).toBeCloseTo(500, 6);
      expect(p.z).toBeCloseTo(100, 6);
    }
    // La malla del sólido se conserva tal cual.
    expect(w.triangles.length).toBe(96);
  });

  it('dos galerías separadas en la misma capa → dos labores', () => {
    const w = buildWorkings(parseWorkingsDxf(dxf(...boxGallery('LAB'), ...boxGallery('LAB', 50))), {
      profile: { kind: 'arched', width: 4, height: 4 },
    });
    expect(w.axes.map((a) => a.name)).toEqual(['LAB 1', 'LAB 2']);
  });
});

describe('DXF de labores: POLYLINE polyface', () => {
  // Caja de 5 × 4 m (ancho × alto) y 30 m al Este, piso en z = 2000: 8 vértices y 4 caras
  // (piso, techo y hastiales); la última cara con un índice negativo (arista invisible).
  const V = [
    [0, -2.5, 2000],
    [30, -2.5, 2000],
    [30, 2.5, 2000],
    [0, 2.5, 2000],
    [0, -2.5, 2004],
    [30, -2.5, 2004],
    [30, 2.5, 2004],
    [0, 2.5, 2004],
  ];
  const F = [
    [1, 2, 3, 4],
    [5, 6, 7, 8],
    [1, 2, 6, 5],
    [4, 3, 7, -8],
  ];
  const text = dxf(
    g(0, 'POLYLINE', 8, 'RAMPA', 66, 1, 70, 64, 71, 8, 72, 4),
    ...V.map((v) =>
      g(0, 'VERTEX', 8, 'RAMPA', 10, v[0] ?? 0, 20, v[1] ?? 0, 30, v[2] ?? 0, 70, 192),
    ),
    ...F.map((f) =>
      g(
        0,
        'VERTEX',
        8,
        'RAMPA',
        10,
        0,
        20,
        0,
        30,
        0,
        70,
        128,
        71,
        f[0] ?? 0,
        72,
        f[1] ?? 0,
        73,
        f[2] ?? 0,
        74,
        f[3] ?? 0,
      ),
    ),
    g(0, 'SEQEND', 8, 'RAMPA'),
  );

  it('vértices y caras del polyface → sólido; su eje va al Este por el piso', () => {
    const src = parseWorkingsDxf(text);
    expect(src.axes).toHaveLength(0);
    expect(src.solids[0]?.triangles.length).toBe(4 * 2 * 3);
    const w = buildWorkings(src, { profile: { kind: 'arched', width: 4, height: 4 } });
    const pts = workingAxisPoints(w, 0);
    expect(axisLength(pts)).toBeCloseTo(30, 6);
    expect(w.axes[0]?.profile).toMatchObject({ width: 5, height: 4 });
    const at = stationOnAxis(pts, 10);
    expect(at.point.y).toBeCloseTo(0, 6);
    expect(at.point.z).toBeCloseTo(2000, 6);
    // Dirección del eje: Este u Oeste según el signo de la componente principal.
    expect(Math.abs(Math.sin(at.azimuth))).toBeCloseTo(1, 9);
  });
});

describe('DXF de labores: ejes 3D', () => {
  // POLYLINE 3D (bandera 8): rampa de 30 m al Este subiendo 3 m, luego 20 m al Norte.
  const polyline = g(
    0,
    'POLYLINE',
    8,
    'EJE_RAMPA',
    66,
    1,
    70,
    8,
    0,
    'VERTEX',
    8,
    'EJE_RAMPA',
    10,
    1000,
    20,
    2000,
    30,
    500,
    70,
    32,
    0,
    'VERTEX',
    8,
    'EJE_RAMPA',
    10,
    1030,
    20,
    2000,
    30,
    503,
    70,
    32,
    0,
    'VERTEX',
    8,
    'EJE_RAMPA',
    10,
    1030,
    20,
    2020,
    30,
    503,
    70,
    32,
    0,
    'SEQEND',
    8,
    'EJE_RAMPA',
  );
  const src = parseWorkingsDxf(dxf(polyline));

  it('la polilínea 3D es un eje con sus cotas', () => {
    expect(src.axes).toHaveLength(1);
    expect(src.axes[0]?.points.map((p) => p.z)).toEqual([500, 503, 503]);
    expect(src.warnings.map((w) => w.code)).not.toContain('workings.flatAxis');
  });

  it('se convierte en túnel con el perfil elegido (una sección por vértice)', () => {
    const w = buildWorkings(src, { profile: { kind: 'rectangular', width: 5, height: 4 } });
    expect(w.axes[0]).toMatchObject({
      source: 'axis',
      profile: { kind: 'rectangular', width: 5, height: 4 },
    });
    // 3 secciones de 4 vértices; 2 tramos × 4 caras × 2 triángulos.
    expect(w.vertices.length / 3).toBe(12);
    expect(w.triangles.length / 3).toBe(16);
    // Primera sección: perpendicular al Este, ancho 5 (y de 1997,5 a 2002,5), alto 4.
    const ys = [1, 4, 7, 10].map((i) => w.vertices[i] ?? 0);
    expect(Math.min(...ys)).toBeCloseTo(1997.5, 1);
    expect(Math.max(...ys)).toBeCloseTo(2002.5, 1);
  });

  it('eje al centro de la sección: se baja medio alto al piso', () => {
    const w = buildWorkings(src, {
      profile: { kind: 'rectangular', width: 5, height: 4 },
      axisAt: 'center',
    });
    expect(workingAxisPoints(w, 0)[0]?.z).toBeCloseTo(498, 9);
  });

  it('LINE sueltas se encadenan; LWPOLYLINE sin cota avisa', () => {
    const lines = dxf(
      g(0, 'LINE', 8, 'EJE', 10, 0, 20, 0, 30, 10, 11, 10, 21, 0, 31, 10),
      g(0, 'LINE', 8, 'EJE', 10, 20, 20, 0, 30, 10, 11, 10, 21, 0, 31, 10),
      g(0, 'LWPOLYLINE', 8, 'PLANTA', 90, 2, 70, 0, 10, 0, 20, 0, 10, 5, 20, 5),
    );
    const s = parseWorkingsDxf(lines);
    const eje = s.axes.find((a) => a.name === 'EJE');
    expect(eje?.points).toHaveLength(3);
    expect(axisLength(eje?.points ?? [])).toBeCloseTo(20, 9);
    expect(s.warnings.map((w) => w.code)).toContain('workings.flatAxis');
  });

  it('el asset de labores se codifica, decodifica y suma al levantamiento', () => {
    const w = buildWorkings(src, { profile: { kind: 'arched', width: 4.5, height: 4.5 } });
    const back = decodeAsset(encodeAsset({ kind: 'workings', workings: w }));
    expect(back.kind).toBe('workings');
    if (back.kind !== 'workings') return;
    expect(Array.from(back.workings.axisCoords)).toEqual(Array.from(w.axisCoords));
    expect(back.workings.axes).toEqual(w.axes);
    const built = buildSurvey(
      { name: 'Labores', surveyDate: '2026-10-20', format: 'workings', files: ['x.dxf'] },
      { workings: w },
    );
    expect(built.survey.assets.workings).toMatch(/^[0-9a-f]{64}$/);
    expect(built.survey.stats.lines).toBe(1);
    expect(built.survey.bounds.minX).toBeLessThan(1000);
    expect(built.survey.bounds.maxZ).toBeGreaterThan(503 + 4);
  });
});

describe('Surpac: cadenas como ejes', () => {
  it('cada cadena es un eje (Y = Norte primero)', () => {
    const str = [
      'labores,20-oct-26,,',
      '0, 0.000, 0.000, 0.000, 0.000, 0.000, 0.000',
      '1, 2000.0, 1000.0, 500.0,',
      '1, 2050.0, 1000.0, 500.0,',
      '0, 0.000, 0.000, 0.000,',
      '2, 2000.0, 1100.0, 480.0,',
      '2, 2000.0, 1140.0, 480.0,',
      '0, 0.000, 0.000, 0.000, END',
    ].join('\n');
    const src = parseWorkingsSurpac(str);
    expect(src.axes.map((a) => a.name)).toEqual(['1', '2']);
    expect(src.axes[0]?.points[1]).toEqual({ x: 1000, y: 2050, z: 500 });
    const enc = new TextEncoder();
    const read = readWorkingsFiles([
      { name: 'Ejes_NV480.str', bytes: enc.encode(str) },
      { name: 'otro.pdf', bytes: new Uint8Array() },
    ]);
    expect(read.axes.map((a) => a.name)).toEqual(['Ejes_NV480 1', 'Ejes_NV480 2']);
    expect(read.warnings.map((w) => w.code)).toEqual(['workings.unknownFile']);
  });
});

describe('ubicación por progresiva', () => {
  const axis = [
    { x: 1000, y: 2000, z: 500 },
    { x: 1030, y: 2000, z: 503 },
    { x: 1030, y: 2020, z: 503 },
  ];
  const first = Math.hypot(30, 3);

  it('punto, azimut y pendiente del tramo a la progresiva', () => {
    const s = stationOnAxis(axis, 10);
    expect(s.length).toBeCloseTo(first + 20, 9);
    expect(s.point.x).toBeCloseTo(1000 + (10 * 30) / first, 9);
    expect(s.point.z).toBeCloseTo(500 + (10 * 3) / first, 9);
    expect(s.azimuth).toBeCloseTo(90 * deg, 12);
    expect(s.gradient).toBeCloseTo(Math.atan(3 / 30), 12);
  });

  it('en el segundo tramo apunta al Norte; en sentido inverso al Sur y bajando', () => {
    const s = stationOnAxis(axis, first + 5);
    expect(s.point).toMatchObject({ x: 1030, z: 503 });
    expect(s.point.y).toBeCloseTo(2005, 9);
    expect(s.azimuth).toBeCloseTo(0, 12);
    const back = stationOnAxis(axis, 10, true);
    expect(back.azimuth).toBeCloseTo(270 * deg, 12);
    expect(back.gradient).toBeCloseTo(-Math.atan(3 / 30), 12);
  });

  it('progresiva fuera de rango se recorta a los extremos', () => {
    expect(stationOnAxis(axis, -5).station).toBe(0);
    const end = stationOnAxis(axis, 1e6);
    expect(end.point).toEqual({ x: 1030, y: 2020, z: 503 });
    expect(end.azimuth).toBeCloseTo(0, 12);
  });

  it('progresiva del punto más cercano (clic en el 3D o en planta)', () => {
    const near = nearestStation(axis, { x: 1031, y: 2012, z: 504 });
    expect(near.station).toBeCloseTo(first + 12, 9);
    expect(near.distance).toBeCloseTo(Math.SQRT2, 9);
    const plan = nearestStation(axis, { x: 1015, y: 2001 }, true);
    expect(plan.station).toBeCloseTo(first / 2, 9);
    expect(plan.distance).toBeCloseTo(1, 9);
  });
});

describe('sección de la labor en el plano del frente', () => {
  it('el corte del túnel generado es su perfil (ancho y alto)', () => {
    const profile = workingProfile({ kind: 'arched', width: 4, height: 4 });
    const axis = [
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 40, z: 0 },
    ];
    const mesh = tunnelMesh(axis, profile.points);
    const at = stationOnAxis(axis, 15);
    const frame = planeFrame({ origin: at.point, azimuth: at.azimuth, gradient: at.gradient });
    // Radio chico frente al tramo: los triángulos largos (0 → 40 m) cruzan el plano igual.
    const segs = sectionWorkings(mesh.vertices, mesh.triangles, frame, 5);
    expect(segs.length).toBeGreaterThan(10);
    const us = segs.flatMap((s) => [s.a.u, s.b.u]);
    const vs = segs.flatMap((s) => [s.a.v, s.b.v]);
    expect(Math.min(...us)).toBeCloseTo(-2, 6);
    expect(Math.max(...us)).toBeCloseTo(2, 6);
    expect(Math.min(...vs)).toBeCloseTo(0, 6);
    expect(Math.max(...vs)).toBeCloseTo(4, 2);
  });

  it('las labores lejos del frente no entran en el corte', () => {
    const profile = workingProfile({ kind: 'rectangular', width: 4, height: 4 });
    const far = tunnelMesh(
      [
        { x: 100, y: 0, z: 0 },
        { x: 100, y: 40, z: 0 },
      ],
      profile.points,
    );
    const frame = planeFrame({ origin: { x: 0, y: 15, z: 0 }, azimuth: 0 });
    expect(sectionWorkings(far.vertices, far.triangles, frame, 10)).toHaveLength(0);
  });

  it('el eje estimado de un tubo generado coincide con su eje', () => {
    const profile = workingProfile({ kind: 'arched', width: 4, height: 5 });
    const mesh = tunnelMesh(
      [
        { x: 0, y: 0, z: 10 },
        { x: 30, y: 30, z: 10 },
      ],
      profile.points,
    );
    const est = estimateSolidAxis(mesh.vertices, mesh.triangles);
    expect(est?.width).toBeCloseTo(4, 1);
    expect(est?.height).toBeCloseTo(5, 1);
    for (const p of est?.points ?? []) {
      expect(p.x - p.y).toBeCloseTo(0, 6);
      expect(p.z).toBeCloseTo(10, 6);
    }
  });
});

/** Caja como entidad MESH (AcDbSubDMesh): 8 vértices y 6 caras de 4 lados. */
function meshBox(
  layer: string,
  x0: number,
  y0: number,
  z0: number,
  w: number,
  l: number,
  h: number,
) {
  const v = [
    [x0, y0, z0],
    [x0 + w, y0, z0],
    [x0 + w, y0 + l, z0],
    [x0, y0 + l, z0],
    [x0, y0, z0 + h],
    [x0 + w, y0, z0 + h],
    [x0 + w, y0 + l, z0 + h],
    [x0, y0 + l, z0 + h],
  ];
  const faces = [
    [0, 3, 2, 1],
    [4, 5, 6, 7],
    [0, 1, 5, 4],
    [1, 2, 6, 5],
    [2, 3, 7, 6],
    [3, 0, 4, 7],
  ];
  return g(
    0,
    'MESH',
    8,
    layer,
    100,
    'AcDbSubDMesh',
    71,
    2,
    72,
    0,
    91,
    0,
    92,
    8,
    ...v.flatMap((p) => [10, p[0] ?? 0, 20, p[1] ?? 0, 30, p[2] ?? 0]),
    93,
    30,
    ...faces.flatMap((f) => [90, 4, ...f.flatMap((i) => [90, i])]),
    94,
    0,
    95,
    0,
  );
}

const line = (layer: string, a: number[], b: number[]) =>
  g(
    0,
    'LINE',
    8,
    layer,
    10,
    a[0] ?? 0,
    20,
    a[1] ?? 0,
    30,
    a[2] ?? 0,
    11,
    b[0] ?? 0,
    21,
    b[1] ?? 0,
    31,
    b[2] ?? 0,
  );

describe('DXF de labores: MESH y elección de capas', () => {
  // Mina modelo: dos tajeos MESH, un eje de galería, hastiales y una curva de nivel.
  const text = dxf(
    meshBox('TAJEOS', 100, 0, 1775, 10, 20, 15),
    meshBox('TAJEOS', 160, 0, 1775, 10, 20, 15),
    line('EJE_GALERIA', [0, 0, 1775], [80, 0, 1775]),
    line('HASTIALES', [0, 2, 1775], [80, 2, 1775]),
    g(0, 'LWPOLYLINE', 8, 'TOPO_CURVAS', 38, 2000, 90, 2, 70, 0, 10, 0, 20, 0, 10, 50, 20, 50),
  );

  it('las capas sugeridas son las labores; topografía y hastiales quedan fuera', () => {
    const layers = inspectWorkingsDxf(text);
    expect(layers.map((l) => [l.name, l.axes, l.solids, l.suggested])).toEqual([
      ['EJE_GALERIA', 1, 0, true],
      ['HASTIALES', 1, 0, false],
      ['TAJEOS', 0, 2, true],
      ['TOPO_CURVAS', 1, 0, false],
    ]);
  });

  it('cada MESH separada es un sólido: dos tajeos con su eje estimado', () => {
    const src = parseWorkingsDxf(text, { layers: ['EJE_GALERIA', 'TAJEOS'] });
    expect(src.axes.map((a) => a.name)).toEqual(['EJE_GALERIA']);
    expect(src.solids.map((x) => [x.name, x.vertices.length / 3, x.triangles.length / 3])).toEqual([
      ['TAJEOS', 16, 24],
    ]);
    const w = buildWorkings(src, { profile: { kind: 'arched', width: 4, height: 4 } });
    expect(w.axes.map((a) => a.name)).toEqual(['EJE_GALERIA', 'TAJEOS 1', 'TAJEOS 2']);
    expect(src.warnings.map((x) => x.code)).toEqual([]);
  });

  it('sin elegir capas se lee todo (como antes)', () => {
    const src = parseWorkingsDxf(text);
    expect(src.axes.map((a) => a.name).sort()).toEqual(['EJE_GALERIA', 'HASTIALES', 'TOPO_CURVAS']);
  });
});

describe('eje estimado de un tajeo de 8 esquinas', () => {
  it('el piso sigue la cara inferior: no salta entre base y techo', () => {
    const v = [
      [120, -100, 1895],
      [142, -100, 1895],
      [142, -75, 1895],
      [120, -75, 1895],
      [106, -100, 1925],
      [128, -100, 1925],
      [128, -75, 1925],
      [106, -75, 1925],
    ].flat();
    const faces = [
      [0, 3, 2, 1],
      [4, 5, 6, 7],
      [0, 1, 5, 4],
      [1, 2, 6, 5],
      [2, 3, 7, 6],
      [3, 0, 4, 7],
    ];
    const tris = faces.flatMap((f) => [f[0], f[1], f[2], f[0], f[2], f[3]] as number[]);
    const est = estimateSolidAxis(v, tris);
    const zs = est?.points.map((p) => p.z) ?? [];
    // Baja de forma monótona (sin zigzag) y nunca por debajo de la base.
    for (let i = 1; i < zs.length; i++)
      expect(zs[i] ?? 0).toBeLessThanOrEqual((zs[i - 1] ?? 0) + 1e-9);
    expect(Math.min(...zs)).toBeCloseTo(1895, 6);
    expect(axisLength(est?.points ?? [])).toBeLessThan(60);
  });
});
