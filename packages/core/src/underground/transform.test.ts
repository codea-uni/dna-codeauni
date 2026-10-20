import { describe, expect, it } from 'vitest';
import { holeToe } from '../geometry/hole';
import {
  faceHoleToWorld,
  localToWorld,
  offsetFrame,
  planeFrame,
  ringHoleToWorld,
} from './transform';

const deg = Math.PI / 180;

describe('plano del frente → proyecto', () => {
  it('taladro horizontal: inclinación π/2 y azimut = el de la galería', () => {
    const frame = planeFrame({ origin: { x: 100, y: 200, z: 50 }, azimuth: 30 * deg });
    const w = faceHoleToWorld(frame, { collar: { u: 1, v: 2 }, toe: { u: 1, v: 2 }, depth: 3 });
    expect(w.inclination).toBeCloseTo(Math.PI / 2, 12);
    expect(w.azimuth).toBeCloseTo(30 * deg, 12);
    expect(w.length).toBeCloseTo(3, 12);
    // u a la derecha: (cos 30°, −sin 30°); v arriba.
    expect(w.collar.x).toBeCloseTo(100 + Math.cos(30 * deg), 12);
    expect(w.collar.y).toBeCloseTo(200 - Math.sin(30 * deg), 12);
    expect(w.collar.z).toBeCloseTo(52, 12);
    // Coherente con holeToe de la convención del repositorio.
    const toe = holeToe(w);
    expect(toe.x).toBeCloseTo(w.toe.x, 9);
    expect(toe.y).toBeCloseTo(w.toe.y, 9);
    expect(toe.z).toBeCloseTo(w.toe.z, 9);
  });

  it('galería al Norte: u = Este; look-out hacia la derecha gira el azimut hacia el Este', () => {
    const frame = planeFrame({ origin: { x: 0, y: 0, z: 0 }, azimuth: 0 });
    const w = faceHoleToWorld(frame, { collar: { u: 2, v: 1 }, toe: { u: 2.1, v: 1 }, depth: 3 });
    expect(w.collar.x).toBeCloseTo(2, 12);
    expect(w.toe.y).toBeCloseTo(3, 12);
    expect(w.azimuth).toBeCloseTo(Math.atan2(0.1, 3), 12);
    expect(w.inclination).toBeCloseTo(Math.PI / 2, 12);
  });

  it('pendiente positiva: taladro ascendente, inclinación π/2 + g', () => {
    const frame = planeFrame({
      origin: { x: 0, y: 0, z: 0 },
      azimuth: 90 * deg,
      gradient: 5 * deg,
    });
    const w = faceHoleToWorld(frame, { collar: { u: 0, v: 1 }, toe: { u: 0, v: 1 }, depth: 4 });
    expect(w.inclination).toBeCloseTo(Math.PI / 2 + 5 * deg, 12);
    expect(w.azimuth).toBeCloseTo(90 * deg, 12);
  });
});

describe('plano del anillo → proyecto', () => {
  const frame = planeFrame({ origin: { x: 0, y: 0, z: 0 }, azimuth: 0 });

  it('ascendente vertical π, descendente 0, horizontal a +u = Este', () => {
    const up = ringHoleToWorld(frame, { collar: { u: 0, v: 4 }, toe: { u: 0, v: 14 } });
    expect(up.inclination).toBeCloseTo(Math.PI, 12);
    expect(up.length).toBeCloseTo(10, 12);
    const down = ringHoleToWorld(frame, { collar: { u: 0, v: 0 }, toe: { u: 0, v: -5 } });
    expect(down.inclination).toBeCloseTo(0, 12);
    const right = ringHoleToWorld(frame, { collar: { u: 2, v: 2 }, toe: { u: 8, v: 2 } });
    expect(right.inclination).toBeCloseTo(Math.PI / 2, 12);
    expect(right.azimuth).toBeCloseTo(Math.PI / 2, 12);
  });

  it('dump de 10°: el ascendente se inclina hacia el avance', () => {
    const f = planeFrame({ origin: { x: 0, y: 0, z: 0 }, azimuth: 0, dump: 10 * deg });
    const up = ringHoleToWorld(f, { collar: { u: 0, v: 0 }, toe: { u: 0, v: 10 } });
    expect(up.inclination).toBeCloseTo(Math.PI - 10 * deg, 12);
    expect(up.azimuth).toBeCloseTo(0, 12);
  });

  it('réplica: desplazar el marco un burden a lo largo de la normal', () => {
    const f2 = offsetFrame(frame, 2.2);
    expect(localToWorld(f2, { u: 0, v: 0 }).y).toBeCloseTo(2.2, 12);
  });
});
