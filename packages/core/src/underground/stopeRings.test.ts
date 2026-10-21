import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createDefaultLibrary } from '../model/library';
import { holeAxis } from './analysis';
import { designRing, replicateRings } from './ringDesign';
import { MAX_RING_DRIVE_GRADE, stopeRingSetup } from './stopeRings';
import { ringsToHoles } from './toHoles';
import { planeFrame } from './transform';
import { workingKinds, workingTriangleOwners } from './workingKinds';
import {
  buildWorkings,
  inspectWorkingsDxf,
  parseWorkingsDxf,
  stationOnAxis,
  workingAxisPoints,
} from './workings';

/**
 * A9 (prueba de usabilidad, subterránea): con el DXF real del cliente, elegir «TAJEOS 1» para los
 * abanicos daba «Az 90°, pendiente −143 %»: el eje estimado del sólido baja con el buzamiento
 * (65°) y los anillos salían horizontales. `fixtures/tajeo-ventana.dxf` es un recorte de
 * `mina-subterranea.dxf` (capas TAJEOS, EJE_VENTANA y EJE_GALERIA del nivel 1895): el tajeo 1 es un
 * prisma de 22 m (E-O) × 25 m (N-S) × 30 m de alto (base a 1895, techo a 1925, corrido 14 m al
 * oeste), con la ventana 1 entrando por su base a y = −87,5 desde la galería de x = 102.
 */

function must<T>(x: T | null | undefined): T {
  if (x === null || x === undefined) throw new Error('valor ausente');
  return x;
}

const text = readFileSync(new URL('./fixtures/tajeo-ventana.dxf', import.meta.url), 'utf8');
const layers = inspectWorkingsDxf(text)
  .filter((l) => l.suggested)
  .map((l) => l.name);
const w = buildWorkings(parseWorkingsDxf(text, { layers }), {
  profile: { kind: 'arched', width: 4.5, height: 4 },
});
const kinds = workingKinds(w);
const owners = workingTriangleOwners(w);
const axes = w.axes.map((_, i) => workingAxisPoints(w, i));
const stopeIndex = w.axes.findIndex((a, i) => kinds[i] === 'stope' && a.name.startsWith('TAJEOS'));

function setupFor(rings: number, burden: number) {
  const stopeTriangles: number[] = [];
  owners.forEach((o, t) => {
    if (o === stopeIndex) stopeTriangles.push(t);
  });
  return stopeRingSetup(
    {
      points: must(axes[stopeIndex]),
      vertices: w.vertices,
      triangles: w.triangles,
      stopeTriangles,
    },
    axes.map((points, i) => ({ points: i === stopeIndex ? [] : points, kind: must(kinds[i]) })),
    { rings, burden },
  );
}

describe('abanicos en un tajeo importado (DXF del cliente)', () => {
  it('el recorte trae el tajeo, la ventana y la galería', () => {
    expect(stopeIndex).toBeGreaterThanOrEqual(0);
    expect(w.axes.some((a, i) => a.name.startsWith('EJE_VENTANA') && kinds[i] === 'access')).toBe(
      true,
    );
  });

  it('el eje del sólido baja con el buzamiento (por eso no sirve como galería)', () => {
    const s = stationOnAxis(must(axes[stopeIndex]), 0);
    expect(Math.abs(Math.tan(s.gradient))).toBeGreaterThan(MAX_RING_DRIVE_GRADE);
  });

  it('se perfora desde la ventana: Az 90°, pendiente 0, anillos verticales', () => {
    const setup = setupFor(5, 2.2);
    const drive = must(w.axes[must(setup.driveIndex)]);
    expect(drive.name).toMatch(/EJE_VENTANA/);
    // La ventana 1 va hacia el este a y = −87,5 (centro del tajeo) y cota 1895 (base del tajeo).
    expect((setup.azimuth * 180) / Math.PI).toBeCloseTo(90, 6);
    expect(setup.gradient).toBeCloseTo(0, 9);
    expect(setup.origin.y).toBeCloseTo(-87.5, 6);
    expect(setup.origin.z).toBeCloseTo(1895, 6);

    // Los taladros de los anillos quedan en planos verticales perpendiculares al avance.
    const frame = planeFrame({
      origin: setup.origin,
      azimuth: setup.azimuth,
      gradient: setup.gradient,
    });
    const sec = must(setup.section);
    const l = sec.offset - sec.width / 2;
    const r = sec.offset + sec.width / 2;
    const ring = designRing({
      pivot: { u: 0, v: 3 },
      boundary: [
        { u: l, v: sec.bottom },
        { u: r, v: sec.bottom },
        { u: r, v: sec.top },
        { u: l, v: sec.top },
      ],
      mode: 'toeSpacing',
      toeSpacing: 2.5,
      holeDiameter: 0.089,
      explosiveDensity: 1150,
    });
    const lib = createDefaultLibrary();
    const holes = ringsToHoles({
      ring,
      frame,
      placements: replicateRings(5, 2.2),
      products: { explosive: must(lib.explosives[0]) },
    });
    expect(holes.length).toBeGreaterThan(20);
    for (const h of holes) {
      const a = holeAxis(h);
      // Sin componente a lo largo del avance (este): el anillo es un plano vertical N-S.
      expect(Math.abs(a.x)).toBeLessThan(1e-6);
    }
  });

  it('el ancho y el alto salen del sólido cortado en el plano del anillo (25 m × 30 m)', () => {
    const sec = must(setupFor(5, 2.2).section);
    expect(sec.width).toBeCloseTo(25, 6);
    expect(sec.offset).toBeCloseTo(0, 6);
    expect(sec.bottom).toBeCloseTo(0, 6);
    expect(sec.top).toBeCloseTo(30, 6);
  });

  it('sin galería cerca: la dirección horizontal del tajeo y pendiente 0', () => {
    const stopeTriangles: number[] = [];
    owners.forEach((o, t) => {
      if (o === stopeIndex) stopeTriangles.push(t);
    });
    const setup = stopeRingSetup(
      {
        points: must(axes[stopeIndex]),
        vertices: w.vertices,
        triangles: w.triangles,
        stopeTriangles,
      },
      [],
      { rings: 1, burden: 2 },
    );
    expect(setup.driveIndex).toBeNull();
    expect(setup.gradient).toBe(0);
    expect((setup.azimuth * 180) / Math.PI).toBeCloseTo(90, 6);
  });
});
