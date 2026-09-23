/** Paso "redondo" (1, 2 o 5 × 10ⁿ) mayor o igual a `raw`. */
export function niceStep(raw: number): number {
  if (!(raw > 0)) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const m of [1, 2, 5, 10]) if (m * pow >= raw - 1e-12) return m * pow;
  return 10 * pow;
}

/** Valores múltiplos de `step` dentro de [min, max]. */
export function ticks(min: number, max: number, step: number): number[] {
  if (!(step > 0) || !(max >= min)) return [];
  const out: number[] = [];
  const first = Math.ceil(min / step);
  const last = Math.floor(max / step);
  if (last - first > 500) return [];
  for (let k = first; k <= last; k++) out.push(Number((k * step).toPrecision(12)));
  return out;
}

/** Barra de escala: largo redondo [m] que ocupe como máximo `maxPx` píxeles. */
export function scaleBar(metersPerPixel: number, maxPx = 120): { meters: number; pixels: number } {
  const raw = metersPerPixel * maxPx;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  let meters = pow;
  for (const m of [5, 2, 1]) {
    if (m * pow <= raw) {
      meters = m * pow;
      break;
    }
  }
  return { meters, pixels: meters / metersPerPixel };
}

/** Número con miles "." y decimales "," (formato es) sin depender de Intl. */
function es(v: number, decimals: number): string {
  const [int = '0', dec] = Math.abs(v).toFixed(decimals).split('.');
  const trimmed = dec?.replace(/0+$/, '');
  return `${v < 0 ? '−' : ''}${int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}${trimmed ? `,${trimmed}` : ''}`;
}

/** Distancia legible: mm/cm debajo de 1 m, km sobre 10 km. */
export function formatDistance(m: number): string {
  if (m < 0.01) return `${es(m * 1000, 0)} mm`;
  if (m < 1) return `${es(m * 100, m < 0.1 ? 1 : 0)} cm`;
  if (m >= 10_000) return `${es(m / 1000, 1)} km`;
  return `${es(m, m < 10 ? 2 : m < 100 ? 1 : 0)} m`;
}

/** Coordenada para las reglas: miles separados por espacio fino, decimales solo si el paso los necesita. */
export function formatCoordinate(v: number, step: number): string {
  const decimals = step >= 1 ? 0 : Math.min(3, Math.ceil(-Math.log10(step)));
  const [int = '0', dec] = Math.abs(v).toFixed(decimals).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${v < 0 ? '−' : ''}${grouped}${dec ? `,${dec}` : ''}`;
}
