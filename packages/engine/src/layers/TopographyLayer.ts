import {
  BufferGeometry,
  Color,
  DataTexture,
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
import {
  LINE_ROLES,
  type Bounds3,
  type ContourSet,
  type ImageGeoref,
  type LineRole,
  type LineSetData,
  type Vec3,
} from '@cronos/core';

/** Lo que se dibuja de un levantamiento (D-16), calculado en el worker. */
export interface TopographyViewData {
  id: string;
  bounds: Bounds3;
  /** Relieve sombreado (RGBA, fila 0 = Norte) y su georreferencia. */
  shade: {
    rgba: Uint8Array | Uint8ClampedArray;
    width: number;
    height: number;
    georef: ImageGeoref;
  } | null;
  contours: ContourSet | null;
  lines: LineSetData | null;
}

/** Colores de las líneas de referencia por rol. */
export const TOPO_LINE_COLORS: Record<LineRole, number> = {
  contour: 0x8fa3a0,
  crest: 0xf0b429,
  toe: 0x4fb3bf,
  breakline: 0xb48ead,
  other: 0xa8b3bf,
};

const CONTOUR_MINOR = new Color(0x9aa89c);
const CONTOUR_MAJOR = new Color(0xe8e2d0);

/** Una malla de segmentos 2D (x1, y1, x2, y2 en coordenadas de proyecto) a coordenadas de render. */
function segmentPositions(
  segments: Float64Array,
  keep: (k: number) => boolean,
  origin: Vec3,
): Float32Array {
  const n = segments.length / 4;
  const out: number[] = [];
  for (let k = 0; k < n; k++) {
    if (!keep(k)) continue;
    out.push(
      (segments[k * 4] ?? 0) - origin.x,
      (segments[k * 4 + 1] ?? 0) - origin.y,
      0,
      (segments[k * 4 + 2] ?? 0) - origin.x,
      (segments[k * 4 + 3] ?? 0) - origin.y,
      0,
    );
  }
  return Float32Array.from(out);
}

/**
 * Topografía en planta, debajo de todo el diseño: relieve sombreado (bajo la grilla), curvas de
 * nivel (maestras más marcadas) y líneas de referencia (cresta, pie…) coloreadas por rol.
 */
export class TopographyLayer {
  readonly shadeRoot = new Group();
  readonly contourRoot = new Group();
  readonly lineRoot = new Group();
  private shadeOpacity = 0.85;
  private readonly disposers: (() => void)[] = [];

  constructor() {
    this.shadeRoot.renderOrder = -12;
  }

  setShadeOpacity(opacity: number): void {
    this.shadeOpacity = opacity;
    this.shadeRoot.traverse((o) => {
      if (o instanceof Mesh) (o.material as MeshBasicMaterial).opacity = opacity;
    });
  }

  set(data: readonly TopographyViewData[], origin: Vec3): void {
    this.clear();
    for (const d of data) {
      if (d.shade) this.addShade(d.shade, origin);
      if (d.contours) this.addContours(d.contours, origin);
      if (d.lines) this.addLines(d.lines, origin);
    }
  }

  private addShade(shade: NonNullable<TopographyViewData['shade']>, origin: Vec3): void {
    const { rgba, width, height, georef } = shade;
    const tex = new DataTexture(
      new Uint8Array(rgba.buffer, rgba.byteOffset, rgba.byteLength),
      width,
      height,
      RGBAFormat,
    );
    tex.colorSpace = SRGBColorSpace;
    tex.magFilter = LinearFilter;
    tex.minFilter = LinearFilter;
    tex.needsUpdate = true;
    const geometry = new PlaneGeometry(1, 1);
    // La fila 0 del ráster es el Norte; la de la textura, abajo: se invierte la V.
    const uv = geometry.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
    const material = new MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: this.shadeOpacity,
      depthTest: false,
      depthWrite: false,
    });
    const mesh = new Mesh(geometry, material);
    const w = width * georef.pixelSizeX;
    const h = height * -georef.pixelSizeY;
    mesh.scale.set(w, h, 1);
    // Giro horario desde el Norte alrededor de la esquina superior izquierda.
    const a = -georef.rotation;
    const cx = (w / 2) * Math.cos(a) + (h / 2) * Math.sin(a);
    const cy = (w / 2) * Math.sin(a) - (h / 2) * Math.cos(a);
    mesh.rotation.z = a;
    mesh.position.set(georef.originX + cx - origin.x, georef.originY + cy - origin.y, 0);
    mesh.frustumCulled = false;
    mesh.renderOrder = -12;
    this.shadeRoot.add(mesh);
    this.disposers.push(() => {
      tex.dispose();
      geometry.dispose();
      material.dispose();
    });
  }

  private addContours(c: ContourSet, origin: Vec3): void {
    for (const major of [false, true]) {
      const pos = segmentPositions(c.segments, (k) => (c.major[k] === 1) === major, origin);
      if (pos.length === 0) continue;
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new Float32BufferAttribute(pos, 3));
      const material = new LineBasicMaterial({
        color: major ? CONTOUR_MAJOR : CONTOUR_MINOR,
        transparent: true,
        opacity: major ? 0.75 : 0.35,
        depthTest: false,
      });
      const lines = new LineSegments(geometry, material);
      lines.frustumCulled = false;
      lines.renderOrder = -9;
      this.contourRoot.add(lines);
      this.disposers.push(() => {
        geometry.dispose();
        material.dispose();
      });
    }
  }

  private addLines(l: LineSetData, origin: Vec3): void {
    const pos: number[] = [];
    const col: number[] = [];
    const c = new Color();
    const n = l.roles.length;
    for (let i = 0; i < n; i++) {
      const a = l.offsets[i] ?? 0;
      const b = l.offsets[i + 1] ?? a;
      c.setHex(TOPO_LINE_COLORS[LINE_ROLES[l.roles[i] ?? 0] ?? 'other'], SRGBColorSpace);
      const seg = (p: number, q: number) => {
        pos.push(
          (l.coords[p * 3] ?? 0) - origin.x,
          (l.coords[p * 3 + 1] ?? 0) - origin.y,
          0,
          (l.coords[q * 3] ?? 0) - origin.x,
          (l.coords[q * 3 + 1] ?? 0) - origin.y,
          0,
        );
        col.push(c.r, c.g, c.b, c.r, c.g, c.b);
      };
      for (let p = a; p + 1 < b; p++) seg(p, p + 1);
      if (l.closed[i] === 1 && b - a > 2) seg(b - 1, a);
    }
    if (pos.length === 0) return;
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(pos, 3));
    geometry.setAttribute('color', new Float32BufferAttribute(col, 3));
    const material = new LineBasicMaterial({ vertexColors: true, depthTest: false });
    const lines = new LineSegments(geometry, material);
    lines.frustumCulled = false;
    lines.renderOrder = -8;
    this.lineRoot.add(lines);
    this.disposers.push(() => {
      geometry.dispose();
      material.dispose();
    });
  }

  private clear(): void {
    for (const d of this.disposers) d();
    this.disposers.length = 0;
    this.shadeRoot.clear();
    this.contourRoot.clear();
    this.lineRoot.clear();
  }

  dispose(): void {
    this.clear();
  }
}
