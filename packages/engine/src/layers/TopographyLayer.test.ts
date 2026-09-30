import type { LineSegments, Mesh } from 'three';
import { Color, SRGBColorSpace } from 'three';
import { describe, expect, it } from 'vitest';
import { TOPO_LINE_COLORS, TopographyLayer, type TopographyViewData } from './TopographyLayer';

const ORIGIN = { x: 345_000, y: 8_512_000, z: 4000 };
const data: TopographyViewData = {
  id: 's1',
  bounds: {
    minX: 345_000,
    minY: 8_512_000,
    minZ: 4000,
    maxX: 345_020,
    maxY: 8_512_010,
    maxZ: 4010,
  },
  // Ráster de 4 × 2 píxeles de 5 m con la esquina superior izquierda en (345 000, 8 512 010).
  shade: {
    rgba: new Uint8ClampedArray(4 * 2 * 4),
    width: 4,
    height: 2,
    georef: { originX: 345_000, originY: 8_512_010, pixelSizeX: 5, pixelSizeY: -5, rotation: 0 },
  },
  contours: {
    segments: Float64Array.from([
      345_000, 8_512_000, 345_010, 8_512_000, 345_000, 8_512_005, 345_010, 8_512_005,
    ]),
    levels: Float64Array.from([4001, 4005]),
    major: Uint8Array.from([0, 1]),
  },
  // Una cresta cerrada de 3 puntos (3 segmentos) y un pie abierto de 2 (1 segmento).
  lines: {
    coords: Float64Array.from([
      345_000, 8_512_000, 0, 345_010, 8_512_000, 0, 345_010, 8_512_010, 0, 345_000, 8_512_001, 0,
      345_020, 8_512_001, 0,
    ]),
    offsets: Uint32Array.from([0, 3, 5]),
    roles: Uint8Array.from([1, 2]),
    closed: Uint8Array.from([1, 0]),
  },
};

const geometryOf = (o: unknown) => (o as Mesh | LineSegments).geometry;

describe('TopographyLayer', () => {
  it('ubica el sombreado por su esquina y relativo al origen, con la fila 0 arriba', () => {
    const layer = new TopographyLayer();
    layer.set([data], ORIGIN);
    const mesh = layer.shadeRoot.children[0] as Mesh;
    expect(mesh.scale.x).toBe(20);
    expect(mesh.scale.y).toBe(10);
    expect(mesh.position.x).toBe(10); // centro: 345 010 − origen
    expect(mesh.position.y).toBe(5);
    // PlaneGeometry: el vértice 0 es la esquina superior izquierda; tras invertir V, toma la fila 0.
    expect(geometryOf(mesh).getAttribute('uv').getY(0)).toBe(0);
  });

  it('curvas menores y maestras por separado; líneas por rol con la cresta cerrada', () => {
    const layer = new TopographyLayer();
    layer.set([data], ORIGIN);
    expect(layer.contourRoot.children).toHaveLength(2);
    const lines = geometryOf(layer.lineRoot.children[0]);
    expect(lines.getAttribute('position').count).toBe((3 + 1) * 2);
    const crest = new Color().setHex(TOPO_LINE_COLORS.crest, SRGBColorSpace);
    expect(lines.getAttribute('color').getX(0)).toBeCloseTo(crest.r, 6);
    // El último segmento de la cresta cierra del punto 3 al 1.
    const pos = lines.getAttribute('position');
    expect([pos.getX(4), pos.getY(4), pos.getX(5), pos.getY(5)]).toEqual([10, 10, 0, 0]);
  });

  it('la ortofoto va sobre el relieve, ubicada por su esquina', () => {
    const layer = new TopographyLayer();
    const bitmap = { width: 100, height: 50 } as unknown as ImageBitmap;
    layer.set(
      [
        {
          ...data,
          image: {
            bitmap,
            width: 100,
            height: 50,
            // 0,5 m por píxel: 50 × 25 m con la esquina superior izquierda en (345 000, 8 512 025).
            georef: {
              originX: 345_000,
              originY: 8_512_025,
              pixelSizeX: 0.5,
              pixelSizeY: -0.5,
              rotation: 0,
            },
          },
        },
      ],
      ORIGIN,
    );
    const mesh = layer.imageRoot.children[0] as Mesh;
    expect([mesh.scale.x, mesh.scale.y]).toEqual([50, 25]);
    expect([mesh.position.x, mesh.position.y]).toEqual([25, 12.5]);
    expect(layer.imageRoot.renderOrder).toBeGreaterThan(layer.shadeRoot.renderOrder);
  });

  it('volver a cargar reemplaza lo anterior', () => {
    const layer = new TopographyLayer();
    layer.set([data], ORIGIN);
    layer.set([], ORIGIN);
    expect(layer.shadeRoot.children).toHaveLength(0);
    expect(layer.contourRoot.children).toHaveLength(0);
    expect(layer.lineRoot.children).toHaveLength(0);
  });
});
