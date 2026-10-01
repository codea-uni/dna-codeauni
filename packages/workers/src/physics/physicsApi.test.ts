import { computeMuckpile } from '@cronos/core';
import { describe, expect, it } from 'vitest';
import { computeApi } from '../computeApi';
import { simulatePhysics } from './physicsApi';

describe('animación física de la pila (Rapier, A7 nivel 2)', () => {
  it('bloques en caída libre quedan apoyados sobre un piso plano', async () => {
    const ground = {
      originX: -20,
      originY: -20,
      cellSize: 2,
      nx: 21,
      ny: 21,
      values: new Float32Array(441).fill(100),
    };
    const n = 4;
    const r = await simulatePhysics({
      origin: { x: 0, y: 0, z: 100 },
      ground,
      blocks: {
        count: n,
        origin: Float64Array.from([0, 0, 105, 4, 0, 106, -4, 0, 104, 0, 4, 108]),
        velocity: new Float32Array(3 * n),
        launchTime: new Float64Array(n),
        height: new Float32Array(n).fill(1),
      },
      blockSize: 1,
      settleTime: 3,
    });
    expect(r.bodies).toBe(n);
    const last = r.frames - 1;
    for (let i = 0; i < n; i++) {
      const z = r.positions[3 * (last * n + i) + 2] ?? NaN;
      // Centro del cubo de 0,9 m apoyado en z = 0 (relativo al origen): ≈ 0,45 m.
      expect(z).toBeGreaterThan(0.3);
      expect(z).toBeLessThan(0.7);
    }
  });

  it('la pila del ejemplo se simula con la velocidad del modelo cinemático', async () => {
    const { project } = await computeApi.buildExample('muckpile');
    const blast = project.blasts[0];
    if (!blast) throw new Error('sin voladura');
    const m = computeMuckpile(project, blast.id);
    if (!m) throw new Error('sin pila');
    const r = await simulatePhysics({
      origin: project.coordinateSystem.origin,
      ground: m.grids.base,
      blocks: m.blocks,
      blockSize: blast.calcParams.muckpile.blockSize,
      maxBodies: 400,
      settleTime: 2,
    });
    expect(r.bodies).toBeLessThanOrEqual(400);
    // Al final, los bloques avanzaron hacia la cara libre (Norte, +y) en promedio.
    let dy = 0;
    for (let i = 0; i < r.bodies; i++) {
      const k = r.blockIndex[i] ?? 0;
      const y0 = (m.blocks.origin[3 * k + 1] ?? 0) - project.coordinateSystem.origin.y;
      dy += (r.positions[3 * ((r.frames - 1) * r.bodies + i) + 1] ?? 0) - y0;
    }
    expect(dy / r.bodies).toBeGreaterThan(1);
  }, 60_000);
});
