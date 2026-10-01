import { describe, expect, it, vi } from 'vitest';
import { Engine } from './Engine';
import type { OrbitState } from './cameras/orbit';

// No necesita WebGL: ejercita la sincronización de cámara con la implementación real del motor.
interface CameraHarness {
  origin: { x: number; y: number; z: number };
  orbit: OrbitState | null;
  view: { centerX: number; centerY: number; metersPerPixel: number };
  viewMode: string;
  scene3dDirty: boolean;
  rebase: () => void;
  onDocumentChange: (change: object) => void;
}

describe('cámara al cambiar la geometría', () => {
  it('marca la escena nueva antes de que un reset pueda encuadrarla', () => {
    const engine = Object.create(Engine.prototype) as CameraHarness;
    Object.assign(engine, {
      viewMode: 'plan',
      scene3dDirty: false,
      onDocumentChangePlan: vi.fn(() => {
        expect(engine.scene3dDirty).toBe(true);
      }),
    });
    engine.onDocumentChange({ reset: true });
  });

  it.each(['plan', '3d'])('recentra UTM sin alejar la cámara (%s)', (mode) => {
    const engine = Object.create(Engine.prototype) as CameraHarness;
    const rebuild3d = vi.fn();
    const applyCamera3d = vi.fn();
    Object.assign(engine, {
      document: {
        project: { blasts: [{ holes: [{ collar: { x: 500000, y: 8000000, z: 3500 } }] }] },
      },
      origin: { x: 0, y: 0, z: 0 },
      orbit: {
        targetX: 500010,
        targetY: 8000020,
        targetZ: 3495,
        yaw: 1,
        pitch: 0.6,
        distance: 180,
      },
      view: { centerX: 500010, centerY: 8000020, metersPerPixel: 0.2 },
      viewMode: mode,
      scene3dDirty: false,
      rebuildAll: vi.fn(),
      rebuild3d,
      applyCamera3d,
    });
    engine.rebase();
    expect(engine.orbit).toMatchObject({
      targetX: 10,
      targetY: 20,
      targetZ: -5,
      distance: 180,
    });
    expect(engine.view.centerX + engine.origin.x).toBe(500010);
    expect(engine.view.centerY + engine.origin.y).toBe(8000020);
    expect(engine.scene3dDirty).toBe(true);
    expect(rebuild3d).toHaveBeenCalledTimes(mode === '3d' ? 1 : 0);
    expect(applyCamera3d).toHaveBeenCalledTimes(mode === '3d' ? 1 : 0);
  });

  it('un reset en 3D encuadra la escena nueva, sin secuencia ni pila del modelo anterior', () => {
    const engine = Object.create(Engine.prototype) as CameraHarness;
    let oldPile = true;
    let newScene = false;
    const fit3d = vi.fn(() => {
      expect(oldPile).toBe(false);
      expect(newScene).toBe(true);
      engine.orbit = {
        targetX: 0,
        targetY: 0,
        targetZ: 0,
        yaw: 1,
        pitch: 0.6,
        distance: 200,
      };
    });
    const stopSequence = vi.fn();
    Object.assign(engine, {
      document: { project: { coordinateSystem: { origin: { x: 500000, y: 8000000, z: 3500 } } } },
      viewMode: '3d',
      scene3dDirty: false,
      rebuildAll: vi.fn(),
      stopSequence,
      setMuckpile: vi.fn(() => {
        oldPile = false;
      }),
      rebuild3d: vi.fn(() => {
        engine.scene3dDirty = false;
        newScene = true;
      }),
      fit3d,
      applyCamera3d: vi.fn(),
    });
    engine.onDocumentChange({ reset: true });
    expect(fit3d).toHaveBeenCalledTimes(1);
    expect(stopSequence).toHaveBeenCalledTimes(1);
  });
});
