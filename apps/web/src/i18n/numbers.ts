import type { Locale } from './index';

// `\s` incluye el espacio no separable y el fino que usa `toLocaleString`.
const SPACES = /\s/g;

/**
 * Lee un número tal como lo escribe un ingeniero: «6,5» «6.5» «1.234,5» «1,234.5» «7,25 m» «−3».
 *
 * Con un solo separador, este siempre es decimal: en un campo nadie escribe miles y el punto del
 * teclado numérico tiene que servir en español. Con los dos, el último es el decimal. Varios iguales
 * sin el otro son de miles y deben agrupar de a tres. Devuelve `null` si el texto no es un número.
 */
export function parseUserNumber(raw: string, unit?: string): number | null {
  let s = raw.replace(SPACES, '').replace('−', '-');
  const u = unit?.replace(SPACES, '');
  if (u && s.endsWith(u)) s = s.slice(0, -u.length);
  const m = /^([+-]?)([\d.,]+)$/.exec(s);
  const sign = m?.[1] ?? '';
  const body = m?.[2] ?? '';
  if (!/\d/.test(body)) return null;

  const dots = body.split('.').length - 1;
  const commas = body.split(',').length - 1;
  let decimal: '.' | ',' | null = null;
  if (dots > 0 && commas > 0) decimal = body.lastIndexOf('.') > body.lastIndexOf(',') ? '.' : ',';
  else if (dots === 1) decimal = '.';
  else if (commas === 1) decimal = ',';
  const group = decimal === '.' ? ',' : decimal === ',' ? '.' : dots > 1 ? '.' : ',';

  const parts = decimal ? body.split(decimal) : [body];
  if (parts.length > 2) return null;
  const int = parts[0] ?? '';
  const frac = parts[1] ?? '';
  if (frac.includes(group)) return null;
  if (int.includes(group) && !new RegExp(`^\\d{1,3}(\\${group}\\d{3})+$`).test(int)) return null;

  const n = Number(`${sign}${int.split(group).join('') || '0'}.${frac || '0'}`);
  return Number.isFinite(n) ? n : null;
}

/**
 * Número para mostrar dentro de un campo editable: separador decimal del idioma, sin miles (para que
 * `parseUserNumber` lo vuelva a leer igual) y sin ceros a la derecha. Redondear es solo presentación.
 */
export function formatInputNumber(v: number, decimals: number, locale: Locale): string {
  const text = String(Number(v.toFixed(decimals)));
  return locale === 'es' ? text.replace('.', ',') : text;
}
