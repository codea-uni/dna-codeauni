import {
  applyChargeRule,
  createEmptyProject,
  createHole,
  DEFAULT_BENCH,
  DEFAULT_HOLE_TEMPLATE,
  newId,
} from '@blastlab/core';
import { Color, type InstancedMesh } from 'three';
import { describe, expect, it } from 'vitest';
import { EnergyLayer } from '../layers/EnergyLayer';
import { InitiationLayer } from '../layers/InitiationLayer';
import { IsochronesLayer } from '../layers/IsochronesLayer';
import { DEFAULT_3D_OPTIONS, Scene3D } from './Scene3D';

function project() {
  const p = createEmptyProject();
  const base = p.blasts[0];
  const anfo = p.library.explosives[0];
  const stem = p.library.stemmingMaterials[0];
  const c17 = p.library.surfaceConnectors[0];
  if (!base || !anfo || !stem || !c17) throw new Error('incompleto');
  const holes = [0, 6].map((x) => {
    const h = createHole({
      position: { x, y: 0 },
      template: DEFAULT_HOLE_TEMPLATE,
      bench: { ...DEFAULT_BENCH, floorElevation: 100 },
      label: String(x),
    });
    return {
      ...h,
      ...applyChargeRule(
        h,
        {
          stemmingLength: 4,
          stemmingMaterialId: stem.id,
          explosiveId: anfo.id,
          primerOffsetFromToe: 0.5,
        },
        p.library,
      ),
    };
  });
  const [a, b] = holes;
  if (!a || !b) throw new Error('faltan');
  const blast = {
    ...base,
    bench: { ...base.bench, floorElevation: 100 },
    holes,
    initiation: {
      ...base.initiation,
      connections: [
        {
          id: newId<'Connection'>(),
          from: { kind: 'hole' as const, holeId: a.id },
          to: { kind: 'hole' as const, holeId: b.id },
          connectorId: c17.id,
        },
      ],
      initiationPoints: [
        { id: newId<'InitiationPoint'>(), at: { kind: 'hole' as const, holeId: a.id }, time: 0 },
      ],
    },
  };
  return { ...p, blasts: [blast] };
}

function cylinders(scene: Scene3D): InstancedMesh {
  const found: InstancedMesh[] = [];
  scene.root.traverse((o) => {
    if ((o as Partial<InstancedMesh>).isInstancedMesh === true) found.push(o as InstancedMesh);
  });
  const m = found[0];
  if (!m) throw new Error('sin cilindros');
  return m;
}

describe('capas en 3D', () => {
  it('color por taladro: pinta la columna explosiva y conserva el taco; null restaura el material', () => {
    const p = project();
    const scene = new Scene3D();
    scene.rebuild(p, p.blasts, { x: 0, y: 0, z: 0 }, DEFAULT_3D_OPTIONS);
    const mesh = cylinders(scene);
    const before = new Color();
    const taco = new Color();
    mesh.getColorAt(0, before); // explosivo del taladro 1
    mesh.getColorAt(1, taco); // taco del taladro 1
    const red = new Color(1, 0, 0);
    const first = p.blasts[0]?.holes[0]?.id;
    scene.setColorSource((id) => (id === first ? red : null));
    const c = new Color();
    mesh.getColorAt(0, c);
    expect(c.equals(red)).toBe(true);
    mesh.getColorAt(1, c);
    expect(c.equals(taco)).toBe(true); // el taco no se pinta
    mesh.getColorAt(2, c);
    expect(c.equals(red)).toBe(false); // otro taladro: material
    scene.setColorSource(null);
    mesh.getColorAt(0, c);
    expect(c.equals(before)).toBe(true);
    // El color se conserva al reconstruir (p.ej. al cambiar el radio).
    scene.setColorSource(() => red);
    scene.rebuild(p, p.blasts, { x: 0, y: 0, z: 0 }, { ...DEFAULT_3D_OPTIONS, radiusScale: 3 });
    mesh.getColorAt(0, c);
    expect(c.equals(red)).toBe(true);
  });

  it('amarres en 3D a la cota de las bocas; en planta en z = 0', () => {
    const p = project();
    const layer = new InitiationLayer();
    const lines = layer.root.children[0] as unknown as {
      geometry: { getAttribute: (n: string) => { getZ: (i: number) => number; count: number } };
    };
    layer.rebuild(p.blasts, p.library, { x: 0, y: 0, z: 100 }, true);
    // Boca en z = 115 → relativo al origen de render 15, más 0.15 de separación
    expect(lines.geometry.getAttribute('position').getZ(0)).toBeCloseTo(15.15, 5);
    layer.rebuild(p.blasts, p.library, { x: 0, y: 0, z: 100 }, false);
    expect(lines.geometry.getAttribute('position').getZ(0)).toBe(0);
  });

  it('isócronas y mapas se ubican a su cota en 3D', () => {
    const iso = new IsochronesLayer();
    iso.set(
      { segments: new Float64Array([0, 0, 1, 1]), levels: new Float32Array([0.1]), min: 0, max: 1 },
      { x: 0, y: 0, z: 0 },
      15.25,
    );
    expect(iso.lines.position.z).toBe(15.25);
    const energy = new EnergyLayer();
    const data = {
      originX: 0,
      originY: 0,
      cellSize: 1,
      nx: 2,
      ny: 2,
      rgba: new Uint8Array(16),
      contours: { segments: new Float64Array(0), levels: new Float32Array(0) },
      colorMin: 0,
      colorMax: 1,
      colorLog: false,
      elevation: 107.5,
    };
    energy.set(data, { x: 0, y: 0, z: 100 }, true);
    // Plano (−0.5 dentro del grupo) a la cota evaluada: 107.5 − 100
    expect(energy.root.position.z - 0.5 + 0.5).toBeCloseTo(8, 6);
    energy.set(data, { x: 0, y: 0, z: 100 }, false);
    expect(energy.root.position.z).toBe(0);
  });
});
