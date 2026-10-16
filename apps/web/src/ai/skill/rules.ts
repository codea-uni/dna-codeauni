import type { ExplosiveFamily, WaterResistance } from '@cronos/core';
import type { MaterialKind, RockMassClass, WaterCondition } from '../site';

/**
 * Reglas de criterio del agente de diseño (`docs/agent/CONOCIMIENTO-VOLADURA.md`). Son valores
 * guía con su fuente y estado (regla de dominio 3: por debajo de R3 son sugerencias, nunca
 * bloqueos); los números que se informan salen de los cálculos de la app.
 */

export interface Sourced<T> {
  value: T;
  source: string;
}

/**
 * Clase de macizo → Ks de Konya–Walter (FC-07; Konya & Walter 1990, tabla de corrección por
 * estructura) y descripción del macizo de Cunningham (1987) para el factor de roca de Kuz-Ram
 * (R1 F23): masivo RMD = 50; diaclasado RMD = JF = JPS + JPA (JPS 10 si < 0,1 m, 20 si entre
 * 0,1 m y el sobretamaño; JPA 20 = buzamiento hacia fuera de la cara, valor intermedio sin dato).
 * `rockFactor` suma rmd + jps + jpa: en el diaclasado rmd va en 0.
 */
export const ROCK_CLASSES: Record<
  RockMassClass,
  { ks: number; rmd: number; jps: number; jpa: number; label: string; source: string }
> = {
  massive: {
    ks: 0.95,
    rmd: 50,
    jps: 0,
    jpa: 0,
    label: 'macizo masivo, roca continua',
    source: 'Konya & Walter (1990) Ks = 0,95 masivo; Cunningham (1987) RMD = 50 masivo',
  },
  fractured: {
    ks: 1.1,
    rmd: 0,
    jps: 20,
    jpa: 20,
    label: 'macizo diaclasado (discontinuo)',
    source:
      'Konya & Walter (1990) Ks = 1,1; Cunningham (1987) JF = JPS 20 (0,1 m – sobretamaño) + JPA 20',
  },
  very_fractured: {
    ks: 1.3,
    rmd: 0,
    jps: 10,
    jpa: 20,
    label: 'macizo muy fracturado',
    source:
      'Konya & Walter (1990) Ks = 1,3 muy fracturado; Cunningham (1987) JF = JPS 10 (< 0,1 m) + JPA 20',
  },
};

/** Kd de Konya–Walter por estratificación (sin dato: horizontal o masivo). */
export const KD_DEFAULT: Sourced<number> = {
  value: 1.0,
  source: 'Konya & Walter (1990) Kd = 1,0 estratificación horizontal o masiva',
};

/** Resistencia al agua que exige cada condición del taladro. */
export const WATER_NEEDS: Record<WaterCondition, { accepts: WaterResistance[]; note: string }> = {
  dry: {
    accepts: ['none', 'limited', 'high'],
    note: 'Taladro seco: ANFO o mezclas son válidos.',
  },
  wet: {
    accepts: ['limited', 'high'],
    note: 'Agua estática: el ANFO se disuelve (con ~10 % de humedad ya no sirve) y da NOx; usar mezcla 60/40 o 70/30 emulsión/ANFO o emulsión gasificada, bombeada desde el fondo (R1 F18; Dyno Nobel TITAN; AEISG NOx).',
  },
  flooded: {
    accepts: ['high'],
    note: 'Inundado o con recarga: emulsión bombeable desde el fondo, encartuchado resistente al agua, o manga (liner) con producto seco; cargar y disparar sin espera (R1 F18; AEISG NOx causas 2, 5 y 6).',
  },
};

/** Familias que NO se recomiendan en terreno reactivo (AN con sulfuros). */
export const REACTIVE_GROUND: {
  avoid: ExplosiveFamily[];
  tempLimitC: number;
  note: string;
  source: string;
} = {
  avoid: ['anfo', 'heavy-anfo'],
  tempLimitC: 55,
  note: 'Terreno reactivo (sulfuros como pirita con nitrato de amonio): reacción exotérmica que puede iniciar el explosivo antes de tiempo. Sin ensayo: solo producto muy inhibido y ~8 h de permanencia; con ensayo, producto inhibido y la permanencia que fije el proveedor (usual ≤ 7 días). Terreno caliente de 55 a 100 °C: medir cada taladro, no cargar los que pasen el límite, cargar los más calientes al final; detonadores y boosters hasta 70 °C.',
  source: 'AEISG Code of Practice: Elevated Temperature and Reactive Ground (2020)',
};

/**
 * Balance de oxígeno (fracción) de los componentes: nitrato de amonio +0,20 y petróleo (CH2)n
 * −3,42. ANFO estequiométrico ≈ 94,5/5,5 (OB ≈ 0).
 */
export const OXYGEN_BALANCE = {
  an: 0.2,
  fuelOil: -3.42,
  source:
    'Persson, Holmberg & Lee (1994) Rock Blasting and Explosives Engineering, cap. 3 (balance de oxígeno); AEISG Prevention and Management of Blast Generated NOx Gases',
};

/** Malla relativa al burden (guía; FC-09 y R1). */
export const PATTERN_RATIOS = {
  spacing: { square: 1.0, staggered: 1.15, source: 'R1 F09 (S = 1,0–1,5·B; 1,15 tresbolillo)' },
  stemming: {
    min: 0.7,
    max: 1.0,
    source: 'Konya & Walter (1990): T = 0,7·B (1,0·B con flyrock sensible)',
  },
  subdrill: { value: 0.3, source: 'Konya & Walter (1990): J = 0,3·B' },
};

/** Ajuste de la malla según el destino del material (más ceñida para mineral, más abierta para desmonte). */
export const MATERIAL_SCALE: Record<MaterialKind, { factor: number; note: string }> = {
  ore: { factor: 0.9, note: 'Mineral a planta: malla más ceñida para P80 fino (guía, calibrar).' },
  mixed: { factor: 0.95, note: 'Mixta: submalla ceñida en el mineral y abierta en el desmonte.' },
  waste: {
    factor: 1.1,
    note: 'Desmonte o desbroce: malla más abierta, fragmento grueso aceptable (guía, calibrar).',
  },
};

/** Tiros cortados: vecindad y margen de la señal de superficie (guía, calibrar). */
export const CUTOFF = {
  radiusInBurdens: 2,
  minLeadMs: 0,
  source:
    'Dyno Nobel, guía NONEL: todos los retardos de superficie encendidos antes del movimiento del terreno; retardo de fondo típico 500 ms (R1). Vecindad 2·B y margen 0 ms son parámetros sin fuente (R0, calibrar)',
};
