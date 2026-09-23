import {
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
import { turboRgb, type Vec3 } from '@blastlab/core';

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
}

/** Mapa de calor de energía con sus contornos, debajo de los taladros. */
export class EnergyLayer {
  readonly root = new Group();
  private readonly plane: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private readonly lines: LineSegments<BufferGeometry, LineBasicMaterial>;
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
    this.root.add(this.plane, this.lines);
  }

  setOpacity(opacity: number): void {
    this.plane.material.opacity = opacity;
  }

  /** `use3d`: el mapa se ubica a su cota (`elevation`); en planta queda bajo los taladros. */
  set(data: EnergyData | null, origin: Vec3, use3d = false): void {
    this.root.position.z =
      use3d && data?.elevation !== undefined ? data.elevation - origin.z + 0.5 : 0;
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
    this.plane.visible = true;

    const { segments, levels } = data.contours;
    const n = levels.length;
    const pos = new Float32Array(n * 6);
    const col = new Float32Array(n * 6);
    const c = new Color();
    const lo = data.colorLog ? Math.log(Math.max(data.colorMin, 1e-9)) : data.colorMin;
    const hi = data.colorLog ? Math.log(Math.max(data.colorMax, 1e-9)) : data.colorMax;
    for (let k = 0; k < n; k++) {
      pos[k * 6] = (segments[k * 4] ?? 0) - origin.x;
      pos[k * 6 + 1] = (segments[k * 4 + 1] ?? 0) - origin.y;
      pos[k * 6 + 3] = (segments[k * 4 + 2] ?? 0) - origin.x;
      pos[k * 6 + 4] = (segments[k * 4 + 3] ?? 0) - origin.y;
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

  dispose(): void {
    this.texture?.dispose();
    this.plane.geometry.dispose();
    this.plane.material.dispose();
    this.lines.geometry.dispose();
    this.lines.material.dispose();
  }
}
