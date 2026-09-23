import { holeToe, lengthToFloor } from '../geometry/hole';
import { unitToAzimuth } from '../geometry/vec';
import { newId } from '../model/ids';
import type { Bench, Hole, Meters } from '../model/types';

// ------------------------------------------------------------------ Parseo genérico

export interface CsvTable {
  delimiter: string;
  headers: string[];
  rows: string[][];
}

/** Detecta el separador por la primera línea: tab, punto y coma o coma. */
export function detectDelimiter(text: string): string {
  const line = text.split(/\r?\n/, 1)[0] ?? '';
  const counts = ['\t', ';', ','].map((d) => [d, line.split(d).length - 1] as const);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0] && counts[0][1] > 0 ? counts[0][0] : ',';
}

/** Parser CSV (RFC 4180): comillas dobles, comillas escapadas y saltos de línea dentro de campos. */
export function parseCsv(text: string, delimiter = detectDelimiter(text)): CsvTable {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text; // quita BOM
  for (let i = 0; i < src.length; i++) {
    const ch = src.charAt(i);
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"' && field === '') {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== '')) rows.push(row);
  const headers = (rows.shift() ?? []).map((h) => h.trim());
  return { delimiter, headers, rows };
}

/** Número con punto o coma decimal; NaN si no es válido. */
export function parseNumber(text: string | undefined): number {
  if (text === undefined) return NaN;
  const t = text.trim().replace(/\s/g, '');
  if (t === '') return NaN;
  // "1.234,5" → 1234.5 ; "1,5" → 1.5 ; "1234.5" → 1234.5
  const normalized =
    t.includes(',') && t.includes('.')
      ? t.replace(/\./g, '').replace(',', '.')
      : t.replace(',', '.');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : NaN;
}

function quote(value: string, delimiter: string): string {
  return /["\r\n]/.test(value) || value.includes(delimiter)
    ? `"${value.replace(/"/g, '""')}"`
    : value;
}

// ------------------------------------------------------------------ Taladros

export type HoleCsvField =
  | 'label'
  | 'x'
  | 'y'
  | 'z'
  | 'toeX'
  | 'toeY'
  | 'toeZ'
  | 'length'
  | 'diameter'
  | 'inclination'
  | 'azimuth'
  | 'subdrill'
  | 'row'
  | 'col';

export const HOLE_CSV_FIELDS: { field: HoleCsvField; label: string; required?: boolean }[] = [
  { field: 'label', label: 'Etiqueta' },
  { field: 'x', label: 'Este (X) boca', required: true },
  { field: 'y', label: 'Norte (Y) boca', required: true },
  { field: 'z', label: 'Cota (Z) boca' },
  { field: 'toeX', label: 'Este (X) fondo' },
  { field: 'toeY', label: 'Norte (Y) fondo' },
  { field: 'toeZ', label: 'Cota (Z) fondo' },
  { field: 'length', label: 'Longitud' },
  { field: 'diameter', label: 'Diámetro' },
  { field: 'inclination', label: 'Inclinación' },
  { field: 'azimuth', label: 'Azimut' },
  { field: 'subdrill', label: 'Sobreperforación' },
  { field: 'row', label: 'Fila' },
  { field: 'col', label: 'Columna' },
];

/** Índice de columna por campo (−1 o ausente = no mapeado). */
export type HoleCsvMapping = Partial<Record<HoleCsvField, number>>;

export interface HoleCsvUnits {
  length: 'm' | 'ft';
  diameter: 'mm' | 'in' | 'm';
  angle: 'deg' | 'rad';
  /** Convención de la inclinación en el archivo. */
  inclination: 'fromVertical' | 'fromHorizontal';
}

export const DEFAULT_CSV_UNITS: HoleCsvUnits = {
  length: 'm',
  diameter: 'mm',
  angle: 'deg',
  inclination: 'fromVertical',
};

const ALIASES: Record<HoleCsvField, string[]> = {
  label: [
    'label',
    'id',
    'hole',
    'holeid',
    'hole_id',
    'name',
    'nombre',
    'etiqueta',
    'taladro',
    'pozo',
    'numero',
    'num',
  ],
  x: [
    'x',
    'este',
    'east',
    'easting',
    'collar_x',
    'collarx',
    'x_collar',
    'boca_x',
    'xboca',
    'x_boca',
    'e',
  ],
  y: [
    'y',
    'norte',
    'north',
    'northing',
    'collar_y',
    'collary',
    'y_collar',
    'boca_y',
    'yboca',
    'y_boca',
    'n',
  ],
  z: [
    'z',
    'cota',
    'elev',
    'elevation',
    'rl',
    'collar_z',
    'collarz',
    'z_collar',
    'boca_z',
    'zboca',
    'z_boca',
  ],
  toeX: ['toe_x', 'toex', 'x_toe', 'fondo_x', 'xfondo', 'x_fondo', 'end_x'],
  toeY: ['toe_y', 'toey', 'y_toe', 'fondo_y', 'yfondo', 'y_fondo', 'end_y'],
  toeZ: ['toe_z', 'toez', 'z_toe', 'fondo_z', 'zfondo', 'z_fondo', 'end_z'],
  length: ['length', 'length_m', 'len', 'longitud', 'largo', 'profundidad', 'depth', 'long'],
  diameter: ['diameter', 'diameter_mm', 'diam', 'dia', 'diametro', 'diámetro', 'diametro_mm'],
  inclination: [
    'inclination',
    'inclination_deg',
    'incl',
    'inclinacion',
    'inclinación',
    'angle',
    'angulo',
    'dip',
    'buzamiento',
  ],
  azimuth: ['azimuth', 'azimuth_deg', 'azi', 'az', 'azimut', 'rumbo', 'bearing'],
  subdrill: ['subdrill', 'subdrill_m', 'sobreperforacion', 'sobreperforación', 'pasadura', 'sp'],
  row: ['row', 'fila'],
  col: ['col', 'column', 'columna'],
};

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[\s.()[\]]+/g, '_')
    .replace(/_+$/, '');

/** Adivina el mapeo por nombre de encabezado. */
export function guessHoleMapping(headers: readonly string[]): HoleCsvMapping {
  const mapping: HoleCsvMapping = {};
  const used = new Set<number>();
  for (const { field } of HOLE_CSV_FIELDS) {
    const aliases = ALIASES[field].map(normalize);
    const idx = headers.findIndex((h, i) => !used.has(i) && aliases.includes(normalize(h)));
    if (idx >= 0) {
      mapping[field] = idx;
      used.add(idx);
    }
  }
  return mapping;
}

export interface HoleCsvDefaults {
  diameter: Meters;
  subdrill: Meters;
  bench: Bench;
  /** Primer número para etiquetas si el archivo no las trae. */
  startNumber: number;
}

export interface HoleCsvImport {
  holes: Hole[];
  errors: { line: number; message: string }[];
}

const DEG = Math.PI / 180;

/**
 * Convierte filas CSV en taladros. Geometría (en orden de prioridad):
 * 1. Con longitud (e inclinación/azimut opcionales): se usan tal cual.
 * 2. Sin longitud pero con fondo XYZ: longitud, inclinación y azimut se derivan de boca → fondo.
 * 3. Sin ninguno: longitud hasta piso + sobreperforación del banco.
 * Sin cota de boca se usa la superficie del banco.
 */
export function importHolesFromCsv(
  table: CsvTable,
  mapping: HoleCsvMapping,
  units: HoleCsvUnits,
  defaults: HoleCsvDefaults,
): HoleCsvImport {
  const holes: Hole[] = [];
  const errors: HoleCsvImport['errors'] = [];
  const lenK = units.length === 'ft' ? 0.3048 : 1;
  const diaK = units.diameter === 'mm' ? 0.001 : units.diameter === 'in' ? 0.0254 : 1;
  const angK = units.angle === 'deg' ? DEG : 1;
  const get = (row: string[], f: HoleCsvField) => {
    const i = mapping[f];
    return i === undefined || i < 0 ? NaN : parseNumber(row[i]);
  };
  let next = defaults.startNumber;
  table.rows.forEach((row, r) => {
    const line = r + 2; // 1 = encabezado
    const x = get(row, 'x') * lenK;
    const y = get(row, 'y') * lenK;
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      errors.push({ line, message: 'X o Y de boca no numéricos' });
      return;
    }
    const zRaw = get(row, 'z');
    const z = Number.isFinite(zRaw)
      ? zRaw * lenK
      : defaults.bench.floorElevation + defaults.bench.height;
    const subdrillRaw = get(row, 'subdrill');
    const subdrill = Number.isFinite(subdrillRaw) ? subdrillRaw * lenK : defaults.subdrill;
    const diaRaw = get(row, 'diameter');
    const diameter = Number.isFinite(diaRaw) && diaRaw > 0 ? diaRaw * diaK : defaults.diameter;

    let length: number;
    let inclination: number;
    let azimuth: number;
    const tx = get(row, 'toeX') * lenK;
    const ty = get(row, 'toeY') * lenK;
    const tz = get(row, 'toeZ') * lenK;
    const lenRaw = get(row, 'length');
    if (
      !Number.isFinite(lenRaw) &&
      Number.isFinite(tx) &&
      Number.isFinite(ty) &&
      Number.isFinite(tz)
    ) {
      const dx = tx - x;
      const dy = ty - y;
      const dz = z - tz;
      length = Math.hypot(dx, dy, dz);
      const horizontal = Math.hypot(dx, dy);
      inclination = Math.atan2(horizontal, dz);
      azimuth = horizontal > 1e-9 ? unitToAzimuth(dx, dy) : 0;
    } else {
      const incRaw = get(row, 'inclination');
      let inc = Number.isFinite(incRaw) ? incRaw * angK : 0;
      if (Number.isFinite(incRaw) && units.inclination === 'fromHorizontal')
        inc = Math.PI / 2 - Math.abs(inc);
      inclination = Math.abs(inc);
      const azRaw = get(row, 'azimuth');
      azimuth = Number.isFinite(azRaw)
        ? (((azRaw * angK) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
        : 0;
      length = Number.isFinite(lenRaw)
        ? lenRaw * lenK
        : lengthToFloor(z, defaults.bench.floorElevation, subdrill, inclination);
    }
    if (!(length >= 0) || inclination >= Math.PI / 2) {
      errors.push({ line, message: 'Geometría inválida (longitud negativa o taladro horizontal)' });
      return;
    }
    const labelIdx = mapping.label;
    const labelText = labelIdx !== undefined && labelIdx >= 0 ? (row[labelIdx] ?? '').trim() : '';
    const hole: Hole = {
      id: newId<'Hole'>(),
      label: labelText || String(next++),
      collar: { x, y, z },
      diameter,
      length,
      inclination,
      azimuth,
      subdrill,
      decks: [],
      initiators: [],
      status: 'designed',
    };
    const rowN = get(row, 'row');
    const colN = get(row, 'col');
    if (Number.isInteger(rowN)) hole.row = rowN;
    if (Number.isInteger(colN)) hole.col = colN;
    holes.push(hole);
  });
  return { holes, errors };
}

/** Exporta taladros a CSV (SI: m, mm, grados), con boca y fondo para no perder geometría. */
export function exportHolesCsv(
  holes: readonly Hole[],
  chargeKg?: ReadonlyMap<string, number>,
  delimiter = ',',
): string {
  const headers = [
    'label',
    'x',
    'y',
    'z',
    'toe_x',
    'toe_y',
    'toe_z',
    'length_m',
    'diameter_mm',
    'inclination_deg',
    'azimuth_deg',
    'subdrill_m',
    'row',
    'col',
  ];
  if (chargeKg) headers.push('charge_kg');
  const fmt = (v: number, d: number) => String(Number(v.toFixed(d)));
  const lines = [headers.join(delimiter)];
  for (const h of holes) {
    const toe = holeToe(h);
    const cells = [
      quote(h.label, delimiter),
      fmt(h.collar.x, 4),
      fmt(h.collar.y, 4),
      fmt(h.collar.z, 4),
      fmt(toe.x, 4),
      fmt(toe.y, 4),
      fmt(toe.z, 4),
      fmt(h.length, 4),
      fmt(h.diameter * 1000, 3),
      fmt(h.inclination / DEG, 7),
      fmt(h.azimuth / DEG, 7),
      fmt(h.subdrill, 4),
      h.row === undefined ? '' : String(h.row),
      h.col === undefined ? '' : String(h.col),
    ];
    if (chargeKg) cells.push(fmt(chargeKg.get(h.id) ?? 0, 2));
    lines.push(cells.join(delimiter));
  }
  return lines.join('\r\n') + '\r\n';
}
