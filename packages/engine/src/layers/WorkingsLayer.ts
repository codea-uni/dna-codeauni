import {
  BufferGeometry,
  DoubleSide,
  EdgesGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshLambertMaterial,
  Uint32BufferAttribute,
  type Raycaster,
} from 'three';
import type { Bounds3, Vec3 } from '@cronos/core';

/** Labores subterráneas de un levantamiento (malla en coordenadas de proyecto). */
export interface WorkingsView {
  id: string;
  vertices: Float64Array;
  triangles: Uint32Array;
  /** Color #rrggbb. */
  color: number;
  /** 0–1 (0,25). */
  opacity?: number;
}

/**
 * Labores subterráneas reales (túneles, galerías, rampas) en 3D: piel semitransparente con sus
 * aristas marcadas y, si se pide, el contorno de la sección del frente elegido. Las coordenadas se
 * pasan a relativas al origen de render en float32.
 */
export class WorkingsLayer {
  readonly root = new Group();
  private meshes: Mesh[] = [];
  private disposers: (() => void)[] = [];
  private sectionDisposer: (() => void) | null = null;
  private section: LineSegments | null = null;
  /** Caja envolvente en coordenadas de render (relativas al origen). */
  bounds: Bounds3 | null = null;

  constructor() {
    this.root.name = 'workings';
  }

  set(views: readonly WorkingsView[], origin: Vec3): void {
    this.clear();
    const b = {
      minX: Infinity,
      minY: Infinity,
      minZ: Infinity,
      maxX: -Infinity,
      maxY: -Infinity,
      maxZ: -Infinity,
    };
    for (const v of views) {
      if (v.triangles.length < 3) continue;
      const pos = new Float32Array(v.vertices.length);
      for (let i = 0; i + 2 < v.vertices.length; i += 3) {
        const x = (v.vertices[i] ?? 0) - origin.x;
        const y = (v.vertices[i + 1] ?? 0) - origin.y;
        const z = (v.vertices[i + 2] ?? 0) - origin.z;
        pos[i] = x;
        pos[i + 1] = y;
        pos[i + 2] = z;
        b.minX = Math.min(b.minX, x);
        b.minY = Math.min(b.minY, y);
        b.minZ = Math.min(b.minZ, z);
        b.maxX = Math.max(b.maxX, x);
        b.maxY = Math.max(b.maxY, y);
        b.maxZ = Math.max(b.maxZ, z);
      }
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new Float32BufferAttribute(pos, 3));
      geometry.setIndex(new Uint32BufferAttribute(v.triangles, 1));
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
      const material = new MeshLambertMaterial({
        color: v.color,
        transparent: true,
        opacity: v.opacity ?? 0.25,
        side: DoubleSide,
        depthWrite: false,
      });
      const mesh = new Mesh(geometry, material);
      mesh.name = v.id;
      mesh.renderOrder = 2;
      this.root.add(mesh);
      this.meshes.push(mesh);
      // Aristas marcadas (cambio de dirección > 25°): secciones, hastiales y bordes del sólido.
      const edges = new EdgesGeometry(geometry, 25);
      const lineMat = new LineBasicMaterial({ color: v.color, transparent: true, opacity: 0.55 });
      this.root.add(new LineSegments(edges, lineMat));
      this.disposers.push(() => {
        geometry.dispose();
        material.dispose();
        edges.dispose();
        lineMat.dispose();
      });
    }
    this.bounds = Number.isFinite(b.minX) ? b : null;
    if (this.section) this.root.add(this.section);
  }

  /**
   * Contorno de la sección del frente (pares de puntos en coordenadas de proyecto); null lo quita.
   */
  setSection(segments: readonly Vec3[] | null, origin: Vec3, color = 0xff3b30): void {
    this.sectionDisposer?.();
    this.sectionDisposer = null;
    if (this.section) this.root.remove(this.section);
    this.section = null;
    if (!segments || segments.length < 2) return;
    const pos: number[] = [];
    for (const p of segments) pos.push(p.x - origin.x, p.y - origin.y, p.z - origin.z);
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(pos, 3));
    const material = new LineBasicMaterial({ color, depthTest: false });
    const lines = new LineSegments(geometry, material);
    lines.renderOrder = 10;
    this.section = lines;
    this.root.add(lines);
    this.sectionDisposer = () => {
      geometry.dispose();
      material.dispose();
    };
  }

  /** Primer punto de las labores que toca el rayo (coordenadas de render) o null. */
  raycast(raycaster: Raycaster): { x: number; y: number; z: number } | null {
    if (!this.root.visible) return null;
    const hit = raycaster.intersectObjects(this.meshes, false)[0];
    return hit ? { x: hit.point.x, y: hit.point.y, z: hit.point.z } : null;
  }

  clear(): void {
    for (const d of this.disposers) d();
    this.disposers = [];
    this.meshes = [];
    this.root.clear();
    this.bounds = null;
  }

  dispose(): void {
    this.clear();
    this.sectionDisposer?.();
    this.sectionDisposer = null;
    this.section = null;
  }
}
