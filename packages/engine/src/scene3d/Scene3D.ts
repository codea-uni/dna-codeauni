import {
  AmbientLight,
  BufferAttribute,
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
  boundaryBench,
  freeFaceQuads,
  holeSegments3d,
  holeToe,
  type Blast,
  type HoleId,
  type Project,
  type SegmentKind,
  type Vec3,
  type TinData,
} from '@cronos/core';
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
  /** Opacidad de la topografía (0–1): deja ver los taladros bajo el terreno. */
  surfaceOpacity: number;
}

export const DEFAULT_3D_OPTIONS: Scene3DOptions = {
  radiusScale: 2,
  minRadius: 0.15,
  surfaceOpacity: 0.55,
};

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
  /** Caras libres (talud) y planos del banco (techo y piso): se pueden ocultar para ver la pila. */
  readonly faces = new Group();
  readonly benchPlanes = new Group();
  /**
   * Superficies topográficas, en caché por triangulación: no se reconstruyen en cada edición del
   * diseño (un TIN de millones de triángulos tarda), solo si cambian o cambia el origen.
   */
  private readonly surfaces = new Group();
  private readonly surfaceCache = new Map<TinData, Mesh<BufferGeometry, MeshLambertMaterial>>();
  private surfaceOrigin: Vec3 | null = null;
  /** Polígonos (coordenadas de proyecto) donde la topografía no se dibuja: la roca ya volada. */
  private surfaceMask: readonly (readonly { x: number; y: number }[])[] | null = null;
  private surfaceOpacity = DEFAULT_3D_OPTIONS.surfaceOpacity;
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
    this.root.add(ambient, sun, fill, this.dynamic, this.surfaces, this.faces, this.benchPlanes);
    this.root.visible = false;
  }

  /**
   * `tins`: triangulaciones de los levantamientos topográficos cargados, por id (D-16). La del
   * banco (`bench.topographyId`) reemplaza el plano superior.
   */
  rebuild(
    project: Project,
    blasts: readonly Blast[],
    origin: Vec3,
    options: Scene3DOptions,
    tins: ReadonlyMap<string, TinData> = new Map(),
  ): void {
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
    const wanted = new Set<TinData>();
    for (const blast of blasts) {
      const surface = blast.bench.topographyId ? tins.get(blast.bench.topographyId) : undefined;
      // Cada perímetro a la cota de su propio piso (pueden estar en bancos distintos del tajo).
      let outlines = blast.boundaries
        .filter((x) => x.polygon.length >= 3)
        .map((x) => ({
          poly: x.polygon.map((p) => ({ x: p.x - origin.x, y: p.y - origin.y })),
          bench: boundaryBench(blast.bench, x),
        }));
      if (outlines.length === 0 && Number.isFinite(b.minX)) {
        const pad = 5;
        outlines = [
          {
            poly: [
              { x: b.minX - pad, y: b.minY - pad },
              { x: b.maxX + pad, y: b.minY - pad },
              { x: b.maxX + pad, y: b.maxY + pad },
              { x: b.minX - pad, y: b.maxY + pad },
            ],
            bench: blast.bench,
          },
        ];
      }
      for (const { poly, bench } of outlines) {
        const top = bench.floorElevation + bench.height - origin.z;
        const floor = bench.floorElevation - origin.z;
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
        for (const q of freeFaceQuads(boundary, boundaryBench(blast.bench, boundary))) {
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
        this.faces.add(
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
      if (surface) wanted.add(surface);
    }
    // Si ningún banco usa un levantamiento, se dibujan los cargados como referencia; sin
    // taladros, su extensión decide el encuadre.
    if (wanted.size === 0) for (const tin of tins.values()) wanted.add(tin);
    this.surfaceOpacity = options.surfaceOpacity;
    this.syncSurfaces(wanted, origin);
    if (!Number.isFinite(b.minX))
      for (const tin of tins.values()) {
        const v = tin.vertices;
        for (let i = 0; i + 2 < v.length; i += 3)
          grow((v[i] ?? 0) - origin.x, (v[i + 1] ?? 0) - origin.y, (v[i + 2] ?? 0) - origin.z);
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
    for (const tin of [...this.surfaceCache.keys()]) this.dropSurface(tin);
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
    this.benchPlanes.add(mesh);
  }

  private addLines(positions: number[], color: number): void {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(positions, 3));
    this.dynamic.add(new LineSegments(g, new LineBasicMaterial({ color })));
  }

  /** Deja en escena exactamente las superficies pedidas, reutilizando las ya construidas. */
  private syncSurfaces(wanted: ReadonlySet<TinData>, origin: Vec3): void {
    const o = this.surfaceOrigin;
    if (o?.x !== origin.x || o.y !== origin.y || o.z !== origin.z) {
      for (const tin of [...this.surfaceCache.keys()]) this.dropSurface(tin);
      this.surfaceOrigin = { ...origin };
    }
    for (const tin of [...this.surfaceCache.keys()]) if (!wanted.has(tin)) this.dropSurface(tin);
    for (const tin of wanted) {
      let mesh = this.surfaceCache.get(tin);
      if (!mesh) {
        mesh = this.buildSurface(tin.vertices, tin.triangles, origin);
        this.surfaceCache.set(tin, mesh);
        this.surfaces.add(mesh);
        this.applyMask(tin, mesh);
      }
      mesh.material.opacity = this.surfaceOpacity;
    }
  }

  /**
   * Recorta la topografía (A7b): no dibuja los triángulos cuyo centro cae en alguno de los
   * polígonos (perímetros volados y su talud), para ver la pila donde antes estaba la roca.
   * `null` la vuelve a dibujar entera.
   */
  setSurfaceMask(polygons: readonly (readonly { x: number; y: number }[])[] | null): void {
    this.surfaceMask = polygons && polygons.length > 0 ? polygons : null;
    for (const [tin, mesh] of this.surfaceCache) this.applyMask(tin, mesh);
  }

  private applyMask(tin: TinData, mesh: Mesh<BufferGeometry, MeshLambertMaterial>): void {
    const tri = tin.triangles;
    const mask = this.surfaceMask;
    if (!mask) {
      mesh.geometry.setIndex(
        new BufferAttribute(tri instanceof Uint32Array ? tri : Uint32Array.from(tri), 1),
      );
      return;
    }
    const v = tin.vertices;
    const boxes = mask.map((poly) => {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const p of poly) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      }
      return { poly, minX, minY, maxX, maxY };
    });
    const keep = new Uint32Array(tri.length);
    let n = 0;
    for (let t = 0; t + 2 < tri.length; t += 3) {
      const a = (tri[t] ?? 0) * 3;
      const b = (tri[t + 1] ?? 0) * 3;
      const c = (tri[t + 2] ?? 0) * 3;
      const x = ((v[a] ?? 0) + (v[b] ?? 0) + (v[c] ?? 0)) / 3;
      const y = ((v[a + 1] ?? 0) + (v[b + 1] ?? 0) + (v[c + 1] ?? 0)) / 3;
      const cut = boxes.some(
        (m) => x >= m.minX && x <= m.maxX && y >= m.minY && y <= m.maxY && inside(x, y, m.poly),
      );
      if (cut) continue;
      keep[n++] = tri[t] ?? 0;
      keep[n++] = tri[t + 1] ?? 0;
      keep[n++] = tri[t + 2] ?? 0;
    }
    mesh.geometry.setIndex(new BufferAttribute(keep.slice(0, n), 1));
  }

  private dropSurface(tin: TinData): void {
    const mesh = this.surfaceCache.get(tin);
    if (!mesh) return;
    this.surfaces.remove(mesh);
    mesh.geometry.dispose();
    mesh.material.dispose();
    this.surfaceCache.delete(tin);
  }

  /** Opacidad de la topografía sin reconstruirla. */
  setSurfaceOpacity(opacity: number): void {
    this.surfaceOpacity = opacity;
    for (const mesh of this.surfaceCache.values()) {
      mesh.material.opacity = opacity;
      // Opaca del todo, escribe profundidad como un sólido; transparente, deja ver lo de abajo.
      mesh.material.transparent = opacity < 1;
      mesh.material.depthWrite = opacity >= 1;
      mesh.material.needsUpdate = true;
    }
  }

  /** TIN coloreado por cota (verde bajo → marrón alto). */
  private buildSurface(
    vertices: ArrayLike<number>,
    triangles: ArrayLike<number>,
    origin: Vec3,
  ): Mesh<BufferGeometry, MeshLambertMaterial> {
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
    // Índices como arreglo tipado, sin copiar a un arreglo de JS (TIN de cientos de miles).
    g.setIndex(
      new BufferAttribute(
        triangles instanceof Uint32Array ? triangles : Uint32Array.from(triangles),
        1,
      ),
    );
    g.computeVertexNormals();
    const opaque = this.surfaceOpacity >= 1;
    const mesh = new Mesh(
      g,
      new MeshLambertMaterial({
        vertexColors: true,
        side: DoubleSide,
        transparent: !opaque,
        opacity: this.surfaceOpacity,
        depthWrite: opaque,
      }),
    );
    // Después de los taladros (opacos): así se ven a través del terreno.
    mesh.renderOrder = 1;
    return mesh;
  }

  private clearDynamic(): void {
    for (const group of [this.faces, this.benchPlanes])
      for (const child of [...group.children] as Object3D[]) {
        group.remove(child);
        if (child instanceof Mesh) {
          (child.geometry as BufferGeometry).dispose();
          (child.material as { dispose(): void }).dispose();
        }
      }
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

/** Punto en polígono (par-impar). */
function inside(x: number, y: number, poly: readonly { x: number; y: number }[]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (!a || !b) continue;
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}
