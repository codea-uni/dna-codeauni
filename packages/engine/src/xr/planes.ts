import type { Vec3 } from '@cronos/core';

/** Superficie horizontal detectada por el visor (`plane-detection`), en el espacio XR. */
export interface XrSurface {
  center: Vec3;
  /** Lados del rectángulo que la contiene [m]. */
  width: number;
  depth: number;
  /** Etiqueta de la configuración del espacio del Quest (`table`, `desk`, `floor`, …). */
  label?: string;
}

/** Altura razonable de una mesa sin etiqueta [m] (supuesto, QUESTIONS §2). */
const TABLE_MIN_Y = 0.4;
const TABLE_MAX_Y = 1.3;

/**
 * Mesa donde apoyar la maqueta: primero una superficie etiquetada como mesa o escritorio, si no la
 * superficie horizontal a altura de mesa más cercana a la cabeza; null si no hay ninguna.
 */
export function pickTable(surfaces: readonly XrSurface[], head: Vec3): XrSurface | null {
  const dist = (s: XrSurface) => Math.hypot(s.center.x - head.x, s.center.z - head.z);
  const byDistance = (a: XrSurface, b: XrSurface) => dist(a) - dist(b);
  const labeled = surfaces.filter((s) => s.label === 'table' || s.label === 'desk');
  if (labeled.length > 0) return [...labeled].sort(byDistance)[0] ?? null;
  const atHeight = surfaces.filter(
    (s) => s.label !== 'floor' && s.center.y >= TABLE_MIN_Y && s.center.y <= TABLE_MAX_Y,
  );
  return [...atHeight].sort(byDistance)[0] ?? null;
}
