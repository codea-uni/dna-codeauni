import { describe, expect, it, vi } from 'vitest';
import { Engine } from './Engine';
import type { Bounds3 } from '@cronos/core';
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
    const fitPlan = vi.fn();
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
      resetBuild: vi.fn(),
      setMuckpile: vi.fn(() => {
        oldPile = false;
      }),
      rebuild3d: vi.fn(() => {
        engine.scene3dDirty = false;
        newScene = true;
      }),
      fit3d,
      fitPlan,
      applyCamera3d: vi.fn(),
    });
    engine.onDocumentChange({ reset: true });
    expect(fit3d).toHaveBeenCalledTimes(1);
    expect(stopSequence).toHaveBeenCalledTimes(1);
    // La planta también queda encuadrada: al volver de 3D no aparece en otro lugar.
    expect(fitPlan).toHaveBeenCalledWith(false);
  });
});

/** Motor sin WebGL con lo que usan `fit3d`/`frameModels3d`/`zoomToFit` en planta. */
function framingEngine(opts: {
  design: Bounds3 | null;
  workings?: Bounds3[];
  models?: Bounds3[];
  topography?: Bounds3[];
}) {
  const engine = Object.create(Engine.prototype) as CameraHarness & {
    fit3d: () => void;
    frameModels3d: (surveyId?: string) => boolean;
    zoomToFit: (selectionOnly?: boolean) => void;
  };
  Object.assign(engine, {
    origin: { x: 0, y: 0, z: 0 },
    orbit: null,
    viewMode: '3d',
    width: 1200,
    height: 740,
    camera3d: { fov: 50 },
    scene3d: { designBounds: opts.design },
    workings3d: { items: opts.workings ?? [] },
    models3d: { items: opts.models ?? [] },
    topographyData: (opts.topography ?? []).map((bounds) => ({ bounds })),
    layerVisible: { workings: true, muckpile: false, muckpileBlocks: false },
    muckpileData: null,
    typicalSpacing: 1,
    decorations: { rulerInset: { left: 0, top: 0 } },
    document: { project: { blasts: [{ holes: [], boundaries: [] }] } },
    applyView: vi.fn(),
    applyCamera3d: vi.fn(),
    setViewMode: vi.fn(),
    loop: { invalidate: vi.fn() },
  });
  return engine;
}

const cube = (x: number, y: number, z: number, size: number): Bounds3 => ({
  minX: x,
  minY: y,
  minZ: z,
  maxX: x + size,
  maxY: y + size,
  maxZ: z + size,
});

describe('encuadre con levantamientos en UTM', () => {
  // Frente en coordenadas locales; labores y nube en UTM (render relativo al origen 0,0,0).
  const front = cube(-107, 0, -2, 4.3);
  const labores = cube(299_928, 8_599_950, 3_476, 150);
  const nube = cube(617_137, 7_759_507, 1_340, 300);

  it('fit3d encuadra el diseño y no se va «al infinito»', () => {
    const engine = framingEngine({ design: front, workings: [labores], models: [nube] });
    engine.fit3d();
    const o = engine.orbit;
    if (!o) throw new Error('sin órbita');
    expect(Number.isFinite(o.distance)).toBe(true);
    expect(o.distance).toBeLessThan(30);
    expect(o.targetX).toBeCloseTo(-104.85, 1);
  });

  it('sin diseño encuadra las labores (no las labores y la nube a 850 km)', () => {
    const engine = framingEngine({ design: null, workings: [labores], models: [nube] });
    engine.fit3d();
    const o = engine.orbit;
    if (!o) throw new Error('sin órbita');
    expect(o.distance).toBeLessThan(1_000);
    expect(o.targetX).toBeCloseTo(300_003, 0);
  });

  it('«Ver en 3D» de labores y nubes tampoco une sectores lejanos', () => {
    const engine = framingEngine({ design: front, workings: [labores], models: [nube] });
    expect(engine.frameModels3d()).toBe(true);
    expect(engine.orbit?.distance).toBeLessThan(1_000);
    expect(framingEngine({ design: front }).frameModels3d()).toBe(false);
  });

  it('en planta: frente subterráneo con sus fondos, sin la topografía lejana', () => {
    const engine = framingEngine({ design: null, topography: [labores, nube] });
    Object.assign(engine, { viewMode: 'plan' });
    // Fondos 4 m adelante (los taladros del frente van casi horizontales).
    const withToes = engine as unknown as { document: { project: { blasts: object[] } } };
    withToes.document.project.blasts = [
      {
        holes: [-105, -103].map((x) => ({
          collar: { x, y: 0, z: 0 },
          azimuth: 0,
          inclination: Math.PI / 2,
          length: 4,
          tags: ['ug-face'],
        })),
        boundaries: [],
      },
    ];
    engine.zoomToFit();
    expect(engine.view.centerX).toBeCloseTo(-104, 0);
    expect(engine.view.centerY).toBeGreaterThan(0.5);
    expect(engine.view.metersPerPixel).toBeLessThan(0.1);
  });

  it('en planta sin diseño: el primer levantamiento y los cercanos', () => {
    const engine = framingEngine({ design: null, topography: [labores, nube] });
    Object.assign(engine, { viewMode: 'plan' });
    engine.zoomToFit();
    expect(engine.view.centerX).toBeCloseTo(300_003, -1);
    expect(engine.view.metersPerPixel).toBeLessThan(1);
  });
});

describe('«Ver en 3D» de un levantamiento', () => {
  it('encuadra el levantamiento pedido aunque haya labores en otro sector', () => {
    const labores = { ...cube(299_928, 8_599_950, 3_476, 150), id: 'labores' };
    const nube = { ...cube(617_137, 7_759_507, 1_340, 300), id: 'nube' };
    const engine = framingEngine({ design: null, workings: [labores], models: [nube] });
    expect(engine.frameModels3d('nube')).toBe(true);
    expect(engine.orbit?.targetX).toBeCloseTo(617_287, 0);
    expect(engine.frameModels3d()).toBe(true);
    expect(engine.orbit?.targetX).toBeCloseTo(300_003, 0);
  });
});
