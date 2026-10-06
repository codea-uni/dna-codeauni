import { describe, expect, it } from 'vitest';
import {
  dirToModel,
  dragPlacement,
  headingOf,
  moveBy,
  placeAt,
  toModel,
  toXr,
  turnAbout,
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
