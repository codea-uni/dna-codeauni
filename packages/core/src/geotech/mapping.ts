import type { BlockModelData } from '../topography/asset';
import type { BlockModelMapping, GeotechField } from '../model/types';

/** Propiedades numéricas que puede traer una columna (todas menos la litología). */
export const GEOTECH_NUMERIC_FIELDS = [
  'density',
  'ucs',
  'rmr',
  'gsi',
  'q',
  'rqd',
  'youngModulus',
  'vp',
  'tensileStrength',
] as const satisfies readonly GeotechField[];

const PATTERNS: Record<GeotechField, RegExp> = {
  density: /^(density|densidad|dens|sg|dens_s|density_d|bd|bulk_density|peso_?esp\w*)$/i,
  ucs: /^(ucs|ucs_?mpa|rcu|rcs|ucs_?\w+|sigci|sigma_?ci?|resist\w*_?comp\w*)$/i,
  rmr: /^(rmr|rmr_?\d+|rmr_?\w+)$/i,
  gsi: /^(gsi|gsi_?\w+)$/i,
  q: /^(q|qbarton|q_barton|q_index|q_value|indice_?q)$/i,
  rqd: /^(rqd|rqd_?\w+)$/i,
  youngModulus: /^(e|ei|young|young_?\w+|modulo|modulo_?\w+|mod_?e|e_?gpa|ym|youngs?_?modulus)$/i,
  vp: /^(vp|v_?p|vp_?\w+|pwave|vel_?p)$/i,
  tensileStrength: /^(ti|ts|bts|sigma_?t|sigt|rt|tension|traccion|tracción|tensile\w*)$/i,
  lithology:
    /^(lito|litologia|litología|lith|lithology|rock|roca|rocktype|rock_type|lit|tipo_?roca)$/i,
};
const GRADE =
  /^(cu|cut|cus|au|ag|mo|zn|pb|fe|ley|grade|ore|mineral|material|mat|tipo|cueq|aueq|nsr)/i;

/**
 * Mapeo inicial de un modelo de bloques: reconoce las columnas por su nombre (UCS, RMR, GSI, Q,
 * RQD, E, Vp, tracción, densidad, litología). Geotécnico si trae alguna propiedad de competencia;
 * geológico si trae leyes o material (o si no trae nada geotécnico).
 */
export function detectMapping(model: BlockModelData): BlockModelMapping {
  const columns: BlockModelMapping['columns'] = {};
  for (const field of GEOTECH_NUMERIC_FIELDS) {
    const hit =
      field === 'density' && model.densityAttribute
        ? model.densityAttribute
        : model.numeric.find((a) => PATTERNS[field].test(a.name))?.name;
    if (hit) columns[field] = hit;
  }
  const lith = model.categorical.find((a) => PATTERNS.lithology.test(a.name));
  if (lith) columns.lithology = lith.name;
  const geotechnical = GEOTECH_NUMERIC_FIELDS.some((f) => f !== 'density' && columns[f]);
  const geological =
    model.numeric.some((a) => GRADE.test(a.name)) ||
    model.categorical.some((a) => GRADE.test(a.name)) ||
    !geotechnical;
  return { geological, geotechnical, columns };
}

/**
 * Factor que lleva una columna a las unidades de planilla (densidad t/m³, UCS y tracción MPa,
 * módulo GPa, Vp m/s, RQD %), deducido de la mediana: kg/m³, Pa, MPa del módulo, km/s o RQD en
 * fracción se convierten solos.
 */
export function columnScale(field: GeotechField, values: ArrayLike<number>): number {
  const finite: number[] = [];
  const step = Math.max(1, Math.floor(values.length / 2000));
  for (let i = 0; i < values.length; i += step) {
    const v = values[i] ?? NaN;
    if (Number.isFinite(v) && v > 0) finite.push(v);
  }
  if (finite.length === 0) return 1;
  finite.sort((a, b) => a - b);
  const med = finite[Math.floor(finite.length / 2)] ?? 0;
  switch (field) {
    case 'density':
      return med > 100 ? 1 / 1000 : 1;
    case 'ucs':
    case 'tensileStrength':
      return med > 1e5 ? 1e-6 : 1;
    case 'youngModulus':
      return med > 1e6 ? 1e-9 : med > 500 ? 1e-3 : 1;
    case 'vp':
      return med < 20 ? 1000 : 1;
    case 'rqd':
      return med <= 1 ? 100 : 1;
    default:
      return 1;
  }
}
