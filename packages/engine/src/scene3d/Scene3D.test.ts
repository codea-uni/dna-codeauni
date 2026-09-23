import {
  applyChargeRule,
  createEmptyProject,
  createHole,
  DEFAULT_BENCH,
  DEFAULT_HOLE_TEMPLATE,
  newId,
  type Project,
} from '@blastlab/core';
import type { InstancedMesh } from 'three';
import { Color, Matrix4, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { DEFAULT_3D_OPTIONS, explosiveColorHex, MATERIAL_COLORS, Scene3D } from './Scene3D';

function projectWith(loaded: number, empty: number): Project {
  const p = createEmptyProject();
  const lib = p.library;
  const base = p.blasts[0];
  const anfo = lib.explosives[0];
  const stem = lib.stemmingMaterials[0];
  if (!base || !anfo || !stem) throw new Error('proyecto incompleto');
  const holes = Array.from({ length: loaded + empty }, (_, i) => {
    const h = createHole({
      position: { x: i * 6, y: 0 },
      template: DEFAULT_HOLE_TEMPLATE,
      bench: DEFAULT_BENCH,
      label: String(i + 1),
    });
    if (i >= loaded) return h;
    // Taco 4 m + aire 1 m + ANFO: 3 decks, sin tramo vacío.
    return {
      ...h,
      ...applyChargeRule(
        h,
        {
          stemmingLength: 4,
          airDeckLength: 1,
          stemmingMaterialId: stem.id,
          explosiveId: anfo.id,
          primerOffsetFromToe: 0.5,
        },
        lib,
      ),
    };
  });
  return {
    ...p,
    blasts: [
      {
        ...base,
        holes,
        boundaries: [
          {
            id: newId<'Boundary'>(),
            name: 'P1',
            polygon: [
              { x: -5, y: -5 },
              { x: 6 * (loaded + empty), y: -5 },
              { x: 6 * (loaded + empty), y: 5 },
              { x: -5, y: 5 },
            ],
            freeFaceEdges: [0],
          },
        ],
      },
    ],
  };
}

function cylinders(scene: Scene3D): InstancedMesh {
  const found: InstancedMesh[] = [];
  scene.root.traverse((o) => {
    if ((o as Partial<InstancedMesh>).isInstancedMesh === true) found.push(o as InstancedMesh);
  });
  const mesh = found[0];
  if (!mesh) throw new Error('sin cilindros');
  return mesh;
}

describe('escena 3D', () => {
  it('un cilindro por deck y uno para cada taladro sin carga', () => {
    const p = projectWith(3, 2);
    const scene = new Scene3D();
    scene.rebuild(p, p.blasts, { x: 0, y: 0, z: 0 }, DEFAULT_3D_OPTIONS);
    expect(scene.segmentCount).toBe(3 * 3 + 2);
    expect(cylinders(scene).count).toBe(11);
  });

  it('colores: explosivo con la paleta, sin cargar en gris', () => {
    const p = projectWith(1, 1);
    const scene = new Scene3D();
    scene.rebuild(p, p.blasts, { x: 0, y: 0, z: 0 }, DEFAULT_3D_OPTIONS);
    const mesh = cylinders(scene);
    const c = new Color();
    mesh.getColorAt(0, c); // primer tramo del primer taladro: el explosivo (fondo)
    expect(c.getHex()).toBe(new Color(explosiveColorHex(0)).getHex());
    mesh.getColorAt(3, c); // taladro sin carga
    expect(c.getHex()).toBe(new Color(MATERIAL_COLORS.empty).getHex());
  });

  it('las matrices ubican el explosivo entre las cotas correctas', () => {
    const p = projectWith(1, 0);
    const scene = new Scene3D();
    scene.rebuild(p, p.blasts, { x: 0, y: 0, z: 0 }, DEFAULT_3D_OPTIONS);
    const m = new Matrix4();
    cylinders(scene).getMatrixAt(0, m);
    // ANFO: de 5 m (taco 4 + aire 1) a 16.5 m de profundidad → z de 10 a −1.5
    const top = new Vector3(0, -0.5, 0).applyMatrix4(m);
    const bottom = new Vector3(0, 0.5, 0).applyMatrix4(m);
    expect(top.z).toBeCloseTo(10, 4);
    expect(bottom.z).toBeCloseTo(-1.5, 4);
  });

  it('límites incluyen banco, fondos y pie del talud (origen de render restado)', () => {
    const p = projectWith(2, 0);
    const scene = new Scene3D();
    scene.rebuild(p, p.blasts, { x: 100, y: 0, z: 10 }, DEFAULT_3D_OPTIONS);
    const b = scene.bounds;
    if (!b) throw new Error('sin límites');
    expect(b.maxZ).toBeCloseTo(15 - 10);
    expect(b.minZ).toBeCloseTo(-1.5 - 10);
    expect(b.minX).toBeCloseTo(-5 - 100);
    // Pie del talud Sur: 15 / tan 75° = 4.02 m más allá del perímetro
    expect(b.minY).toBeCloseTo(-5 - 15 / Math.tan((75 * Math.PI) / 180), 3);
  });

  it('reconstruir reutiliza el buffer y no acumula objetos', () => {
    const p = projectWith(2, 2);
    const scene = new Scene3D();
    scene.rebuild(p, p.blasts, { x: 0, y: 0, z: 0 }, DEFAULT_3D_OPTIONS);
    let before = 0;
    scene.root.traverse(() => before++);
    scene.rebuild(p, p.blasts, { x: 0, y: 0, z: 0 }, { ...DEFAULT_3D_OPTIONS, radiusScale: 4 });
    let after = 0;
    scene.root.traverse(() => after++);
    expect(after).toBe(before);
  });
});
