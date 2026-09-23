import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  LineLoop,
  type Material,
} from 'three';
import { COLORS } from './colors';

/**
 * Elementos transitorios de interacción en coordenadas de render:
 * rectángulo/lazo de selección, polilínea en construcción y marcador de snapping.
 */
export class OverlayLayer {
  readonly root = new Group();
  private readonly lineMaterial = new LineBasicMaterial({
    color: COLORS.overlay,
    depthTest: false,
  });
  private readonly snapMaterial = new LineBasicMaterial({ color: COLORS.snap, depthTest: false });
  private readonly shape: Line;
  private readonly closedShape: LineLoop;
  private readonly marker: LineLoop;

  constructor() {
    this.shape = this.make(Line, this.lineMaterial);
    this.closedShape = this.make(LineLoop, this.lineMaterial);
    this.marker = this.make(LineLoop, this.snapMaterial);
  }

  /** Polilínea abierta (lazo en curso, perímetro en construcción). */
  setPolyline(points: readonly { x: number; y: number }[] | null): void {
    this.setPoints(this.shape, points);
  }

  /** Polígono cerrado (rectángulo de selección). */
  setPolygon(points: readonly { x: number; y: number }[] | null): void {
    this.setPoints(this.closedShape, points);
  }

  /** Rombo de tamaño `sizeM` metros centrado en el punto de snapping. */
  setMarker(point: { x: number; y: number } | null, sizeM: number): void {
    if (!point) {
      this.setPoints(this.marker, null);
      return;
    }
    const { x, y } = point;
    this.setPoints(this.marker, [
      { x: x - sizeM, y },
      { x, y: y + sizeM },
      { x: x + sizeM, y },
      { x, y: y - sizeM },
    ]);
  }

  clear(): void {
    this.setPolyline(null);
    this.setPolygon(null);
    this.setMarker(null, 0);
  }

  dispose(): void {
    for (const obj of [this.shape, this.closedShape, this.marker]) obj.geometry.dispose();
    this.lineMaterial.dispose();
    this.snapMaterial.dispose();
  }

  private make<T extends Line>(
    Ctor: new (g: BufferGeometry, m: Material) => T,
    material: Material,
  ): T {
    const obj = new Ctor(new BufferGeometry(), material);
    obj.frustumCulled = false;
    obj.renderOrder = 5;
    obj.visible = false;
    this.root.add(obj);
    return obj;
  }

  private setPoints(obj: Line, points: readonly { x: number; y: number }[] | null): void {
    if (!points || points.length < 2) {
      obj.visible = false;
      return;
    }
    const positions = new Float32Array(points.length * 3);
    points.forEach((p, i) => {
      positions[i * 3] = p.x;
      positions[i * 3 + 1] = p.y;
    });
    obj.geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    obj.geometry.setDrawRange(0, points.length);
    obj.geometry.computeBoundingSphere();
    obj.visible = true;
  }
}
