import type { LithologyProps } from '../model/types';

/**
 * Valores típicos de roca por litología, para cuando el modelo de bloques solo trae el nombre.
 * Densidad [t/m³], UCS y tracción [MPa], módulo de Young de roca intacta [GPa], Vp de roca
 * intacta [m/s] y RMR típico del macizo. Valores medios de los rangos de Goodman (1989),
 * _Introduction to Rock Mechanics_, tablas 3.1 y 6.2, y Hoek (2007), _Practical Rock
 * Engineering_, cap. 11 (GE-10 en `docs/RULES.md`). Son referencias: la tabla se edita por modelo.
 */
export const DEFAULT_LITHOLOGIES: readonly (LithologyProps & { aliases: readonly string[] })[] = [
  {
    name: 'Andesita',
    aliases: ['andes', 'and'],
    density: 2.65,
    ucs: 140,
    youngModulus: 50,
    vp: 5000,
    tensileStrength: 12,
    rmr: 65,
  },
  {
    name: 'Basalto',
    aliases: ['basalt', 'bas'],
    density: 2.85,
    ucs: 200,
    youngModulus: 70,
    vp: 5800,
    tensileStrength: 15,
    rmr: 70,
  },
  {
    name: 'Granito',
    aliases: ['granit', 'gra'],
    density: 2.65,
    ucs: 180,
    youngModulus: 60,
    vp: 5500,
    tensileStrength: 12,
    rmr: 70,
  },
  {
    name: 'Granodiorita',
    aliases: ['granodior', 'grd'],
    density: 2.7,
    ucs: 170,
    youngModulus: 55,
    vp: 5500,
    tensileStrength: 12,
    rmr: 68,
  },
  {
    name: 'Diorita',
    aliases: ['diorit', 'dio'],
    density: 2.8,
    ucs: 180,
    youngModulus: 65,
    vp: 5600,
    tensileStrength: 13,
    rmr: 70,
  },
  {
    name: 'Pórfido',
    aliases: ['porfid', 'porphyr', 'por'],
    density: 2.65,
    ucs: 130,
    youngModulus: 45,
    vp: 4800,
    tensileStrength: 10,
    rmr: 60,
  },
  {
    name: 'Cuarcita',
    aliases: ['cuarcit', 'quartzit', 'qtz'],
    density: 2.65,
    ucs: 220,
    youngModulus: 70,
    vp: 5800,
    tensileStrength: 15,
    rmr: 70,
  },
  {
    name: 'Caliza',
    aliases: ['caliz', 'limestone', 'cal', 'lst'],
    density: 2.65,
    ucs: 100,
    youngModulus: 50,
    vp: 5000,
    tensileStrength: 8,
    rmr: 60,
  },
  {
    name: 'Dolomita',
    aliases: ['dolomit', 'dol'],
    density: 2.8,
    ucs: 110,
    youngModulus: 55,
    vp: 5500,
    tensileStrength: 8,
    rmr: 60,
  },
  {
    name: 'Mármol',
    aliases: ['marmol', 'marble', 'mar'],
    density: 2.7,
    ucs: 90,
    youngModulus: 50,
    vp: 5200,
    tensileStrength: 7,
    rmr: 60,
  },
  {
    name: 'Skarn',
    aliases: ['skarn', 'skn'],
    density: 3.0,
    ucs: 120,
    youngModulus: 70,
    vp: 5800,
    tensileStrength: 10,
    rmr: 60,
  },
  {
    name: 'Esquisto',
    aliases: ['esquist', 'schist', 'sch'],
    density: 2.7,
    ucs: 60,
    youngModulus: 25,
    vp: 4000,
    tensileStrength: 4,
    rmr: 45,
  },
  {
    name: 'Brecha',
    aliases: ['brech', 'breccia', 'bx'],
    density: 2.55,
    ucs: 70,
    youngModulus: 25,
    vp: 3800,
    tensileStrength: 5,
    rmr: 45,
  },
  {
    name: 'Arenisca',
    aliases: ['arenisc', 'sandstone', 'are', 'sst'],
    density: 2.35,
    ucs: 60,
    youngModulus: 15,
    vp: 3000,
    tensileStrength: 4,
    rmr: 45,
  },
  {
    name: 'Conglomerado',
    aliases: ['conglom', 'cgl'],
    density: 2.45,
    ucs: 60,
    youngModulus: 20,
    vp: 3200,
    tensileStrength: 4,
    rmr: 45,
  },
  {
    name: 'Limolita',
    aliases: ['limolit', 'siltstone', 'lim'],
    density: 2.5,
    ucs: 45,
    youngModulus: 12,
    vp: 2800,
    tensileStrength: 3,
    rmr: 40,
  },
  {
    name: 'Lutita',
    aliases: ['lutit', 'shale', 'lut', 'sh'],
    density: 2.45,
    ucs: 35,
    youngModulus: 10,
    vp: 2500,
    tensileStrength: 2,
    rmr: 35,
  },
  {
    name: 'Toba',
    aliases: ['toba', 'tuff', 'tob'],
    density: 2.0,
    ucs: 25,
    youngModulus: 5,
    vp: 2200,
    tensileStrength: 1.5,
    rmr: 35,
  },
  {
    name: 'Material suelto',
    aliases: [
      'aluvi',
      'grava',
      'gravel',
      'relleno',
      'ripio',
      'desmonte suelto',
      'overburden',
      'ovb',
    ],
    density: 1.9,
    ucs: 1,
    youngModulus: 0.2,
    vp: 1200,
    tensileStrength: 0.1,
    rmr: 15,
  },
];

const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/**
 * Litología típica que corresponde a un nombre o código del modelo («ANDESITA», «and», «Sandstone»):
 * nombre igual, alias al inicio o código corto igual. null si no se reconoce.
 */
export function matchLithology(
  name: string,
): (LithologyProps & { aliases: readonly string[] }) | null {
  const n = normalize(name);
  if (n === '') return null;
  for (const l of DEFAULT_LITHOLOGIES) if (normalize(l.name) === n) return l;
  for (const l of DEFAULT_LITHOLOGIES)
    if (l.aliases.some((a) => (a.length >= 4 ? n.startsWith(a) || n.includes(a) : n === a)))
      return l;
  return null;
}

/**
 * Tabla de litologías de un modelo: cada categoría con lo editado por el usuario o, si no, lo
 * típico de la litología reconocida (sin valores si no se reconoce).
 */
export function lithologyTable(
  categories: readonly string[],
  edited: readonly LithologyProps[] = [],
): LithologyProps[] {
  return categories
    .filter((c) => c.trim() !== '')
    .map((c) => {
      const own = edited.find((e) => e.name === c);
      if (own) return own;
      const typical = matchLithology(c);
      if (!typical) return { name: c };
      const { aliases: _aliases, name: _name, ...values } = typical;
      return { name: c, ...values };
    });
}
