import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DataTexture,
  DoubleSide,
  FrontSide,
  Float32BufferAttribute,
  Group,
  LinearFilter,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  RGBAFormat,
  SRGBColorSpace,
} from 'three';
import { turboRgb, type Ground, type TinData, type Vec3 } from '@cronos/core';

/** Raster coloreado (calculado en el worker) + contornos, en coordenadas de proyecto. */
export interface EnergyData {
  originX: number;
  originY: number;
  cellSize: number;
  nx: number;
  ny: number;
  rgba: Uint8Array;
  contours: { segments: Float64Array; levels: Float32Array };
  colorMin: number;
  colorMax: number;
  colorLog: boolean;
  /** Cota del plano evaluado [m] (se usa en 3D). */
  elevation?: number;
  /**
   * Valores evaluados sobre el terreno (vibración en los receptores, energía «sobre el terreno»):
   * en 3D el mapa se apoya en el relieve. `false` = corte horizontal a `elevation`.
   */
  onTerrain?: boolean;
}

/** Vértices por lado de la malla apoyada en el terreno (el color va en la textura completa). */
const DRAPE_RES = 256;
/** Separación sobre el terreno [m]: el mapa se ve encima sin parpadear. */
const DRAPE_LIFT = 0.3;
/** Largo máximo de un tramo de curva apoyado en el terreno [m] (sigue el relieve entre celdas). */
const CONTOUR_STEP = 2;

/** Mapa de calor de energía con sus contornos, debajo de los taladros. */
export class EnergyLayer {
  readonly root = new Group();
  private readonly plane: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private readonly lines: LineSegments<BufferGeometry, LineBasicMaterial>;
  /** El mismo mapa apoyado en el terreno (3D con levantamiento). */
  private readonly drape: Mesh<BufferGeometry, MeshBasicMaterial>;
  private texture: DataTexture | null = null;

  constructor() {
    this.plane = new Mesh(
      new PlaneGeometry(1, 1),
      new MeshBasicMaterial({
        transparent: true,
        opacity: 0.6,
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.plane.frustumCulled = false;
    this.plane.renderOrder = -5;
    this.plane.visible = false;
    this.lines = new LineSegments(
      new BufferGeometry(),
      new LineBasicMaterial({ vertexColors: true, depthTest: false }),
    );
    this.lines.frustumCulled = false;
    this.lines.renderOrder = -4;
    this.drape = new Mesh(
      new BufferGeometry(),
      new MeshBasicMaterial({
        transparent: true,
        opacity: 0.9,
        side: DoubleSide,
        // Escribe profundidad: el mapa del fondo no se ve a través del de adelante ni del relieve.
        depthWrite: true,
        // Lo transparente del mapa (fuera de su escala) no escribe profundidad: no tapa los taladros.
        alphaTest: 0.02,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4,
      }),
    );
    this.drape.frustumCulled = false;
    this.drape.renderOrder = 3;
    this.drape.visible = false;
    this.root.add(this.plane, this.lines, this.drape);
  }

  setOpacity(opacity: number): void {
    this.plane.material.opacity = opacity;
    // Sobre el relieve, casi sólido: los colores no se mezclan con el terreno ni con lo de atrás.
    this.drape.material.opacity = Math.min(1, opacity + 0.3);
  }

  /**
   * `use3d`: el mapa se ubica a su cota (`elevation`); en planta queda bajo los taladros. Con
   * `ground` y valores sobre el terreno (`onTerrain`), en 3D se apoya en el relieve; con `tin`, el
   * relleno se pinta sobre la misma malla del levantamiento (las rocas no lo atraviesan).
   */
  set(
    data: EnergyData | null,
    origin: Vec3,
    use3d = false,
    ground: Ground | null = null,
    tin: TinData | null = null,
  ): void {
    const draped = use3d && !!ground && data?.onTerrain === true;
    this.root.position.z =
      use3d && !draped && data?.elevation !== undefined ? data.elevation - origin.z + 0.5 : 0;
    this.drape.visible = false;
    this.plane.material.side = use3d ? DoubleSide : FrontSide;
    // En 3D el mapa se intersecta con los taladros; en planta queda siempre debajo.
    this.plane.material.depthTest = use3d;
    this.lines.material.depthTest = use3d;
    this.texture?.dispose();
    this.texture = null;
    if (!data || data.nx === 0) {
      this.plane.visible = false;
      this.lines.geometry.setAttribute('position', new Float32BufferAttribute([], 3));
      return;
    }
    const tex = new DataTexture(data.rgba, data.nx, data.ny, RGBAFormat);
    tex.colorSpace = SRGBColorSpace;
    tex.magFilter = LinearFilter;
    tex.minFilter = LinearFilter;
    tex.needsUpdate = true;
    this.texture = tex;
    this.plane.material.map = tex;
    this.plane.material.needsUpdate = true;
    const w = data.nx * data.cellSize;
    const h = data.ny * data.cellSize;
    this.plane.scale.set(w, h, 1);
    this.plane.position.set(data.originX + w / 2 - origin.x, data.originY + h / 2 - origin.y, -0.5);
    this.plane.visible = !draped;
    if (draped) this.buildDrape(data, origin, ground, tex, tin);

    const flatZ = data.elevation ?? null;
    const { segments, levels } = data.contours;
    const n = levels.length;
    const pos: number[] = [];
    const col: number[] = [];
    const c = new Color();
    const lo = data.colorLog ? Math.log(Math.max(data.colorMin, 1e-9)) : data.colorMin;
    const hi = data.colorLog ? Math.log(Math.max(data.colorMax, 1e-9)) : data.colorMax;
    for (let k = 0; k < n; k++) {
      const x1 = segments[k * 4] ?? 0;
      const y1 = segments[k * 4 + 1] ?? 0;
      const x2 = segments[k * 4 + 2] ?? 0;
      const y2 = segments[k * 4 + 3] ?? 0;
      const v = levels[k] ?? 0;
      const t = hi > lo ? ((data.colorLog ? Math.log(Math.max(v, 1e-9)) : v) - lo) / (hi - lo) : 1;
      // Contornos más claros que el relleno para que se lean encima.
      const [r, g, b] = turboRgb(t);
      c.setRGB(r / 255, g / 255, b / 255, SRGBColorSpace).lerp(new Color(0xffffff), 0.35);
      if (!draped) {
        pos.push(x1 - origin.x, y1 - origin.y, 0, x2 - origin.x, y2 - origin.y, 0);
        col.push(c.r, c.g, c.b, c.r, c.g, c.b);
        continue;
      }
      // Sobre el relieve, en tramos cortos para que sigan el terreno entre celdas; fuera del
      // levantamiento, planas a la cota del mapa (sin cota, el tramo no se dibuja).
      const parts = Math.min(
        8,
        Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / CONTOUR_STEP)),
      );
      for (let i = 0; i < parts; i++) {
        const ax = x1 + ((x2 - x1) * i) / parts;
        const ay = y1 + ((y2 - y1) * i) / parts;
        const bx = x1 + ((x2 - x1) * (i + 1)) / parts;
        const by = y1 + ((y2 - y1) * (i + 1)) / parts;
        const za = ground(ax, ay) ?? flatZ;
        const zb = ground(bx, by) ?? flatZ;
        if (za === null || zb === null) continue;
        const lift = DRAPE_LIFT + 0.1 - origin.z;
        pos.push(ax - origin.x, ay - origin.y, za + lift, bx - origin.x, by - origin.y, zb + lift);
        col.push(c.r, c.g, c.b, c.r, c.g, c.b);
      }
    }
    this.lines.geometry.setAttribute('position', new Float32BufferAttribute(pos, 3));
    this.lines.geometry.setAttribute('color', new Float32BufferAttribute(col, 3));
  }

  /**
   * Malla del mapa sobre el terreno, con coordenadas de textura desde X e Y:
   * - con `tin`, la misma malla del levantamiento levantada `DRAPE_LIFT` (exacta: ninguna roca la
   *   atraviesa), y la retícula solo donde falta el levantamiento;
   * - sin `tin`, una retícula de hasta `DRAPE_RES` vértices por lado con la cota del terreno.
   * Fuera del levantamiento (que puede ser mucho más chico que el mapa) la retícula sigue plana a la
   * cota del mapa, `elevation`, para que el mapa se vea completo; sin esa cota, ahí no se dibuja.
   */
  private buildDrape(
    data: EnergyData,
    origin: Vec3,
    ground: Ground,
    tex: DataTexture,
    tin: TinData | null,
  ): void {
    const w = data.nx * data.cellSize;
    const h = data.ny * data.cellSize;
    const pos: number[] = [];
    const uv: number[] = [];
    const index: number[] = [];
    const vertex = (x: number, y: number, z: number) => {
      pos.push(x - origin.x, y - origin.y, z - origin.z + DRAPE_LIFT);
      uv.push((x - data.originX) / w, (y - data.originY) / h);
    };
    if (tin) {
      const v = tin.vertices;
      for (let i = 0; i + 2 < v.length; i += 3) vertex(v[i] ?? 0, v[i + 1] ?? 0, v[i + 2] ?? 0);
      // Triángulos fuera del mapa: no se dibujan (la textura repetiría su borde).
      const inside = (q: number) => {
        const u = uv[q * 2] ?? -1;
        const t = uv[q * 2 + 1] ?? -1;
        return u >= 0 && u <= 1 && t >= 0 && t <= 1;
      };
      const tris = tin.triangles;
      for (let i = 0; i + 2 < tris.length; i += 3) {
        const a = tris[i] ?? 0;
        const b = tris[i + 1] ?? 0;
        const c = tris[i + 2] ?? 0;
        if (inside(a) || inside(b) || inside(c)) index.push(a, b, c);
      }
    }
    const base = pos.length / 3;
    const cols = Math.min(DRAPE_RES, data.nx) + 1;
    const rows = Math.min(DRAPE_RES, data.ny) + 1;
    // 0 = sin cota, 1 = sobre el levantamiento, 2 = fuera (plana a `elevation`).
    const kind = new Uint8Array(cols * rows);
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < cols; i++) {
        const x = data.originX + (i / (cols - 1)) * w;
        const y = data.originY + (j / (rows - 1)) * h;
        const z = ground(x, y);
        const flat = data.elevation ?? null;
        kind[j * cols + i] = z !== null ? 1 : flat !== null ? 2 : 0;
        vertex(x, y, z ?? flat ?? 0);
      }
    for (let j = 0; j + 1 < rows; j++)
      for (let i = 0; i + 1 < cols; i++) {
        const a = j * cols + i;
        const b = a + 1;
        const c = a + cols;
        const d = c + 1;
        for (const tri of [
          [a, b, c],
          [b, d, c],
        ] as const) {
          const ks = tri.map((q) => kind[q] ?? 0);
          if (ks.includes(0)) continue;
          // Con la malla del levantamiento, la retícula cubre solo lo que queda fuera de ella (un
          // triángulo que cruza el borde uniría el terreno con la cota plana: una pared).
          if (tin && ks.some((k) => k === 1)) continue;
          index.push(base + tri[0], base + tri[1], base + tri[2]);
        }
      }
    const g = this.drape.geometry;
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
    g.setIndex(new BufferAttribute(Uint32Array.from(index), 1));
    this.drape.material.map = tex;
    this.drape.material.needsUpdate = true;
    this.drape.visible = index.length > 0;
  }

  dispose(): void {
    this.drape.geometry.dispose();
    this.drape.material.dispose();
    this.texture?.dispose();
    this.plane.geometry.dispose();
    this.plane.material.dispose();
    this.lines.geometry.dispose();
    this.lines.material.dispose();
  }
}
