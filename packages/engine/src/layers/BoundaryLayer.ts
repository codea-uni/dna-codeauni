import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
} from 'three';
import { outwardNormal, polygonEdge, type Blast, type BoundaryId, type Vec3 } from '@blastlab/core';

/** Paleta de perímetros (sRGB). El índice es el orden en la voladura. */
const PALETTE = [0xff7b54, 0xd2a8ff, 0x56d4dd, 0xe3b341, 0x7ee787, 0xff9bce, 0x79c0ff];

export function boundaryColorHex(index: number): number {
  return PALETTE[index % PALETTE.length] ?? 0xff7b54;
}

export function boundaryColorCss(index: number): string {
  return `#${boundaryColorHex(index).toString(16).padStart(6, '0')}`;
}

/** Separación y largos de las marcas de talud en la cara libre [m]. */
const HATCH_STEP = 2;
const HATCH_LONG = 1.6;
const HATCH_SHORT = 0.8;

/**
 * Perímetros de voladura: contorno con el color del perímetro, marcas de talud en las caras
 * libres (hacia donde se desplaza el material) y vértices del perímetro activo.
 * Se reconstruye entero: son pocos vértices.
 */
export class BoundaryLayer {
  readonly root = new Group();
  private readonly lines: LineSegments<BufferGeometry, LineBasicMaterial>;

  constructor() {
    this.lines = new LineSegments(
      new BufferGeometry(),
      new LineBasicMaterial({ vertexColors: true, depthTest: false }),
    );
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 1;
    this.root.add(this.lines);
  }

  /** `vertexSize` = semilado del marcador de vértice [m] (depende del zoom). */
  rebuild(
    blasts: readonly Blast[],
    origin: Vec3,
    active: BoundaryId | null,
    vertexSize: number,
  ): void {
    const pos: number[] = [];
    const col: number[] = [];
    const color = new Color();
    const seg = (ax: number, ay: number, bx: number, by: number) => {
      pos.push(ax - origin.x, ay - origin.y, 0, bx - origin.x, by - origin.y, 0);
      col.push(color.r, color.g, color.b, color.r, color.g, color.b);
    };
    for (const blast of blasts) {
      blast.boundaries.forEach((boundary, index) => {
        const poly = boundary.polygon;
        if (poly.length < 2) return;
        const isActive = boundary.id === active;
        color.setHex(boundaryColorHex(index));
        if (!isActive && active !== null) color.multiplyScalar(0.75);
        for (let i = 0; i < poly.length; i++) {
          const e = polygonEdge(poly, i);
          if (!e) continue;
          const [a, b] = e;
          seg(a.x, a.y, b.x, b.y);
          if (!boundary.freeFaceEdges.includes(i)) continue;
          // Símbolo de talud: marcas perpendiculares hacia afuera, alternando largas y cortas.
          const n = outwardNormal(poly, i);
          const len = Math.hypot(b.x - a.x, b.y - a.y);
          if (!n || len === 0) continue;
          const count = Math.max(1, Math.floor(len / HATCH_STEP));
          const step = len / count;
          for (let k = 0; k <= count; k++) {
            const t = (k * step) / len;
            const px = a.x + (b.x - a.x) * t;
            const py = a.y + (b.y - a.y) * t;
            const l = k % 2 === 0 ? HATCH_LONG : HATCH_SHORT;
            seg(px, py, px + n.x * l, py + n.y * l);
          }
          // Doble línea en la cresta para que la cara libre se distinga aun sin zoom.
          seg(a.x + n.x * 0.15, a.y + n.y * 0.15, b.x + n.x * 0.15, b.y + n.y * 0.15);
        }
        if (isActive) {
          const s = vertexSize;
          for (const p of poly) {
            seg(p.x - s, p.y - s, p.x + s, p.y - s);
            seg(p.x + s, p.y - s, p.x + s, p.y + s);
            seg(p.x + s, p.y + s, p.x - s, p.y + s);
            seg(p.x - s, p.y + s, p.x - s, p.y - s);
          }
        }
      });
    }
    this.lines.geometry.setAttribute('position', new Float32BufferAttribute(pos, 3));
    this.lines.geometry.setAttribute('color', new Float32BufferAttribute(col, 3));
  }

  dispose(): void {
    this.lines.geometry.dispose();
    this.lines.material.dispose();
  }
}
