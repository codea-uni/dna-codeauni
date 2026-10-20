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
 * color del escaneo). Las coordenadas se pasan a relativas al origen de render en float32.
 */
export class Model3dLayer {
  readonly root = new Group();
  private pointSize = 0.15;
  private disposers: (() => void)[] = [];
  bounds: Bounds3 | null = null;

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
    for (const c of clouds) {
      const pts = this.cloudPoints(c.cloud, origin);
      const bb = pts.geometry.boundingBox;
      if (bb) {
        grow(bb.min.x, bb.min.y, bb.min.z);
        grow(bb.max.x, bb.max.y, bb.max.z);
      }
      this.root.add(pts);
    }
    for (const m of blocks) {
      const mesh = this.blockMesh(m, origin);
      if (!mesh) continue;
      const bb = mesh.boundingBox;
      if (bb) {
        grow(bb.min.x, bb.min.y, bb.min.z);
        grow(bb.max.x, bb.max.y, bb.max.z);
      }
      this.root.add(mesh);
    }
    this.bounds = Number.isFinite(b.minX) ? b : null;
  }

  private cloudPoints(cloud: PointCloudData, origin: Vec3): Points {
    const dx = cloud.origin[0] - origin.x;
    const dy = cloud.origin[1] - origin.y;
    const dz = cloud.origin[2] - origin.z;
    const src = cloud.positions;
    const pos = new Float32Array(src.length);
    for (let i = 0; i < src.length; i += 3) {
      pos[i] = (src[i] ?? 0) + dx;
      pos[i + 1] = (src[i + 1] ?? 0) + dy;
      pos[i + 2] = (src[i + 2] ?? 0) + dz;
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(pos, 3));
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
    let k = 0;
    for (let i = 0; i < n; i++) {
      if (!m.visible[i]) continue;
      const c = m.blocks.centers;
      p.set(
        (c[i * 3] ?? 0) - origin.x,
        (c[i * 3 + 1] ?? 0) - origin.y,
        (c[i * 3 + 2] ?? 0) - origin.z,
      );
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
  }

  dispose(): void {
    this.clear();
  }
}
