import type { DiffMarker, Vec3 } from '@cronos/core';
import {
  BufferGeometry,
  Float32BufferAttribute,
  LineBasicMaterial,
  LineSegments,
  type Color,
} from 'three';
import { COLORS } from './colors';

const RING_SEGMENTS = 12;

/** Color por tipo de cambio (leyenda en la web). */
export const DIFF_COLORS: Record<DiffMarker['kind'], Color> = {
  added: COLORS.diffAdded,
  removed: COLORS.diffRemoved,
  moved: COLORS.diffMoved,
  changed: COLORS.diffChanged,
};

/**
 * Comparación de versiones sobre el plano (D-14): un anillo por taladro con cambios, de color
 * según el tipo; los quitados llevan además una cruz (ya no existen) y los movidos una línea desde
 * su posición anterior. Tamaño en metros, reconstruido al hacer zoom para que se vea constante.
 */
export class VersionDiffLayer {
  readonly lines = new LineSegments(
    new BufferGeometry(),
    new LineBasicMaterial({
      vertexColors: true,
      depthTest: false,
      transparent: true,
      opacity: 0.95,
    }),
  );
  /** Vértices dibujados (para pruebas y diagnóstico). */
  vertexCount = 0;

  constructor() {
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 7;
  }

  set(markers: readonly DiffMarker[] | null, origin: Vec3, sizeM: number): void {
    if (!markers || markers.length === 0) {
      this.lines.geometry.setAttribute('position', new Float32BufferAttribute([], 3));
      this.lines.geometry.setAttribute('color', new Float32BufferAttribute([], 3));
      this.lines.visible = false;
      this.vertexCount = 0;
      return;
    }
    // Cantidad exacta de vértices para escribir en arreglos tipados sin realocar.
    let n = 0;
    for (const m of markers)
      n +=
        RING_SEGMENTS * 2 + (m.kind === 'removed' ? 4 : 0) + (m.kind === 'moved' && m.from ? 2 : 0);
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    let i = 0;
    const push = (x: number, y: number, c: Color) => {
      pos[i * 3] = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = 0;
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
      i++;
    };
    const r = sizeM;
    for (const m of markers) {
      const c = DIFF_COLORS[m.kind];
      const cx = m.position.x - origin.x;
      const cy = m.position.y - origin.y;
      for (let k = 0; k < RING_SEGMENTS; k++) {
        const a0 = (k / RING_SEGMENTS) * Math.PI * 2;
        const a1 = ((k + 1) / RING_SEGMENTS) * Math.PI * 2;
        push(cx + Math.cos(a0) * r, cy + Math.sin(a0) * r, c);
        push(cx + Math.cos(a1) * r, cy + Math.sin(a1) * r, c);
      }
      if (m.kind === 'removed') {
        const s = r * 0.7;
        push(cx - s, cy - s, c);
        push(cx + s, cy + s, c);
        push(cx - s, cy + s, c);
        push(cx + s, cy - s, c);
      }
      if (m.kind === 'moved' && m.from) {
        push(m.from.x - origin.x, m.from.y - origin.y, c);
        push(cx, cy, c);
      }
    }
    this.lines.geometry.setAttribute('position', new Float32BufferAttribute(pos, 3));
    this.lines.geometry.setAttribute('color', new Float32BufferAttribute(col, 3));
    this.lines.geometry.computeBoundingSphere();
    this.lines.visible = true;
    this.vertexCount = n;
  }

  dispose(): void {
    this.lines.geometry.dispose();
    this.lines.material.dispose();
  }
}

/** Color CSS de cada tipo de cambio, para la leyenda de la web. */
export function diffColorCss(kind: DiffMarker['kind']): string {
  return `#${DIFF_COLORS[kind].getHexString()}`;
}
