import {
  AmbientLight,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshLambertMaterial,
  Shape,
  ShapeGeometry,
  Vector2,
  type Object3D,
} from 'three';
import {
  freeFaceQuads,
  holeSegments3d,
  holeToe,
  type Blast,
  type HoleId,
  type Project,
  type SegmentKind,
  type Vec3,
} from '@blastlab/core';
import { writeSegmentMatrix } from './segmentMatrix';

/** Colores de materiales (sRGB). Los explosivos se distinguen entre sí por la paleta cálida. */
export const MATERIAL_COLORS: Record<Exclude<SegmentKind, 'explosive'>, number> = {
  stemming: 0xb8a07a,
  air: 0x9fd3ff,
  water: 0x2f81f7,
  plug: 0x8b949e,
  empty: 0x3a4250,
};
export const EXPLOSIVE_PALETTE = [0xff7b39, 0xe5534b, 0xd29922, 0xdb61a2, 0xf0883e, 0xa371f7];

export function explosiveColorHex(index: number): number {
  return (
    EXPLOSIVE_PALETTE[
      ((index % EXPLOSIVE_PALETTE.length) + EXPLOSIVE_PALETTE.length) % EXPLOSIVE_PALETTE.length
    ] ?? 0xff7b39
  );
}

export function hexCss(hex: number): string {
  return `#${hex.toString(16).padStart(6, '0')}`;
}

export interface Scene3DOptions {
  /** Exageración del radio de los taladros (1 = real). */
  radiusScale: number;
  /** Radio mínimo visible [m]. */
  minRadius: number;
}

export const DEFAULT_3D_OPTIONS: Scene3DOptions = { radiusScale: 2, minRadius: 0.15 };

export interface Bounds3 {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

/**
 * Escena 3D del banco: taladros como cilindros instanciados coloreados por material, superficie y
 * piso del banco, caras de talud, topografía y perímetros. Coordenadas relativas al origen de render.
 */
export class Scene3D {
  readonly root = new Group();
  private readonly cylinderGeometry = new CylinderGeometry(1, 1, 1, 12, 1, false);
  private readonly cylinderMaterial = new MeshLambertMaterial({ color: 0xffffff });
  private cylinders: InstancedMesh | null = null;
  private capacity = 0;
  private readonly dynamic = new Group();
  bounds: Bounds3 | null = null;
  segmentCount = 0;
  private instanceHole: HoleId[] = [];
  private instancePaint = new Uint8Array(0);
  private baseColors = new Float32Array(0);
  private colorSource: ((id: HoleId) => Color | null) | null = null;

  constructor() {
    const ambient = new AmbientLight(0xffffff, 1.1);
    const sun = new DirectionalLight(0xffffff, 1.6);
    sun.position.set(0.4, -0.6, 1);
    const fill = new DirectionalLight(0xffffff, 0.5);
    fill.position.set(-0.5, 0.7, 0.3);
    this.root.add(ambient, sun, fill, this.dynamic);
    this.root.visible = false;
  }

  rebuild(project: Project, blasts: readonly Blast[], origin: Vec3, options: Scene3DOptions): void {
    this.clearDynamic();
    const explosiveIndex = new Map(project.library.explosives.map((e, i) => [e.id as string, i]));
    const b: Bounds3 = {
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
    const rel = (p: Vec3) => ({ x: p.x - origin.x, y: p.y - origin.y, z: p.z - origin.z });

    // ---------------------------------------------------------------- Taladros
    const segs: { from: Vec3; to: Vec3; r: number; color: number; hole: HoleId; paint: boolean }[] =
      [];
    for (const blast of blasts) {
      for (const h of blast.holes) {
        const r = Math.max(options.minRadius, (h.diameter / 2) * options.radiusScale);
        for (const s of holeSegments3d(h)) {
          const color =
            s.kind === 'explosive'
              ? explosiveColorHex(explosiveIndex.get(s.productId ?? '') ?? 0)
              : MATERIAL_COLORS[s.kind];
          // Tramo vacío más delgado: se lee como "perforado sin cargar".
          segs.push({
            from: rel(s.from),
            to: rel(s.to),
            r: s.kind === 'empty' ? r * 0.6 : r,
            color,
            hole: h.id,
            // Se colorea por tiempo/valor la columna explosiva (y el taladro vacío); taco y aire conservan su material.
            paint: s.kind === 'explosive' || s.kind === 'empty',
          });
        }
        const c = rel(h.collar);
        const t = rel(holeToe(h));
        grow(c.x, c.y, c.z);
        grow(t.x, t.y, t.z);
      }
    }
    this.segmentCount = segs.length;
    if (segs.length > this.capacity || !this.cylinders) {
      this.cylinders?.dispose();
      this.capacity = Math.max(1024, Math.ceil(segs.length * 1.5));
      this.cylinders = new InstancedMesh(
        this.cylinderGeometry,
        this.cylinderMaterial,
        this.capacity,
      );
      this.cylinders.instanceMatrix.setUsage(DynamicDrawUsage);
      this.cylinders.instanceColor = new InstancedBufferAttribute(
        new Float32Array(this.capacity * 3),
        3,
      ).setUsage(DynamicDrawUsage);
      this.cylinders.frustumCulled = false;
    }
    const mesh = this.cylinders;
    const m = mesh.instanceMatrix.array as Float32Array;
    const colors = mesh.instanceColor?.array as Float32Array | undefined;
    const tmp = new Color();
    segs.forEach((s, i) => {
      writeSegmentMatrix(m, i * 16, s.from, s.to, s.r);
      if (colors) {
        tmp.setHex(s.color);
        colors[i * 3] = tmp.r;
        colors[i * 3 + 1] = tmp.g;
        colors[i * 3 + 2] = tmp.b;
      }
    });
    this.instanceHole = segs.map((x) => x.hole);
    this.instancePaint = Uint8Array.from(segs, (x) => (x.paint ? 1 : 0));
    this.baseColors = new Float32Array(segs.length * 3);
    if (colors) this.baseColors.set(colors.subarray(0, segs.length * 3));
    mesh.count = segs.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    this.dynamic.add(mesh);

    // ---------------------------------------------------------------- Banco, caras y topografía
    for (const blast of blasts) {
      const top = blast.bench.floorElevation + blast.bench.height - origin.z;
      const floor = blast.bench.floorElevation - origin.z;
      const surface = project.surfaces.find((s) => s.id === blast.bench.topSurfaceId);
      let outlines = blast.boundaries
        .filter((x) => x.polygon.length >= 3)
        .map((x) => x.polygon.map((p) => ({ x: p.x - origin.x, y: p.y - origin.y })));
      if (outlines.length === 0 && Number.isFinite(b.minX)) {
        const pad = 5;
        outlines = [
          [
            { x: b.minX - pad, y: b.minY - pad },
            { x: b.maxX + pad, y: b.minY - pad },
            { x: b.maxX + pad, y: b.maxY + pad },
            { x: b.minX - pad, y: b.maxY + pad },
          ],
        ];
      }
      for (const poly of outlines) {
        for (const p of poly) {
          grow(p.x, p.y, top);
          grow(p.x, p.y, floor);
        }
        if (!surface) this.addFlat(poly, top, 0x6e7681, 0.28);
        this.addFlat(poly, floor, 0x30363d, 0.35);
        const lines: number[] = [];
        poly.forEach((p, i) => {
          const q = poly[(i + 1) % poly.length] ?? p;
          lines.push(p.x, p.y, top, q.x, q.y, top);
        });
        this.addLines(lines, 0xff7b54);
      }
      // Caras de talud (hacia donde se desplaza el material).
      const faceVerts: number[] = [];
      for (const boundary of blast.boundaries) {
        for (const q of freeFaceQuads(boundary, blast.bench)) {
          const [a, bb, c, d] = q.map(rel) as [Vec3, Vec3, Vec3, Vec3];
          faceVerts.push(
            a.x,
            a.y,
            a.z,
            bb.x,
            bb.y,
            bb.z,
            c.x,
            c.y,
            c.z,
            a.x,
            a.y,
            a.z,
            c.x,
            c.y,
            c.z,
            d.x,
            d.y,
            d.z,
          );
          for (const p of [c, d]) grow(p.x, p.y, p.z);
        }
      }
      if (faceVerts.length > 0) {
        const g = new BufferGeometry();
        g.setAttribute('position', new Float32BufferAttribute(faceVerts, 3));
        g.computeVertexNormals();
        this.dynamic.add(
          new Mesh(
            g,
            new MeshLambertMaterial({
              color: 0x8a6a4a,
              side: DoubleSide,
              transparent: true,
              opacity: 0.85,
            }),
          ),
        );
      }
      if (surface) this.addSurface(surface.vertices, surface.triangles, origin);
    }
    this.bounds = Number.isFinite(b.minX) ? b : null;
    this.refreshColors();
  }

  /** Color por taladro (tiempo, kg, secuencia…) para la columna explosiva; null = color del material. */
  setColorSource(source: ((id: HoleId) => Color | null) | null): void {
    this.colorSource = source;
    this.refreshColors();
  }

  refreshColors(): void {
    const mesh = this.cylinders;
    const colors = mesh?.instanceColor?.array as Float32Array | undefined;
    if (!mesh || !colors) return;
    const source = this.colorSource;
    for (let i = 0; i < this.instanceHole.length; i++) {
      const c = source && this.instancePaint[i] ? source(this.instanceHole[i] as HoleId) : null;
      if (c) {
        colors[i * 3] = c.r;
        colors[i * 3 + 1] = c.g;
        colors[i * 3 + 2] = c.b;
      } else {
        colors[i * 3] = this.baseColors[i * 3] ?? 0;
        colors[i * 3 + 1] = this.baseColors[i * 3 + 1] ?? 0;
        colors[i * 3 + 2] = this.baseColors[i * 3 + 2] ?? 0;
      }
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    this.clearDynamic();
    this.cylinders?.dispose();
    this.cylinderGeometry.dispose();
    this.cylinderMaterial.dispose();
  }

  private addFlat(
    poly: { x: number; y: number }[],
    z: number,
    color: number,
    opacity: number,
  ): void {
    const shape = new Shape(poly.map((p) => new Vector2(p.x, p.y)));
    const g = new ShapeGeometry(shape);
    const mesh = new Mesh(
      g,
      new MeshLambertMaterial({
        color,
        transparent: true,
        opacity,
        side: DoubleSide,
        depthWrite: false,
      }),
    );
    mesh.position.z = z;
    mesh.renderOrder = 1;
    this.dynamic.add(mesh);
  }

  private addLines(positions: number[], color: number): void {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(positions, 3));
    this.dynamic.add(new LineSegments(g, new LineBasicMaterial({ color })));
  }

  /** TIN coloreado por cota (verde bajo → marrón alto). */
  private addSurface(
    vertices: readonly number[],
    triangles: readonly number[],
    origin: Vec3,
  ): void {
    const n = vertices.length / 3;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    let zMin = Infinity;
    let zMax = -Infinity;
    for (let i = 0; i < n; i++) {
      const z = vertices[i * 3 + 2] ?? 0;
      zMin = Math.min(zMin, z);
      zMax = Math.max(zMax, z);
    }
    const low = new Color(0x4d7a4a);
    const high = new Color(0xb89868);
    const c = new Color();
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (vertices[i * 3] ?? 0) - origin.x;
      pos[i * 3 + 1] = (vertices[i * 3 + 1] ?? 0) - origin.y;
      pos[i * 3 + 2] = (vertices[i * 3 + 2] ?? 0) - origin.z;
      c.copy(low).lerp(
        high,
        zMax > zMin ? ((vertices[i * 3 + 2] ?? 0) - zMin) / (zMax - zMin) : 0.5,
      );
      col.set([c.r, c.g, c.b], i * 3);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new Float32BufferAttribute(col, 3));
    g.setIndex([...triangles]);
    g.computeVertexNormals();
    this.dynamic.add(
      new Mesh(
        g,
        new MeshLambertMaterial({
          vertexColors: true,
          side: DoubleSide,
          transparent: true,
          opacity: 0.8,
        }),
      ),
    );
  }

  private clearDynamic(): void {
    for (const child of [...this.dynamic.children] as Object3D[]) {
      this.dynamic.remove(child);
      if (child === this.cylinders) continue;
      if (child instanceof Mesh || child instanceof LineSegments) {
        (child.geometry as BufferGeometry).dispose();
        const mat = child.material as { dispose(): void } | { dispose(): void }[];
        if (Array.isArray(mat))
          mat.forEach((x) => {
            x.dispose();
          });
        else mat.dispose();
      }
    }
  }
}
