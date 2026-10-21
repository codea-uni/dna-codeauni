import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  LineBasicMaterial,
  LineSegments,
} from 'three';
import {
  DEVIATION_HIGH,
  DEVIATION_OK,
  hasSurvey,
  holeToe,
  surveyPath,
  type Blast,
  type Vec3,
} from '@cronos/core';

const OK = new Color(0x34d399);
const MID = new Color(0xfbbf24);
const HIGH = new Color(0xf87171);

/**
 * Perforación real medida con sonda: la trayectoria de cada taladro (de la boca al fondo real),
 * coloreada por desvío del fondo (verde ≤ 2 %, ámbar ≤ 5 %, rojo más). En planta se ve la
 * proyección junto a la traza de diseño; en 3D, la curva dentro del banco.
 */
export class AsDrilledLayer {
  readonly plan = new LineSegments(
    new BufferGeometry(),
    new LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true }),
  );
  readonly lines3d = new LineSegments(
    new BufferGeometry(),
    new LineBasicMaterial({ vertexColors: true }),
  );

  constructor() {
    this.plan.frustumCulled = false;
    this.plan.renderOrder = 1;
    this.lines3d.frustumCulled = false;
  }

  set(blasts: readonly Blast[], origin: Vec3): void {
    const plan: number[] = [];
    const space: number[] = [];
    const colors: number[] = [];
    for (const blast of blasts) {
      const correction = blast.drillSurvey?.azimuthCorrection ?? 0;
      for (const h of blast.holes) {
        if (!hasSurvey(h)) continue;
        const path = surveyPath(h, correction);
        const toe = path[path.length - 1];
        if (!toe) continue;
        const design = holeToe(h);
        const ratio = Math.hypot(toe.x - design.x, toe.y - design.y) / Math.max(h.length, 1e-6);
        const c = ratio > DEVIATION_HIGH ? HIGH : ratio > DEVIATION_OK ? MID : OK;
        for (let i = 1; i < path.length; i++) {
          const a = path[i - 1];
          const b = path[i];
          if (!a || !b) continue;
          plan.push(a.x - origin.x, a.y - origin.y, 0, b.x - origin.x, b.y - origin.y, 0);
          space.push(
            a.x - origin.x,
            a.y - origin.y,
            a.z - origin.z,
            b.x - origin.x,
            b.y - origin.y,
            b.z - origin.z,
          );
          colors.push(c.r, c.g, c.b, c.r, c.g, c.b);
        }
      }
    }
    for (const [lines, pos] of [
      [this.plan, plan],
      [this.lines3d, space],
    ] as const) {
      lines.geometry.setAttribute('position', new Float32BufferAttribute(pos, 3));
      lines.geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
      lines.geometry.computeBoundingSphere();
    }
  }

  dispose(): void {
    for (const l of [this.plan, this.lines3d]) {
      l.geometry.dispose();
      l.material.dispose();
    }
  }
}
