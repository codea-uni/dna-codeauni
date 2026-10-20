import {
  applyChargeRule,
  createEmptyProject,
  createHole,
  DEFAULT_BENCH,
  DEFAULT_HOLE_TEMPLATE,
  newId,
  type Project,
  type TopographySurveyId,
} from '@cronos/core';
import type { InstancedMesh } from 'three';
import { Color, Matrix4, Quaternion, Vector3 } from 'three';
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

  it('la topografía se reutiliza entre ediciones y su opacidad cambia sin reconstruir', () => {
    const p = projectWith(1, 1);
    const tin = {
      vertices: Float64Array.from([0, 0, 15, 20, 0, 15, 0, 20, 16]),
      triangles: Uint32Array.from([0, 1, 2]),
    };
    const tins = new Map([['s1', tin]]);
    const origin = { x: 0, y: 0, z: 0 };
    const scene = new Scene3D();
    const surfaces = () =>
      scene.root.children
        .flatMap((c) => c.children)
        // La superficie es la única malla indexada con el triángulo del TIN.
        .filter(
          (c) =>
            (c as unknown as { geometry?: { index?: { count: number } | null } }).geometry?.index
              ?.count === 3,
        );
    scene.rebuild(p, p.blasts, origin, DEFAULT_3D_OPTIONS, tins);
    const first = surfaces()[0];
    scene.rebuild(p, p.blasts, origin, DEFAULT_3D_OPTIONS, tins);
    expect(surfaces()).toEqual([first]);
    scene.setSurfaceOpacity(0.3);
    expect((first as unknown as { material: { opacity: number } }).material.opacity).toBe(0.3);
    scene.rebuild(p, p.blasts, origin, DEFAULT_3D_OPTIONS, new Map());
    expect(surfaces()).toHaveLength(0);
  });

  it('con el terreno del banco, la cara libre y el techo siguen el relieve (no la cota del banco)', () => {
    const base = projectWith(2, 0);
    const blast = base.blasts[0];
    if (!blast) throw new Error('sin voladura');
    const p = {
      ...base,
      blasts: [{ ...blast, bench: { ...blast.bench, topographyId: 's1' as TopographySurveyId } }],
    };
    // Terreno: plano z = 15 + 0,1·x − 0,2·y (el banco plano estaría a z = 15).
    const ground = (x: number, y: number) => 15 + 0.1 * x - 0.2 * y;
    const tin = {
      vertices: Float64Array.from([
        -50,
        -50,
        ground(-50, -50),
        50,
        -50,
        ground(50, -50),
        0,
        50,
        ground(0, 50),
      ]),
      triangles: Uint32Array.from([0, 1, 2]),
    };
    const origin = { x: 1, y: 2, z: 3 };
    const scene = new Scene3D();
    scene.rebuild(
      p,
      p.blasts,
      origin,
      DEFAULT_3D_OPTIONS,
      new Map([['s1', tin]]),
      new Map([['s1', ground]]),
    );
    const vertices = (group: { children: unknown[] }) =>
      group.children.flatMap((c) => {
        const mesh = c as {
          position: { z: number };
          geometry: { getAttribute(n: string): { array: ArrayLike<number> } };
        };
        const pos = mesh.geometry.getAttribute('position').array;
        return Array.from({ length: pos.length / 3 }, (_, i) => ({
          x: (pos[i * 3] ?? 0) + origin.x,
          y: (pos[i * 3 + 1] ?? 0) + origin.y,
          z: (pos[i * 3 + 2] ?? 0) + mesh.position.z + origin.z,
        }));
      });
    const face = vertices(scene.faces);
    expect(face.length).toBeGreaterThan(10);
    for (const v of face) expect(v.z).toBeCloseTo(ground(v.x, v.y), 4);
    // Techo apoyado en el terreno (además del piso plano de referencia a la cota del piso).
    const planes = vertices(scene.benchPlanes);
    const onGround = planes.filter((v) => Math.abs(v.z - ground(v.x, v.y)) < 1e-4);
    const atFloor = planes.filter((v) => Math.abs(v.z - DEFAULT_BENCH.floorElevation) < 1e-4);
    expect(onGround.length).toBeGreaterThan(10);
    expect(onGround.length + atFloor.length).toBe(planes.length);
  });

  it('sin terreno la cara libre es el talud analítico: de la cresta (piso + H) al pie (piso)', () => {
    const p = projectWith(2, 0);
    const scene = new Scene3D();
    scene.rebuild(p, p.blasts, { x: 0, y: 0, z: 0 }, DEFAULT_3D_OPTIONS);
    const zs = scene.faces.children.flatMap((c) =>
      Array.from(
        (
          c as unknown as { geometry: { getAttribute(n: string): { array: ArrayLike<number> } } }
        ).geometry.getAttribute('position').array,
      ).filter((_, i) => i % 3 === 2),
    );
    const top = DEFAULT_BENCH.floorElevation + DEFAULT_BENCH.height;
    expect(Math.max(...zs)).toBeCloseTo(top, 4);
    expect(Math.min(...zs)).toBeCloseTo(DEFAULT_BENCH.floorElevation, 4);
  });
});

describe('grosor de los taladros en 3D', () => {
  it('diámetro real × factor (sin mínimo fijo de 15 cm) y al menos lo que pide la cámara', () => {
    const p = projectWith(1, 1);
    const blast = p.blasts[0];
    if (!blast) throw new Error('sin voladura');
    // Taladros de frente: 45 mm.
    const thin = {
      ...p,
      blasts: [{ ...blast, holes: blast.holes.map((h) => ({ ...h, diameter: 0.045 })) }],
    };
    const scene = new Scene3D();
    scene.rebuild(thin, thin.blasts, { x: 0, y: 0, z: 0 }, DEFAULT_3D_OPTIONS);
    const radii = [...scene.segmentRadii];
    // Cargado: 0.0225 × 2; vacío: × 0,6.
    expect(Math.max(...radii)).toBeCloseTo(0.045, 4);
    expect(Math.min(...radii)).toBeCloseTo(0.027, 4);
    // La cámara se aleja: 1 px = 0,3 m; los vacíos siguen más delgados.
    expect(scene.setViewMinRadius(0.3)).toBe(true);
    expect(Math.max(...scene.segmentRadii)).toBeCloseTo(0.3, 4);
    expect(Math.min(...scene.segmentRadii)).toBeCloseTo(0.18, 4);
    const m = new Matrix4();
    cylinders(scene).getMatrixAt(0, m);
    const s = new Vector3();
    m.decompose(new Vector3(), new Quaternion(), s);
    expect(Math.abs(s.x)).toBeCloseTo(0.3, 4);
    // Un cambio menor al 10 % no reescribe; volver cerca recupera el diámetro real.
    expect(scene.setViewMinRadius(0.31)).toBe(false);
    expect(scene.setViewMinRadius(0.001)).toBe(true);
    expect(Math.max(...scene.segmentRadii)).toBeCloseTo(0.045, 4);
    // Una reconstrucción conserva el mínimo de la cámara.
    scene.setViewMinRadius(0.2);
    scene.rebuild(thin, thin.blasts, { x: 0, y: 0, z: 0 }, DEFAULT_3D_OPTIONS);
    expect(Math.max(...scene.segmentRadii)).toBeCloseTo(0.2, 4);
  });

  it('la extensión del diseño no incluye la topografía de referencia', () => {
    const p = projectWith(1, 0);
    const scene = new Scene3D();
    scene.rebuild(p, p.blasts, { x: 0, y: 0, z: 0 }, DEFAULT_3D_OPTIONS);
    expect(scene.designBounds).toEqual(scene.bounds);
    const empty = { ...p, blasts: p.blasts.map((b) => ({ ...b, holes: [], boundaries: [] })) };
    scene.rebuild(empty, empty.blasts, { x: 0, y: 0, z: 0 }, DEFAULT_3D_OPTIONS);
    expect(scene.designBounds).toBeNull();
  });
});
