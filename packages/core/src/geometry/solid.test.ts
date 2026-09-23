import { describe, expect, it } from 'vitest';
import { createHole, DEFAULT_BENCH, DEFAULT_HOLE_TEMPLATE } from '../model/factories';
import { newId } from '../model/ids';
import type { Hole } from '../model/types';
import { degToRad } from '../units/units';
import { freeFaceQuads, holeSegments3d } from './solid';

function hole(): Hole {
  return createHole({
    position: { x: 10, y: 20 },
    template: DEFAULT_HOLE_TEMPLATE,
    bench: DEFAULT_BENCH,
    label: '1',
  });
}

describe('sólidos 3D', () => {
  it('taladro sin carga: un solo tramo vacío de boca a fondo', () => {
    const segs = holeSegments3d(hole());
    expect(segs).toHaveLength(1);
    expect(segs[0]?.kind).toBe('empty');
    expect(segs[0]?.from.z).toBe(15);
    expect(segs[0]?.to.z).toBeCloseTo(-1.5);
  });

  it('decks + tramo vacío en la boca cubren toda la longitud', () => {
    const h = hole(); // 16.5 m vertical, boca en z = 15
    const expl = newId<'Explosive'>();
    const loaded: Hole = {
      ...h,
      decks: [
        { id: newId<'Deck'>(), kind: 'explosive', explosiveId: expl, length: 10 },
        { id: newId<'Deck'>(), kind: 'air', length: 1 },
        {
          id: newId<'Deck'>(),
          kind: 'stemming',
          materialId: newId<'StemmingMaterial'>(),
          length: 3.5,
        },
      ],
    };
    const segs = holeSegments3d(loaded);
    expect(segs.map((s) => s.kind)).toEqual(['explosive', 'air', 'stemming', 'empty']);
    // Explosivo de 6.5 a 16.5 m de profundidad → z de 8.5 a −1.5
    expect(segs[0]?.from.z).toBeCloseTo(8.5);
    expect(segs[0]?.to.z).toBeCloseTo(-1.5);
    expect(segs[0]?.productId).toBe(expl);
    // Vacío: 0 a 2 m (16.5 − 14.5 de decks)
    expect(segs[3]?.from.z).toBe(15);
    expect(segs[3]?.to.z).toBeCloseTo(13);
    const total = segs.reduce(
      (s, x) => s + Math.hypot(x.to.x - x.from.x, x.to.y - x.from.y, x.to.z - x.from.z),
      0,
    );
    expect(total).toBeCloseTo(16.5, 9);
  });

  it('taladro inclinado: los tramos siguen el eje', () => {
    const h = { ...hole(), inclination: degToRad(20), azimuth: degToRad(90), length: 10 };
    const segs = holeSegments3d({
      ...h,
      decks: [{ id: newId<'Deck'>(), kind: 'air', length: 10 }],
    });
    // Fondo: x = 10 + 10·sin20° = 13.420, z = 15 − 10·cos20° = 5.603
    expect(segs[0]?.to.x).toBeCloseTo(13.4202, 4);
    expect(segs[0]?.to.z).toBeCloseTo(5.6031, 4);
    expect(segs[0]?.from).toEqual(h.collar);
  });

  it('cara de talud: de la cresta al pie, hacia afuera H / tan(ángulo)', () => {
    const boundary = {
      id: newId<'Boundary'>(),
      name: 'P',
      polygon: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ],
      freeFaceEdges: [0],
    };
    const bench = { ...DEFAULT_BENCH, faceAngle: degToRad(75) }; // 15 m de altura
    const [q] = freeFaceQuads(boundary, bench);
    if (!q) throw new Error('sin cara');
    // Cara Sur: el pie queda 15/tan75° = 4.019 m al Sur de la cresta, en la cota de piso.
    expect(q[0]).toEqual({ x: 0, y: 0, z: 15 });
    expect(q[2].y).toBeCloseTo(-4.0192, 4);
    expect(q[2].z).toBe(0);
    expect(freeFaceQuads({ ...boundary, freeFaceEdges: [] }, bench)).toEqual([]);
  });
});
