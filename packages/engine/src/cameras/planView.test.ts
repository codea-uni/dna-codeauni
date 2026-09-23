import { describe, expect, it } from 'vitest';
import { fitBounds, panBy, screenToWorld, zoomAt, type PlanViewState } from './planView';

const W = 800;
const H = 600;
const view: PlanViewState = { centerX: 100, centerY: 200, metersPerPixel: 0.5 };

describe('vista en planta', () => {
  it('el centro de pantalla es el centro de la vista', () => {
    expect(screenToWorld(view, W / 2, H / 2, W, H)).toEqual({ x: 100, y: 200 });
  });

  it('Y de pantalla crece hacia abajo, Norte hacia arriba', () => {
    const p = screenToWorld(view, W / 2, 0, W, H);
    expect(p.y).toBeCloseTo(200 + 300 * 0.5);
  });

  it('pan: arrastrar a la derecha mueve el mundo con el cursor', () => {
    const v = panBy(view, 10, 0);
    expect(v.centerX).toBeCloseTo(95);
  });

  it('zoom al cursor mantiene fijo el punto bajo el cursor', () => {
    const px = 123;
    const py = 456;
    const before = screenToWorld(view, px, py, W, H);
    const after = screenToWorld(zoomAt(view, 0.5, px, py, W, H), px, py, W, H);
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
  });

  it('encuadre de límites con margen', () => {
    const v = fitBounds({ minX: 0, minY: 0, maxX: 100, maxY: 50 }, 800, 600, 0.1);
    expect(v.centerX).toBe(50);
    expect(v.centerY).toBe(25);
    // Ancho útil 640 px → 100 m / 640 px
    expect(v.metersPerPixel).toBeCloseTo(100 / 640);
  });
});
