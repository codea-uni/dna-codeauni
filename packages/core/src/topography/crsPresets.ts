import { CRS_DEFS } from './reproject';

/**
 * Sistemas de coordenadas habituales por país, para elegir el de la mina sin saber el código EPSG.
 * Los códigos son los del registro EPSG (epsg.io): WGS 84 / UTM sur 327zz, PSAD56 / UTM 2487z y
 * POSGAR 2007 / Argentina faja n = 5342 + n.
 */

/**
 * Coordenadas locales de la mina (sin georreferenciar). 32767 es el valor «definido por el
 * usuario» de GeoTIFF: no es un sistema del registro EPSG, así que nunca se reproyecta.
 */
export const LOCAL_MINE_CRS = 32767;

export type CrsCountry = 'PE' | 'CL' | 'AR' | 'local';

export interface CrsPreset {
  country: CrsCountry;
  epsg: number;
  /** Nombre del sistema (el de `CRS_DEFS` si se puede reproyectar). */
  name: string;
}

const preset = (country: CrsCountry, epsg: number): CrsPreset => ({
  country,
  epsg,
  name: CRS_DEFS[epsg]?.name ?? `EPSG ${String(epsg)}`,
});

/** Atajos por país, en el orden en que se muestran. */
export const CRS_PRESETS: readonly CrsPreset[] = [
  preset('PE', 32717),
  preset('PE', 32718),
  preset('PE', 32719),
  preset('PE', 24877),
  preset('PE', 24878),
  preset('PE', 24879),
  preset('CL', 32718),
  preset('CL', 32719),
  ...[1, 2, 3, 4, 5, 6, 7].map((n) => preset('AR', 5342 + n)),
  preset('AR', 32719),
  preset('AR', 32720),
  preset('AR', 32721),
  { country: 'local', epsg: LOCAL_MINE_CRS, name: 'Coordenadas locales de mina' },
];

/** Nombres del país para la búsqueda (sin tildes, en minúsculas). */
const COUNTRY_WORDS: Record<CrsCountry, string> = {
  PE: 'peru',
  CL: 'chile',
  AR: 'argentina',
  local: 'local mina sin georreferenciar',
};

const plain = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

/**
 * Atajos que coinciden con lo escrito: país, zona («18s», «faja 3»), datum o código. Cada palabra
 * debe ser el comienzo de una palabra del país, del nombre o del código. Vacío = todos.
 */
export function searchCrsPresets(query: string): CrsPreset[] {
  const words = plain(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...CRS_PRESETS];
  return CRS_PRESETS.filter((p) => {
    const tokens = `${COUNTRY_WORDS[p.country]} ${plain(p.name)} ${String(p.epsg)}`.split(
      /[\s/()]+/,
    );
    return words.every((w) => tokens.some((tok) => tok.startsWith(w)));
  });
}

/** Nombre legible de un sistema: el del atajo o de `CRS_DEFS`, o «EPSG n». */
export function crsLabel(epsg: number): string {
  return (
    CRS_PRESETS.find((p) => p.epsg === epsg)?.name ?? CRS_DEFS[epsg]?.name ?? `EPSG ${String(epsg)}`
  );
}
