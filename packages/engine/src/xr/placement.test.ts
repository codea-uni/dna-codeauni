import { describe, expect, it } from 'vitest';
import {
  blendPlacement,
  dirToModel,
  dragPlacement,
  easeInOut,
  headingOf,
  moveBy,
  placeAt,
  samePlacement,
  standPlacement,
  toModel,
  toXr,
  turnAbout,
  twoHandPlacement,
  walkDragGain,
  walkTwoHandPlacement,
  type XrPlacement,
} from './placement';

// Convención (D-19, CLAUDE.md regla 3): modelo X Este, Y Norte, Z arriba; WebXR Y arriba, −Z adelante.
const id = { scale: 1, yaw: 0, offset: { x: 0, y: 0, z: 0 } };

function close(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) {
  expect(a.x).toBeCloseTo(b.x, 9);
  expect(a.y).toBeCloseTo(b.y, 9);
  expect(a.z).toBeCloseTo(b.z, 9);
}

describe('ubicación del modelo en XR', () => {
  it('Este a la derecha, Norte adelante, cota arriba', () => {
    close(toXr(id, { x: 1, y: 0, z: 0 }), { x: 1, y: 0, z: 0 });
    close(toXr(id, { x: 0, y: 1, z: 0 }), { x: 0, y: 0, z: -1 });
    close(toXr(id, { x: 0, y: 0, z: 1 }), { x: 0, y: 1, z: 0 });
  });

  it('ida y vuelta con escala, giro y desplazamiento', () => {
    const p = { scale: 1 / 1000, yaw: 0.7, offset: { x: 0.3, y: 0.9, z: -1.1 } };
    const v = { x: 512.5, y: -230.25, z: 18 };
    close(toModel(p, toXr(p, v)), v);
  });

  it('maqueta 1:1000: 100 m del modelo son 10 cm', () => {
    const p = { scale: 1 / 1000, yaw: 0, offset: { x: 0, y: 0, z: 0 } };
    close(toXr(p, { x: 100, y: 0, z: 0 }), { x: 0.1, y: 0, z: 0 });
    close(dirToModel(p, { x: 0, y: 0, z: -0.1 }), { x: 0, y: 100, z: 0 });
  });

  it('placeAt deja el punto del modelo en el punto XR pedido', () => {
    const p = placeAt({ x: 40, y: -60, z: 25 }, { x: 0, y: 0, z: 0 }, 0.4, 1);
    close(toXr(p, { x: 40, y: -60, z: 25 }), { x: 0, y: 0, z: 0 });
  });

  it('moverse adelante acerca lo que está al Norte', () => {
    const p = moveBy(id, { x: 0, y: 0, z: -5 });
    close(toXr(p, { x: 0, y: 10, z: 0 }), { x: 0, y: 0, z: -5 });
  });

  it('girar a la izquierda 90° deja el Oeste adelante y no mueve el pivote', () => {
    const pivot = { x: 2, y: 1.6, z: 3 };
    const before = toModel(id, pivot);
    const p = turnAbout(id, pivot, Math.PI / 2);
    close(toModel(p, pivot), before);
    const west = toXr(p, { x: before.x - 10, y: before.y, z: 0 });
    close({ x: west.x - pivot.x, y: 0, z: west.z - pivot.z }, { x: 0, y: 0, z: -10 });
  });

  it('rumbo de la cabeza: 0 mirando a −Z, π/2 mirando a −X', () => {
    expect(headingOf({ x: 0, y: 0, z: -1 })).toBeCloseTo(0, 12);
    expect(headingOf({ x: -1, y: 0, z: 0 })).toBeCloseTo(Math.PI / 2, 12);
  });

  it('arrastrar: el modelo sigue al control y gira alrededor de la mano', () => {
    const p0 = { scale: 1 / 1000, yaw: 0, offset: { x: 0, y: 0.9, z: -1 } };
    const hand = { pos: { x: 0.2, y: 1, z: -0.6 }, yaw: 0 };
    const grabbed = toModel(p0, hand.pos);
    // Mover la mano 0,5 m a la derecha y 0,1 m arriba: el punto tomado va con ella.
    const moved = dragPlacement(p0, hand, { pos: { x: 0.7, y: 1.1, z: -0.6 }, yaw: 0 });
    close(toXr(moved, grabbed), { x: 0.7, y: 1.1, z: -0.6 });
    // Girar la muñeca 90° en el lugar: el punto tomado no se mueve y el modelo gira 90°.
    const turned = dragPlacement(p0, hand, { pos: hand.pos, yaw: Math.PI / 2 });
    close(toXr(turned, grabbed), hand.pos);
    expect(turned.yaw).toBeCloseTo(Math.PI / 2, 12);
  });
});

describe('suavizado y dos manos', () => {
  const p0: XrPlacement = { scale: 0.001, yaw: 0.2, offset: { x: 0.1, y: 0.8, z: -0.5 } };
  const p1: XrPlacement = { scale: 0.004, yaw: -2.9, offset: { x: -0.3, y: 1.1, z: -0.9 } };
  const pivot = { x: 120, y: -40, z: 10 };

  it('k = 0 queda donde estaba y k = 1 llega', () => {
    expect(samePlacement(blendPlacement(p0, p1, pivot, 0), p0)).toBe(true);
    expect(samePlacement(blendPlacement(p0, p1, pivot, 1), p1)).toBe(true);
  });

  it('el pivote viaja en línea recta y la escala es geométrica', () => {
    const mid = blendPlacement(p0, p1, pivot, 0.5);
    const a = toXr(p0, pivot);
    const b = toXr(p1, pivot);
    const m = toXr(mid, pivot);
    expect(m.x).toBeCloseTo((a.x + b.x) / 2, 9);
    expect(m.z).toBeCloseTo((a.z + b.z) / 2, 9);
    expect(mid.scale).toBeCloseTo(Math.sqrt(p0.scale * p1.scale), 12);
  });

  it('pasos sucesivos convergen al destino', () => {
    let p = p0;
    for (let i = 0; i < 200; i++) p = blendPlacement(p, p1, pivot, 0.1);
    expect(samePlacement(p, p1)).toBe(true);
  });

  it('dos manos: los puntos bajo las manos las siguen al girar, escalar y mover', () => {
    const a0 = { x: -0.2, y: 1, z: -0.5 };
    const b0 = { x: 0.2, y: 1, z: -0.5 };
    // Manos más separadas, giradas 30° y corridas.
    const ang = Math.PI / 6;
    const a1 = { x: 0.1 - 0.3 * Math.cos(ang), y: 1.1, z: -0.6 + 0.3 * Math.sin(ang) };
    const b1 = { x: 0.1 + 0.3 * Math.cos(ang), y: 1.1, z: -0.6 - 0.3 * Math.sin(ang) };
    const under = toModel(p0, a0);
    const p = twoHandPlacement(p0, a0, b0, a1, b1);
    const back = toXr(p, under);
    expect(back.x).toBeCloseTo(a1.x, 9);
    expect(back.z).toBeCloseTo(a1.z, 9);
    expect(p.scale).toBeCloseTo(p0.scale * 1.5, 12);
  });

  it('pararse en un lugar: los ojos en la cabeza y lo que se mira, adelante de la mirada', () => {
    const eye = { x: 120, y: -40, z: 351.7 };
    const look = { x: 1, y: 1 };
    const headXr = { x: 0.2, y: 1.6, z: -0.3 };
    // Cabeza mirando a la izquierda 30° (rumbo XR positivo a la izquierda).
    const heading = Math.PI / 6;
    const p = standPlacement(eye, look, headXr, heading);
    expect(p.scale).toBe(1);
    close(toXr(p, eye), headXr);
    const ahead = toXr(p, { x: eye.x + look.x, y: eye.y + look.y, z: eye.z });
    const dir = { x: ahead.x - headXr.x, y: ahead.y - headXr.y, z: ahead.z - headXr.z };
    expect(dir.y).toBeCloseTo(0, 9);
    expect(headingOf(dir)).toBeCloseTo(heading, 9);
  });

  it('avance suave del traslado: 0 al inicio, 1 al final, simétrico', () => {
    expect(easeInOut(-1)).toBe(0);
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(0.5)).toBeCloseTo(0.5, 12);
    expect(easeInOut(1)).toBe(1);
    expect(easeInOut(2)).toBe(1);
    expect(easeInOut(0.2) + easeInOut(0.8)).toBeCloseTo(1, 12);
  });
});

describe('walkTwoHandPlacement', () => {
  const p0: XrPlacement = { scale: 1, yaw: 0, offset: { x: 0, y: 0, z: 0 } };
  const head = { x: 0, y: 1.6, z: 0 };
  it('separar las manos acerca hacia ellas y juntarlas aleja (sin cambiar la escala)', () => {
    const a0 = { x: -0.15, y: 1.2, z: -0.4 };
    const b0 = { x: 0.15, y: 1.2, z: -0.4 };
    const a1 = { x: -0.3, y: 1.2, z: -0.4 };
    const b1 = { x: 0.3, y: 1.2, z: -0.4 };
    const near = walkTwoHandPlacement(p0, head, a0, b0, a1, b1, 1, 100);
    expect(near.scale).toBe(1);
    // El usuario avanzó hacia adelante (−Z) y bajó: el mundo se corre hacia +Z y arriba.
    expect(near.offset.z).toBeGreaterThan(10);
    expect(near.offset.y).toBeGreaterThan(0);
    const far = walkTwoHandPlacement(p0, head, a1, b1, a0, b0, 1, 100);
    expect(far.offset.z).toBeLessThan(-10);
  });
  it('girar el segmento entre las manos gira el mundo alrededor de la cabeza', () => {
    const a0 = { x: -0.2, y: 1.2, z: -0.4 };
    const b0 = { x: 0.2, y: 1.2, z: -0.4 };
    const c = Math.cos(0.2);
    const s = Math.sin(0.2);
    const a1 = { x: -0.2 * c, y: 1.2, z: -0.4 + 0.2 * s };
    const b1 = { x: 0.2 * c, y: 1.2, z: -0.4 - 0.2 * s };
    const q = walkTwoHandPlacement(p0, head, a0, b0, a1, b1, 1, 0);
    expect(q.yaw).toBeCloseTo(0.2, 5);
    // La cabeza no se movió respecto del mundo en planta: el punto bajo la cabeza sigue ahí.
    const under = toModel(p0, head);
    const now = toXr(q, under);
    expect(now.x).toBeCloseTo(head.x, 5);
    expect(now.z).toBeCloseTo(head.z, 5);
  });
  it('mover las dos manos arrastra el mundo con la ganancia', () => {
    const a0 = { x: -0.2, y: 1.2, z: -0.4 };
    const b0 = { x: 0.2, y: 1.2, z: -0.4 };
    const a1 = { x: -0.1, y: 1.2, z: -0.4 };
    const b1 = { x: 0.3, y: 1.2, z: -0.4 };
    const q = walkTwoHandPlacement(p0, head, a0, b0, a1, b1, 10, 0);
    expect(q.offset.x).toBeCloseTo(1, 5);
  });
});

describe('walkDragGain', () => {
  it('×6 cerca del suelo (como antes) y mucho más desde lo alto', () => {
    expect(walkDragGain(1.7)).toBe(6);
    expect(walkDragGain(20)).toBe(6);
    expect(walkDragGain(60)).toBe(12);
    expect(walkDragGain(1000)).toBe(30);
  });
});
