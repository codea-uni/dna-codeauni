import { describe, expect, it } from 'vitest';
import {
  boxGap,
  clipPlanes,
  clusterBoxes,
  FRAME_NEAR_M,
  frameBox,
  isFiniteBox,
  minRadiusAt,
  sceneNear,
} from './frame';
import { fitOrbit } from './orbit';

const box = (x: number, y: number, size = 10, z = 0) => ({
  minX: x,
  minY: y,
  minZ: z,
  maxX: x + size,
  maxY: y + size,
  maxZ: z + size,
});

// Frente local cerca de (0, 0) y levantamientos en UTM (19S) a miles de km.
const design = box(-107, 0, 5);
const cloudUtm = box(617_137, 7_759_507, 200);
const workingsUtm = box(299_928, 8_599_950, 150);

describe('encuadre (diseño vs levantamientos)', () => {
  it('con diseño se encuadra el diseño, aunque haya nubes y labores en UTM', () => {
    expect(frameBox(design, [cloudUtm, workingsUtm])).toEqual(design);
    const o = fitOrbit(design, (50 * Math.PI) / 180, 1.6);
    expect(o.distance).toBeLessThan(50);
  });

  it('sin diseño, el primer levantamiento y los cercanos; nunca dos sectores a cientos de km', () => {
    const near = box(300_100, 8_600_100, 50);
    const b = frameBox(null, [workingsUtm, cloudUtm, near]);
    expect(b).toEqual({ ...workingsUtm, maxX: 300_150, maxY: 8_600_150 });
    if (!b) throw new Error('sin caja');
    expect(Math.max(b.maxX - b.minX, b.maxY - b.minY)).toBeLessThan(FRAME_NEAR_M);
  });

  it('agrupa encadenando: A cerca de B y B cerca de C', () => {
    const a = box(0, 0);
    const b = box(4_000, 0);
    const c = box(8_000, 0);
    expect(clusterBoxes([a, c, b])).toEqual({ ...a, maxX: 8_010 });
  });

  it('descarta cajas vacías, invertidas, infinitas o NaN', () => {
    const empty = {
      minX: Infinity,
      minY: Infinity,
      minZ: Infinity,
      maxX: -Infinity,
      maxY: -Infinity,
      maxZ: -Infinity,
    };
    const nan = { ...box(0, 0), maxZ: Number.NaN };
    expect(isFiniteBox(empty)).toBe(false);
    expect(isFiniteBox(nan)).toBe(false);
    expect(isFiniteBox(null)).toBe(false);
    expect(frameBox(empty, [nan, null, undefined])).toBeNull();
    expect(frameBox(nan, [box(5, 5)])).toEqual(box(5, 5));
  });

  it('distancia entre cajas: 0 si se solapan', () => {
    expect(boxGap(box(0, 0), box(5, 5))).toBe(0);
    expect(boxGap(box(0, 0), box(13, 14))).toBeCloseTo(5);
  });
});

describe('planos de recorte', () => {
  it('el lejano alcanza las labores del mismo sector pero no otro sector', () => {
    const target = box(0, 0, 0);
    const near = sceneNear(target, [design, workingsUtm, box(800, 0, 100)]);
    expect(near.maxX).toBe(900);
    expect(near.minX).toBe(-107);
  });

  it('near/far finitos y con proporción acotada', () => {
    for (const d of [0, -1, Number.NaN, Infinity, 3, 10, 300, 50_000]) {
      const c = clipPlanes(d, 2_000);
      expect(Number.isFinite(c.near) && Number.isFinite(c.far)).toBe(true);
      expect(c.near).toBeGreaterThan(0);
      expect(c.far).toBeGreaterThan(c.near);
      expect(c.far).toBeLessThanOrEqual(200_000);
    }
    expect(clipPlanes(10, 2_000).far).toBeGreaterThanOrEqual(2_000);
    expect(clipPlanes(10).far).toBe(500);
  });
});

describe('grosor mínimo de los taladros', () => {
  it('≈ 1 px a la distancia de la cámara (no un mínimo fijo en metros)', () => {
    const fov = (50 * Math.PI) / 180;
    // A 10 m de un frente, 1 px son ~1 cm: un taladro de 45 mm (× 2) se ve con su diámetro.
    expect(minRadiusAt(10, fov, 740)).toBeCloseTo(0.0126, 3);
    expect(minRadiusAt(10, fov, 740)).toBeLessThan(0.045);
    // A 1 km ya manda el píxel.
    expect(minRadiusAt(1_000, fov, 740)).toBeGreaterThan(1);
    expect(minRadiusAt(0, fov, 740)).toBe(0);
    expect(minRadiusAt(10, fov, 0)).toBe(0);
  });
});
