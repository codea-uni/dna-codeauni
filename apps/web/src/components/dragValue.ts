/** Recorrido que cubre todo el rango de un campo con mínimo y máximo. */
const FULL_RANGE_PX = 600;

export interface DragRules {
  start: number;
  decimals: number;
  step: number;
  min?: number | undefined;
  max?: number | undefined;
  integer?: boolean | undefined;
}

const clamp = (v: number, min?: number, max?: number) =>
  Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v));

/**
 * Valor para un desplazamiento horizontal de `dx` píxeles. Sin rango, un paso cada 4 px; con
 * rango, todo el rango en unos 600 px (lo que sea más rápido). Mayús ×10 y Alt ÷10, como ↑/↓.
 */
export function dragValue(rules: DragRules, dx: number, shift: boolean, alt: boolean): number {
  const { start, decimals, step, min, max, integer } = rules;
  const perPx = Math.max(
    step / 4,
    min !== undefined && max !== undefined ? (max - min) / FULL_RANGE_PX : 0,
  );
  const factor = shift ? 10 : alt ? 0.1 : 1;
  const raw = start + dx * perPx * factor;
  const precision = integer ? 0 : Math.max(decimals, alt ? decimals + 1 : 0);
  return clamp(Number(raw.toFixed(precision)), min, max);
}
