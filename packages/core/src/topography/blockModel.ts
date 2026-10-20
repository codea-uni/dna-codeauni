import { decodeText, parseNumber } from '../io/csv';
import type { BlockCategoryAttribute, BlockModelData, BlockNumericAttribute } from './asset';

/**
 * Modelo de bloques en CSV (Datamine `_XC,_YC,_ZC,_XSIZE…`, o `X,Y,Z,DX,DY,DZ` de Vulcan/Surpac
 * exportados). Cada fila es un bloque con su centro y tamaño; las demás columnas son atributos:
 * numéricos (leyes, densidad, tonelaje) o de texto (litología, material). Las columnas de
 * definición del modelo (`_XMORIG`, `_NX`, `_ROTANGLE1`…) se leen solo para el giro.
 */

export interface BlockModelParse extends BlockModelData {
  warnings: string[];
  /** Columnas de atributos que se descartaron por tamaño (modelos muy grandes). */
  dropped: string[];
}

const CENTER: [0 | 1 | 2, RegExp][] = [
  [0, /^(_?xc|x|xcentre|xcenter|x_centre|x_center|centroid_x|este|east)$/i],
  [1, /^(_?yc|y|ycentre|ycenter|y_centre|y_center|centroid_y|norte|north)$/i],
  [2, /^(_?zc|z|zcentre|zcenter|z_centre|z_center|centroid_z|cota|elev|rl)$/i],
];
const SIZE: [0 | 1 | 2, RegExp][] = [
  [0, /^(_?xsize|dx|xinc|_?xinc|size_x|xdim)$/i],
  [1, /^(_?ysize|dy|yinc|_?yinc|size_y|ydim)$/i],
  [2, /^(_?zsize|dz|zinc|_?zinc|size_z|zdim)$/i],
];
const DENSITY = /^(density|densidad|dens|sg|dens_s|density_d|bd|bulk_density)$/i;

/** Valores numéricos que se guardan como máximo (≈ 160 MB en float32). */
const MAX_NUMERIC_VALUES = 40_000_000;

export function parseBlockModelCsv(bytes: Uint8Array): BlockModelParse {
  const { text } = decodeText(bytes);
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  const head = (lines[0] ?? '').replace(/^\uFEFF/, '');
  const delimiter = [',', ';', '\t'].find((d) => head.includes(d)) ?? ' ';
  const split = (l: string) =>
    delimiter === ' '
      ? l.trim().split(/\s+/)
      : l.split(delimiter).map((c) => c.trim().replace(/^"|"$/g, ''));
  const names = split(head).map((h) => h.replace(/^"|"$/g, '').trim());
  const rows = lines.slice(1).map(split);
  const warnings: string[] = [];

  const find = (table: [0 | 1 | 2, RegExp][], axis: 0 | 1 | 2) => {
    const re = table.find(([a]) => a === axis)?.[1];
    return re ? names.findIndex((n) => re.test(n)) : -1;
  };
  const centerCols = [find(CENTER, 0), find(CENTER, 1), find(CENTER, 2)];
  if (centerCols.some((c) => c < 0))
    throw new Error(
      'No se encontraron las columnas del centro del bloque (_XC, _YC, _ZC o X, Y, Z)',
    );
  const sizeCols = [find(SIZE, 0), find(SIZE, 1), find(SIZE, 2)];

  const n = rows.length;
  const centers = new Float64Array(n * 3);
  const sizes = new Float32Array(n * 3);
  let missingSize = false;
  let bad = 0;
  let k = 0;
  const keptRows: string[][] = [];
  for (const r of rows) {
    const c = centerCols.map((i) => parseNumber(r[i]));
    if (!c.every(Number.isFinite)) {
      bad++;
      continue;
    }
    for (let a = 0; a < 3; a++) {
      centers[k * 3 + a] = c[a] ?? 0;
      const s = parseNumber(r[sizeCols[a] ?? -1]);
      if (Number.isFinite(s) && s > 0) sizes[k * 3 + a] = s;
      else missingSize = true;
    }
    keptRows.push(r);
    k++;
  }
  if (bad > 0) warnings.push(`${String(bad)} filas sin centro válido se omitieron`);
  const count = k;
  const centersOut = centers.subarray(0, count * 3);
  const sizesOut = sizes.subarray(0, count * 3);
  if (missingSize) fillSizes(centersOut, sizesOut, warnings);

  // Atributos: todo lo que no es centro, tamaño ni definición del modelo (`_` inicial).
  const skip = new Set([...centerCols, ...sizeCols]);
  const attrCols = names
    .map((name, i) => ({ name, i }))
    .filter(({ name, i }) => !skip.has(i) && name !== '' && !name.startsWith('_'));
  const numeric: BlockNumericAttribute[] = [];
  const categorical: BlockCategoryAttribute[] = [];
  const dropped: string[] = [];
  const maxNumeric = Math.max(1, Math.floor(MAX_NUMERIC_VALUES / Math.max(1, count)));
  for (const { name, i } of attrCols) {
    let numbers = 0;
    let texts = 0;
    for (const r of keptRows) {
      const v = r[i] ?? '';
      if (v === '') continue;
      if (Number.isFinite(parseNumber(v))) numbers++;
      else texts++;
    }
    if (numbers === 0 && texts === 0) continue;
    if (texts === 0) {
      if (numeric.length >= maxNumeric) {
        dropped.push(name);
        continue;
      }
      const values = new Float32Array(count);
      keptRows.forEach((r, j) => {
        values[j] = parseNumber(r[i]);
      });
      numeric.push({ name, values });
    } else {
      const categories: string[] = [];
      const index = new Map<string, number>();
      const codes = new Uint32Array(count);
      keptRows.forEach((r, j) => {
        const v = r[i] ?? '';
        let code = index.get(v);
        if (code === undefined) {
          code = categories.length;
          categories.push(v);
          index.set(v, code);
        }
        codes[j] = code;
      });
      categorical.push({ name, categories, codes });
    }
  }
  if (dropped.length > 0)
    warnings.push(`Modelo grande: se omitieron ${String(dropped.length)} atributos numéricos`);

  const headerRotation = rotationFromHeader(names, rows[0]);
  const rotation = inferRotation(centersOut, sizesOut, headerRotation);
  const density = numeric.find((a) => DENSITY.test(a.name))?.name;
  return {
    centers: centersOut,
    sizes: sizesOut,
    rotation,
    numeric,
    categorical,
    ...(density ? { densityAttribute: density } : {}),
    warnings,
    dropped,
  };
}

/**
 * Giro de la cabecera Datamine: `_ROTANGLE1` alrededor de `_ROTAXIS1` (3 = Z), en grados. Solo se
 * usa el giro alrededor de Z (los modelos con buzamiento se dibujan sin él, con aviso).
 */
function rotationFromHeader(names: string[], first: string[] | undefined): number | null {
  if (!first) return null;
  const at = (n: string) => {
    const i = names.findIndex((h) => h.toUpperCase() === n);
    return i < 0 ? NaN : parseNumber(first[i]);
  };
  const angle = at('_ROTANGLE1');
  const axis = at('_ROTAXIS1');
  if (!Number.isFinite(angle) || angle === 0) return Number.isFinite(angle) ? 0 : null;
  if (Number.isFinite(axis) && axis !== 3) return null;
  return (angle * Math.PI) / 180;
}

/**
 * Giro real de la grilla, medido en los datos: dirección del vecino más cercano en el mismo nivel
 * (módulo 90°). Si la cabecera da un giro, se elige el signo que coincide con lo medido (cada
 * programa usa su convención); si no hay vecinos, se usa la cabecera tal cual.
 */
export function inferRotation(
  centers: Float64Array,
  sizes: Float32Array,
  header: number | null,
): number {
  const n = centers.length / 3;
  const angles: number[] = [];
  const sample = Math.min(n, 400);
  const step = Math.max(1, Math.floor(n / sample));
  for (let i = 0; i < n && angles.length < sample; i += step) {
    const x = centers[i * 3] ?? 0;
    const y = centers[i * 3 + 1] ?? 0;
    const z = centers[i * 3 + 2] ?? 0;
    const size = Math.min(sizes[i * 3] ?? 0, sizes[i * 3 + 1] ?? 0) || Infinity;
    let best = Infinity;
    let bx = 0;
    let by = 0;
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      if (Math.abs((centers[j * 3 + 2] ?? 0) - z) > 1e-3) continue;
      const dx = (centers[j * 3] ?? 0) - x;
      const dy = (centers[j * 3 + 1] ?? 0) - y;
      const d = dx * dx + dy * dy;
      if (d > 1e-6 && d < best) {
        best = d;
        bx = dx;
        by = dy;
      }
    }
    // Solo vecinos de lado (no en diagonal ni lejanos).
    if (Number.isFinite(best) && Math.sqrt(best) <= size * 1.05)
      angles.push(mod90(Math.atan2(by, bx)));
  }
  if (angles.length === 0) return header ?? 0;
  angles.sort((a, b) => a - b);
  const measured = angles[Math.floor(angles.length / 2)] ?? 0;
  if (header === null) return measured;
  const candidates = [header, -header];
  const diff = (a: number) => {
    const d = Math.abs(mod90(a) - measured);
    return Math.min(d, Math.PI / 2 - d);
  };
  return candidates.reduce((a, b) => (diff(b) < diff(a) ? b : a));
}

const mod90 = (a: number) => {
  const q = Math.PI / 2;
  return ((a % q) + q) % q;
};

/** Bloques sin tamaño: el paso más común entre centros de cada eje (modelo regular). */
function fillSizes(centers: Float64Array, sizes: Float32Array, warnings: string[]): void {
  const n = centers.length / 3;
  for (let a = 0; a < 3; a++) {
    const values = new Set<number>();
    for (let i = 0; i < n; i++) values.add(Math.round((centers[i * 3 + a] ?? 0) * 1000) / 1000);
    const sorted = [...values].sort((x, y) => x - y);
    const gaps = new Map<number, number>();
    for (let i = 1; i < sorted.length; i++) {
      const g = Math.round(((sorted[i] ?? 0) - (sorted[i - 1] ?? 0)) * 100) / 100;
      if (g > 0) gaps.set(g, (gaps.get(g) ?? 0) + 1);
    }
    const step = [...gaps.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? 1;
    for (let i = 0; i < n; i++) if (!(sizes[i * 3 + a] ?? 0)) sizes[i * 3 + a] = step;
  }
  warnings.push('El archivo no trae el tamaño de los bloques: se dedujo del espaciamiento');
}

// ===================== Color por atributo =====================

/** Paleta de categorías (litología, material): distinguibles y legibles sobre fondo oscuro. */
export const BLOCK_CATEGORY_COLORS: readonly [number, number, number][] = [
  [230, 159, 0],
  [86, 180, 233],
  [0, 158, 115],
  [240, 228, 66],
  [0, 114, 178],
  [213, 94, 0],
  [204, 121, 167],
  [160, 160, 160],
  [140, 86, 75],
  [148, 103, 189],
  [23, 190, 207],
  [188, 189, 34],
];

export interface BlockColoring {
  /** RGB por bloque (0–255). */
  colors: Uint8Array;
  /** 1 = se dibuja; 0 = filtrado o sin dato. */
  visible: Uint8Array;
  legend:
    | { kind: 'numeric'; attribute: string; min: number; max: number }
    | {
        kind: 'category';
        attribute: string;
        items: { name: string; color: [number, number, number]; count: number }[];
      };
}

/**
 * Colores de un modelo de bloques por un atributo: escala turbo entre `min` y `max` (por defecto
 * percentiles 2–98, que no deja que un valor extremo aplaste la escala) o un color por categoría.
 * `range` filtra: los bloques fuera de él no se dibujan (p. ej. solo ley ≥ corte).
 */
export function colorBlocks(
  model: BlockModelData,
  attribute: string,
  turbo: (t: number) => [number, number, number],
  range?: { min?: number; max?: number },
): BlockColoring {
  const n = model.centers.length / 3;
  const colors = new Uint8Array(n * 3);
  const visible = new Uint8Array(n).fill(1);
  const cat = model.categorical.find((a) => a.name === attribute);
  if (cat) {
    const counts = new Array<number>(cat.categories.length).fill(0);
    for (let i = 0; i < n; i++) {
      const code = cat.codes[i] ?? 0;
      counts[code] = (counts[code] ?? 0) + 1;
      const c = BLOCK_CATEGORY_COLORS[code % BLOCK_CATEGORY_COLORS.length] ?? [200, 200, 200];
      colors.set(c, i * 3);
    }
    return {
      colors,
      visible,
      legend: {
        kind: 'category',
        attribute,
        items: cat.categories.map((name, k) => ({
          name: name === '' ? '(vacío)' : name,
          color: BLOCK_CATEGORY_COLORS[k % BLOCK_CATEGORY_COLORS.length] ?? [200, 200, 200],
          count: counts[k] ?? 0,
        })),
      },
    };
  }
  const num = model.numeric.find((a) => a.name === attribute);
  if (!num) {
    colors.fill(180);
    return { colors, visible, legend: { kind: 'numeric', attribute, min: 0, max: 0 } };
  }
  const finite = Array.from(num.values)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const pick = (q: number) =>
    finite[Math.min(finite.length - 1, Math.floor(q * finite.length))] ?? 0;
  const min = range?.min ?? pick(0.02);
  const max = range?.max ?? pick(0.98);
  const span = max - min || 1;
  for (let i = 0; i < n; i++) {
    const v = num.values[i] ?? NaN;
    if (
      !Number.isFinite(v) ||
      (range?.min !== undefined && v < range.min) ||
      (range?.max !== undefined && v > range.max)
    ) {
      visible[i] = 0;
      continue;
    }
    colors.set(turbo((v - min) / span), i * 3);
  }
  return { colors, visible, legend: { kind: 'numeric', attribute, min, max } };
}

/** Volumen [m³] y tonelaje [t] de los bloques visibles (densidad del atributo o la dada). */
export function blockTotals(
  model: BlockModelData,
  visible?: Uint8Array,
  fallbackDensity = 2.7,
): { blocks: number; volume: number; tonnes: number } {
  const dens = model.numeric.find((a) => a.name === model.densityAttribute)?.values;
  let blocks = 0;
  let volume = 0;
  let tonnes = 0;
  for (let i = 0; i < model.centers.length / 3; i++) {
    if (visible && !visible[i]) continue;
    const v =
      (model.sizes[i * 3] ?? 0) * (model.sizes[i * 3 + 1] ?? 0) * (model.sizes[i * 3 + 2] ?? 0);
    const d = dens?.[i];
    blocks++;
    volume += v;
    tonnes += v * (d !== undefined && Number.isFinite(d) && d > 0 ? d : fallbackDensity);
  }
  return { blocks, volume, tonnes };
}
