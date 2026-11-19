import { describe, expect, it } from 'vitest';
import { swebrecB, swebrecPassing } from '../fragmentation/fragmentation';
import { blockLanding, discretizeFragments, FRAGMENT_FINE } from './fragments';
import type { MuckpileBlocks } from './types';

/** Bloques de prueba: cubos de lado `s`, una sola curva Swebrec. */
function blocks(n: number, s: number, x50: number, xmax: number, nUnif: number): MuckpileBlocks {
  const b = swebrecB(x50, xmax, nUnif);
  const curve = new Float32Array(3 * n);
  for (let k = 0; k < n; k++) curve.set([x50, xmax, b], 3 * k);
  const origin = new Float64Array(3 * n);
  for (let k = 0; k < n; k++) origin.set([k * s, 0, 0], 3 * k);
  const velocity = new Float32Array(3 * n);
  for (let k = 0; k < n; k++) velocity.set([10, 0, 5], 3 * k);
  return {
    count: n,
    origin,
    impact: origin.slice(),
    destination: origin.slice(),
    velocity,
    launchTime: new Float64Array(n).fill(0),
    impactTime: new Float64Array(n).fill(1),
    hole: new Int32Array(n),
    volume: new Float32Array(n).fill(s * s * s),
    height: new Float32Array(n).fill(s),
    topSlope: new Float32Array(2 * n),
    fragmentSize: new Float32Array(n).fill(NaN),
    domain: new Int16Array(n).fill(-1),
    curve,
  };
}

describe('discretizeFragments (FC-47)', () => {
  it('conserva el volumen de cada bloque: piedras + fino = in situ', () => {
    const bl = blocks(50, 1, 0.08, 0.6, 1.2);
    const f = discretizeFragments(bl, { budget: 20000 });
    // Valor esperado independiente de la fórmula de conteo: el volumen in situ de los cubos.
    expect(f.volume.total).toBeCloseTo(50, 6);
    expect(Math.abs(f.volume.drawn + f.volume.fine - 50) / 50).toBeLessThan(1e-6);
    // Volumen de las piedras desde los ejes (caja L·I·S) = k_v·x³.
    let vAxes = 0;
    for (let j = 0; j < f.count; j++) {
      if ((f.flags[j] ?? 0) & FRAGMENT_FINE) continue;
      vAxes += (f.axes[3 * j] ?? 0) * (f.axes[3 * j + 1] ?? 0) * (f.axes[3 * j + 2] ?? 0);
    }
    expect(Math.abs(vAxes - f.volume.drawn) / f.volume.drawn).toBeLessThan(1e-4);
  });

  it('respeta el presupuesto subiendo el corte', () => {
    const bl = blocks(400, 1, 0.08, 0.6, 1.2);
    const f = discretizeFragments(bl, { budget: 5000 });
    expect(f.count).toBeLessThanOrEqual(5000);
    expect(f.cut).toBeGreaterThan(0.03);
    // El fino es lo que la curva deja bajo el corte (fracción de volumen pasante).
    const p = swebrecPassing(f.cut, 0.08, 0.6, swebrecB(0.08, 0.6, 1.2));
    expect(f.volume.fine / f.volume.total).toBeGreaterThan(p - 0.05);
  });

  it('el histograma en volumen de las piedras reproduce P(x) sobre el corte', () => {
    const x50 = 0.25;
    const xmax = 1.2;
    const bl = blocks(60, 1.5, x50, xmax, 1.4);
    const f = discretizeFragments(bl, { budget: 40000 });
    const b = swebrecB(x50, xmax, 1.4);
    const p0 = swebrecPassing(f.cut, x50, xmax, b);
    let worst = 0;
    for (const x of [0.1, 0.2, 0.3, 0.5, 0.8]) {
      if (x <= f.cut) continue;
      let v = 0;
      for (let j = 0; j < f.count; j++)
        if (!((f.flags[j] ?? 0) & FRAGMENT_FINE) && (f.size[j] ?? 0) <= x)
          v += 0.45 * (f.size[j] ?? 0) ** 3;
      const sim = p0 + v / f.volume.total;
      worst = Math.max(worst, Math.abs(sim - swebrecPassing(x, x50, xmax, b)));
    }
    expect(worst).toBeLessThan(0.03);
  });

  it('formas: medias de I/L y S/I cerca de lo medido (Sun et al. 2014)', () => {
    const f = discretizeFragments(blocks(200, 1, 0.08, 0.6, 1.2), { budget: 20000 });
    let il = 0;
    let si = 0;
    let n = 0;
    for (let j = 0; j < f.count; j++) {
      const L = f.axes[3 * j] ?? 1;
      const I = f.axes[3 * j + 1] ?? 1;
      const S = f.axes[3 * j + 2] ?? 1;
      il += I / L;
      si += S / I;
      n++;
    }
    expect(n).toBeGreaterThan(10000);
    expect(Math.abs(il / n - 0.72)).toBeLessThan(0.02);
    expect(Math.abs(si / n - 0.5)).toBeLessThan(0.02);
  });

  it('es determinista', () => {
    const a = discretizeFragments(blocks(30, 1, 0.1, 0.6, 1.2), { budget: 3000 });
    const b = discretizeFragments(blocks(30, 1, 0.1, 0.6, 1.2), { budget: 3000 });
    expect(a.count).toBe(b.count);
    expect(Array.from(a.spread.slice(0, 300))).toEqual(Array.from(b.spread.slice(0, 300)));
  });

  it('bloques sin curva quedan como vóxel', () => {
    const bl = blocks(3, 1, 0.1, 0.6, 1.2);
    bl.curve?.fill(NaN);
    const f = discretizeFragments(bl);
    expect(f.count).toBe(0);
    expect(Number.isNaN(f.fineFraction[0] ?? 0)).toBe(true);
  });

  it('cada piedra aterriza donde la lleva su vuelo y su hueco final está cerca, sin volver', () => {
    const bl = blocks(40, 1, 0.1, 0.6, 1.2);
    // La pila (destinos) queda adelante, a 10 m en x, como en la realidad.
    for (let k = 0; k < bl.count; k++) bl.destination[3 * k] = (bl.origin[3 * k] ?? 0) + 10;
    const f = discretizeFragments(bl, { budget: 8000, spreadLimit: 1 });
    let back = 0;
    let stones = 0;
    for (let j = 0; j < f.count; j++) {
      const k = f.parent[j] ?? 0;
      const L = blockLanding(bl, k);
      // Aterrizaje = el del bloque + desfase + separación acotada (≤ 1 m + medio bloque).
      const d = Math.hypot((f.land[3 * j] ?? 0) - L.x, (f.land[3 * j + 1] ?? 0) - L.y);
      expect(d).toBeLessThanOrEqual(1 + Math.SQRT2 * 0.5 + 1e-6);
      if ((f.flags[j] ?? 0) & FRAGMENT_FINE) {
        expect(f.restPos[3 * j]).toBe(f.land[3 * j]);
        continue;
      }
      stones++;
      if ((f.restPos[3 * j] ?? 0) - (f.land[3 * j] ?? 0) < -2) back++;
    }
    expect(stones).toBeGreaterThan(1000);
    expect(back / stones).toBeLessThan(0.02);
  });
});
