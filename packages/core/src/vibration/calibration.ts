import { uuidv7 } from '../model/ids';
import type { Vec3, VibrationLaw, VibrationLawId } from '../model/types';

/**
 * Calibración de la ley de vibración (factor de terreno) con mediciones de sismógrafo
 * (`docs/RULES.md` FC-50 a FC-52): pequeñas voladuras de prueba medidas a varias distancias, por
 * zona del tajo o de la mina subterránea. Con ellas se ajusta PPV = K · SD^(−β) en log-log.
 */

/** Medición de sismógrafo (un geófono, un disparo). Unidades SI: PPV en m/s, carga en kg. */
export interface SeismographRecord {
  id: string;
  /** Fecha de la voladura (AAAA-MM-DD). */
  date: string;
  /** Zona o sector de la mina (p. ej. «Tajo norte», «Nivel 3370»). */
  zone: string;
  /** Voladura superficial o subterránea. */
  context: 'surface' | 'underground';
  /** Carga máxima por retardo [kg]. */
  charge: number;
  /** Distancia voladura–geófono [m]; si falta, la de las coordenadas. */
  distance?: number;
  blastPosition?: Vec3;
  sensorPosition?: Vec3;
  /** PPV medida [m/s] (componente vectorial máxima o la mayor de las tres). */
  ppv: number;
  /** Frecuencia dominante [Hz], opcional. */
  frequency?: number;
  note?: string;
}

export type LawScaling = VibrationLaw['scaling'];

/** Distancia de la medición [m]: la ingresada o la 3D entre voladura y geófono; null si no hay. */
export function recordDistance(r: SeismographRecord): number | null {
  if (r.distance !== undefined && r.distance > 0) return r.distance;
  if (r.blastPosition && r.sensorPosition) {
    const d = Math.hypot(
      r.sensorPosition.x - r.blastPosition.x,
      r.sensorPosition.y - r.blastPosition.y,
      r.sensorPosition.z - r.blastPosition.z,
    );
    return d > 0 ? d : null;
  }
  return null;
}

/** Distancia escalada SD = R / W^(1/2) o R / W^(1/3). */
export function scaledDistance(distance: number, charge: number, scaling: LawScaling): number {
  return distance / Math.pow(charge, scaling === 'square-root' ? 1 / 2 : 1 / 3);
}

export interface VibrationFit {
  scaling: LawScaling;
  /** K a la mediana (50 %) [m/s]. */
  k: number;
  beta: number;
  r2: number;
  n: number;
  /** Error estándar de la regresión en log10(PPV). */
  stdError: number;
  /** K de la envolvente al 95 %: K · 10^(t₀.₉₅ · s) [m/s]. */
  k95: number;
  /** Rango de distancia escalada de los datos (fuera de él, la ley extrapola). */
  sdMin: number;
  sdMax: number;
  /** Puntos usados (para el gráfico). */
  points: { sd: number; ppv: number; id: string }[];
}

/** t de Student unilateral al 95 % por grados de libertad (1..30); más, 1,645. */
const T95 = [
  6.314, 2.92, 2.353, 2.132, 2.015, 1.943, 1.895, 1.86, 1.833, 1.812, 1.796, 1.782, 1.771, 1.761,
  1.753, 1.746, 1.74, 1.734, 1.729, 1.725, 1.721, 1.717, 1.714, 1.711, 1.708, 1.706, 1.703, 1.701,
  1.699, 1.697,
];
export function studentT95(dof: number): number {
  return dof >= 1 && dof <= 30 ? (T95[dof - 1] ?? 1.645) : 1.645;
}

/**
 * Ajuste por mínimos cuadrados de log10(PPV) = log10(K) − β·log10(SD) (USBM, Devine 1966;
 * Dowding 1985). K95 sale del error estándar de la regresión con t de Student unilateral.
 * null con menos de 3 mediciones válidas o sin dispersión en SD.
 */
export function fitVibrationLaw(
  records: readonly SeismographRecord[],
  scaling: LawScaling,
): VibrationFit | null {
  const points: VibrationFit['points'] = [];
  for (const r of records) {
    const d = recordDistance(r);
    if (d === null || !(r.charge > 0) || !(r.ppv > 0)) continue;
    points.push({ sd: scaledDistance(d, r.charge, scaling), ppv: r.ppv, id: r.id });
  }
  const n = points.length;
  if (n < 3) return null;
  let sx = 0;
  let sy = 0;
  for (const p of points) {
    sx += Math.log10(p.sd);
    sy += Math.log10(p.ppv);
  }
  const mx = sx / n;
  const my = sy / n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const p of points) {
    const dx = Math.log10(p.sd) - mx;
    const dy = Math.log10(p.ppv) - my;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  if (sxx < 1e-12) return null;
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  let sse = 0;
  for (const p of points) {
    const e = Math.log10(p.ppv) - (intercept + slope * Math.log10(p.sd));
    sse += e * e;
  }
  const stdError = n > 2 ? Math.sqrt(sse / (n - 2)) : 0;
  const k = Math.pow(10, intercept);
  return {
    scaling,
    k,
    beta: -slope,
    r2: syy > 0 ? 1 - sse / syy : 1,
    n,
    stdError,
    k95: k * Math.pow(10, studentT95(n - 2) * stdError),
    sdMin: Math.min(...points.map((p) => p.sd)),
    sdMax: Math.max(...points.map((p) => p.sd)),
    points,
  };
}

export interface ZoneFit {
  /** Zona; '' = todas las de ese tipo. */
  zone: string;
  context: SeismographRecord['context'];
  n: number;
  squareRoot: VibrationFit | null;
  cubeRoot: VibrationFit | null;
}

/** Ajustes por tipo (superficial/subterránea) para todas las zonas juntas y para cada zona. */
export function fitByZone(records: readonly SeismographRecord[]): ZoneFit[] {
  const groups = new Map<
    string,
    { zone: string; context: SeismographRecord['context']; list: SeismographRecord[] }
  >();
  const add = (zone: string, context: SeismographRecord['context'], r: SeismographRecord) => {
    const key = `${context}\u0000${zone}`;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { zone, context, list: [] }));
    g.list.push(r);
  };
  for (const r of records) {
    add('', r.context, r);
    if (r.zone.trim()) add(r.zone.trim(), r.context, r);
  }
  const out: ZoneFit[] = [];
  for (const g of groups.values()) {
    // Una sola zona: el grupo «todas» repite el de la zona.
    if (g.zone === '' && [...groups.values()].filter((x) => x.context === g.context).length === 2)
      continue;
    out.push({
      zone: g.zone,
      context: g.context,
      n: g.list.length,
      squareRoot: fitVibrationLaw(g.list, 'square-root'),
      cubeRoot: fitVibrationLaw(g.list, 'cube-root'),
    });
  }
  return out.sort(
    (a, b) =>
      a.context.localeCompare(b.context) ||
      (a.zone === '' ? -1 : b.zone === '' ? 1 : a.zone.localeCompare(b.zone)),
  );
}

/** Ley del proyecto a partir de un ajuste (mediana o envolvente al 95 %). */
export function lawFromFit(
  fit: VibrationFit,
  meta: { zone: string; context: SeismographRecord['context']; level: 50 | 95; name?: string },
): VibrationLaw {
  const where = meta.zone || (meta.context === 'underground' ? 'subterránea' : 'superficial');
  return {
    id: uuidv7() as VibrationLawId,
    name: meta.name ?? `${where} · ${meta.level} %`,
    scaling: fit.scaling,
    k: meta.level === 95 ? fit.k95 : fit.k,
    beta: fit.beta,
    confidence: meta.level / 100,
    context: meta.context,
    fit: { zone: meta.zone, n: fit.n, r2: fit.r2 },
  };
}

// ------------------------------------------------------------------ CSV

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

type Column =
  | 'date'
  | 'zone'
  | 'context'
  | 'charge'
  | 'distance'
  | 'ppv'
  | 'frequency'
  | 'bx'
  | 'by'
  | 'bz'
  | 'sx'
  | 'sy'
  | 'sz'
  | 'note';

const EXACT: Record<string, Column> = {
  bx: 'bx',
  by: 'by',
  bz: 'bz',
  voladurax: 'bx',
  voladuray: 'by',
  voladuraz: 'bz',
  blastx: 'bx',
  blasty: 'by',
  blastz: 'bz',
  gx: 'sx',
  gy: 'sy',
  gz: 'sz',
  geofonox: 'sx',
  geofonoy: 'sy',
  geofonoz: 'sz',
  sensorx: 'sx',
  sensory: 'sy',
  sensorz: 'sz',
  r: 'distance',
  w: 'charge',
  f: 'frequency',
  hz: 'frequency',
};
const PREFIX: [string, Column][] = [
  ['fecha', 'date'],
  ['date', 'date'],
  ['zona', 'zone'],
  ['sector', 'zone'],
  ['zone', 'zone'],
  ['tipo', 'context'],
  ['type', 'context'],
  ['contexto', 'context'],
  ['carga', 'charge'],
  ['charge', 'charge'],
  ['mic', 'charge'],
  ['distancia', 'distance'],
  ['distance', 'distance'],
  ['ppv', 'ppv'],
  ['vpp', 'ppv'],
  ['velocidad', 'ppv'],
  ['frecuencia', 'frequency'],
  ['frequency', 'frequency'],
  ['nota', 'note'],
  ['note', 'note'],
  ['observ', 'note'],
];

function columnOf(header: string): Column | null {
  const h = norm(header);
  if (EXACT[h]) return EXACT[h];
  for (const [p, c] of PREFIX) if (h.startsWith(p)) return c;
  return null;
}

/** Tipo de voladura de un texto libre («subterránea», «UG», «superficial», «tajo»…). */
function contextOf(text: string): SeismographRecord['context'] {
  const t = norm(text);
  return /^(sub|ug|under|inter|mina?sub)/.test(t) ? 'underground' : 'surface';
}

export interface CsvImport {
  records: SeismographRecord[];
  /** Filas descartadas con el motivo (número de línea desde 1). */
  errors: { line: number; reason: string }[];
}

/**
 * Lee mediciones de sismógrafo de un CSV (coma, punto y coma o tabulador; con `;` o tabulador se
 * acepta coma decimal). Columnas reconocidas por su encabezado: fecha, zona/sector, tipo,
 * carga (kg por retardo), distancia (m) o coordenadas de voladura (voladura_x…) y geófono
 * (geofono_x…), PPV (mm/s; «in/s» se convierte), frecuencia (Hz), nota.
 */
export function parseSeismographCsv(
  text: string,
  defaults: Partial<SeismographRecord> = {},
): CsvImport {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  const errors: CsvImport['errors'] = [];
  if (lines.length < 2) return { records: [], errors: [{ line: 1, reason: 'sin datos' }] };
  const head = lines[0] ?? '';
  const sep = [';', '\t', ','].reduce((a, b) =>
    head.split(b).length > head.split(a).length ? b : a,
  );
  const decimalComma = sep !== ',';
  const headers = head.split(sep).map((h) => h.trim());
  const cols = headers.map(columnOf);
  const ppvInches = headers.some((h, i) => cols[i] === 'ppv' && /in\/?s|pulg/i.test(h));
  const ppvMeters = headers.some((h, i) => cols[i] === 'ppv' && /\(m\/s\)/i.test(h));
  if (!cols.includes('ppv') || !cols.includes('charge'))
    return { records: [], errors: [{ line: 1, reason: 'faltan las columnas de carga y PPV' }] };
  const num = (s: string | undefined) => {
    if (s === undefined) return NaN;
    const t = s.trim().replace(/\s/g, '');
    if (t === '') return NaN;
    return Number(decimalComma ? t.replace(',', '.') : t);
  };
  const records: SeismographRecord[] = [];
  for (let li = 1; li < lines.length; li++) {
    const cells = (lines[li] ?? '').split(sep);
    const get = (c: Column) => {
      const i = cols.indexOf(c);
      return i >= 0 ? cells[i] : undefined;
    };
    const charge = num(get('charge'));
    const ppvRaw = num(get('ppv'));
    if (!(charge > 0) || !(ppvRaw > 0)) {
      errors.push({ line: li + 1, reason: 'carga o PPV no válidos' });
      continue;
    }
    const ppv = ppvMeters ? ppvRaw : ppvInches ? ppvRaw * 0.0254 : ppvRaw / 1000;
    const rec: SeismographRecord = {
      id: uuidv7(),
      date: (get('date') ?? defaults.date ?? '').trim(),
      zone: (get('zone') ?? defaults.zone ?? '').trim(),
      context:
        get('context') !== undefined
          ? contextOf(get('context') ?? '')
          : (defaults.context ?? 'surface'),
      charge,
      ppv,
    };
    const d = num(get('distance'));
    if (d > 0) rec.distance = d;
    const bx = num(get('bx'));
    const by = num(get('by'));
    const bz = num(get('bz'));
    const sx = num(get('sx'));
    const sy = num(get('sy'));
    const sz = num(get('sz'));
    if ([bx, by, sx, sy].every(Number.isFinite)) {
      rec.blastPosition = { x: bx, y: by, z: Number.isFinite(bz) ? bz : 0 };
      rec.sensorPosition = { x: sx, y: sy, z: Number.isFinite(sz) ? sz : 0 };
    }
    const f = num(get('frequency'));
    if (f > 0) rec.frequency = f;
    const note = get('note')?.trim();
    if (note) rec.note = note;
    if (recordDistance(rec) === null) {
      errors.push({ line: li + 1, reason: 'sin distancia ni coordenadas' });
      continue;
    }
    records.push(rec);
  }
  return { records, errors };
}
