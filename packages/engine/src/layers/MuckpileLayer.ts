import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshLambertMaterial,
  SRGBColorSpace,
} from 'three';
import type { ScalarGrid, Vec3 } from '@cronos/core';

/** Espesor mínimo de material para dibujar la pila [m]. */
const MIN_LOOSE = 0.02;

/**
 * Superficie de la pila en 3D (A7): malla de la grilla de alturas con color por celda (mapa de
 * calor, tamaño de fragmento o dominio) y opacidad; solo donde hay material suelto.
 */
export interface MuckpileSurfaceData {
  /** Superficie de la pila (cotas [m]). */
  after: ScalarGrid;
  /** Terreno fijo: la pila se dibuja donde `after − base` supera 2 cm. */
  base: ScalarGrid;
  /** Color sRGB por celda [r, g, b, …] (0–255). */
  colors: Uint8Array;
}

export class MuckpileSurfaceLayer {
  readonly root = new Group();
  private mesh: Mesh<BufferGeometry, MeshLambertMaterial> | null = null;
  private opacity = 0.9;

  setOpacity(opacity: number): void {
    this.opacity = opacity;
    if (!this.mesh) return;
    const m = this.mesh.material;
    m.opacity = opacity;
    m.transparent = opacity < 1;
    m.depthWrite = opacity >= 1;
    m.needsUpdate = true;
  }

  set(data: MuckpileSurfaceData | null, origin: Vec3): void {
    this.clear();
    if (!data || data.after.nx < 2 || data.after.ny < 2) return;
    const g = gridMesh(data.after, origin, (k) => {
      const loose = (data.after.values[k] ?? 0) - (data.base.values[k] ?? 0);
      return loose > MIN_LOOSE;
    });
    if (!g) return;
    const { nx, ny } = data.after;
    const col = new Float32Array(nx * ny * 3);
    const c = new Color();
    for (let k = 0; k < nx * ny; k++) {
      c.setRGB(
        (data.colors[3 * k] ?? 160) / 255,
        (data.colors[3 * k + 1] ?? 140) / 255,
        (data.colors[3 * k + 2] ?? 110) / 255,
        SRGBColorSpace,
      );
      col[3 * k] = c.r;
      col[3 * k + 1] = c.g;
      col[3 * k + 2] = c.b;
    }
    g.setAttribute('color', new Float32BufferAttribute(col, 3));
    this.mesh = new Mesh(
      g,
      new MeshLambertMaterial({
        vertexColors: true,
        side: DoubleSide,
        transparent: this.opacity < 1,
        opacity: this.opacity,
        depthWrite: this.opacity >= 1,
      }),
    );
    this.mesh.renderOrder = 2;
    this.root.add(this.mesh);
  }

  clear(): void {
    if (!this.mesh) return;
    this.root.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.mesh = null;
  }

  dispose(): void {
    this.clear();
  }
}

/**
 * Techo in situ antes de la voladura (A7): malla de alambre tenue sobre el volumen que se vuela,
 * para comparar con la pila.
 */
export class MuckpileBeforeLayer {
  readonly root = new Group();
  private lines: LineSegments<BufferGeometry, LineBasicMaterial> | null = null;

  set(data: { before: ScalarGrid; base: ScalarGrid } | null, origin: Vec3): void {
    this.clear();
    if (!data || data.before.nx < 2 || data.before.ny < 2) return;
    const { before, base } = data;
    const { nx, ny, cellSize, originX, originY } = before;
    const inside = (k: number) => (before.values[k] ?? 0) - (base.values[k] ?? 0) > 0.1;
    const pos: number[] = [];
    const vx = (i: number) => originX + (i + 0.5) * cellSize - origin.x;
    const vy = (j: number) => originY + (j + 0.5) * cellSize - origin.y;
    const vz = (k: number) => (before.values[k] ?? 0) - origin.z;
    // Alambre cada dos celdas: se lee el techo sin tapar la pila.
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        if (!inside(k)) continue;
        if (i + 1 < nx && inside(k + 1) && j % 2 === 0)
          pos.push(vx(i), vy(j), vz(k), vx(i + 1), vy(j), vz(k + 1));
        if (j + 1 < ny && inside(k + nx) && i % 2 === 0)
          pos.push(vx(i), vy(j), vz(k), vx(i), vy(j + 1), vz(k + nx));
      }
    if (pos.length === 0) return;
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    this.lines = new LineSegments(
      g,
      new LineBasicMaterial({ color: 0xe6edf3, transparent: true, opacity: 0.35 }),
    );
    this.root.add(this.lines);
  }

  clear(): void {
    if (!this.lines) return;
    this.root.remove(this.lines);
    this.lines.geometry.dispose();
    this.lines.material.dispose();
    this.lines = null;
  }

  dispose(): void {
    this.clear();
  }
}

/** Malla indexada de una grilla (vértices en centros de celda), con los quads que pide `keep`. */
function gridMesh(
  grid: ScalarGrid,
  origin: Vec3,
  keep: (k: number) => boolean,
): BufferGeometry | null {
  const { nx, ny, cellSize, originX, originY } = grid;
  const pos = new Float32Array(nx * ny * 3);
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      pos[3 * k] = originX + (i + 0.5) * cellSize - origin.x;
      pos[3 * k + 1] = originY + (j + 0.5) * cellSize - origin.y;
      pos[3 * k + 2] = (grid.values[k] ?? 0) - origin.z;
    }
  const idx: number[] = [];
  for (let j = 0; j + 1 < ny; j++)
    for (let i = 0; i + 1 < nx; i++) {
      const k = j * nx + i;
      if (!(keep(k) || keep(k + 1) || keep(k + nx) || keep(k + nx + 1))) continue;
      idx.push(k, k + 1, k + nx, k + 1, k + nx + 1, k + nx);
    }
  if (idx.length === 0) return null;
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setIndex(new BufferAttribute(Uint32Array.from(idx), 1));
  g.computeVertexNormals();
  return g;
}
