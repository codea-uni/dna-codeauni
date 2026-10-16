import { describe, expect, it } from 'vitest';
import {
  EYE_HEIGHT,
  angleBetween,
  azimuthOf,
  blastFrame,
  dirOf,
  standPoint,
  viewpoint,
  type ViewpointScene,
} from './viewpoints';

// Convención (CLAUDE.md regla 3): X Este, Y Norte; azimut desde el Norte en sentido horario.
// Voladura de prueba: cuadrado 0..40 antihorario con la cara libre al Sur (arista 0, y = 0).
const square = [
  { x: 0, y: 0 },
  { x: 40, y: 0 },
  { x: 40, y: 40 },
  { x: 0, y: 40 },
];
const holes = [
  { x: 10, y: 10 },
  { x: 30, y: 10 },
  { x: 10, y: 30 },
  { x: 30, y: 30 },
];
const scene: ViewpointScene = {
  boundaries: [{ polygon: square, freeFaceEdges: [0] }],
  holes,
  points: [],
};

/** Donde queda parado el usuario según el pedido. */
const standOf = (s: {
  target: { x: number; y: number };
  standDistance: number;
  yawDeg?: number;
}) => {
  const u = dirOf(s.yawDeg ?? 0);
  return { x: s.target.x - u.x * s.standDistance, y: s.target.y - u.y * s.standDistance };
};

describe('puntos de vista del visor', () => {
  it('azimuts: Norte 0°, Este 90°, Sur 180°, Oeste 270°', () => {
    expect(azimuthOf({ x: 0, y: 1 })).toBeCloseTo(0, 9);
    expect(azimuthOf({ x: 1, y: 0 })).toBeCloseTo(90, 9);
    expect(azimuthOf({ x: 0, y: -1 })).toBeCloseTo(180, 9);
    expect(azimuthOf({ x: -1, y: 0 })).toBeCloseTo(270, 9);
    expect(dirOf(90).x).toBeCloseTo(1, 9);
    expect(angleBetween(350, 10)).toBeCloseTo(20, 9);
  });

  it('pararse a una distancia: con rumbo dado, o en la línea desde donde está el usuario', () => {
    const a = standPoint({ x: 0, y: 0 }, 10, 0, { x: 99, y: 99 }, 0);
    expect(a.stand.x).toBeCloseTo(0, 9);
    expect(a.stand.y).toBeCloseTo(-10, 9);
    // Sin rumbo: viene del Este, queda 10 m al Este mirando al Oeste.
    const b = standPoint({ x: 0, y: 0 }, 10, undefined, { x: 50, y: 0 }, 0);
    expect(b.stand.x).toBeCloseTo(10, 9);
    expect(b.yawDeg).toBeCloseTo(270, 9);
    // Encima del objetivo: el rumbo de reserva.
    expect(standPoint({ x: 0, y: 0 }, 5, undefined, { x: 0, y: 0 }, 90).yawDeg).toBe(90);
  });

  it('marco de la voladura: centro de los taladros y cara libre al Sur', () => {
    const f = blastFrame(scene);
    expect(f?.center).toEqual({ x: 20, y: 20 });
    expect(f?.radius).toBeCloseTo(Math.hypot(20, 20), 9);
    expect(f?.face?.mid).toEqual({ x: 20, y: 0 });
    expect(f?.face?.normal.x).toBeCloseTo(0, 9);
    expect(f?.face?.normal.y).toBeCloseTo(-1, 9);
    expect(blastFrame({ boundaries: [], holes: [], points: [] })).toBeNull();
  });

  it('frente a la cara libre: al Sur de la cara, mirando al Norte, de pie', () => {
    const v = viewpoint('free_face', scene, { distance: 30 });
    expect(v?.yawDeg).toBeCloseTo(0, 9);
    expect(v?.eyeHeight).toBe(EYE_HEIGHT);
    const s = v ? standOf(v) : null;
    expect(s?.x).toBeCloseTo(20, 9);
    expect(s?.y).toBeCloseTo(-30, 9);
  });

  it('detrás de la voladura: al Norte del borde trasero, mirando hacia la cara libre (Sur)', () => {
    const v = viewpoint('behind', scene, { distance: 15 });
    expect(v?.yawDeg).toBeCloseTo(180, 9);
    // Borde trasero a 20 m del centro + 15 m.
    const s = v ? standOf(v) : null;
    expect(s?.x).toBeCloseTo(20, 9);
    expect(s?.y).toBeCloseTo(55, 9);
  });

  it('cresta: atrás del borde de la cara libre, mirando a lo largo de ella', () => {
    const v = viewpoint('crest', scene);
    // Arista (0,0)→(40,0): se para 5 m antes de la esquina y 3 m adentro, mira al Este.
    expect(v?.yawDeg).toBeCloseTo(90, 9);
    const s = v ? standOf(v) : null;
    expect(s?.x).toBeCloseTo(-5, 9);
    expect(s?.y).toBeCloseTo(3, 9);
  });

  it('sin cara libre no hay vista de cara libre, detrás ni cresta', () => {
    const noFace = { ...scene, boundaries: [{ polygon: square, freeFaceEdges: [] }] };
    expect(viewpoint('free_face', noFace)).toBeNull();
    expect(viewpoint('behind', noFace)).toBeNull();
    expect(viewpoint('crest', noFace)).toBeNull();
    expect(viewpoint('blast', noFace)).not.toBeNull();
  });

  it('voladura: al borde de la zona perforada, del lado del usuario; encima de ella, desde la cara libre', () => {
    // Taladros a 14,1 m del centro (20, 20): de pie a 0,6·14,1 + 8 = 16,5 m, a 2,3 m de los de afuera.
    const east = viewpoint('blast', scene, { from: { x: 300, y: 20 } });
    expect(east?.yawDeg).toBeCloseTo(270, 9);
    expect(east?.standDistance).toBeCloseTo(Math.hypot(10, 10) * 0.6 + 8, 9);
    expect(east?.eyeHeight).toBe(EYE_HEIGHT);
    const s = east ? standOf(east) : null;
    expect(s?.x).toBeCloseTo(20 + Math.hypot(10, 10) * 0.6 + 8, 9);
    // Con distancia pedida, a esa distancia del centro.
    expect(
      viewpoint('blast', scene, { from: { x: 300, y: 20 }, distance: 20 })?.standDistance,
    ).toBe(20);
    const onTop = viewpoint('blast', scene, { from: { x: 21, y: 22 } });
    expect(onTop?.yawDeg).toBeCloseTo(0, 9);
  });

  it('centro: de pie en medio de la malla, mirando hacia la cara libre (Sur)', () => {
    const v = viewpoint('center', scene, { from: { x: 300, y: 20 } });
    expect(v?.standDistance).toBe(0);
    expect(v?.target).toEqual({ x: 20, y: 20 });
    expect(v?.yawDeg).toBeCloseTo(180, 9);
  });

  it('encima: flotando sobre la voladura, un poco atrás del centro, a la altura que la hace caber', () => {
    const v = viewpoint('above', scene, { from: { x: 300, y: 20 } });
    // 1,6·14,1 = 22,6 m < 25 m mínimo.
    expect(v?.eyeHeight).toBe(25);
    expect(v?.standDistance).toBeCloseTo(25 * 0.55, 9);
    // Desde el lado de la cara libre (Sur), mirando al Norte a través de la malla.
    expect(v?.yawDeg).toBeCloseTo(0, 9);
    expect(viewpoint('above', scene, { distance: 120 })?.eyeHeight).toBe(120);
  });

  it('vista general: en alto, con la comunidad detrás de la voladura y lejos del alcance mínimo', () => {
    const withPoint = { ...scene, points: [{ x: 20, y: 500 }] };
    const v = viewpoint('overview', withPoint, { minDistance: 900 });
    expect(v?.yawDeg).toBeCloseTo(0, 9);
    expect(v?.standDistance).toBe(900);
    expect(v?.eyeHeight).toBeGreaterThan(100);
    // Mira hacia la comunidad: la voladura queda entre el usuario y el punto.
    const s = v ? standOf(v) : null;
    expect(s?.y ?? 0).toBeLessThan(0);
  });
});
