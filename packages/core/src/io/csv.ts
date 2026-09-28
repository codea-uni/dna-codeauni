import { holeToe, lengthToFloor } from '../geometry/hole';
import { unitToAzimuth } from '../geometry/vec';
import { newId } from '../model/ids';
import type {
  Bench,
  Hole,
  HoleGroup,
  HoleGroupKind,
  Meters,
  SubdrillConvention,
} from '../model/types';

// ------------------------------------------------------------------ Parseo genérico

export interface CsvTable {
  delimiter: string;
  /** false si la primera fila ya son datos (se nombran «Columna 1…»). */
  hasHeader: boolean;
  headers: string[];
  rows: string[][];
}

export type TextEncodingName = 'utf-8' | 'windows-1252';

/**
 * Decodifica un archivo de texto (`docs/theory/03 §5`, trampa de codificación). Sin codificación
 * indicada: UTF-8 si es válido; si no, Windows-1252, superconjunto imprimible de ISO-8859-1 (los
 * acentos y la ñ de archivos de Windows).
 */
export function decodeText(
  bytes: Uint8Array,
  encoding?: TextEncodingName,
): { text: string; encoding: TextEncodingName } {
  if (encoding) return { text: new TextDecoder(encoding).decode(bytes), encoding };
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), encoding: 'utf-8' };
  } catch {
    return { text: new TextDecoder('windows-1252').decode(bytes), encoding: 'windows-1252' };
  }
}

/**
 * Detecta el separador por la primera línea (sin lo que va entre comillas). Tab y punto y coma
 * tienen prioridad sobre la coma: la coma aparece dentro de números como separador decimal o de
 * miles (`272,345.578`, `docs/theory/03 §5`), el tab y el punto y coma no.
 */
export function detectDelimiter(text: string): string {
  const line = (text.split(/\r?\n/, 1)[0] ?? '').replace(/"[^"]*"/g, '');
  return ['\t', ';'].find((d) => line.includes(d)) ?? ',';
}

/**
 * Parser CSV (RFC 4180): comillas dobles, comillas escapadas y saltos de línea dentro de campos.
 * Sin `hasHeader`, la primera fila es encabezado solo si ninguna celda es un número (CR-04 viene
 * sin encabezado: «ID, Este, Norte, Cota»).
 */
export function parseCsv(
  text: string,
  delimiter = detectDelimiter(text),
  hasHeader?: boolean,
): CsvTable {
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
  const header = hasHeader ?? !(rows[0] ?? []).some((c) => Number.isFinite(parseNumber(c)));
  const width = rows.reduce((w, r) => Math.max(w, r.length), 0);
  const headers = header
    ? (rows.shift() ?? []).map((h) => h.trim())
    : Array.from({ length: width }, (_, i) => `Columna ${String(i + 1)}`);
  return { delimiter, hasHeader: header, headers, rows };
}

/** Separador de miles de un archivo: `,` (272,345.578), `.` (1.234,5) o ninguno. */
export type ThousandsSeparator = ',' | '.' | null;

/**
 * Detecta el separador de miles del archivo (`docs/theory/03 §5`): si alguna celda trae ambos
 * separadores, el último es el decimal y el otro separa miles en todo el archivo. Así «274,600»
 * se lee como 274600 en un archivo con «272,345.578», y como 274,6 en uno sin miles.
 */
export function detectThousands(rows: readonly (readonly string[])[]): ThousandsSeparator {
  for (const row of rows)
    for (const cell of row) {
      if (/\d,\d{3}(,\d{3})*\.\d/.test(cell)) return ',';
      if (/\d\.\d{3}(\.\d{3})*,\d/.test(cell)) return '.';
    }
  return null;
}

/**
 * Número con punto o coma decimal; NaN si no es válido. Con `thousands` (del archivo) ese
 * separador se quita. Sin él, una celda con ambos toma el último como decimal: `272,345.578` →
 * 272345.578 y `1.234,5` → 1234.5; varias comas sin punto son miles (`8,944,820`).
 */
export function parseNumber(text: string | undefined, thousands?: ThousandsSeparator): number {
  if (text === undefined) return NaN;
  let t = text.trim().replace(/\s/g, '');
  if (t === '') return NaN;
  const sep =
    thousands ??
    (t.includes(',') && t.includes('.')
      ? t.lastIndexOf(',') > t.lastIndexOf('.')
        ? '.'
        : ','
      : (t.match(/,/g)?.length ?? 0) > 1
        ? ','
        : null);
  if (sep) t = t.split(sep).join('');
  const n = Number(t.replace(',', '.'));
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
  | 'col'
  | 'group';

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
  { field: 'group', label: 'Grupo' },
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
  group: ['group', 'grupo', 'tipo', 'type', 'zona'],
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

/**
 * Mapeo por posición para archivos sin encabezado: «ID, Este, Norte, Cota» si la primera columna
 * no es numérica (formato de CR-04); si lo es, «Este, Norte, Cota».
 */
export function positionalHoleMapping(firstRow: readonly string[]): HoleCsvMapping {
  const o = Number.isFinite(parseNumber(firstRow[0])) ? 0 : 1;
  const mapping: HoleCsvMapping = { x: o, y: o + 1 };
  if (o === 1) mapping.label = 0;
  if (firstRow.length > o + 2) mapping.z = o + 2;
  return mapping;
}

export interface HoleCsvDefaults {
  diameter: Meters;
  subdrill: Meters;
  bench: Bench;
  /** Primer número para etiquetas si el archivo no las trae. */
  startNumber: number;
  /** Etiquetas que ya existen en la voladura (vacío si se reemplazan). */
  existingLabels?: readonly string[];
  /** Grupos de la voladura, para asignar la columna Grupo por nombre. */
  groups?: readonly HoleGroup[];
  /** CRS del proyecto, para revisar el rango de las coordenadas. */
  epsg?: number;
  /** Sin columna Grupo: el grupo es el prefijo de letras del ID (CR-04: A, B, C, BF). */
  groupFromPrefix?: boolean;
  /** Convención de sobreperforación de la voladura (P-05). */
  subdrillConvention?: SubdrillConvention;
}

/** Aviso de importación (no impide importar): `docs/theory/03 §5`. */
export interface ImportWarning {
  kind: 'noZ' | 'zeroZ' | 'swapXY' | 'outOfCrs' | 'outlier';
  message: string;
  /** Valores que interpola `message`, para traducirlo en la interfaz (G8). */
  params?: Record<string, string | number>;
  /** Etiquetas afectadas (vacío si afecta a todo el archivo). */
  labels: string[];
}

export interface HoleCsvImport {
  holes: Hole[];
  errors: { line: number; message: string }[];
  warnings: ImportWarning[];
  /** Grupos nuevos creados a partir de la columna Grupo. */
  groups: HoleGroup[];
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
  const noZ: string[] = [];
  const zeroZ: string[] = [];
  const seen = new Map<string, number>(
    (defaults.existingLabels ?? []).map((l) => [l.toLowerCase(), 0] as const),
  );
  const groupByName = new Map(
    (defaults.groups ?? []).map((g) => [g.name.trim().toLowerCase(), g] as const),
  );
  const newGroups: HoleGroup[] = [];
  const lenK = units.length === 'ft' ? 0.3048 : 1;
  const diaK = units.diameter === 'mm' ? 0.001 : units.diameter === 'in' ? 0.0254 : 1;
  const angK = units.angle === 'deg' ? DEG : 1;
  const thousands = detectThousands(table.rows);
  const get = (row: string[], f: HoleCsvField) => {
    const i = mapping[f];
    return i === undefined || i < 0 ? NaN : parseNumber(row[i], thousands);
  };
  let next = defaults.startNumber;
  table.rows.forEach((row, r) => {
    const line = r + (table.hasHeader ? 2 : 1);
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
        : lengthToFloor(
            z,
            defaults.bench.floorElevation,
            subdrill,
            inclination,
            defaults.subdrillConvention,
          );
    }
    if (!(length >= 0) || inclination >= Math.PI / 2) {
      errors.push({ line, message: 'Geometría inválida (longitud negativa o taladro horizontal)' });
      return;
    }
    const labelIdx = mapping.label;
    const labelText = labelIdx !== undefined && labelIdx >= 0 ? (row[labelIdx] ?? '').trim() : '';
    const label = labelText || String(next++);
    const firstLine = seen.get(label.toLowerCase());
    if (firstLine !== undefined) {
      errors.push({
        line,
        message: `ID duplicado «${label}»${firstLine > 0 ? ` (ya en la línea ${String(firstLine)})` : ' (ya existe en la voladura)'}`,
      });
      return;
    }
    seen.set(label.toLowerCase(), line);
    if (!Number.isFinite(zRaw)) noZ.push(label);
    else if (zRaw === 0) zeroZ.push(label);
    const hole: Hole = {
      id: newId<'Hole'>(),
      label,
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
    const groupIdx = mapping.group;
    const groupName =
      groupIdx !== undefined && groupIdx >= 0
        ? (row[groupIdx] ?? '').trim()
        : defaults.groupFromPrefix
          ? (/^\p{L}+/u.exec(label)?.[0] ?? '')
          : '';
    if (groupName) {
      let group = groupByName.get(groupName.toLowerCase());
      if (!group) {
        group = makeGroup(groupName, newGroups.length + (defaults.groups?.length ?? 0));
        groupByName.set(groupName.toLowerCase(), group);
        newGroups.push(group);
      }
      hole.groupId = group.id;
    }
    holes.push(hole);
  });
  const warnings: ImportWarning[] = [];
  if (noZ.length > 0)
    warnings.push({
      kind: 'noZ',
      message: `${String(noZ.length)} taladros sin cota: se usó la superficie del banco.`,
      params: { count: noZ.length },
      labels: noZ,
    });
  if (zeroZ.length > 0)
    warnings.push({
      kind: 'zeroZ',
      message: `${String(zeroZ.length)} taladros con cota 0: revisa si falta la cota.`,
      params: { count: zeroZ.length },
      labels: zeroZ,
    });
  warnings.push(...checkHolePositions(holes, defaults.epsg));
  return { holes, errors, warnings, groups: newGroups };
}

const GROUP_COLORS = ['#e3b341', '#58a6ff', '#f778ba', '#56d364', '#ff7b72', '#a371f7'];

/** Grupo nuevo; el tipo se infiere del nombre (precorte, buffer, producción; RM-18). */
export function makeGroup(name: string, index: number): HoleGroup {
  const n = name.toLowerCase();
  const kind: HoleGroupKind = /precorte|presplit|pre-corte/.test(n)
    ? 'presplit'
    : /buffer|amortigu|^bf$/.test(n)
      ? 'buffer'
      : n.includes('prod')
        ? 'production'
        : 'other';
  return {
    id: newId<'HoleGroup'>(),
    name,
    kind,
    color: GROUP_COLORS[index % GROUP_COLORS.length] ?? '#8b949e',
  };
}

const median = (xs: readonly number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? (s[m] ?? NaN) : ((s[m - 1] ?? NaN) + (s[m] ?? NaN)) / 2;
};

/**
 * Rango UTM del CRS, si es una proyección UTM conocida: WGS 84 (EPSG 326zz norte, 327zz sur) y
 * PSAD56 / UTM 17S–19S (EPSG 24877–24879, usado en Perú).
 */
function utmRange(epsg: number | undefined): { south: boolean } | null {
  if (epsg === undefined) return null;
  if (epsg >= 32601 && epsg <= 32660) return { south: false };
  if ((epsg >= 32701 && epsg <= 32760) || (epsg >= 24877 && epsg <= 24879)) return { south: true };
  return null;
}

const eastingOk = (e: number) => e >= 100_000 && e <= 900_000;
const northingOk = (n: number, south: boolean) =>
  south ? n >= 1_000_000 && n <= 10_000_000 : n >= 0 && n <= 9_400_000;

/**
 * Revisa posiciones importadas (`docs/theory/03 §5`):
 * - Norte y Este intercambiados: con un CRS UTM, fuera de rango y dentro si se intercambian; sin
 *   CRS UTM, «Este» de 7 cifras y «Norte» de 6 (en el hemisferio sur el Norte tiene 7).
 * - Fuera del rango del CRS (¿CRS distinto al del proyecto?).
 * - Atípicos: a más de max(10 × mediana, 1 km) del centro de la nube.
 *   ponytail: umbral fijo y simple; si da falsos avisos con mallas muy alargadas, usar MAD por eje.
 */
export function checkHolePositions(
  holes: readonly Pick<Hole, 'label' | 'collar'>[],
  epsg?: number,
): ImportWarning[] {
  if (holes.length === 0) return [];
  const warnings: ImportWarning[] = [];
  const mx = median(holes.map((h) => h.collar.x));
  const my = median(holes.map((h) => h.collar.y));
  const utm = utmRange(epsg);
  if (utm) {
    const ok = eastingOk(mx) && northingOk(my, utm.south);
    if (!ok && eastingOk(my) && northingOk(mx, utm.south))
      warnings.push({
        kind: 'swapXY',
        message:
          'Este y Norte parecen intercambiados: los valores caen fuera del rango UTM del proyecto y dentro si se intercambian.',
        params: { variant: 'utm' },
        labels: [],
      });
    else if (!ok)
      warnings.push({
        kind: 'outOfCrs',
        message: `Las coordenadas caen fuera del rango UTM del EPSG ${String(epsg)}: revisa si el archivo usa otro CRS o coordenadas locales.`,
        params: { epsg: String(epsg) },
        labels: [],
      });
  } else if (mx >= 1_000_000 && mx < 10_000_000 && my >= 100_000 && my < 1_000_000) {
    warnings.push({
      kind: 'swapXY',
      message: 'Este y Norte parecen intercambiados: el Este tiene 7 cifras y el Norte 6.',
      params: { variant: 'digits' },
      labels: [],
    });
  }
  const d = holes.map((h) => Math.hypot(h.collar.x - mx, h.collar.y - my));
  const limit = Math.max(10 * median(d), 1000);
  const outliers = holes.filter((_, i) => (d[i] ?? 0) > limit).map((h) => h.label);
  if (outliers.length > 0) {
    const list = `${outliers.slice(0, 5).join(', ')}${outliers.length > 5 ? '…' : ''}`;
    warnings.push({
      kind: 'outlier',
      message: `${String(outliers.length)} taladros a más de ${limit.toFixed(0)} m del resto: ${list}.`,
      params: { count: outliers.length, limit: limit.toFixed(0), list },
      labels: outliers,
    });
  }
  return warnings;
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
