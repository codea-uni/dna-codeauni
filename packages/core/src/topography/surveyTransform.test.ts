import { describe, expect, it } from 'vitest';
import { decodeAsset, encodeAsset, type WorkingsData } from './asset';
import {
  isIdentityMove,
  moveBelowGround,
  moveBlocks,
  moveCentroidTo,
  moveCloud,
  moveImage,
  movePoint,
  moveSurveyParts,
  moveTin,
  moveWorkings,
  surveyPartsCentroid,
  type SurveyMove,
} from './surveyTransform';

const close = (a: number, b: number) => {
  expect(a).toBeCloseTo(b, 6);
};

const workings: WorkingsData = {
  vertices: new Float64Array([0, 0, 100, 10, 0, 100, 10, 10, 104, 0, 10, 104]),
  triangles: new Uint32Array([0, 1, 2, 0, 2, 3]),
  axisCoords: new Float64Array([0, 5, 100, 10, 5, 104]),
  axisOffsets: new Uint32Array([0, 2]),
  axes: [{ name: 'GAL 420', source: 'axis', profile: { kind: 'arched', width: 4, height: 4 } }],
};

describe('mover levantamientos', () => {
  it('traslada por un vector', () => {
    const m: SurveyMove = { dx: 100, dy: 200, dz: -80, rotationDeg: 0, pivot: { x: 0, y: 0 } };
    const p = movePoint({ x: 1, y: 2, z: 3 }, m);
    expect(p).toEqual({ x: 101, y: 202, z: -77 });
    expect(isIdentityMove(m)).toBe(false);
    expect(isIdentityMove({ ...m, dx: 0, dy: 0, dz: 0 })).toBe(true);
  });

  it('gira en planta en sentido horario alrededor del pivote', () => {
    const m: SurveyMove = { dx: 0, dy: 0, dz: 0, rotationDeg: 90, pivot: { x: 10, y: 10 } };
    // Un punto al Norte del pivote queda al Este.
    const p = movePoint({ x: 10, y: 20, z: 5 }, m);
    close(p.x, 20);
    close(p.y, 10);
    expect(p.z).toBe(5);
    // El pivote no se mueve.
    const q = movePoint({ x: 10, y: 10, z: 0 }, m);
    close(q.x, 10);
    close(q.y, 10);
  });

  it('centroide de labores, nube, bloques y TIN', () => {
    expect(surveyPartsCentroid({ workings })).toEqual({ x: 5, y: 5, z: 102 });
    expect(
      surveyPartsCentroid({
        cloud: {
          origin: [1000, 2000, 300],
          positions: new Float32Array([0, 0, 0, 2, 4, 6]),
          sourcePoints: 2,
        },
      }),
    ).toEqual({ x: 1001, y: 2002, z: 303 });
    expect(surveyPartsCentroid({})).toBeNull();
  });

  it('lleva el centroide a un punto y baja bajo el terreno', () => {
    const c = surveyPartsCentroid({ workings });
    if (!c) throw new Error('sin centroide');
    const m = moveCentroidTo(c, { x: 500, y: 600, z: 0 });
    const moved = moveWorkings(workings, m);
    expect(surveyPartsCentroid({ workings: moved })).toEqual({ x: 500, y: 600, z: 0 });
    // Terreno plano a 3800 m: el centroide queda 250 m debajo.
    const below = moveBelowGround(c, 250, () => 3800);
    if (!below) throw new Error('sin terreno');
    const w2 = moveWorkings(workings, below);
    expect(surveyPartsCentroid({ workings: w2 })?.z).toBeCloseTo(3550, 6);
    // Fuera de la topografía no hay movimiento.
    expect(moveBelowGround(c, 250, () => null)).toBeNull();
    // Nombres y perfiles se conservan; la entrada no cambia.
    expect(w2.axes).toEqual(workings.axes);
    expect(workings.vertices[0]).toBe(0);
  });

  it('el asset movido se codifica y decodifica igual', () => {
    const m: SurveyMove = { dx: 1, dy: 2, dz: 3, rotationDeg: 30, pivot: { x: 5, y: 5 } };
    const moved = moveWorkings(workings, m);
    const back = decodeAsset(encodeAsset({ kind: 'workings', workings: moved }));
    expect(back.kind).toBe('workings');
    if (back.kind === 'workings')
      expect(Array.from(back.workings.vertices)).toEqual(Array.from(moved.vertices));
  });

  it('nube: conserva la precisión con el origen movido', () => {
    const cloud = {
      origin: [300000, 8600000, 4000] as [number, number, number],
      positions: new Float32Array([0.25, 0.5, 0.125, 10.5, 20.25, 3]),
      colors: new Uint8Array([1, 2, 3, 4, 5, 6]),
      sourcePoints: 2,
    };
    const m: SurveyMove = { dx: 100.4, dy: -50.2, dz: -300, rotationDeg: 0, pivot: { x: 0, y: 0 } };
    const r = moveCloud(cloud, m);
    expect(r.origin).toEqual([300100, 8599949, 3700]);
    close(r.origin[0] + (r.positions[0] ?? 0), 300000.25 + 100.4);
    close(r.origin[1] + (r.positions[1] ?? 0), 8600000.5 - 50.2);
    expect(Array.from(r.colors ?? [])).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('modelo de bloques: centros movidos y giro del modelo', () => {
    const blocks = {
      centers: new Float64Array([0, 10, 0]),
      sizes: new Float32Array([5, 5, 5]),
      rotation: 0.1,
      numeric: [{ name: 'CU', values: new Float32Array([0.5]) }],
      categorical: [{ name: 'LITO', categories: ['AND'], codes: new Uint32Array([0]) }],
      densityAttribute: 'CU',
    };
    const r = moveBlocks(blocks, { dx: 0, dy: 0, dz: 0, rotationDeg: 90, pivot: { x: 0, y: 0 } });
    close(r.centers[0] ?? 0, 10);
    close(r.centers[1] ?? 0, 0);
    close(r.rotation, 0.1 - Math.PI / 2);
    expect(r.densityAttribute).toBe('CU');
    expect(r.numeric[0]?.values[0]).toBeCloseTo(0.5);
  });

  it('TIN, ortofoto y todas las partes juntas', () => {
    const tin = {
      vertices: new Float64Array([0, 0, 1, 1, 0, 1, 0, 1, 1]),
      triangles: new Uint32Array([0, 1, 2]),
    };
    const m: SurveyMove = { dx: 10, dy: 0, dz: 0, rotationDeg: 0, pivot: { x: 0, y: 0 } };
    expect(Array.from(moveTin(tin, m).vertices)).toEqual([10, 0, 1, 11, 0, 1, 10, 1, 1]);
    const image = {
      mime: 'image/png',
      width: 10,
      height: 10,
      georef: { originX: 0, originY: 10, pixelSizeX: 1, pixelSizeY: -1, rotation: 0 },
      bytes: new Uint8Array([1]),
    };
    const img = moveImage(image, { ...m, rotationDeg: 90 });
    close(img.georef.originX, 20);
    close(img.georef.originY, 0);
    close(img.georef.rotation, Math.PI / 2);
    const parts = moveSurveyParts({ tin, image }, m);
    expect(parts.tin?.vertices[0]).toBe(10);
    expect(parts.image?.georef.originX).toBe(10);
    expect(parts.cloud).toBeUndefined();
  });
});
