import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
} from 'three';
import type { Blast, HoleId, ProductLibrary, Vec3 } from '@blastlab/core';
import { connectorColorHex } from './colormap';

const ARROW_AT = 0.62;

/**
 * Red de superficie: conexiones con flecha (color según retardo) y puntos de inicio.
 * Se reconstruye entera: miles de segmentos cuestan < 1 ms.
 */
export class InitiationLayer {
  readonly root = new Group();
  private readonly lines: LineSegments<BufferGeometry, LineBasicMaterial>;
  private readonly starts: LineSegments<BufferGeometry, LineBasicMaterial>;

  constructor() {
    this.lines = new LineSegments(
      new BufferGeometry(),
      new LineBasicMaterial({ vertexColors: true, depthTest: false }),
    );
    this.starts = new LineSegments(
      new BufferGeometry(),
      new LineBasicMaterial({ color: 0xff3b3b, depthTest: false }),
    );
    for (const obj of [this.lines, this.starts]) {
      obj.frustumCulled = false;
      obj.renderOrder = 1;
      this.root.add(obj);
    }
    this.starts.renderOrder = 4;
  }

  /** `use3d`: las líneas van a la cota de las bocas (vista 3D); si no, en z = 0 (planta). */
  rebuild(blasts: readonly Blast[], library: ProductLibrary, origin: Vec3, use3d = false): void {
    const delays = new Map(library.surfaceConnectors.map((c) => [c.id, c.delay]));
    const pos: number[] = [];
    const col: number[] = [];
    const startPos: number[] = [];
    const color = new Color();
    const lift = 0.15; // un poco sobre la boca para que no se hunda en la superficie
    for (const blast of blasts) {
      const at = new Map<HoleId, Vec3>();
      for (const h of blast.holes) {
        at.set(h.id, {
          x: h.collar.x - origin.x,
          y: h.collar.y - origin.y,
          z: use3d ? h.collar.z - origin.z + lift : 0,
        });
      }
      const nodes = new Map(
        blast.initiation.nodes.map((n) => [
          n.id,
          {
            x: n.position.x - origin.x,
            y: n.position.y - origin.y,
            z: use3d ? n.position.z - origin.z + lift : 0,
          },
        ]),
      );
      const resolve = (ref: Blast['initiation']['connections'][number]['from']) =>
        ref.kind === 'hole' ? at.get(ref.holeId) : nodes.get(ref.nodeId);
      const push = (x: number, y: number, z: number) => {
        pos.push(x, y, z);
        col.push(color.r, color.g, color.b);
      };
      for (const c of blast.initiation.connections) {
        const a = resolve(c.from);
        const b = resolve(c.to);
        if (!a || !b) continue;
        color.setHex(connectorColorHex(c.delayOverride ?? delays.get(c.connectorId) ?? 0));
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy);
        if (len === 0) continue;
        const ux = dx / len;
        const uy = dy / len;
        const tz = a.z + (b.z - a.z) * ARROW_AT;
        const tip = { x: a.x + dx * ARROW_AT, y: a.y + dy * ARROW_AT };
        const size = Math.min(len * 0.18, 1.2);
        push(a.x, a.y, a.z);
        push(b.x, b.y, b.z);
        push(tip.x, tip.y, tz);
        push(tip.x - ux * size - uy * size * 0.55, tip.y - uy * size + ux * size * 0.55, tz);
        push(tip.x, tip.y, tz);
        push(tip.x - ux * size + uy * size * 0.55, tip.y - uy * size - ux * size * 0.55, tz);
      }
      for (const ip of blast.initiation.initiationPoints) {
        const p = resolve(ip.at);
        if (!p) continue;
        // Estrella de 8 brazos de 1.6 m.
        const r = 1.6;
        for (let k = 0; k < 4; k++) {
          const ang = (k * Math.PI) / 4;
          startPos.push(
            p.x - Math.cos(ang) * r,
            p.y - Math.sin(ang) * r,
            p.z,
            p.x + Math.cos(ang) * r,
            p.y + Math.sin(ang) * r,
            p.z,
          );
        }
      }
    }
    this.lines.geometry.setAttribute('position', new Float32BufferAttribute(pos, 3));
    this.lines.geometry.setAttribute('color', new Float32BufferAttribute(col, 3));
    this.starts.geometry.setAttribute('position', new Float32BufferAttribute(startPos, 3));
  }

  dispose(): void {
    this.lines.geometry.dispose();
    this.lines.material.dispose();
    this.starts.geometry.dispose();
    this.starts.material.dispose();
  }
}
