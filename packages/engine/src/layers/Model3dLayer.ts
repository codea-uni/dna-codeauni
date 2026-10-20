import {
  BoxGeometry,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Matrix4,
  MeshLambertMaterial,
  Points,
  PointsMaterial,
  Quaternion,
  Uint8BufferAttribute,
  Vector3,
} from 'three';
import type { BlockModelData, Bounds3, PointCloudData, Vec3 } from '@cronos/core';

/** Nube de puntos de un levantamiento, lista para dibujar. */
export interface PointCloudView {
  id: string;
  cloud: PointCloudData;
}

/** Modelo de bloques con el color y la visibilidad de cada bloque (ver `colorBlocks`). */
export interface BlockModelView {
  id: string;
  blocks: BlockModelData;
  colors: Uint8Array;
  visible: Uint8Array;
  /** 0–1. */
  opacity: number;
}

/**
 * Nubes de puntos y modelos de bloques en 3D (sin triangular: conservan túneles, voladizos y el
 * color del escaneo). Los vértices quedan relativos a un ancla propia de cada objeto (float32 con
 * precisión milimétrica) y el desplazamiento al origen de render va en la posición del objeto
 * (float64 en three): una nube en UTM lejos del diseño ya no se dibuja «en escalones» de 0,5–1 m.
 */
export class Model3dLayer {
  readonly root = new Group();
  private pointSize = 0.15;
  private disposers: (() => void)[] = [];
  bounds: Bounds3 | null = null;
  /** Caja de cada nube y modelo (render), para encuadrar sin unir sectores lejanos. */
  items: (Bounds3 & { id: string })[] = [];

  constructor() {
    this.root.name = 'models3d';
  }

  /** Tamaño de los puntos [m] (a escala real; se ven más chicos a lo lejos). */
  setPointSize(size: number): void {
    this.pointSize = size;
    for (const c of this.root.children)
      if (c instanceof Points) (c.material as PointsMaterial).size = size;
  }

  set(clouds: readonly PointCloudView[], blocks: readonly BlockModelView[], origin: Vec3): void {
    this.clear();
    const b = {
      minX: Infinity,
      minY: Infinity,
      minZ: Infinity,
      maxX: -Infinity,
      maxY: -Infinity,
      maxZ: -Infinity,
    };
    const grow = (x: number, y: number, z: number) => {
      b.minX = Math.min(b.minX, x);
      b.minY = Math.min(b.minY, y);
      b.minZ = Math.min(b.minZ, z);
      b.maxX = Math.max(b.maxX, x);
      b.maxY = Math.max(b.maxY, y);
      b.maxZ = Math.max(b.maxZ, z);
    };
    const items: (Bounds3 & { id: string })[] = [];
    const add = (id: string, bb: { min: Vector3; max: Vector3 } | null, at: Vector3): void => {
      if (!bb || !Number.isFinite(bb.min.x) || !Number.isFinite(bb.max.x)) return;
      const box = {
        id,
        minX: bb.min.x + at.x,
        minY: bb.min.y + at.y,
        minZ: bb.min.z + at.z,
        maxX: bb.max.x + at.x,
        maxY: bb.max.y + at.y,
        maxZ: bb.max.z + at.z,
      };
      items.push(box);
      grow(box.minX, box.minY, box.minZ);
      grow(box.maxX, box.maxY, box.maxZ);
    };
    for (const c of clouds) {
      const pts = this.cloudPoints(c.cloud, origin);
      add(c.id, pts.geometry.boundingBox, pts.position);
      this.root.add(pts);
    }
    for (const m of blocks) {
      const mesh = this.blockMesh(m, origin);
      if (!mesh) continue;
      add(m.id, mesh.boundingBox, mesh.position);
      this.root.add(mesh);
    }
    this.items = items;
    this.bounds = Number.isFinite(b.minX) ? b : null;
  }

  private cloudPoints(cloud: PointCloudData, origin: Vec3): Points {
    const dx = cloud.origin[0] - origin.x;
    const dy = cloud.origin[1] - origin.y;
    const dz = cloud.origin[2] - origin.z;
    // Los puntos ya vienen relativos al origen de la nube: se quedan así y la nube se desplaza.
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(cloud.positions, 3));
    if (cloud.colors)
      geometry.setAttribute('color', new Uint8BufferAttribute(cloud.colors, 3, true));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const material = new PointsMaterial({
      size: this.pointSize,
      sizeAttenuation: true,
      vertexColors: cloud.colors !== undefined,
      color: cloud.colors ? 0xffffff : 0xb8c4cc,
    });
    const points = new Points(geometry, material);
    points.name = 'pointCloud';
    points.position.set(dx, dy, dz);
    this.disposers.push(() => {
      geometry.dispose();
      material.dispose();
    });
    return points;
  }

  private blockMesh(m: BlockModelView, origin: Vec3): InstancedMesh | null {
    const n = m.blocks.centers.length / 3;
    let shown = 0;
    for (let i = 0; i < n; i++) if (m.visible[i]) shown++;
    if (shown === 0) return null;
    const geometry = new BoxGeometry(1, 1, 1);
    const material = new MeshLambertMaterial({
      transparent: m.opacity < 1,
      opacity: m.opacity,
      depthWrite: m.opacity >= 1,
    });
    const mesh = new InstancedMesh(geometry, material, shown);
    mesh.name = 'blockModel';
    const q = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), m.blocks.rotation);
    const mat = new Matrix4();
    const p = new Vector3();
    const s = new Vector3();
    const color = new Color();
    const c = m.blocks.centers;
    // Ancla: el primer bloque (en float64); cada bloque relativo a ella.
    const ax = c[0] ?? 0;
    const ay = c[1] ?? 0;
    const az = c[2] ?? 0;
    mesh.position.set(ax - origin.x, ay - origin.y, az - origin.z);
    let k = 0;
    for (let i = 0; i < n; i++) {
      if (!m.visible[i]) continue;
      p.set((c[i * 3] ?? 0) - ax, (c[i * 3 + 1] ?? 0) - ay, (c[i * 3 + 2] ?? 0) - az);
      // Un poco menores que la celda: se distinguen los bordes de cada bloque.
      const z = m.blocks.sizes;
      s.set((z[i * 3] ?? 1) * 0.96, (z[i * 3 + 1] ?? 1) * 0.96, (z[i * 3 + 2] ?? 1) * 0.96);
      mat.compose(p, q, s);
      mesh.setMatrixAt(k, mat);
      color.setRGB(
        (m.colors[i * 3] ?? 180) / 255,
        (m.colors[i * 3 + 1] ?? 180) / 255,
        (m.colors[i * 3 + 2] ?? 180) / 255,
      );
      color.convertSRGBToLinear();
      mesh.setColorAt(k, color);
      k++;
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    this.disposers.push(() => {
      geometry.dispose();
      material.dispose();
      mesh.dispose();
    });
    return mesh;
  }

  clear(): void {
    for (const d of this.disposers) d();
    this.disposers = [];
    this.root.clear();
    this.bounds = null;
    this.items = [];
  }

  dispose(): void {
    this.clear();
  }
}
