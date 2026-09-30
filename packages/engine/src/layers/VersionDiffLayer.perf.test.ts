import type { DiffMarker } from '@cronos/core';
import { describe, expect, it } from 'vitest';
import { VersionDiffLayer } from './VersionDiffLayer';

describe('VersionDiffLayer (rendimiento)', () => {
  it('arma 5.000 cambios en pocos milisegundos (se reconstruye al hacer zoom)', () => {
    const markers: DiffMarker[] = Array.from({ length: 5000 }, (_, i) => ({
      kind: (['added', 'removed', 'moved', 'changed'] as const)[i % 4] ?? 'added',
      holeId: String(i),
      label: String(i),
      position: { x: (i % 100) * 5, y: Math.floor(i / 100) * 5, z: 0 },
      from: { x: (i % 100) * 5, y: Math.floor(i / 100) * 5 - 1, z: 0 },
    }));
    const layer = new VersionDiffLayer();
    let best = Infinity;
    for (let k = 0; k < 5; k++) {
      const t0 = performance.now();
      layer.set(markers, { x: 0, y: 0, z: 0 }, 0.5);
      best = Math.min(best, performance.now() - t0);
    }
    expect(layer.vertexCount).toBeGreaterThan(5000 * 24);
    // Un cuadro a 60 fps dura 16,7 ms; la reconstrucción ocurre solo al cambiar el zoom > 5 %.
    expect(best).toBeLessThan(16);
  });
});
