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
import { turboRgb, type Ground, type Vec3 } from '@cronos/core';

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
        opacity: 0.6,
        side: DoubleSide,
        depthWrite: false,
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
    this.drape.material.opacity = opacity;
  }

  /**
   * `use3d`: el mapa se ubica a su cota (`elevation`); en planta queda bajo los taladros. Con
   * `ground` y valores sobre el terreno (`onTerrain`), en 3D se apoya en el relieve.
   */
  set(data: EnergyData | null, origin: Vec3, use3d = false, ground: Ground | null = null): void {
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
    if (draped) this.buildDrape(data, origin, ground, tex);

    const flatZ = data.elevation ?? null;
    const { segments, levels } = data.contours;
    const n = levels.length;
    const pos = new Float32Array(n * 6);
    const col = new Float32Array(n * 6);
    const c = new Color();
    const lo = data.colorLog ? Math.log(Math.max(data.colorMin, 1e-9)) : data.colorMin;
    const hi = data.colorLog ? Math.log(Math.max(data.colorMax, 1e-9)) : data.colorMax;
    for (let k = 0; k < n; k++) {
      const x1 = segments[k * 4] ?? 0;
      const y1 = segments[k * 4 + 1] ?? 0;
      const x2 = segments[k * 4 + 2] ?? 0;
      const y2 = segments[k * 4 + 3] ?? 0;
      pos[k * 6] = x1 - origin.x;
      pos[k * 6 + 1] = y1 - origin.y;
      pos[k * 6 + 3] = x2 - origin.x;
      pos[k * 6 + 4] = y2 - origin.y;
      if (draped) {
        // Curvas sobre el relieve; fuera del levantamiento siguen planas a la cota del mapa, como el
        // relleno (sin cota, el tramo se anula).
        const z1 = ground(x1, y1) ?? flatZ;
        const z2 = ground(x2, y2) ?? flatZ;
        if (z1 === null || z2 === null) {
          pos.fill(0, k * 6, k * 6 + 6);
        } else {
          pos[k * 6 + 2] = z1 - origin.z + DRAPE_LIFT + 0.1;
          pos[k * 6 + 5] = z2 - origin.z + DRAPE_LIFT + 0.1;
        }
      }
      const v = levels[k] ?? 0;
      const t = hi > lo ? ((data.colorLog ? Math.log(Math.max(v, 1e-9)) : v) - lo) / (hi - lo) : 1;
      // Contornos más claros que el relleno para que se lean encima.
      const [r, g, b] = turboRgb(t);
      c.setRGB(r / 255, g / 255, b / 255, SRGBColorSpace).lerp(new Color(0xffffff), 0.35);
      col.set([c.r, c.g, c.b, c.r, c.g, c.b], k * 6);
    }
    this.lines.geometry.setAttribute('position', new Float32BufferAttribute(pos, 3));
    this.lines.geometry.setAttribute('color', new Float32BufferAttribute(col, 3));
  }

  /**
   * Malla del mapa sobre el terreno: retícula de hasta `DRAPE_RES` vértices por lado con la cota
   * del levantamiento y coordenadas de textura desde X e Y. Fuera del levantamiento (que puede ser
   * mucho más chico que el mapa) sigue plana a la cota del mapa, `elevation`, para que el mapa se
   * vea completo; sin esa cota, ahí no se dibuja.
   */
  private buildDrape(data: EnergyData, origin: Vec3, ground: Ground, tex: DataTexture): void {
    const w = data.nx * data.cellSize;
    const h = data.ny * data.cellSize;
    const cols = Math.min(DRAPE_RES, data.nx) + 1;
    const rows = Math.min(DRAPE_RES, data.ny) + 1;
    const pos = new Float32Array(cols * rows * 3);
    const uv = new Float32Array(cols * rows * 2);
    const has = new Uint8Array(cols * rows);
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < cols; i++) {
        const k = j * cols + i;
        const u = i / (cols - 1);
        const v = j / (rows - 1);
        const x = data.originX + u * w;
        const y = data.originY + v * h;
        const z = ground(x, y) ?? data.elevation ?? null;
        pos[k * 3] = x - origin.x;
        pos[k * 3 + 1] = y - origin.y;
        pos[k * 3 + 2] = z === null ? 0 : z - origin.z + DRAPE_LIFT;
        uv[k * 2] = u;
        uv[k * 2 + 1] = v;
        has[k] = z === null ? 0 : 1;
      }
    const index: number[] = [];
    for (let j = 0; j + 1 < rows; j++)
      for (let i = 0; i + 1 < cols; i++) {
        const a = j * cols + i;
        const b = a + 1;
        const c = a + cols;
        const d = c + 1;
        if (has[a] && has[b] && has[c]) index.push(a, b, c);
        if (has[b] && has[d] && has[c]) index.push(b, d, c);
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
