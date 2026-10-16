import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
} from 'three';
import type { Blast, HoleId, ProductLibrary, Vec3 } from '@cronos/core';
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
  /** Vértices de conexiones (6 por conexión), ordenadas por la llegada de la señal. */
  private vertexCount = 0;

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
      const delayOf = (c: Blast['initiation']['connections'][number]) =>
        c.delayOverride ?? delays.get(c.connectorId) ?? 0;
      // En el orden en que llega la señal (para dibujar el amarre como se propaga).
      const arrival = signalArrival(blast, delayOf);
      const key = (ref: Blast['initiation']['connections'][number]['from']) =>
        ref.kind === 'hole' ? `h${ref.holeId}` : `n${ref.nodeId}`;
      const ordered = [...blast.initiation.connections].sort(
        (p, q) =>
          (arrival.get(key(p.from)) ?? Infinity) - (arrival.get(key(q.from)) ?? Infinity) ||
          delayOf(p) - delayOf(q),
      );
      for (const c of ordered) {
        const a = resolve(c.from);
        const b = resolve(c.to);
        if (!a || !b) continue;
        color.setHex(connectorColorHex(delayOf(c)));
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
    this.vertexCount = pos.length / 3;
    this.lines.geometry.setAttribute('position', new Float32BufferAttribute(pos, 3));
    this.lines.geometry.setDrawRange(0, Infinity);
    this.lines.geometry.setAttribute('color', new Float32BufferAttribute(col, 3));
    this.starts.geometry.setAttribute('position', new Float32BufferAttribute(startPos, 3));
  }

  /** Cantidad de conexiones dibujadas. */
  get connectionCount(): number {
    return this.vertexCount / 6;
  }

  /** Pintado en vivo: dibuja solo la fracción `t` (0–1) del amarre, en orden de la señal. */
  setReveal(t: number): void {
    const n = Math.floor(this.connectionCount * Math.min(1, Math.max(0, t)));
    this.lines.geometry.setDrawRange(0, t >= 1 ? Infinity : n * 6);
  }

  dispose(): void {
    this.lines.geometry.dispose();
    this.lines.material.dispose();
    this.starts.geometry.dispose();
    this.starts.material.dispose();
  }
}

/**
 * Llegada de la señal de superficie a cada nodo (taladro `h<id>` o nodo `n<id>`) desde los puntos de
 * inicio, sumando el retardo de cada conector (camino más corto; para ordenar el dibujo).
 */
function signalArrival(
  blast: Blast,
  delayOf: (c: Blast['initiation']['connections'][number]) => number,
): Map<string, number> {
  const key = (ref: Blast['initiation']['connections'][number]['from']) =>
    ref.kind === 'hole' ? `h${ref.holeId}` : `n${ref.nodeId}`;
  const out = new Map<string, { to: string; d: number }[]>();
  for (const c of blast.initiation.connections) {
    const k = key(c.from);
    let list = out.get(k);
    if (!list) out.set(k, (list = []));
    list.push({ to: key(c.to), d: Math.max(0, delayOf(c)) });
  }
  const time = new Map<string, number>();
  const queue: { k: string; t: number }[] = [];
  for (const ip of blast.initiation.initiationPoints) {
    const k = key(ip.at);
    if ((time.get(k) ?? Infinity) <= ip.time) continue;
    time.set(k, ip.time);
    queue.push({ k, t: ip.time });
  }
  const heap = new MinHeap();
  for (const q of queue) heap.push(q);
  for (let cur = heap.pop(); cur; cur = heap.pop()) {
    if (cur.t > (time.get(cur.k) ?? Infinity)) continue;
    for (const e of out.get(cur.k) ?? []) {
      const t = cur.t + e.d;
      if (t < (time.get(e.to) ?? Infinity)) {
        time.set(e.to, t);
        heap.push({ k: e.to, t });
      }
    }
  }
  return time;
}

/** Montículo binario mínimo por tiempo. */
class MinHeap {
  private readonly a: { k: string; t: number }[] = [];

  push(x: { k: string; t: number }): void {
    const a = this.a;
    a.push(x);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      const ap = a[p];
      if (!ap || ap.t <= x.t) break;
      a[i] = ap;
      i = p;
    }
    a[i] = x;
  }

  pop(): { k: string; t: number } | undefined {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length === 0 || !last) return top;
    let i = 0;
    for (;;) {
      const l = 2 * i + 1;
      if (l >= a.length) break;
      const r = l + 1;
      const al = a[l];
      const ar = a[r];
      const c = ar && al && ar.t < al.t ? r : l;
      const ac = a[c];
      if (!ac || ac.t >= last.t) break;
      a[i] = ac;
      i = c;
    }
    a[i] = last;
    return top;
  }
}
