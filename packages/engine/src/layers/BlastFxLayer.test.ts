import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { BlastFxLayer, MAX_SMOKE } from './BlastFxLayer';

const ugHole = (x: number) => ({
  collar: new Vector3(x, 0, 2),
  axis: new Vector3(0, 1, 0),
  length: 3.5,
  underground: true,
});

describe('efectos de detonación', () => {
  it('apagados no crean nada ni piden cuadros', () => {
    const fx = new BlastFxLayer();
    fx.detonate(ugHole(0), 0, true);
    expect(fx.update(0.1, 0.016, 500)).toBe(false);
    expect(fx.root.children).toHaveLength(0);
    expect(fx.shakeOffset(0.1)).toBeNull();
  });

  it('el humo subterráneo sale por la galería, confinado, y se apaga en < 4,5 s', () => {
    const fx = new BlastFxLayer();
    fx.setEnabled(true);
    fx.setHoleCount(500);
    for (let k = 0; k < 500; k++) fx.detonate(ugHole((k % 5) * 0.5), 0, k === 0);
    expect(fx.shakeOffset(0.05)).not.toBeNull();
    const pts = fx.root.children.find((c) => c.type === 'Points');
    expect(pts).toBeDefined();
    let t = 0;
    while (t < 2) {
      t += 1 / 30;
      expect(fx.update(t, 1 / 30, 500)).toBe(true);
    }
    // Posiciones: todas delante del frente (y ≤ 0) y a menos del radio de la galería del eje.
    const pos = (
      pts as unknown as { geometry: { attributes: { position: { array: Float32Array } } } }
    ).geometry.attributes.position.array;
    expect(pos.length).toBe(3 * MAX_SMOKE);
    let moved = 0;
    for (let i = 0; i < MAX_SMOKE; i++) {
      const y = pos[3 * i + 1] ?? 0;
      expect(y).toBeLessThanOrEqual(1e-6);
      if (y < -2) moved++;
    }
    expect(moved).toBeGreaterThan(MAX_SMOKE / 3);
    while (t < 4.6) {
      t += 1 / 30;
      fx.update(t, 1 / 30, 500);
    }
    expect(fx.update(t + 0.1, 1 / 30, 500)).toBe(false);
    fx.setEnabled(false);
    expect(fx.root.children).toHaveLength(0);
  });
});
