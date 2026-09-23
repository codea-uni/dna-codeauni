import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineDashedMaterial,
  LineLoop,
  LineSegments,
} from 'three';
import type { MonitoringPoint, Vec2, Vec3 } from '@blastlab/core';

/**
 * Elementos de sitio: zona de exclusión por proyecciones (línea roja discontinua) y puntos de
 * control (marcador en forma de diana con tamaño constante en pantalla).
 */
export class SiteLayer {
  readonly root = new Group();
  private readonly zone: LineLoop<BufferGeometry, LineDashedMaterial>;
  private readonly markers: LineSegments<BufferGeometry, LineBasicMaterial>;

  constructor() {
    this.zone = new LineLoop(
      new BufferGeometry(),
      new LineDashedMaterial({ color: 0xff3b30, dashSize: 6, gapSize: 4, depthTest: false }),
    );
    this.zone.frustumCulled = false;
    this.zone.renderOrder = 6;
    this.zone.visible = false;
    this.markers = new LineSegments(
      new BufferGeometry(),
      new LineBasicMaterial({ color: 0x39d353, depthTest: false }),
    );
    this.markers.frustumCulled = false;
    this.markers.renderOrder = 6;
    this.root.add(this.zone, this.markers);
  }

  setZone(points: readonly Vec2[] | null, origin: Vec3, metersPerPixel: number): void {
    if (!points || points.length < 3) {
      this.hasZone = false;
      this.zone.visible = false;
      return;
    }
    const pos: number[] = [];
    for (const p of points) pos.push(p.x - origin.x, p.y - origin.y, 0);
    this.zone.geometry.setAttribute('position', new Float32BufferAttribute(pos, 3));
    this.zone.computeLineDistances();
    this.setDashScale(metersPerPixel);
    this.hasZone = true;
    this.zone.visible = this.zoneEnabled;
  }

  private zoneEnabled = true;
  private hasZone = false;

  setZoneVisible(visible: boolean): void {
    this.zoneEnabled = visible;
    this.zone.visible = visible && this.hasZone;
  }

  /** Mantiene el guionado en píxeles constantes. */
  setDashScale(metersPerPixel: number): void {
    this.zone.material.dashSize = 8 * metersPerPixel;
    this.zone.material.gapSize = 6 * metersPerPixel;
  }

  /** Diana de radio `sizeM` metros en cada punto de control. */
  setMarkers(points: readonly MonitoringPoint[], origin: Vec3, sizeM: number): void {
    const pos: number[] = [];
    const seg = 16;
    for (const p of points) {
      const cx = p.position.x - origin.x;
      const cy = p.position.y - origin.y;
      for (let k = 0; k < seg; k++) {
        const a0 = (k / seg) * Math.PI * 2;
        const a1 = ((k + 1) / seg) * Math.PI * 2;
        pos.push(
          cx + Math.cos(a0) * sizeM,
          cy + Math.sin(a0) * sizeM,
          0,
          cx + Math.cos(a1) * sizeM,
          cy + Math.sin(a1) * sizeM,
          0,
        );
      }
      const s = sizeM * 1.6;
      pos.push(cx - s, cy, 0, cx + s, cy, 0, cx, cy - s, 0, cx, cy + s, 0);
    }
    this.markers.geometry.setAttribute('position', new Float32BufferAttribute(pos, 3));
  }

  dispose(): void {
    this.zone.geometry.dispose();
    this.zone.material.dispose();
    this.markers.geometry.dispose();
    this.markers.material.dispose();
  }
}
