import { decodeText, parseCsv, parseNumber } from '../io/csv';
import type { Blast, Hole, HoleId, SurveyStation } from '../model/types';

/** Un taladro medido con la sonda, tal como viene en el archivo. */
export interface SurveyedHole {
  /** Identificación del archivo: número («1») o etiqueta («T01»). */
  name: string;
  stations: SurveyStation[];
}

export interface DrillSurveyFile {
  format: 'boretrak' | 'csv';
  holes: SurveyedHole[];
  /** Avisos de lectura: filas sin número, columnas no reconocidas. */
  warnings: string[];
}

const DEG = Math.PI / 180;
/** Registro del .phd de Carlson Boretrak: 22 bytes de texto + 3 float32 (LE) + 2 de relleno. */
const PHD_RECORD = 36;
const PHD_LABEL = 22;

/**
 * Lee el binario .phd de Carlson Boretrak. Cada registro es una etiqueta y tres números: las
 * cabeceras «O_  Hole No:12» abren un taladro y los registros «Original» traen rumbo [°],
 * inclinación desde la vertical [°] y profundidad [m]. El primer registro es la cabecera del
 * archivo (cantidad de registros).
 */
export function readBoretrakPhd(bytes: Uint8Array): SurveyedHole[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const latin1 = new TextDecoder('latin1');
  const holes: SurveyedHole[] = [];
  let current: SurveyedHole | null = null;
  for (let o = PHD_RECORD; o + PHD_RECORD <= bytes.length; o += PHD_RECORD) {
    const label = latin1
      .decode(bytes.subarray(o, o + PHD_LABEL))
      .replace(/\0/g, '')
      .trim();
    const hole = /Hole No:\s*(\S+)/.exec(label);
    if (hole?.[1]) {
      current = { name: hole[1], stations: [] };
      holes.push(current);
      continue;
    }
    if (label !== 'Original' || !current) continue;
    const azimuth = view.getFloat32(o + PHD_LABEL, true);
    const inclination = view.getFloat32(o + PHD_LABEL + 4, true);
    const depth = view.getFloat32(o + PHD_LABEL + 8, true);
    if (![azimuth, inclination, depth].every(Number.isFinite)) continue;
    current.stations.push({ depth, inclination: inclination * DEG, azimuth: azimuth * DEG });
  }
  return holes.filter((h) => h.stations.length > 0);
}

const HEADERS = {
  hole: /^(taladro|hole|id$|nombre|name|label|etiqueta|n[°º.o]?$|num)/i,
  depth: /^(prof|depth|md|distancia|dist|largo|length|metro)/i,
  azimuth: /^(rumbo|azim|az|bearing|direcci)/i,
  inclination: /^(incl|inc|angulo|ángulo|angle)/i,
  dip: /^(dip|buzam|manteo)/i,
};

/**
 * CSV de desviación: una fila por lectura con taladro, profundidad, rumbo e inclinación en grados.
 * La inclinación se mide desde la vertical; si la columna es «dip»/«buzamiento» (desde la
 * horizontal, p.ej. −85°) se convierte.
 */
export function readDeviationCsv(text: string): { holes: SurveyedHole[]; warnings: string[] } {
  const table = parseCsv(text, undefined, true);
  const find = (re: RegExp) => table.headers.findIndex((h) => re.test(h.trim()));
  const col = {
    hole: find(HEADERS.hole),
    depth: find(HEADERS.depth),
    azimuth: find(HEADERS.azimuth),
    inclination: find(HEADERS.inclination),
    dip: find(HEADERS.dip),
  };
  const warnings: string[] = [];
  const angleCol = col.inclination >= 0 ? col.inclination : col.dip;
  if (col.hole < 0 || col.depth < 0 || col.azimuth < 0 || angleCol < 0) {
    warnings.push('columns');
    return { holes: [], warnings };
  }
  const byName = new Map<string, SurveyedHole>();
  let skipped = 0;
  for (const row of table.rows) {
    const name = (row[col.hole] ?? '').trim();
    const depth = parseNumber(row[col.depth]);
    const azimuth = parseNumber(row[col.azimuth]);
    let angle = parseNumber(row[angleCol]);
    if (!name || ![depth, azimuth, angle].every(Number.isFinite)) {
      if (row.some((c) => c.trim() !== '')) skipped++;
      continue;
    }
    if (col.inclination < 0) angle = 90 - Math.abs(angle);
    let hole = byName.get(name);
    if (!hole) {
      hole = { name, stations: [] };
      byName.set(name, hole);
    }
    hole.stations.push({ depth, inclination: angle * DEG, azimuth: azimuth * DEG });
  }
  if (skipped > 0) warnings.push(`rows:${String(skipped)}`);
  return { holes: [...byName.values()], warnings };
}

/** Lee un archivo de desviación según su contenido (.phd binario o texto delimitado). */
export function readDrillSurvey(bytes: Uint8Array, fileName: string): DrillSurveyFile {
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 512));
  if (/\.phd$/i.test(fileName) || head.includes('Boretrak')) {
    return { format: 'boretrak', holes: readBoretrakPhd(bytes), warnings: [] };
  }
  const { holes, warnings } = readDeviationCsv(decodeText(bytes).text);
  return { format: 'csv', holes, warnings };
}

/** Número final de una etiqueta («T01» → 1, «R2-15» → 15). */
function trailingNumber(label: string): number | null {
  const m = /(\d+)\D*$/.exec(label);
  return m?.[1] ? Number(m[1]) : null;
}

export interface SurveyMatch {
  pairs: { hole: Hole; survey: SurveyedHole }[];
  /** Nombres del archivo que no corresponden a ningún taladro. */
  unmatched: string[];
}

/**
 * Une cada taladro medido con su taladro de la voladura: primero por etiqueta igual (sin
 * importar mayúsculas), luego por el número final («Hole No:1» ↔ «T01») si es único.
 */
export function matchDrillSurvey(blast: Blast, surveyed: readonly SurveyedHole[]): SurveyMatch {
  const byLabel = new Map(blast.holes.map((h) => [h.label.trim().toLowerCase(), h]));
  const byNumber = new Map<number, Hole | null>();
  for (const h of blast.holes) {
    const n = trailingNumber(h.label);
    if (n !== null) byNumber.set(n, byNumber.has(n) ? null : h);
  }
  const used = new Set<HoleId>();
  const pairs: SurveyMatch['pairs'] = [];
  const unmatched: string[] = [];
  for (const s of surveyed) {
    let hole = byLabel.get(s.name.trim().toLowerCase());
    if (!hole) {
      const n = trailingNumber(s.name);
      hole = (n !== null ? byNumber.get(n) : undefined) ?? undefined;
    }
    if (!hole || used.has(hole.id)) {
      unmatched.push(s.name);
      continue;
    }
    used.add(hole.id);
    pairs.push({ hole, survey: s });
  }
  return { pairs, unmatched };
}

/** Taladros con la medición guardada en `actual.survey` (los demás no cambian). */
export function holesWithSurvey(match: SurveyMatch): Hole[] {
  return match.pairs.map(({ hole, survey }) => {
    const stations = [...survey.stations].sort((a, b) => a.depth - b.depth);
    return { ...hole, actual: { ...hole.actual, survey: stations } };
  });
}

/** Taladros de la voladura sin la medición (para quitarla). */
export function holesWithoutSurvey(blast: Blast): Hole[] {
  return blast.holes
    .filter((h) => h.actual?.survey)
    .map((h) => {
      const rest = { ...h.actual };
      delete rest.survey;
      const copy = { ...h };
      if (Object.keys(rest).length > 0) copy.actual = rest;
      else delete copy.actual;
      return copy;
    });
}
