import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
} from 'three';
import type { Vec3 } from '@cronos/core';

/**
 * Excavación subterránea de contexto (galería, tajeo) en 3D: secciones cerradas ordenadas a lo
 * largo del eje, en coordenadas de proyecto. Se dibujan las secciones, aristas longitudinales y,
 * si `surface`, una piel translúcida entre secciones contiguas.
 */
export interface TunnelView {
  id: string;
  /** Secciones (polilíneas cerradas sin repetir el primer vértice), todas con el mismo número de vértices. */
  sections: readonly (readonly Vec3[])[];
  /** Color #rrggbb. */
  color: number;
  surface?: boolean;
  /** Índice de una sección a resaltar (el frente), opcional. */
  highlight?: number;
}

/** Aristas longitudinales por sección (las demás vértices solo forman la piel). */
const LONGITUDINAL_EDGES = 16;

/** Capa de excavaciones; las coordenadas pasan a relativas al origen de render en float32. */
export class TunnelLayer {
  readonly root = new Group();
  private disposers: (() => void)[] = [];

  constructor() {
    this.root.name = 'tunnels';
  }

  set(tunnels: readonly TunnelView[], origin: Vec3): void {
    this.clear();
    for (const t of tunnels) this.build(t, origin);
  }

  private build(t: TunnelView, origin: Vec3): void {
    const secs = t.sections.filter((s) => s.length >= 3);
    const n = secs[0]?.length ?? 0;
    if (n < 3 || secs.some((s) => s.length !== n)) return;
    const rel = (p: Vec3): [number, number, number] => [
      p.x - origin.x,
      p.y - origin.y,
      p.z - origin.z,
    ];
    const lines: number[] = [];
    const strong: number[] = [];
    secs.forEach((s, j) => {
      const target = j === t.highlight || j === 0 || j === secs.length - 1 ? strong : lines;
      for (let i = 0; i < n; i++) target.push(...rel(s[i] as Vec3), ...rel(s[(i + 1) % n] as Vec3));
    });
    const step = Math.max(1, Math.round(n / LONGITUDINAL_EDGES));
    for (let j = 0; j + 1 < secs.length; j++) {
      const a = secs[j] as readonly Vec3[];
      const b = secs[j + 1] as readonly Vec3[];
      for (let i = 0; i < n; i += step) lines.push(...rel(a[i] as Vec3), ...rel(b[i] as Vec3));
    }
    this.addLines(lines, t.color, 0.45);
    this.addLines(strong, t.color, 0.95);
    if (t.surface && secs.length > 1) {
      const pos: number[] = [];
      for (let j = 0; j + 1 < secs.length; j++) {
        const a = secs[j] as readonly Vec3[];
        const b = secs[j + 1] as readonly Vec3[];
        for (let i = 0; i < n; i++) {
          const k = (i + 1) % n;
          pos.push(...rel(a[i] as Vec3), ...rel(b[i] as Vec3), ...rel(b[k] as Vec3));
          pos.push(...rel(a[i] as Vec3), ...rel(b[k] as Vec3), ...rel(a[k] as Vec3));
        }
      }
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new Float32BufferAttribute(pos, 3));
      const material = new MeshBasicMaterial({
        color: t.color,
        transparent: true,
        opacity: 0.1,
        side: DoubleSide,
        depthWrite: false,
      });
      const mesh = new Mesh(geometry, material);
      mesh.renderOrder = 2;
      this.root.add(mesh);
      this.disposers.push(() => {
        geometry.dispose();
        material.dispose();
      });
    }
  }

  private addLines(values: number[], color: number, opacity: number): void {
    if (values.length === 0) return;
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(values, 3));
    const material = new LineBasicMaterial({ color, transparent: opacity < 1, opacity });
    this.root.add(new LineSegments(geometry, material));
    this.disposers.push(() => {
      geometry.dispose();
      material.dispose();
    });
  }

  clear(): void {
    for (const d of this.disposers) d();
    this.disposers = [];
    this.root.clear();
  }

  dispose(): void {
    this.clear();
  }
}
