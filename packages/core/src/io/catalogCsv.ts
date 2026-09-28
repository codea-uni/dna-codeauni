import { newId } from '../model/ids';
import type { Explosive, ExplosiveFamily, WaterResistance } from '../model/types';
import { detectThousands, parseNumber, type CsvTable } from './csv';

/**
 * Catálogo de explosivos en CSV (H-401, `docs/theory/03 §3`). Una fila por producto; unidades en
 * el nombre de la columna. Cada producto conserva su fuente y versión (DF-22).
 */
export const EXPLOSIVE_CSV_COLUMNS = [
  'name',
  'manufacturer',
  'family',
  'form',
  'density_kg_m3',
  'density_min_kg_m3',
  'density_max_kg_m3',
  'vod_m_s',
  'energy_mj_kg',
  'rws',
  'water_resistance',
  'critical_diameter_mm',
  'cartridge_diameter_mm',
  'cartridge_length_mm',
  'cartridge_mass_kg',
  'needs_booster',
  'cost_per_kg',
  'source',
  'version',
] as const;

const FAMILIES: ExplosiveFamily[] = [
  'anfo',
  'heavy-anfo',
  'emulsion',
  'watergel',
  'dynamite',
  'other',
];
const WATER: WaterResistance[] = ['none', 'limited', 'high'];

const cell = (v: string | number | undefined) => {
  const t = v === undefined ? '' : String(v);
  return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

export function exportExplosivesCsv(explosives: readonly Explosive[]): string {
  const rows = explosives.map((e) =>
    [
      e.name,
      e.manufacturer,
      e.family,
      e.form,
      e.density,
      e.densityRange?.min,
      e.densityRange?.max,
      e.vod,
      e.energy / 1e6,
      e.rws,
      e.waterResistance,
      e.criticalDiameter === undefined ? undefined : e.criticalDiameter * 1000,
      e.cartridge === undefined ? undefined : e.cartridge.diameter * 1000,
      e.cartridge === undefined ? undefined : e.cartridge.length * 1000,
      e.cartridge?.mass,
      e.needsBooster === undefined ? undefined : e.needsBooster ? 'si' : 'no',
      e.costPerKg,
      e.source,
      e.version,
    ]
      .map(cell)
      .join(','),
  );
  return [EXPLOSIVE_CSV_COLUMNS.join(','), ...rows].join('\r\n') + '\r\n';
}

/** Importa explosivos; los obligatorios son nombre, densidad, VOD y energía (MJ/kg o kcal/kg). */
export function importExplosivesCsv(table: CsvTable): {
  explosives: Explosive[];
  errors: { line: number; message: string }[];
} {
  const col = new Map(table.headers.map((h, i) => [h.trim().toLowerCase(), i]));
  const thousands = detectThousands(table.rows);
  const text = (row: string[], name: string) => {
    const i = col.get(name);
    return i === undefined ? '' : (row[i] ?? '').trim();
  };
  const num = (row: string[], name: string) => parseNumber(text(row, name), thousands);
  const explosives: Explosive[] = [];
  const errors: { line: number; message: string }[] = [];
  table.rows.forEach((row, r) => {
    const line = r + 2;
    const name = text(row, 'name');
    const density = num(row, 'density_kg_m3');
    const vod = num(row, 'vod_m_s');
    const mj = num(row, 'energy_mj_kg');
    const kcal = num(row, 'energy_kcal_kg');
    const energy = Number.isFinite(mj) ? mj * 1e6 : kcal * 4184; // 1 kcal = 4,184 kJ (02 §0)
    if (!name || !(density > 0) || !(vod > 0) || !(energy > 0)) {
      errors.push({ line, message: 'Faltan nombre, densidad, VOD o energía válidos' });
      return;
    }
    const family = text(row, 'family') as ExplosiveFamily;
    const water = text(row, 'water_resistance') as WaterResistance;
    const e: Explosive = {
      id: newId<'Explosive'>(),
      name,
      family: FAMILIES.includes(family) ? family : 'other',
      form: text(row, 'form') === 'packaged' ? 'packaged' : 'bulk',
      density,
      vod,
      energy,
      rws: num(row, 'rws') > 0 ? num(row, 'rws') : 1,
      waterResistance: WATER.includes(water) ? water : 'none',
    };
    const manufacturer = text(row, 'manufacturer');
    if (manufacturer) e.manufacturer = manufacturer;
    const [dmin, dmax] = [num(row, 'density_min_kg_m3'), num(row, 'density_max_kg_m3')];
    if (dmin > 0 && dmax > 0) e.densityRange = { min: dmin, max: dmax };
    const critical = num(row, 'critical_diameter_mm');
    if (critical > 0) e.criticalDiameter = critical / 1000;
    const cartridge = {
      diameter: num(row, 'cartridge_diameter_mm') / 1000,
      length: num(row, 'cartridge_length_mm') / 1000,
      mass: num(row, 'cartridge_mass_kg'),
    };
    if (cartridge.diameter > 0 && cartridge.length > 0 && cartridge.mass > 0)
      e.cartridge = cartridge;
    const booster = text(row, 'needs_booster').toLowerCase();
    if (booster) e.needsBooster = ['si', 'sí', 'yes', 'true', '1'].includes(booster);
    const cost = num(row, 'cost_per_kg');
    if (cost >= 0) e.costPerKg = cost;
    const source = text(row, 'source');
    if (source) e.source = source;
    const version = text(row, 'version');
    if (version) e.version = version;
    explosives.push(e);
  });
  return { explosives, errors };
}
