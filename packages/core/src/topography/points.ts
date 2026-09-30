import { decodeText, parseNumber } from '../io/csv';
import type { TopoData, TopoWarning } from './data';

/** Qué columna es cada dato (índices desde 0). */
export interface PointColumns {
  east: number;
  north: number;
  elevation: number;
}

export interface PointsParse extends TopoData {
  columns: PointColumns;
  delimiter: string;
  hasHeader: boolean;
}

const HEADER: [keyof PointColumns, RegExp][] = [
  ['north', /^(n|y|norte|northing|north)$/i],
  ['east', /^(e|x|este|easting|east)$/i],
  ['elevation', /^(z|h|cota|elev|elevacion|elevación|elevation|altura|rl)$/i],
];

function split(line: string, delimiter: string): string[] {
  return delimiter === ' ' ? line.trim().split(/\s+/) : line.split(delimiter);
}

/**
 * Puntos de levantamiento en texto (CSV/TXT/XYZ: PNEZD, ENZ, NEZ, XYZ…). Detecta separador,
 * encabezado y columnas; sin encabezado, el Norte se reconoce por tener más cifras que el Este en
 * UTM del hemisferio sur (7 frente a 6, `docs/theory/03 §5`), y se avisa si parecían al revés.
 */
export function parsePoints(bytes: Uint8Array, columns?: PointColumns): PointsParse {
  const { text } = decodeText(bytes);
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '' && !l.trim().startsWith('#'));
  const first = lines[0] ?? '';
  const delimiter = ['\t', ';', ','].find((d) => first.includes(d)) ?? ' ';
  const rows = lines.map((l) => split(l, delimiter).map((c) => c.trim()));
  const headerRow = rows[0] ?? [];
  const hasHeader =
    headerRow.length > 0 && headerRow.every((c) => !Number.isFinite(parseNumber(c)) || c === '');
  const data = hasHeader ? rows.slice(1) : rows;
  const warnings: TopoWarning[] = [];

  let cols = columns;
  if (!cols && hasHeader) {
    const found: Partial<PointColumns> = {};
    headerRow.forEach((h, i) => {
      for (const [key, re] of HEADER) if (re.test(h) && found[key] === undefined) found[key] = i;
    });
    if (found.east !== undefined && found.north !== undefined && found.elevation !== undefined)
      cols = found as PointColumns;
  }
  cols ??= guessColumns(data);
  if (!cols) {
    return {
      points: [],
      lines: [],
      warnings: [{ code: 'points.noColumns' }],
      columns: { east: 0, north: 1, elevation: 2 },
      delimiter,
      hasHeader,
    };
  }

  const points: number[] = [];
  let bad = 0;
  for (const r of data) {
    const e = parseNumber(r[cols.east]);
    const n = parseNumber(r[cols.north]);
    const z = parseNumber(r[cols.elevation]);
    if (Number.isFinite(e) && Number.isFinite(n) && Number.isFinite(z)) points.push(e, n, z);
    else bad++;
  }
  if (bad > 0) warnings.push({ code: 'points.badRows', params: { n: bad } });
  return { points, lines: [], warnings, columns: cols, delimiter, hasHeader };
}

/**
 * Sin encabezado: las columnas numéricas por posición. Con 3 números por fila (X Y Z o N E Z),
 * las dos primeras son planta y la tercera la cota; con 4 o más, la primera suele ser el número
 * de punto (PNEZD). Norte = la columna de planta con valores mayores (7 cifras en UTM sur).
 */
function guessColumns(rows: readonly string[][]): PointColumns | undefined {
  const sample = rows.slice(0, 50);
  const width = Math.max(0, ...sample.map((r) => r.length));
  // Una columna es numérica si lo es en la mayoría de las filas (tolera alguna fila mala).
  const numeric: number[] = [];
  for (let c = 0; c < width; c++)
    if (sample.filter((r) => Number.isFinite(parseNumber(r[c]))).length * 2 > sample.length)
      numeric.push(c);
  if (numeric.length < 3) return undefined;
  // PNEZD: si hay 4+ columnas numéricas y la primera es un correlativo entero, se descarta.
  const isId = (c: number) =>
    sample.every((r) => Number.isInteger(parseNumber(r[c]))) && sample.length > 1;
  const cand =
    numeric.length >= 4 && numeric[0] !== undefined && isId(numeric[0])
      ? numeric.slice(1)
      : numeric;
  const [a, b, z] = cand as [number, number, number];
  const mean = (c: number) => {
    const v = sample.map((r) => Math.abs(parseNumber(r[c]))).filter(Number.isFinite);
    return v.reduce((s, x) => s + x, 0) / Math.max(1, v.length);
  };
  return mean(a) >= mean(b)
    ? { north: a, east: b, elevation: z }
    : { east: a, north: b, elevation: z };
}
