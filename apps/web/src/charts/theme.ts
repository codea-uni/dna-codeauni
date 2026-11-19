/**
 * Colores de los gráficos desde los tokens de `:root` (cronos-ux-interfaz: ningún hex en TSX).
 * Son getters: se leen al armar la opción de ECharts, cuando la hoja de estilos ya está cargada.
 * Papeles: `primary` (serie principal, crisocola), `secondary` (comparación, azurita), `highlight`
 * (umbral o valor destacado, ámbar), `reference` (curva de referencia, atenuada).
 */
const css = (name: string, fallback: string) =>
  typeof document === 'undefined'
    ? fallback
    : getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

export const chart = {
  get text() {
    return css('--text', '#e8eff3');
  },
  get axis() {
    return css('--muted', '#a3b5c0');
  },
  get grid() {
    return css('--border', '#24363f');
  },
  get primary() {
    return css('--accent', '#4fd6e6');
  },
  get secondary() {
    return css('--info', '#7fb2ff');
  },
  get highlight() {
    return css('--amber', '#f2b55c');
  },
  get reference() {
    return css('--faint', '#71879a');
  },
  /** Tamaño mínimo legible de etiquetas (11 px, cronos-ux-interfaz). */
  fontSize: 11,
};
