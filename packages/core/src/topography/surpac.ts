import { parseNumber } from '../io/csv';
import type { TopoData, TopoLine } from './data';

/**
 * Formatos de GEOVIA Surpac (texto, separado por comas), según la descripción pública de
 * University of Nevada, Reno, «String file format» (cse.unr.edu/~fredh/papers/working/vr-mining):
 * - `.str`: línea 1 encabezado, línea 2 registro de ejes; luego `cadena, Y, X, Z, descripciones…`
 *   (**Y = Norte primero**). Un registro con cadena 0 separa segmentos; `0,0,0,0,END` termina.
 * - `.dtm`: triángulos `n, v1, v2, v3, …` cuyos vértices son el número de punto (desde 1) en el
 *   orden en que aparecen en su `.str`. Se leen juntos.
 */
export interface SurpacStr {
  /** Segmentos: número de cadena y sus puntos. */
  strings: { id: number; coords: number[]; closed: boolean }[];
  /** Todos los puntos del archivo en orden (x = Este, y = Norte, z), para el `.dtm`. */
  points: Float64Array;
}

export function parseSurpacStr(text: string): SurpacStr {
  const lines = text.split(/\r?\n/);
  const strings: SurpacStr['strings'] = [];
  const all: number[] = [];
  let current: { id: number; coords: number[] } | null = null;
  const close = () => {
    if (current && current.coords.length >= 6) {
      const c = current.coords;
      const n = c.length;
      const closed = n >= 9 && c[0] === c[n - 3] && c[1] === c[n - 2] && c[2] === c[n - 1];
      strings.push({ id: current.id, coords: closed ? c.slice(0, -3) : c, closed });
    }
    current = null;
  };
  for (const line of lines.slice(2)) {
    const f = line.split(',').map((x) => x.trim());
    if (f.length < 4) continue;
    const id = parseNumber(f[0]);
    if (!Number.isFinite(id)) continue;
    if (id === 0) {
      close();
      if ((f[4] ?? '').toUpperCase() === 'END') break;
      continue;
    }
    const y = parseNumber(f[1]);
    const x = parseNumber(f[2]);
    const z = parseNumber(f[3]);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
    if (current && current.id !== id) close();
    current ??= { id, coords: [] };
    current.coords.push(x, y, z);
    all.push(x, y, z);
  }
  close();
  return { strings, points: Float64Array.from(all) };
}

export function parseSurpacDtm(
  text: string,
  str: SurpacStr,
): { triangles: Uint32Array; bad: number } {
  const n = str.points.length / 3;
  const tri: number[] = [];
  let bad = 0;
  let inTriangles = false;
  for (const line of text.split(/\r?\n/)) {
    const f = line.split(',').map((x) => x.trim());
    const head = (f[0] ?? '').toUpperCase();
    if (head === 'TRISOLATION') {
      inTriangles = true;
      continue;
    }
    if (head === 'OBJECT' || head === 'END') {
      inTriangles = head === 'OBJECT' ? false : inTriangles;
      continue;
    }
    if (!inTriangles || f.length < 4) continue;
    const v = [f[1], f[2], f[3]].map((x) => parseNumber(x) - 1);
    if (v.every((i) => Number.isInteger(i) && i >= 0 && i < n)) tri.push(...v);
    else bad++;
  }
  return { triangles: Uint32Array.from(tri), bad };
}

/** Lee `.str` (y su `.dtm`, si se da): cadenas como líneas de referencia y triangulación. */
export function parseSurpac(strText: string, dtmText?: string): TopoData {
  const str = parseSurpacStr(strText);
  const lines: TopoLine[] = str.strings.map((s) => ({
    coords: s.coords,
    role: 'other',
    closed: s.closed,
  }));
  const data: TopoData = { points: [], lines, warnings: [] };
  if (dtmText !== undefined) {
    const { triangles, bad } = parseSurpacDtm(dtmText, str);
    if (bad > 0) data.warnings.push({ code: 'surpac.badTriangles', params: { n: bad } });
    if (triangles.length > 0) data.faces = { vertices: str.points, triangles };
  } else {
    data.points = Array.from(str.points);
  }
  if (str.points.length === 0) data.warnings.push({ code: 'surpac.empty' });
  return data;
}
