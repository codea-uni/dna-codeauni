import type {
  Explosive,
  ExplosiveFamily,
  KgPerM3,
  Kilograms,
  Meters,
  ProductLibrary,
  Radians,
  Ratio,
  Seconds,
} from '../model/types';
import {
  coupledLinearCharge,
  cutSquareBurden,
  designFaceRound,
  firstSquareCharge,
  type FaceDesignResult,
  type FaceHoleRole,
  type FaceWarning,
} from './faceDesign';
import { arched, rectangular, signedArea, type ExcavationProfile, type UV } from './profiles';
import { designRing, type RingDesignResult } from './ringDesign';

/**
 * Biblioteca de plantillas por método de minado subterráneo (prediseños UG-01 … UG-19).
 *
 * Cada método adapta la forma de perforar: frentes con cuele (desarrollo), chimeneas con alivio
 * (convencional, drop raise, slot), taladros largos paralelos, abanicos (sublevel stoping, SLC,
 * undercut, drawbell), cráteres verticales (VCR), breasting y realce (corte y relleno, shrinkage) y
 * banqueo subterráneo. Los generadores reutilizan el método sueco (`designFaceRound`) y el anillo
 * por espaciamiento de pie (`designRing`) y añaden el cuele en planta y la malla de filas
 * paralelas. Todo es función pura y los valores por defecto están en UNA tabla
 * (`METHOD_DEFAULTS`): son valores de partida de manuales [CG], no de una mina, y el usuario debe
 * ajustarlos (docs/RULES.md §8, UG-*).
 *
 * Coordenadas locales del diseño (P3, metros): x a la derecha a través de la labor, y hacia el
 * avance (a lo largo de la galería o del rumbo del tajeo) y z arriba. Con un `PlaneFrame` de
 * pendiente y dump 0 se pasa al proyecto con `localToWorld(frame, {u: x, v: z}, y)`.
 */

// ------------------------------------------------------------------ Tipos

export type MiningMethodGroup = 'development' | 'raise' | 'stope';

export type MiningMethodId =
  | 'driftConventional'
  | 'driftMechanized'
  | 'ramp'
  | 'bypass'
  | 'conventionalRaise'
  | 'dropRaise'
  | 'slotRaise'
  | 'longholeParallel'
  | 'longholeFan'
  | 'narrowVein'
  | 'vcr'
  | 'slc'
  | 'undercut'
  | 'drawbell'
  | 'breasting'
  | 'uppers'
  | 'shrinkage'
  | 'roomPillar'
  | 'roomBench'
  | 'benchFill';

/**
 * Generador del diseño: frente horizontal (método sueco), frente vertical (chimenea), cuele en
 * planta (drop raise y slot), malla de filas paralelas y anillos en abanico.
 */
export type MethodGenerator = 'face' | 'raise' | 'cut' | 'grid' | 'ring';

/** Dirección de los taladros de la malla paralela. */
export type GridOrientation = 'down' | 'up' | 'horizontal';

/** Carga: columna continua, por tramo de chimenea (de abajo arriba) o esférica (VCR). */
export type MethodCharging = 'column' | 'lift' | 'crater';

/** Contorno del anillo en su plano: tajeo rectangular, anillo de SLC o embudo en V. */
export type RingShape = 'rect' | 'slc' | 'drawbell';

/** Explosivo sugerido por familia y forma (se busca en la biblioteca del proyecto). */
export interface ExplosiveHint {
  families: readonly ExplosiveFamily[];
  form?: 'bulk' | 'packaged';
  /** Patrón del nombre (p. ej. explosivo de precorte para el contorno). */
  name?: RegExp;
  /** Preferir la mayor densidad (VCR). */
  denser?: boolean;
}

/** Parámetros de una plantilla (SI: m, rad, s, kg/m³). Cada método usa los que lista. */
export interface MethodParams {
  /** Perfil del frente (generador `face`). */
  profile: 'arched' | 'rectangular';
  /** Ancho de la sección, de la veta o del tajeo (x) [m]. */
  width: Meters;
  /**
   * Alto: de la sección (frente), del tajeo o de la chimenea (largo vertical de los taladros
   * descendentes) o de la rebanada (breasting) [m].
   */
  height: Meters;
  /** Espesor de la sección en planta (y): chimenea o slot [m]. */
  thickness: Meters;
  holeDiameter: Meters;
  /** Alivio (hueco vacío) y número de alivios; en el slot es la chimenea escariada. */
  reliefDiameter: Meters;
  reliefCount: number;
  /** Cartucho [m]; 0 = a granel acoplado. */
  cartridgeDiameter: Meters;
  /** Largo del taladro o de la viga [m] (frentes, realce, breasting; máximo en abanicos). */
  length: Meters;
  /** Inclinación desde la horizontal [rad] (π/2 = vertical). */
  dip: Radians;
  subdrill: Meters;
  /** Burden y espaciamiento [m]; 0 = automático (Langefors-Kihlström, S = S/B·B). */
  burden: Meters;
  spacing: Meters;
  spacingRatio: Ratio;
  /** Filas (malla paralela) o anillos. */
  rows: number;
  /** Distancia de los taladros extremos a las cajas o paredes [m]. */
  wallOffset: Meters;
  /** Taco o collar sin carga [m]. */
  stemming: Meters;
  /** Galería de perforación del abanico [m]. */
  driveWidth: Meters;
  driveHeight: Meters;
  pivotHeight: Meters;
  /** Espaciamiento de fondo del abanico [m]; 0 = 1,3·B. */
  toeSpacing: Meters;
  standOff: Meters;
  /** Semiancho de la zona sin taladros alrededor de la vertical hacia abajo [rad]. */
  deadZone: Radians;
  /** Inclinación del anillo hacia el avance, desde la vertical [rad] (SLC ≈ 10°). */
  dump: Radians;
  /** Cotas del contorno del anillo respecto al piso de la galería [m]. */
  stopeBottom: Meters;
  stopeTop: Meters;
  /** Collar sin carga alternado: k·S_toe del taladro largo y del corto. */
  collarLongK: Ratio;
  collarShortK: Ratio;
  /** Tramo por disparo (drop raise, rebanada VCR) [m]. */
  liftHeight: Meters;
  /** VCR: profundidad óptima al centro de la carga d_o [m] y largo de la carga en diámetros. */
  burialDepth: Meters;
  chargeDiameters: number;
  /** Tapón inferior [m] (chimeneas por tramos). */
  bottomPlug: Meters;
  /** Constante de roca c [kg/m³] y factor de fijación f de Langefors. */
  rockConstant: number;
  fixation: Ratio;
  rockDensity: KgPerM3;
  /** Desviación angular [m/m] y error de emboquille [m]. */
  deviation: Ratio;
  collaringError: Meters;
  /** Retardo entre taladros (frentes: tiempo por número de retardo) y entre filas o anillos [s]. */
  holeInterval: Seconds;
  rowInterval: Seconds;
  /** Voladura suave en el contorno (frentes) o fila de techo como contorno (breasting). */
  smooth: boolean;
}

export type MethodParamKey = keyof MethodParams;

/** Preajuste de una plantilla (sección típica o diámetro con su malla). */
export interface MethodPreset {
  /** Etiqueta corta («4,0 × 4,0», «Ø 89 mm»). */
  label: string;
  values: Partial<MethodParams>;
}

export interface MiningMethod {
  id: MiningMethodId;
  /** Código de la plantilla en el informe de métodos (UG-01 … UG-19). */
  code: string;
  group: MiningMethodGroup;
  generator: MethodGenerator;
  orientation?: GridOrientation;
  charging?: MethodCharging;
  ringShape?: RingShape;
  /** Marca de los taladros en el 3D (prefijo `ug-`): enviar reemplaza los de la misma marca. */
  tag: string;
  explosive: ExplosiveHint;
  contourExplosive?: ExplosiveHint;
  /** Factor de carga objetivo de control. */
  powderFactor: { min: number; max: number; unit: 'kg/m3' | 'kg/t' };
  /** Parámetros editables, en orden de formulario. */
  params: readonly MethodParamKey[];
  presets?: readonly MethodPreset[];
  /** Pendiente sugerida de la labor al llevarla al 3D [%] (rampa). */
  gradientPct?: number;
  /** Se revisa B ≤ 35·d (regla empírica de producción con taladros largos). */
  empiricalBurden?: boolean;
  /** Fuentes de las reglas y de los valores por defecto. */
  reference: string;
}

// ------------------------------------------------------------------ Valores por defecto

const DEG = Math.PI / 180;

/** Valores comunes; cada plantilla sobrescribe los suyos en `METHOD_DEFAULTS`. */
const COMMON: MethodParams = {
  profile: 'arched',
  width: 4,
  height: 4,
  thickness: 2.5,
  holeDiameter: 0.045,
  reliefDiameter: 0.102,
  reliefCount: 2,
  cartridgeDiameter: 0,
  length: 4,
  dip: 90 * DEG,
  subdrill: 0,
  burden: 0,
  spacing: 0,
  spacingRatio: 1.25,
  rows: 3,
  wallOffset: 0.5,
  stemming: 0,
  driveWidth: 4,
  driveHeight: 4,
  pivotHeight: 1.6,
  toeSpacing: 0,
  standOff: 0.3,
  deadZone: 30 * DEG,
  dump: 0,
  stopeBottom: -3,
  stopeTop: 20,
  collarLongK: 0.6,
  collarShortK: 0.35,
  liftHeight: 3,
  burialDepth: 1.8,
  chargeDiameters: 6,
  bottomPlug: 0.5,
  rockConstant: 0.4,
  fixation: 1,
  rockDensity: 2700,
  deviation: 0.01,
  collaringError: 0.05,
  holeInterval: 0.025,
  rowInterval: 0.1,
  smooth: true,
};

/**
 * TABLA ÚNICA de valores por defecto por plantilla (informe de métodos §7.11, [CG]: Hustrulid &
 * Bullock 2001, López Jimeno 1995, Holmberg 1982, Atlas Copco 2007, EXSA). Para calibrar una mina
 * basta con cambiar esta tabla.
 */
export const METHOD_DEFAULTS: Readonly<Record<MiningMethodId, MethodParams>> = {
  // UG-01 Galería convencional (jackleg) 2,4 × 2,7: d 38, 2 alivios de 64, barra de 6 pies.
  driftConventional: {
    ...COMMON,
    width: 2.4,
    height: 2.7,
    holeDiameter: 0.038,
    reliefDiameter: 0.064,
    reliefCount: 2,
    cartridgeDiameter: 0.032,
    length: 1.8,
    // Roca dura de veta (c = 0,45): con 0,4 el factor de carga queda en 2,47 kg/m³.
    rockConstant: 0.45,
    collaringError: 0.02,
    holeInterval: 0.1,
  },
  // UG-02 Galería mecanizada (jumbo) 4,0 × 4,0: d 45, 2 alivios de 102, barra de 14 pies. Cartuchos
  // de 1¼″ como en «Frente de túnel»: con emulsión a granel acoplada el método sueco da ≈ 2,7 kg/m³,
  // sobre el objetivo de 1,5–2,0 (cartucho 0 = a granel).
  driftMechanized: {
    ...COMMON,
    width: 4,
    height: 4,
    cartridgeDiameter: 0.032,
    length: 4.3,
    collaringError: 0.02,
    holeInterval: 0.1,
  },
  // UG-03 Rampa 4,5 × 4,5 al 12 %.
  ramp: {
    ...COMMON,
    width: 4.5,
    height: 4.5,
    cartridgeDiameter: 0.032,
    length: 4.3,
    collaringError: 0.02,
    holeInterval: 0.1,
  },
  // UG-04 By-pass / crucero 3,5 × 3,5.
  bypass: {
    ...COMMON,
    width: 3.5,
    height: 3.5,
    cartridgeDiameter: 0.032,
    length: 3.7,
    collaringError: 0.02,
    holeInterval: 0.1,
  },
  // UG-05 Chimenea convencional (jackleg o plataforma), 2,0 × 2,0 por defecto (1,5 × 1,5 en los
  // preajustes; ahí el cuele de Holmberg apenas entra): perforación hacia arriba.
  conventionalRaise: {
    ...COMMON,
    profile: 'rectangular',
    width: 2,
    height: 2,
    holeDiameter: 0.038,
    reliefDiameter: 0.064,
    reliefCount: 2,
    cartridgeDiameter: 0.029,
    length: 1.8,
    collaringError: 0.02,
    holeInterval: 0.1,
    smooth: false,
  },
  // UG-06 Drop raise 2,5 × 2,5 de 15 m: d 102 + 3 huecos de 165 (ITH, desviación 0,5 %), tramos de
  // 3 m de abajo arriba (tapón, carga, taco).
  dropRaise: {
    ...COMMON,
    width: 2.5,
    thickness: 2.5,
    height: 15,
    holeDiameter: 0.102,
    reliefDiameter: 0.165,
    reliefCount: 3,
    burden: 1.2,
    spacing: 1.2,
    wallOffset: 0.4,
    deviation: 0.005,
    stemming: 1.5,
    liftHeight: 3,
    bottomPlug: 0.5,
  },
  // UG-07 Slot de tajeo: d 76 contra una chimenea escariada de 0,75 m.
  slotRaise: {
    ...COMMON,
    width: 10,
    thickness: 3,
    height: 20,
    holeDiameter: 0.076,
    reliefDiameter: 0.75,
    reliefCount: 1,
    burden: 1.2,
    spacing: 1.2,
    wallOffset: 0.5,
    stemming: 1,
  },
  // UG-08 Taladros largos paralelos: d 102, B 2,8, S 3,0, taco ≈ 25·d.
  longholeParallel: {
    ...COMMON,
    width: 15,
    height: 25,
    holeDiameter: 0.102,
    burden: 2.8,
    spacing: 3,
    rows: 4,
    wallOffset: 0.75,
    stemming: 2.5,
  },
  // UG-09 Taladros largos en abanico: d 76, B 1,9 (≈ 25·d), S_toe = 1,3·B.
  longholeFan: {
    ...COMMON,
    width: 15,
    holeDiameter: 0.076,
    burden: 1.9,
    toeSpacing: 2.5,
    length: 30,
    rows: 3,
    collarLongK: 0.5,
    collarShortK: 0.3,
    stopeBottom: -3,
    stopeTop: 20,
  },
  // UG-10 Taladros largos en veta angosta: d 64, B 1,3 (rango 1,0–1,5), S 1,2, subnivel de 12 m.
  narrowVein: {
    ...COMMON,
    width: 2.5,
    height: 12,
    holeDiameter: 0.064,
    burden: 1.3,
    spacing: 1.2,
    rows: 4,
    wallOffset: 0.5,
    stemming: 1.2,
  },
  // UG-11 VCR: d 165, malla 2,8 × 2,8, carga esférica (6·d), d_o 1,5 m, rebanada 3 m ≈ 2·d_o, taco
  // 2,5 m (valores de partida: se ajustan con la prueba de cráter).
  vcr: {
    ...COMMON,
    width: 11,
    height: 40,
    holeDiameter: 0.165,
    burden: 2.8,
    spacing: 2.8,
    rows: 4,
    wallOffset: 1.4,
    stemming: 2.5,
    liftHeight: 3,
    burialDepth: 1.5,
    chargeDiameters: 6,
  },
  // UG-12 Anillo de SLC: galería 6 × 4,5 cada 22 m, subnivel 28 m, d 102, B 2,8, S_toe 5,5,
  // anillo ascendente (taladros laterales a 70° de la vertical) con dump de 10° (80°).
  slc: {
    ...COMMON,
    width: 22,
    driveWidth: 6,
    driveHeight: 4.5,
    pivotHeight: 1.8,
    holeDiameter: 0.102,
    burden: 2.8,
    toeSpacing: 5.5,
    length: 35,
    deadZone: 110 * DEG,
    dump: 10 * DEG,
    rows: 2,
    collarLongK: 0.3,
    collarShortK: 0.15,
    stopeBottom: 0,
    stopeTop: 28,
    holeInterval: 0.05,
  },
  // UG-13 Undercut angosto (block / panel caving): d 76, B 1,8, S_toe 2,2 (informe: 2,4), alto 10 m.
  undercut: {
    ...COMMON,
    width: 15,
    holeDiameter: 0.076,
    burden: 1.8,
    toeSpacing: 2.2,
    length: 15,
    deadZone: 80 * DEG,
    rows: 3,
    collarLongK: 0.3,
    collarShortK: 0.15,
    stopeBottom: 0,
    stopeTop: 10,
  },
  // UG-14 Drawbell: embudo en V de 12 m arriba y 15 m de alto, d 76, B 1,8, S_toe 2,2.
  drawbell: {
    ...COMMON,
    width: 12,
    holeDiameter: 0.076,
    burden: 1.8,
    toeSpacing: 2.2,
    length: 18,
    deadZone: 90 * DEG,
    rows: 3,
    collarLongK: 0.2,
    collarShortK: 0.1,
    stopeBottom: 0,
    stopeTop: 15,
  },
  // UG-15 Breasting C&F mecanizado: rebanada 6 × 4, d 45, B 0,9, S 1,1, techo como contorno.
  breasting: {
    ...COMMON,
    width: 6,
    height: 4,
    holeDiameter: 0.045,
    length: 4,
    burden: 0.9,
    spacing: 1.1,
    wallOffset: 0.35,
    stemming: 0.5,
    fixation: 1.2,
    collaringError: 0.02,
    holeInterval: 0,
    rowInterval: 0.1,
  },
  // UG-16 Realce C&F (uppers): veta de 3 m, d 38, barra de 7 pies a 70°, B 0,8, S 0,9.
  uppers: {
    ...COMMON,
    width: 3,
    holeDiameter: 0.038,
    length: 2.1,
    dip: 70 * DEG,
    burden: 0.8,
    spacing: 0.9,
    rows: 4,
    wallOffset: 0.3,
    stemming: 0.35,
    fixation: 1.2,
    collaringError: 0.02,
    holeInterval: 0,
    rowInterval: 0.1,
  },
  // UG-16 (variante) Shrinkage: veta de 1,8 m, realce a 80°, B 0,7, S 0,8, filas en zigzag.
  shrinkage: {
    ...COMMON,
    width: 1.8,
    holeDiameter: 0.038,
    length: 2.1,
    dip: 80 * DEG,
    burden: 0.7,
    spacing: 0.8,
    rows: 5,
    wallOffset: 0.3,
    stemming: 0.3,
    fixation: 1.2,
    collaringError: 0.02,
    holeInterval: 0,
    rowInterval: 0.1,
  },
  // UG-17 Cámara ancha 8 × 6 (cámaras y pilares): método sueco en frente ancho.
  roomPillar: {
    ...COMMON,
    width: 8,
    height: 6,
    cartridgeDiameter: 0.032,
    length: 4.3,
    collaringError: 0.02,
    holeInterval: 0.1,
  },
  // UG-18 Banqueo de cámara (slashing descendente): banco de 6 m, d 76, B 1,8, S 2,2.
  roomBench: {
    ...COMMON,
    width: 8,
    height: 6,
    holeDiameter: 0.076,
    burden: 1.8,
    spacing: 2.2,
    subdrill: 0.3,
    rows: 4,
    wallOffset: 0.75,
    stemming: 1.3,
    rowInterval: 0.075,
  },
  // UG-19 Bench and fill: tajeo de 10 m entre galerías a 20 m, d 89, B 2,3, S 2,8.
  benchFill: {
    ...COMMON,
    width: 10,
    height: 20,
    holeDiameter: 0.089,
    burden: 2.3,
    spacing: 2.8,
    rows: 4,
    wallOffset: 0.8,
    stemming: 2,
  },
};

// ------------------------------------------------------------------ Catálogo

const BULK_EMULSION: ExplosiveHint = { families: ['emulsion', 'heavy-anfo'], form: 'bulk' };
const PACKAGED_EMULSION: ExplosiveHint = {
  families: ['emulsion', 'dynamite', 'watergel'],
  form: 'packaged',
};
const ANFO: ExplosiveHint = { families: ['anfo', 'heavy-anfo', 'emulsion'], form: 'bulk' };
const CONTOUR: ExplosiveHint = {
  families: ['emulsion', 'dynamite'],
  form: 'packaged',
  name: /corte|contour|smooth|exsablock/i,
};

const FACE_PARAMS = [
  'profile',
  'width',
  'height',
  'holeDiameter',
  'reliefDiameter',
  'reliefCount',
  'cartridgeDiameter',
  'length',
  'rockConstant',
  'smooth',
  'holeInterval',
] as const satisfies readonly MethodParamKey[];

const GRID_DOWN_PARAMS = [
  'width',
  'height',
  'holeDiameter',
  'burden',
  'spacing',
  'rows',
  'wallOffset',
  'stemming',
  'subdrill',
  'dip',
  'rockConstant',
  'rockDensity',
  'deviation',
  'holeInterval',
  'rowInterval',
] as const satisfies readonly MethodParamKey[];

const GRID_UP_PARAMS = [
  'width',
  'holeDiameter',
  'cartridgeDiameter',
  'length',
  'dip',
  'burden',
  'spacing',
  'rows',
  'wallOffset',
  'stemming',
  'rockDensity',
  'rowInterval',
] as const satisfies readonly MethodParamKey[];

const RING_PARAMS = [
  'width',
  'stopeBottom',
  'stopeTop',
  'driveWidth',
  'driveHeight',
  'pivotHeight',
  'holeDiameter',
  'burden',
  'toeSpacing',
  'length',
  'deadZone',
  'dump',
  'rows',
  'standOff',
  'collarLongK',
  'collarShortK',
  'rockDensity',
  'holeInterval',
  'rowInterval',
] as const satisfies readonly MethodParamKey[];

const DRIFT_PRESETS: readonly MethodPreset[] = [
  { label: '3,0 × 3,0', values: { width: 3, height: 3, length: 3.4 } },
  { label: '3,5 × 3,5', values: { width: 3.5, height: 3.5, length: 3.7 } },
  { label: '4,0 × 4,0', values: { width: 4, height: 4, length: 4.3 } },
  { label: '4,5 × 4,0', values: { width: 4.5, height: 4, length: 4.3 } },
  { label: '5,0 × 4,5', values: { width: 5, height: 4.5, length: 4.3 } },
];

/** Abanicos de 64 a 115 mm con B ≈ 25·d y S_toe = 1,3·B (§7.0 b y d). */
const FAN_PRESETS: readonly MethodPreset[] = [64, 76, 89, 102, 115].map((mm) => {
  const B = Math.round(mm * 0.025 * 10) / 10;
  return {
    label: `Ø ${String(mm)} mm`,
    values: {
      holeDiameter: mm / 1000,
      burden: B,
      toeSpacing: Math.round(1.3 * B * 10) / 10,
    },
  };
});

const REF_FACE =
  'Holmberg 1982 (método sueco); López Jimeno 1995 cap. túneles; EXSA, Manual Práctico de Voladura';
const REF_LONGHOLE =
  'Langefors & Kihlström 1963; Hustrulid & Bullock 2001 (sublevel stoping); Atlas Copco 2007';
const REF_RING =
  'Hustrulid & Bullock 2001; Oñederra & Chitombo 2007 (diseño de anillos); Atlas Copco 2007';

/** Catálogo de plantillas por método de minado (orden de las tarjetas). */
export const MINING_METHODS: readonly MiningMethod[] = [
  {
    id: 'driftConventional',
    code: 'UG-01',
    group: 'development',
    generator: 'face',
    tag: 'ug-jackleg',
    explosive: PACKAGED_EMULSION,
    contourExplosive: CONTOUR,
    powderFactor: { min: 2.5, max: 3.5, unit: 'kg/m3' },
    params: FACE_PARAMS,
    presets: [
      { label: '2,1 × 2,4', values: { width: 2.1, height: 2.4 } },
      { label: '2,4 × 2,7', values: { width: 2.4, height: 2.7 } },
      { label: '3,0 × 3,0', values: { width: 3, height: 3 } },
    ],
    reference: REF_FACE,
  },
  {
    id: 'driftMechanized',
    code: 'UG-02',
    group: 'development',
    generator: 'face',
    tag: 'ug-drift',
    explosive: PACKAGED_EMULSION,
    contourExplosive: CONTOUR,
    powderFactor: { min: 1.5, max: 2.0, unit: 'kg/m3' },
    params: FACE_PARAMS,
    presets: DRIFT_PRESETS,
    reference: REF_FACE,
  },
  {
    id: 'ramp',
    code: 'UG-03',
    group: 'development',
    generator: 'face',
    tag: 'ug-ramp',
    explosive: PACKAGED_EMULSION,
    contourExplosive: CONTOUR,
    powderFactor: { min: 1.4, max: 1.8, unit: 'kg/m3' },
    params: FACE_PARAMS,
    presets: DRIFT_PRESETS,
    gradientPct: 12,
    reference: REF_FACE,
  },
  {
    id: 'bypass',
    code: 'UG-04',
    group: 'development',
    generator: 'face',
    tag: 'ug-bypass',
    explosive: PACKAGED_EMULSION,
    contourExplosive: CONTOUR,
    powderFactor: { min: 1.8, max: 2.2, unit: 'kg/m3' },
    params: FACE_PARAMS,
    presets: DRIFT_PRESETS,
    reference: REF_FACE,
  },
  {
    id: 'roomPillar',
    code: 'UG-17',
    group: 'development',
    generator: 'face',
    tag: 'ug-room',
    explosive: PACKAGED_EMULSION,
    contourExplosive: CONTOUR,
    powderFactor: { min: 1.0, max: 1.4, unit: 'kg/m3' },
    params: FACE_PARAMS,
    presets: [
      { label: '6 × 5', values: { width: 6, height: 5 } },
      { label: '8 × 6', values: { width: 8, height: 6 } },
      { label: '10 × 6', values: { width: 10, height: 6 } },
    ],
    reference: `${REF_FACE}; Hustrulid & Bullock 2001 (room and pillar)`,
  },
  {
    id: 'conventionalRaise',
    code: 'UG-05',
    group: 'raise',
    generator: 'raise',
    tag: 'ug-raise',
    explosive: PACKAGED_EMULSION,
    powderFactor: { min: 3, max: 4, unit: 'kg/m3' },
    params: [
      'width',
      'height',
      'holeDiameter',
      'reliefDiameter',
      'reliefCount',
      'cartridgeDiameter',
      'length',
      'rockConstant',
      'holeInterval',
    ],
    presets: [
      { label: '1,5 × 1,5', values: { width: 1.5, height: 1.5 } },
      { label: '2,0 × 2,0', values: { width: 2, height: 2 } },
      { label: '2,4 × 2,4', values: { width: 2.4, height: 2.4, length: 2.4 } },
    ],
    reference: `${REF_FACE}; Hustrulid & Bullock 2001 (raising)`,
  },
  {
    id: 'dropRaise',
    code: 'UG-06',
    group: 'raise',
    generator: 'cut',
    charging: 'lift',
    tag: 'ug-dropraise',
    explosive: ANFO,
    powderFactor: { min: 1.5, max: 3, unit: 'kg/m3' },
    params: [
      'width',
      'thickness',
      'height',
      'holeDiameter',
      'reliefDiameter',
      'reliefCount',
      'burden',
      'spacing',
      'wallOffset',
      'liftHeight',
      'bottomPlug',
      'stemming',
      'rockConstant',
      'deviation',
      'holeInterval',
    ],
    reference: 'Holmberg 1982 (cuele en planta); Hustrulid & Bullock 2001; López Jimeno 1995',
  },
  {
    id: 'slotRaise',
    code: 'UG-07',
    group: 'raise',
    generator: 'cut',
    charging: 'column',
    tag: 'ug-slot',
    explosive: BULK_EMULSION,
    powderFactor: { min: 0.8, max: 1.2, unit: 'kg/t' },
    params: [
      'width',
      'thickness',
      'height',
      'holeDiameter',
      'reliefDiameter',
      'burden',
      'spacing',
      'wallOffset',
      'stemming',
      'rockConstant',
      'rockDensity',
      'deviation',
      'holeInterval',
    ],
    reference: `Holmberg 1982; ${REF_LONGHOLE}; Oñederra & Chitombo 2007`,
  },
  {
    id: 'longholeParallel',
    code: 'UG-08',
    group: 'stope',
    generator: 'grid',
    orientation: 'down',
    charging: 'column',
    tag: 'ug-longhole',
    explosive: ANFO,
    powderFactor: { min: 0.3, max: 0.45, unit: 'kg/t' },
    params: GRID_DOWN_PARAMS,
    presets: [
      {
        label: 'Ø 102 mm',
        values: { holeDiameter: 0.102, burden: 2.8, spacing: 3, stemming: 2.5 },
      },
      {
        label: 'Ø 115 mm',
        values: { holeDiameter: 0.115, burden: 3.2, spacing: 3.5, stemming: 2.9 },
      },
      { label: 'Ø 165 mm', values: { holeDiameter: 0.165, burden: 4, spacing: 4.5, stemming: 4 } },
    ],
    empiricalBurden: true,
    reference: REF_LONGHOLE,
  },
  {
    id: 'longholeFan',
    code: 'UG-09',
    group: 'stope',
    generator: 'ring',
    ringShape: 'rect',
    tag: 'ug-fan',
    explosive: BULK_EMULSION,
    powderFactor: { min: 0.35, max: 0.5, unit: 'kg/t' },
    params: RING_PARAMS,
    presets: FAN_PRESETS,
    empiricalBurden: true,
    reference: REF_RING,
  },
  {
    id: 'narrowVein',
    code: 'UG-10',
    group: 'stope',
    generator: 'grid',
    orientation: 'down',
    charging: 'column',
    tag: 'ug-vein',
    explosive: ANFO,
    powderFactor: { min: 0.5, max: 0.8, unit: 'kg/t' },
    params: GRID_DOWN_PARAMS,
    presets: [
      { label: 'Ø 51 mm', values: { holeDiameter: 0.051, burden: 1.2, spacing: 1.0 } },
      { label: 'Ø 64 mm', values: { holeDiameter: 0.064, burden: 1.5, spacing: 1.2 } },
    ],
    reference: `${REF_LONGHOLE}; EXSA`,
  },
  {
    id: 'vcr',
    code: 'UG-11',
    group: 'stope',
    generator: 'grid',
    orientation: 'down',
    charging: 'crater',
    tag: 'ug-vcr',
    explosive: { families: ['emulsion', 'heavy-anfo', 'watergel'], form: 'bulk', denser: true },
    powderFactor: { min: 0.4, max: 0.6, unit: 'kg/t' },
    params: [
      'width',
      'height',
      'holeDiameter',
      'burden',
      'spacing',
      'rows',
      'wallOffset',
      'liftHeight',
      'burialDepth',
      'chargeDiameters',
      'stemming',
      'rockDensity',
      'holeInterval',
    ],
    reference: 'Livingston (teoría de cráter); Hustrulid & Bullock 2001 (VCR); López Jimeno 1995',
  },
  {
    id: 'slc',
    code: 'UG-12',
    group: 'stope',
    generator: 'ring',
    ringShape: 'slc',
    tag: 'ug-slc',
    explosive: BULK_EMULSION,
    powderFactor: { min: 0.3, max: 0.45, unit: 'kg/t' },
    params: RING_PARAMS,
    presets: [
      { label: 'Ø 102 mm', values: { holeDiameter: 0.102, burden: 2.8, toeSpacing: 5.5 } },
      { label: 'Ø 115 mm', values: { holeDiameter: 0.115, burden: 3.2, toeSpacing: 6 } },
    ],
    empiricalBurden: true,
    reference: `${REF_RING} (Kiruna, Malmberget)`,
  },
  {
    id: 'undercut',
    code: 'UG-13',
    group: 'stope',
    generator: 'ring',
    ringShape: 'rect',
    tag: 'ug-undercut',
    explosive: BULK_EMULSION,
    powderFactor: { min: 0.6, max: 0.9, unit: 'kg/t' },
    params: RING_PARAMS,
    reference: `${REF_RING} (block caving)`,
  },
  {
    id: 'drawbell',
    code: 'UG-14',
    group: 'stope',
    generator: 'ring',
    ringShape: 'drawbell',
    tag: 'ug-drawbell',
    explosive: BULK_EMULSION,
    powderFactor: { min: 0.7, max: 1.0, unit: 'kg/t' },
    params: RING_PARAMS,
    reference: `${REF_RING} (block caving)`,
  },
  {
    id: 'breasting',
    code: 'UG-15',
    group: 'stope',
    generator: 'grid',
    orientation: 'horizontal',
    charging: 'column',
    tag: 'ug-breast',
    explosive: BULK_EMULSION,
    powderFactor: { min: 0.6, max: 0.9, unit: 'kg/t' },
    params: [
      'width',
      'height',
      'holeDiameter',
      'length',
      'burden',
      'spacing',
      'wallOffset',
      'stemming',
      'smooth',
      'rockDensity',
      'holeInterval',
      'rowInterval',
    ],
    reference: 'Hustrulid & Bullock 2001 (cut and fill); EXSA; Persson, Holmberg & Lee 1994',
  },
  {
    id: 'uppers',
    code: 'UG-16',
    group: 'stope',
    generator: 'grid',
    orientation: 'up',
    charging: 'column',
    tag: 'ug-uppers',
    explosive: PACKAGED_EMULSION,
    powderFactor: { min: 0.7, max: 1.2, unit: 'kg/t' },
    params: GRID_UP_PARAMS,
    reference: 'Hustrulid & Bullock 2001 (cut and fill); EXSA, Manual Práctico de Voladura',
  },
  {
    id: 'shrinkage',
    code: 'UG-16',
    group: 'stope',
    generator: 'grid',
    orientation: 'up',
    charging: 'column',
    tag: 'ug-shrink',
    explosive: PACKAGED_EMULSION,
    powderFactor: { min: 0.7, max: 1.2, unit: 'kg/t' },
    params: GRID_UP_PARAMS,
    reference: 'Hustrulid & Bullock 2001 (shrinkage); EXSA',
  },
  {
    id: 'roomBench',
    code: 'UG-18',
    group: 'stope',
    generator: 'grid',
    orientation: 'down',
    charging: 'column',
    tag: 'ug-bench',
    explosive: BULK_EMULSION,
    powderFactor: { min: 0.35, max: 0.5, unit: 'kg/t' },
    params: GRID_DOWN_PARAMS,
    presets: [
      { label: 'Ø 64 mm', values: { holeDiameter: 0.064, burden: 1.6, spacing: 2 } },
      { label: 'Ø 76 mm', values: { holeDiameter: 0.076, burden: 1.8, spacing: 2.2 } },
    ],
    reference: `Langefors & Kihlström 1963; Hustrulid & Bullock 2001 (room and pillar)`,
  },
  {
    id: 'benchFill',
    code: 'UG-19',
    group: 'stope',
    generator: 'grid',
    orientation: 'down',
    charging: 'column',
    tag: 'ug-benchfill',
    explosive: BULK_EMULSION,
    powderFactor: { min: 0.35, max: 0.5, unit: 'kg/t' },
    params: GRID_DOWN_PARAMS,
    presets: [
      { label: 'Ø 76 mm', values: { holeDiameter: 0.076, burden: 2, spacing: 2.4, stemming: 1.8 } },
      { label: 'Ø 89 mm', values: { holeDiameter: 0.089, burden: 2.3, spacing: 2.8, stemming: 2 } },
      {
        label: 'Ø 102 mm',
        values: { holeDiameter: 0.102, burden: 2.6, spacing: 3.1, stemming: 2.3 },
      },
    ],
    empiricalBurden: true,
    reference: `Langefors & Kihlström 1963; Hustrulid & Bullock 2001 (bench and fill)`,
  },
];

export const MINING_METHOD_IDS = MINING_METHODS.map((m) => m.id);

export function miningMethod(id: MiningMethodId): MiningMethod {
  const m = MINING_METHODS.find((x) => x.id === id);
  if (!m) throw new Error(`método desconocido: ${id}`);
  return m;
}

/** Marcas de todas las plantillas (sin repetir). */
export const METHOD_TAGS: readonly string[] = [...new Set(MINING_METHODS.map((m) => m.tag))];

/**
 * Explosivo de la biblioteca que mejor cumple la sugerencia; null si la biblioteca está vacía. Con
 * `holeDiameter`, descarta los encartuchados cuyo cartucho no entra en el taladro.
 */
export function pickExplosiveByHint(
  library: Pick<ProductLibrary, 'explosives'>,
  hint: ExplosiveHint,
  holeDiameter?: Meters,
): Explosive | null {
  const fits = (e: Explosive) =>
    holeDiameter === undefined || !e.cartridge || e.cartridge.diameter < holeDiameter - 0.003;
  const list = library.explosives.filter(fits);
  const byDensity = (a: Explosive[]) =>
    hint.denser ? [...a].sort((x, y) => y.density - x.density) : a;
  if (hint.name) {
    const named = list.find((e) => hint.name?.test(e.name));
    if (named) return named;
  }
  for (const family of hint.families) {
    const match = byDensity(
      list.filter((e) => e.family === family && (!hint.form || e.form === hint.form)),
    );
    if (match[0]) return match[0];
  }
  for (const family of hint.families) {
    const match = list.find((e) => e.family === family);
    if (match) return match;
  }
  return list[0] ?? library.explosives[0] ?? null;
}

// ------------------------------------------------------------------ Reglas de diseño

export interface LangeforsInput {
  diameter: Meters;
  /** Densidad de carga en el taladro [kg/m³]. */
  density: KgPerM3;
  /** Potencia relativa en peso respecto al ANFO; s_LFB = 0,84·s_ANFO. */
  rws: Ratio;
  rockConstant: number;
  fixation: Ratio;
  spacingRatio: Ratio;
}

/**
 * Burden máximo de Langefors-Kihlström: B = (d/33)·√(P·s/(c̄·f·S/B)) [m] con d en mm, P en kg/dm³,
 * s relativa a la dinamita LFB (ANFO ≈ 0,84) y c̄ = c + 0,05 (B ≥ 1,4 m) o c + 0,07/B (iterado).
 */
export function langeforsMaxBurden(i: LangeforsInput): Meters {
  const dmm = i.diameter * 1000;
  const Ps = (i.density / 1000) * 0.84 * i.rws;
  const den = (cbar: number) => cbar * i.fixation * i.spacingRatio;
  let B = (dmm / 33) * Math.sqrt(Ps / den(i.rockConstant + 0.05));
  for (let k = 0; k < 50; k++) {
    const cbar = B >= 1.4 ? i.rockConstant + 0.05 : i.rockConstant + 0.07 / B;
    const next = (dmm / 33) * Math.sqrt(Ps / den(cbar));
    if (Math.abs(next - B) < 1e-9) return next;
    B = next;
  }
  return B;
}

/** Burden práctico: B = B_max − e' − α·L (descuento por emboquille y desviación). */
export function practicalBurden(
  maxBurden: Meters,
  length: Meters,
  deviation: Ratio,
  collaringError: Meters,
): Meters {
  return maxBurden - collaringError - deviation * length;
}

// ------------------------------------------------------------------ Resultado

/** Punto local (x a la derecha, y al avance, z arriba) [m]. */
export interface P3 {
  x: Meters;
  y: Meters;
  z: Meters;
}

export type MethodHoleRole =
  FaceHoleRole | 'longhole' | 'ring' | 'slot' | 'crater' | 'breast' | 'upper';

/** Tramo de la columna, de FONDO a BOCA. */
export type MethodDeck =
  | { kind: 'charge'; length: Meters; linearCharge: number; product: 'main' | 'contour' }
  | { kind: 'stemming'; length: Meters }
  | { kind: 'plug'; length: Meters }
  | { kind: 'air'; length: Meters };

export interface MethodHole {
  index: number;
  role: MethodHoleRole;
  collar: P3;
  toe: P3;
  length: Meters;
  diameter: Meters;
  /** Fila, anillo o sección del cuele (0 = la primera en salir). */
  group: number;
  decks: MethodDeck[];
  mass: Kilograms;
  /** Tiempo de salida [s]; null en los alivios (vacíos). */
  delay: Seconds | null;
}

export type MethodViewId = 'front' | 'plan' | 'side';

/** Vista 2D del diseño: ejes del plano y contornos (excavación, tajeo, cara libre). */
export interface MethodView {
  id: MethodViewId;
  axes: readonly ['x', 'z'] | readonly ['x', 'y'] | readonly ['y', 'z'];
  outlines: {
    kind: 'excavation' | 'stope' | 'drive' | 'freeFace' | 'lift';
    points: UV[];
    closed: boolean;
  }[];
}

/** Excavación de contexto para el 3D: secciones sucesivas en coordenadas locales. */
export interface MethodContext {
  kind: 'drive' | 'round' | 'stope';
  sections: P3[][];
}

export type MethodWarningCode =
  | 'burdenAboveLangefors'
  | 'burdenAboveEmpirical'
  | 'deviationCritical'
  | 'cutChargeBelowRequired'
  | 'noHoles'
  | 'holesTruncated'
  | 'stemmingTooLong';

export interface MethodWarning {
  code: MethodWarningCode;
  params?: Record<string, number>;
}

/** Comprobación de la malla contra las reglas (Langefors y B ≈ 25–35·d). */
export interface MethodRules {
  burden: Meters;
  spacing: Meters;
  langeforsMax: Meters;
  langeforsPractical: Meters;
  empiricalMin: Meters;
  empiricalMax: Meters;
  /** El burden salió de la regla (parámetro en 0). */
  auto: boolean;
}

export interface MethodKpis {
  holes: number;
  chargedHoles: number;
  reliefHoles: number;
  drilledMeters: Meters;
  chargedMeters: Meters;
  totalCharge: Kilograms;
  /** Volumen in situ que rompe el disparo [m³] y toneladas. */
  volume: number;
  tonnes: number;
  powderFactor: number; // kg/m³
  chargePerTonne: number; // kg/t
  drilledPerTonne: number; // m/t
  /** Mayor carga que sale en un mismo tiempo (±8 ms) [kg], para la vibración. */
  maxChargePerDelay: Kilograms;
  /** Avance por disparo (frentes y chimeneas) [m]. */
  advance?: Meters;
}

export interface MethodDesign {
  method: MiningMethodId;
  params: MethodParams;
  holes: MethodHole[];
  kpis: MethodKpis;
  /** Factor de carga contra el objetivo de la plantilla. */
  powderFactorStatus: 'low' | 'ok' | 'high';
  rules?: MethodRules;
  /** Avisos del método sueco (generadores `face` y `raise`). */
  faceWarnings: FaceWarning[];
  warnings: MethodWarning[];
  views: MethodView[];
  context: MethodContext[];
  /** Caja que contiene la labor y el tajeo (con el look-out de los frentes) [m]. */
  envelope: { min: P3; max: P3 };
  /** Resultados de los motores reutilizados (para tablas de detalle). */
  face?: { profile: ExcavationProfile; design: FaceDesignResult };
  ring?: { design: RingDesignResult; boundary: UV[]; drive: UV[]; pivot: UV };
}

/** Explosivo para el cálculo: densidad [kg/m³] y potencia relativa al ANFO. */
export interface MethodExplosive {
  density: KgPerM3;
  rws: Ratio;
}

/** Datos fuera de rango (mensaje para la interfaz). */
export class MethodInputError extends Error {}

// ------------------------------------------------------------------ Utilidades

const p3 = (x: number, y: number, z: number): P3 => ({ x, y, z });

function rect(x0: number, x1: number, y0: number, y1: number): UV[] {
  return [
    { u: x0, v: y0 },
    { u: x1, v: y0 },
    { u: x1, v: y1 },
    { u: x0, v: y1 },
  ];
}

/** Posiciones equiespaciadas entre a y b con separación ≈ S (redondeo al entero más cercano). */
export function spreadPositions(a: number, b: number, S: number): number[] {
  const span = b - a;
  if (!(span > 1e-9) || !(S > 0)) return [(a + b) / 2];
  const n = Math.max(1, Math.round(span / S)) + 1;
  return Array.from({ length: n }, (_, i) => a + (span * i) / (n - 1));
}

function deckMass(decks: readonly MethodDeck[]): Kilograms {
  return decks.reduce((s, d) => s + (d.kind === 'charge' ? d.length * d.linearCharge : 0), 0);
}

function chargedLength(decks: readonly MethodDeck[]): Meters {
  return decks.reduce((s, d) => s + (d.kind === 'charge' ? d.length : 0), 0);
}

/** Columna normal (fondo → boca): carga y taco; sin largo de carga, todo taco. */
function columnDecks(length: Meters, stemming: Meters, q: number, product: 'main' | 'contour') {
  const st = Math.min(Math.max(0, stemming), length);
  const out: MethodDeck[] = [];
  if (length - st > 1e-9)
    out.push({ kind: 'charge', length: length - st, linearCharge: q, product });
  if (st > 1e-9) out.push({ kind: 'stemming', length: st });
  return out;
}

/** Secciones de un contorno barrido a lo largo de un eje cada ~1 m. */
function sweep(points: readonly UV[], map: (p: UV, s: number) => P3, from: number, to: number) {
  const n = Math.max(1, Math.ceil(Math.abs(to - from)));
  return Array.from({ length: n + 1 }, (_, i) => {
    const s = from + ((to - from) * i) / n;
    return points.map((p) => map(p, s));
  });
}

function boxOf(points: readonly P3[]): { min: P3; max: P3 } {
  const min = p3(Infinity, Infinity, Infinity);
  const max = p3(-Infinity, -Infinity, -Infinity);
  for (const p of points) {
    min.x = Math.min(min.x, p.x);
    min.y = Math.min(min.y, p.y);
    min.z = Math.min(min.z, p.z);
    max.x = Math.max(max.x, p.x);
    max.y = Math.max(max.y, p.y);
    max.z = Math.max(max.z, p.z);
  }
  return { min, max };
}

function linearChargeOf(p: MethodParams, e: MethodExplosive): number {
  const dc = Math.min(p.cartridgeDiameter, p.holeDiameter);
  return dc > 0
    ? coupledLinearCharge(e.density, dc)
    : coupledLinearCharge(e.density, p.holeDiameter);
}

function rulesFor(
  p: MethodParams,
  e: MethodExplosive,
  length: Meters,
  spacingRatio: Ratio,
): MethodRules {
  const d = p.holeDiameter;
  const langeforsMax = langeforsMaxBurden({
    diameter: d,
    density: e.density,
    rws: e.rws,
    rockConstant: p.rockConstant,
    fixation: p.fixation,
    spacingRatio,
  });
  const langeforsPractical = practicalBurden(langeforsMax, length, p.deviation, p.collaringError);
  const auto = !(p.burden > 0);
  const burden = auto ? Math.max(0.3, langeforsPractical) : p.burden;
  return {
    burden,
    spacing: p.spacing > 0 ? p.spacing : spacingRatio * burden,
    langeforsMax,
    langeforsPractical,
    empiricalMin: 25 * d,
    empiricalMax: 35 * d,
    auto,
  };
}

function burdenWarnings(m: MiningMethod, r: MethodRules, d: Meters): MethodWarning[] {
  const out: MethodWarning[] = [];
  if (!r.auto && r.burden > r.langeforsPractical + 1e-6)
    out.push({
      code: 'burdenAboveLangefors',
      params: { burden: r.burden, limit: r.langeforsPractical },
    });
  if (m.empiricalBurden && r.burden > 35 * d + 1e-6)
    out.push({ code: 'burdenAboveEmpirical', params: { burden: r.burden, limit: 35 * d } });
  return out;
}

// ------------------------------------------------------------------ Generadores

interface Partial3 {
  holes: Omit<MethodHole, 'index' | 'mass'>[];
  volume: number;
  advance?: Meters;
  rules?: MethodRules;
  faceWarnings?: FaceWarning[];
  warnings: MethodWarning[];
  views: MethodView[];
  context: MethodContext[];
  envelopePoints: P3[];
  face?: MethodDesign['face'];
  ring?: MethodDesign['ring'];
}

function faceProfile(p: MethodParams): ExcavationProfile {
  const { width: W, height: H } = p;
  if (!(W > 0.5) || !(H > 0.5)) throw new MethodInputError('W, H > 0,5 m');
  if (p.profile === 'rectangular') return rectangular(W, H);
  const hw = H - W / 2;
  if (hw <= 0.05) throw new MethodInputError(`H > W/2 = ${(W / 2).toFixed(2)} m`);
  return arched(W, hw);
}

function faceRound(p: MethodParams, e: MethodExplosive, raise: boolean) {
  if (!(p.holeDiameter > 0) || !(p.reliefDiameter > 0)) throw new MethodInputError('d, φ0 > 0');
  const profile = faceProfile(p);
  const dc = Math.min(p.cartridgeDiameter, p.holeDiameter);
  const design = designFaceRound({
    profile,
    holeDiameter: p.holeDiameter,
    reliefDiameter: p.reliefDiameter,
    reliefCount: p.reliefCount,
    explosiveDensity: e.density,
    rws: e.rws,
    ...(dc > 0 ? { linearCharge: coupledLinearCharge(e.density, dc) } : {}),
    rockConstant: p.rockConstant,
    maxDrillLength: p.length,
    smoothBlasting: p.smooth,
    collaringError: p.collaringError,
    angularDeviation: p.deviation,
    // En la chimenea el cuele va al centro de la sección.
    ...(raise ? { cutCenter: { u: 0, v: p.height / 2 } } : {}),
  });
  return { profile, design };
}

/** Frente de galería, crucero, rampa, by-pass o cámara: método sueco (Holmberg). */
function genFace(p: MethodParams, e: MethodExplosive): Partial3 {
  const { profile, design } = faceRound(p, e, false);
  const holes = design.holes.map((h) => {
    const decks: MethodDeck[] = [];
    if (h.charge) {
      const product = h.role === 'contour' ? 'contour' : 'main';
      if (h.charge.bottom.length > 1e-9 && h.charge.bottom.linearCharge > 0)
        decks.push({ kind: 'charge', product, ...h.charge.bottom });
      if (h.charge.column.length > 1e-9 && h.charge.column.linearCharge > 0)
        decks.push({ kind: 'charge', product, ...h.charge.column });
      if (h.charge.stemming > 1e-9) decks.push({ kind: 'stemming', length: h.charge.stemming });
    }
    return {
      role: h.role,
      collar: p3(h.collar.u, 0, h.collar.v),
      toe: p3(h.toe.u, h.depth, h.toe.v),
      length: h.length,
      diameter: h.diameter,
      group: h.delay ?? 0,
      decks,
      delay: h.delay === null ? null : h.delay * p.holeInterval,
    };
  });
  const behind = 3 * design.kpis.advance;
  const toXZ = (q: UV, s: number) => p3(q.u, s, q.v);
  return {
    holes,
    volume: design.kpis.volume,
    advance: design.kpis.advance,
    faceWarnings: design.warnings,
    warnings: [],
    views: [
      {
        id: 'front',
        axes: ['x', 'z'],
        outlines: [{ kind: 'excavation', points: profile.points, closed: true }],
      },
    ],
    context: [
      { kind: 'drive', sections: sweep(profile.points, toXZ, -behind, 0) },
      { kind: 'round', sections: sweep(profile.points, toXZ, 0, design.depth) },
    ],
    envelopePoints: [...profile.points.map((q) => toXZ(q, 0)), ...holes.map((h) => h.toe)],
    face: { profile, design },
  };
}

/** Chimenea convencional: el mismo frente girado al plano horizontal, perforado hacia arriba. */
function genRaise(p: MethodParams, e: MethodExplosive): Partial3 {
  const f = genFace({ ...p, profile: 'rectangular' }, e);
  const H = p.height;
  // Plano del frente (u, v) → planta (x = u, y = v − H/2); el avance va hacia +z.
  const turn = (q: P3): P3 => p3(q.x, q.z - H / 2, q.y);
  const holes = f.holes.map((h) => ({ ...h, collar: turn(h.collar), toe: turn(h.toe) }));
  const section = rect(-p.width / 2, p.width / 2, -H / 2, H / 2);
  const depth = f.face?.design.depth ?? p.length;
  const toPlan = (q: UV, s: number) => p3(q.u, q.v, s);
  return {
    ...f,
    holes,
    views: [
      {
        id: 'plan',
        axes: ['x', 'y'],
        outlines: [{ kind: 'excavation', points: section, closed: true }],
      },
      {
        id: 'front',
        axes: ['x', 'z'],
        outlines: [
          { kind: 'excavation', points: rect(-p.width / 2, p.width / 2, 0, depth), closed: true },
        ],
      },
    ],
    context: [
      { kind: 'drive', sections: sweep(section, toPlan, -3 * (f.advance ?? depth), 0) },
      { kind: 'round', sections: sweep(section, toPlan, 0, depth) },
    ],
    envelopePoints: [...section.map((q) => toPlan(q, 0)), ...holes.map((h) => h.toe)],
  };
}

/**
 * Cuele en planta (drop raise y slot): alivio(s) al centro, secciones de Holmberg giradas 45° una
 * respecto de la otra (B1 = min(1,5·Φ; Φ/2 + B) centro a centro, luego B = 8,8·10⁻²·√(Ah·q·s/(d·c))
 * con tope B) y relleno de la sección con una malla B × S. Taladros descendentes de alto H.
 */
function genCut(m: MiningMethod, p: MethodParams, e: MethodExplosive): Partial3 {
  const d = p.holeDiameter;
  if (!(d > 0) || !(p.reliefDiameter > 0)) throw new MethodInputError('d, φ0 > 0');
  if (!(p.width > 0.5) || !(p.thickness > 0.5) || !(p.height > 0.5))
    throw new MethodInputError('W, T, H > 0,5 m');
  const q = linearChargeOf(p, e);
  const n = Math.max(1, Math.round(p.reliefCount));
  const phi0 = p.reliefDiameter;
  const phi = phi0 * Math.sqrt(n);
  const H = p.height;
  const c = p.rockConstant;
  const F = p.deviation * H + p.collaringError;
  const Bcap = p.burden > 0 ? p.burden : Infinity;
  const hx = p.width / 2 - p.wallOffset;
  const hy = p.thickness / 2 - p.wallOffset;
  if (!(hx > 0) || !(hy > 0)) throw new MethodInputError('W, T > 2·borde');
  const inside = (u: UV) => Math.abs(u.u) <= hx + 1e-9 && Math.abs(u.v) <= hy + 1e-9;
  const warnings: MethodWarning[] = [];

  type Pt = UV & { role: MethodHoleRole; group: number };
  const pts: Pt[] = [];
  if (n === 1) pts.push({ u: 0, v: 0, role: 'relief', group: 0 });
  else {
    const r = (1.5 * phi0) / (2 * Math.sin(Math.PI / n));
    for (let k = 0; k < n; k++) {
      const a = (2 * Math.PI * k) / n;
      pts.push({ u: r * Math.cos(a), v: r * Math.sin(a), role: 'relief', group: 0 });
    }
  }
  // Secciones del cuele.
  const B1 = Math.min(1.5 * phi, phi / 2 + Bcap);
  if (F > 0.5 * (B1 - phi / 2))
    warnings.push({ code: 'deviationCritical', params: { deviation: F, burden: B1 - phi / 2 } });
  // La carga mínima de Holmberg vale para alivios perforados; contra una chimenea escariada
  // (Φ > 0,3 m) manda la regla B ≈ 1–1,5 m.
  const l1 = firstSquareCharge(d, B1, phi, c, e.rws);
  if (phi <= 0.3 && l1 > q)
    warnings.push({ code: 'cutChargeBelowRequired', params: { required: l1, available: q } });
  let radius = B1;
  let side = Math.SQRT2 * B1;
  let lastRadius = 0;
  for (let i = 1; i < 12; i++) {
    if (i > 1) {
      const Ah = side;
      const B = Math.min(cutSquareBurden(Ah, q, e.rws, d, c), Bcap, 2 * Ah);
      radius = B + Ah / 2;
      side = Math.SQRT2 * radius;
    }
    const base = i % 2 === 1 ? Math.PI / 4 : 0;
    let added = 0;
    for (let k = 0; k < 4; k++) {
      const a = base + (k * Math.PI) / 2;
      const u = { u: radius * Math.cos(a), v: radius * Math.sin(a) };
      if (inside(u)) {
        pts.push({ ...u, role: 'cut', group: i });
        added++;
      }
    }
    if (added === 0) break;
    lastRadius = radius;
  }
  // Relleno con malla B × S de la sección.
  const Bf = p.burden > 0 ? p.burden : Math.max(0.5, 25 * d);
  const Sf = p.spacing > 0 ? p.spacing : p.spacingRatio * Bf;
  const minGap = 0.6 * Math.min(Bf, Sf);
  const fill: Pt[] = [];
  for (const y of spreadPositions(-hy, hy, Bf))
    for (const x of spreadPositions(-hx, hx, Sf)) {
      const u = { u: x, v: y };
      if (Math.hypot(x, y) < lastRadius + 0.5 * Bf) continue;
      if ([...pts, ...fill].some((o) => Math.hypot(o.u - x, o.v - y) < minGap)) continue;
      fill.push({ ...u, role: 'slot', group: 99 });
    }
  pts.push(...fill);

  // Secuencia: un taladro por retardo, del alivio hacia afuera.
  const charged = pts
    .filter((x) => x.role !== 'relief')
    .sort((a, b) => Math.hypot(a.u, a.v) - Math.hypot(b.u, b.v));
  const order = new Map(charged.map((x, i) => [x, i]));
  const lift = m.charging === 'lift';
  const holes = pts.map((x) => {
    const relief = x.role === 'relief';
    let decks: MethodDeck[] = [];
    if (!relief) {
      if (lift) {
        // Tramo inferior (alto = tapón + carga + taco), aire hasta la boca.
        const plug = Math.min(p.bottomPlug, H);
        const charge = Math.max(0.3, Math.min(p.liftHeight - plug - p.stemming, H - plug));
        const st = Math.max(0, Math.min(p.stemming, H - plug - charge));
        decks = [
          { kind: 'plug', length: plug },
          { kind: 'charge', length: charge, linearCharge: q, product: 'main' },
          { kind: 'stemming', length: st },
        ];
        const air = H - plug - charge - st;
        if (air > 1e-9) decks.push({ kind: 'air', length: air });
        decks = decks.filter((k) => k.length > 1e-9);
      } else decks = columnDecks(H, p.stemming, q, 'main');
    }
    const rank = order.get(x) ?? 0;
    return {
      role: x.role,
      collar: p3(x.u, x.v, 0),
      toe: p3(x.u, x.v, -H),
      length: H,
      diameter: relief ? phi0 : d,
      group: x.group === 99 ? (lastRadius > 0 ? 50 : 1) : x.group,
      decks,
      delay: relief ? null : rank * p.holeInterval,
    };
  });
  const section = rect(-p.width / 2, p.width / 2, -p.thickness / 2, p.thickness / 2);
  const area = p.width * p.thickness;
  const blasted = lift ? Math.min(p.liftHeight, H) : H;
  const toPlan = (u: UV, s: number) => p3(u.u, u.v, s);
  return {
    holes,
    volume: area * blasted,
    ...(lift ? { advance: blasted } : {}),
    warnings,
    views: [
      {
        id: 'plan',
        axes: ['x', 'y'],
        outlines: [{ kind: 'stope', points: section, closed: true }],
      },
      {
        id: 'front',
        axes: ['x', 'z'],
        outlines: [
          { kind: 'stope', points: rect(-p.width / 2, p.width / 2, -H, 0), closed: true },
          ...(lift
            ? [
                {
                  kind: 'lift' as const,
                  points: [
                    { u: -p.width / 2, v: -H + blasted },
                    { u: p.width / 2, v: -H + blasted },
                  ],
                  closed: false,
                },
              ]
            : []),
        ],
      },
    ],
    context: [{ kind: 'stope', sections: sweep(section, toPlan, -H, 0) }],
    envelopePoints: [...section.map((u) => toPlan(u, 0)), ...section.map((u) => toPlan(u, -H))],
  };
}

/**
 * Malla de filas paralelas: taladros largos descendentes (sublevel stoping, veta angosta, VCR,
 * banqueo), realce ascendente (corte y relleno, shrinkage) o breasting horizontal. La cara libre
 * está en y = 0 (slot) o, en el breasting, abajo (z = 0); la fila 1 es la más cercana.
 */
function genGrid(m: MiningMethod, p: MethodParams, e: MethodExplosive): Partial3 {
  const d = p.holeDiameter;
  const orient = m.orientation ?? 'down';
  if (!(d > 0) || !(p.width > 0.3)) throw new MethodInputError('d, W > 0');
  const q = linearChargeOf(p, e);
  const dip = Math.min(Math.max(p.dip, 30 * DEG), 90 * DEG);
  const sinD = Math.sin(dip);
  const cosD = Math.abs(Math.cos(dip)) < 1e-12 ? 0 : Math.cos(dip);
  const holeLen = orient === 'down' ? (p.height + p.subdrill) / sinD : Math.max(0.3, p.length);
  if (!(holeLen > 0.3)) throw new MethodInputError('L > 0,3 m');
  const sbGuess = p.spacing > 0 && p.burden > 0 ? p.spacing / p.burden : p.spacingRatio;
  const rules = rulesFor(p, e, holeLen, sbGuess);
  const B = rules.burden;
  const S = rules.spacing;
  const W = p.width;
  const xs = spreadPositions(-W / 2 + p.wallOffset, W / 2 - p.wallOffset, S);
  const xsStag =
    m.id === 'shrinkage' && xs.length > 1
      ? xs.slice(1).map((x, i) => (x + (xs[i] as number)) / 2)
      : xs;
  const warnings: MethodWarning[] = m.charging === 'crater' ? [] : burdenWarnings(m, rules, d);
  const qContour = Math.min(90 * d * d, q);

  type Raw = Omit<MethodHole, 'index' | 'mass' | 'delay'>;
  const raw: Raw[] = [];
  const rows = Math.max(1, Math.round(p.rows));
  const views: MethodView[] = [];
  const context: MethodContext[] = [];
  const envelope: P3[] = [];

  if (orient === 'horizontal') {
    // Breasting: filas horizontales de abajo (cara libre) arriba; la del techo es contorno.
    const H = p.height;
    if (!(H > 2 * p.wallOffset)) throw new MethodInputError('H > 2·borde');
    const zs = spreadPositions(p.wallOffset, H - p.wallOffset, B);
    zs.forEach((z, r) => {
      const contour = p.smooth && r === zs.length - 1;
      xs.forEach((x) => {
        raw.push({
          role: contour ? 'contour' : 'breast',
          collar: p3(x, 0, z),
          toe: p3(x, holeLen, z),
          length: holeLen,
          diameter: d,
          group: r,
          decks: columnDecks(
            holeLen,
            p.stemming,
            contour ? qContour : q,
            contour ? 'contour' : 'main',
          ),
        });
      });
    });
    const advance = 0.95 * holeLen;
    const volume = W * H * advance;
    const face = rect(-W / 2, W / 2, 0, H);
    views.push(
      {
        id: 'front',
        axes: ['x', 'z'],
        outlines: [{ kind: 'excavation', points: face, closed: true }],
      },
      {
        id: 'side',
        axes: ['y', 'z'],
        outlines: [
          { kind: 'stope', points: rect(0, holeLen, 0, H), closed: true },
          {
            kind: 'freeFace',
            points: [
              { u: -1, v: 0 },
              { u: holeLen + 1, v: 0 },
            ],
            closed: false,
          },
        ],
      },
    );
    const toXZ = (u: UV, s: number) => p3(u.u, s, u.v);
    context.push({ kind: 'round', sections: sweep(face, toXZ, 0, holeLen) });
    envelope.push(...face.map((u) => toXZ(u, 0)), ...face.map((u) => toXZ(u, holeLen)));
    const res = finishGrid(raw, p, 'rows');
    return {
      holes: res,
      volume,
      advance,
      rules,
      warnings,
      views,
      context,
      envelopePoints: envelope,
    };
  }

  // Descendentes o ascendentes: filas a lo largo de y a B, 1,5·B … desde la cara libre (y = 0),
  // inclinados hacia ella si dip < 90°.
  const up = orient === 'up';
  const vert = holeLen * sinD;
  const lean = holeLen * cosD;
  for (let r = 0; r < rows; r++) {
    const y = (r + 1) * B;
    const row = r % 2 === 1 ? xsStag : xs;
    row.forEach((x) => {
      const collar = p3(x, y, 0);
      const toe = p3(x, y - lean, up ? vert : -vert);
      let decks: MethodDeck[];
      if (m.charging === 'crater') {
        // Rebanada inferior: tapón hasta d_o − Lc/2 del fondo, carga esférica, taco y aire.
        const Lc = Math.min(p.chargeDiameters * d, holeLen);
        const plug = Math.max(0, Math.min(p.burialDepth - Lc / 2, holeLen - Lc));
        const st = Math.min(p.stemming, holeLen - plug - Lc);
        decks = [
          { kind: 'plug' as const, length: plug },
          { kind: 'charge' as const, length: Lc, linearCharge: q, product: 'main' as const },
          { kind: 'stemming' as const, length: st },
          { kind: 'air' as const, length: holeLen - plug - Lc - st },
        ].filter((k) => k.length > 1e-9);
      } else decks = columnDecks(holeLen, p.stemming, q, 'main');
      raw.push({
        role: m.charging === 'crater' ? 'crater' : up ? 'upper' : 'longhole',
        collar,
        toe,
        length: holeLen,
        diameter: d,
        group: r,
        decks,
      });
    });
  }
  const L = rows * B;
  const Hb = up ? vert : p.height;
  const blastedH = m.charging === 'crater' ? Math.min(p.liftHeight, Hb) : Hb;
  const volume = W * L * blastedH;
  const zLo = up ? 0 : -Hb;
  const zHi = up ? Hb : 0;
  const plan = rect(-W / 2, W / 2, 0, L);
  views.push(
    {
      id: 'plan',
      axes: ['x', 'y'],
      outlines: [
        { kind: 'stope', points: plan, closed: true },
        {
          kind: 'freeFace',
          points: [
            { u: -W / 2, v: 0 },
            { u: W / 2, v: 0 },
          ],
          closed: false,
        },
      ],
    },
    {
      id: 'side',
      axes: ['y', 'z'],
      outlines: [
        { kind: 'stope', points: rect(0, L, zLo, zHi), closed: true },
        {
          kind: 'freeFace',
          points: [
            { u: 0, v: zLo },
            { u: 0, v: zHi },
          ],
          closed: false,
        },
        ...(m.charging === 'crater'
          ? [
              {
                kind: 'lift' as const,
                points: [
                  { u: 0, v: zLo + blastedH },
                  { u: L, v: zLo + blastedH },
                ],
                closed: false,
              },
            ]
          : []),
      ],
    },
  );
  const section = rect(-W / 2, W / 2, zLo, zHi);
  const toXZ = (u: UV, s: number) => p3(u.u, s, u.v);
  context.push({ kind: 'stope', sections: sweep(section, toXZ, 0, L) });
  envelope.push(
    ...section.map((u) => toXZ(u, -lean)),
    ...section.map((u) => toXZ(u, L)),
    p3(0, 0, up ? zLo : zLo - p.subdrill),
  );
  const res = finishGrid(raw, p, m.charging === 'crater' ? 'all' : 'rows');
  return { holes: res, volume, rules, warnings, views, context, envelopePoints: envelope };
}

/** Tiempos de la malla: por filas (retardo de fila + taladros del centro afuera) o todos juntos. */
function finishGrid(
  raw: Omit<MethodHole, 'index' | 'mass' | 'delay'>[],
  p: MethodParams,
  mode: 'rows' | 'all',
): Omit<MethodHole, 'index' | 'mass'>[] {
  if (mode === 'all') {
    // VCR: un disparo por rebanada, cargas a 25 ms del centro hacia afuera.
    const cx = raw.reduce((s, h) => s + h.collar.x, 0) / Math.max(1, raw.length);
    const cy = raw.reduce((s, h) => s + h.collar.y, 0) / Math.max(1, raw.length);
    const sorted = [...raw].sort(
      (a, b) =>
        Math.hypot(a.collar.x - cx, a.collar.y - cy) - Math.hypot(b.collar.x - cx, b.collar.y - cy),
    );
    const order = new Map(sorted.map((h, i) => [h, i]));
    return raw.map((h) => {
      return { ...h, delay: (order.get(h) ?? 0) * p.holeInterval };
    });
  }
  const out: Omit<MethodHole, 'index' | 'mass'>[] = [];
  const groups = [...new Set(raw.map((h) => h.group))].sort((a, b) => a - b);
  for (const g of groups) {
    const row = raw.filter((h) => h.group === g);
    const sorted = [...row].sort((a, b) => Math.abs(a.collar.x) - Math.abs(b.collar.x));
    sorted.forEach((h, k) => {
      out.push({ ...h, delay: g * p.rowInterval + k * p.holeInterval });
    });
  }
  return out;
}

/** Contorno del anillo en su plano según la forma de la plantilla. */
function ringBoundary(shape: RingShape, p: MethodParams): UV[] {
  const W = p.width;
  const b = p.stopeBottom;
  const t = p.stopeTop;
  if (!(W > 1) || !(t > b)) throw new MethodInputError('W > 1 m, techo > piso');
  if (shape === 'slc') {
    // Anillo de SLC: entre galerías vecinas (ancho = distancia entre galerías) hasta el subnivel
    // superior, angostándose arriba (forma de pera).
    const h1 = b + 0.45 * (t - b);
    return [
      { u: -W / 2, v: b },
      { u: W / 2, v: b },
      { u: W / 2, v: h1 },
      { u: 0.2 * W, v: t },
      { u: -0.2 * W, v: t },
      { u: -W / 2, v: h1 },
    ];
  }
  if (shape === 'drawbell') {
    // Embudo en V: ancho de la galería abajo y W arriba.
    const w0 = p.driveWidth / 2 + 0.5;
    return [
      { u: -w0, v: b },
      { u: w0, v: b },
      { u: W / 2, v: t },
      { u: -W / 2, v: t },
    ];
  }
  return rect(-W / 2, W / 2, b, t);
}

/** Abanicos: `designRing` (S_toe constante, collar alternado) y réplica cada B en retirada. */
function genRing(m: MiningMethod, p: MethodParams, e: MethodExplosive): Partial3 {
  const d = p.holeDiameter;
  if (!(d > 0)) throw new MethodInputError('d > 0');
  if (!(p.driveWidth > 1) || !(p.driveHeight > 1)) throw new MethodInputError('galería > 1 m');
  const hw = p.driveHeight - p.driveWidth / 2;
  const drive = hw > 0.05 ? arched(p.driveWidth, hw) : rectangular(p.driveWidth, p.driveHeight);
  const boundary = ringBoundary(m.ringShape ?? 'rect', p);
  // En el anillo los taladros convergen: S/B medio de Langefors = 1,25 aunque S_toe sea mayor.
  const rules = rulesFor(p, e, p.length, p.spacingRatio);
  const B = rules.burden;
  const St = p.toeSpacing > 0 ? p.toeSpacing : 1.3 * B;
  rules.spacing = St;
  const pivot = { u: 0, v: Math.min(p.pivotHeight, p.driveHeight - 0.2) };
  const ring = designRing({
    pivot,
    boundary,
    drive: drive.points,
    mode: 'toeSpacing',
    toeSpacing: St,
    standOff: p.standOff,
    maxLength: p.length,
    deadZones: p.deadZone > 0 ? [{ center: Math.PI, halfWidth: p.deadZone }] : [],
    holeDiameter: d,
    explosiveDensity: e.density,
    kLongCollar: p.collarLongK,
    kShortCollar: p.collarShortK,
    burden: B,
    rockDensity: p.rockDensity,
    delayInterval: p.holeInterval,
  });
  const warnings = burdenWarnings(m, rules, d);
  const truncated = ring.holes.filter((h) => h.truncated).length;
  if (truncated > 0) warnings.push({ code: 'holesTruncated', params: { count: truncated } });
  const rows = Math.max(1, Math.round(p.rows));
  const sd = Math.sin(p.dump);
  const cd = Math.cos(p.dump);
  const at = (u: UV, y0: number) => p3(u.u, y0 + u.v * sd, u.v * cd);
  const holes: Omit<MethodHole, 'index' | 'mass'>[] = [];
  for (let r = 0; r < rows; r++) {
    const y0 = r * B;
    // Los taladros que quedarían sin carga (cortos junto a la galería) no se perforan.
    for (const h of ring.holes.filter((x) => x.chargedLength > 1e-9)) {
      const decks: MethodDeck[] = [];
      if (h.chargedLength > 1e-9)
        decks.push({
          kind: 'charge',
          length: h.chargedLength,
          linearCharge: ring.linearCharge,
          product: 'main',
        });
      if (h.unchargedCollar > 1e-9) decks.push({ kind: 'stemming', length: h.unchargedCollar });
      holes.push({
        role: 'ring',
        collar: at(h.collar, y0),
        toe: at(h.toe, y0),
        length: h.length,
        diameter: d,
        group: r,
        decks,
        delay: h.delay + r * p.rowInterval,
      });
    }
  }
  const proj = (pts: readonly UV[]) => pts.map((u) => ({ u: u.u, v: u.v * cd }));
  const L = (rows - 1) * B;
  const toXZ = (u: UV, s: number) => at(u, s);
  return {
    holes,
    volume: ring.kpis.area * B * rows,
    rules,
    warnings,
    views: [
      {
        id: 'front',
        axes: ['x', 'z'],
        outlines: [
          { kind: 'stope', points: proj(boundary), closed: true },
          { kind: 'drive', points: proj(drive.points), closed: true },
        ],
      },
    ],
    context: [
      { kind: 'drive', sections: sweep(drive.points, toXZ, -3, L + 3) },
      { kind: 'stope', sections: sweep(boundary, toXZ, -1.5, L + 1.5) },
    ],
    envelopePoints: [
      ...boundary.map((u) => at(u, 0)),
      ...boundary.map((u) => at(u, L)),
      ...drive.points.map((u) => at(u, 0)),
    ],
    ring: { design: ring, boundary, drive: drive.points, pivot },
  };
}

// ------------------------------------------------------------------ Diseño por método

/** Explosivo genérico si no se da uno (emulsión 1150 kg/m³, s_ANFO 0,8). */
export const DEFAULT_METHOD_EXPLOSIVE: MethodExplosive = { density: 1150, rws: 0.8 };

/** Parámetros de la plantilla con los cambios del usuario (los no dados quedan por defecto). */
export function methodParams(id: MiningMethodId, patch: Partial<MethodParams> = {}): MethodParams {
  const out = { ...METHOD_DEFAULTS[id] };
  for (const [k, v] of Object.entries(patch) as [MethodParamKey, unknown][])
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  return out;
}

/**
 * Diseña la plantilla del método con sus parámetros. Función pura. `contour` es el explosivo del
 * contorno (frentes con voladura suave); la carga lineal del contorno es 90·d² de todos modos.
 */
export function designByMethod(
  id: MiningMethodId,
  patch: Partial<MethodParams> = {},
  explosive: MethodExplosive = DEFAULT_METHOD_EXPLOSIVE,
): MethodDesign {
  const m = miningMethod(id);
  const p = methodParams(id, patch);
  if (!(p.rockDensity > 0)) throw new MethodInputError('ρ roca > 0');
  let g: Partial3;
  switch (m.generator) {
    case 'face':
      g = genFace(p, explosive);
      break;
    case 'raise':
      g = genRaise(p, explosive);
      break;
    case 'cut':
      g = genCut(m, p, explosive);
      break;
    case 'grid':
      g = genGrid(m, p, explosive);
      break;
    case 'ring':
      g = genRing(m, p, explosive);
      break;
  }
  const holes: MethodHole[] = g.holes.map((h, i) => ({
    ...h,
    index: i + 1,
    mass: deckMass(h.decks),
  }));
  const warnings = [...g.warnings];
  if (holes.length === 0) warnings.push({ code: 'noHoles' });
  const stemmed = holes.filter(
    (h) => h.role !== 'relief' && chargedLength(h.decks) <= 1e-9 && h.length > 0,
  ).length;
  if (stemmed > 0) warnings.push({ code: 'stemmingTooLong', params: { count: stemmed } });

  // Indicadores.
  const charged = holes.filter((h) => h.mass > 0);
  const totalCharge = charged.reduce((s, h) => s + h.mass, 0);
  const tonnes = (g.volume * p.rockDensity) / 1000;
  const perDelay = new Map<number, number>();
  for (const h of charged) {
    if (h.delay === null) continue;
    const key = Math.round(h.delay / 0.008);
    perDelay.set(key, (perDelay.get(key) ?? 0) + h.mass);
  }
  const drilledMeters = holes.reduce((s, h) => s + h.length, 0);
  const kpis: MethodKpis = {
    holes: holes.length,
    chargedHoles: charged.length,
    reliefHoles: holes.filter((h) => h.role === 'relief').length,
    drilledMeters,
    chargedMeters: holes.reduce((s, h) => s + chargedLength(h.decks), 0),
    totalCharge,
    volume: g.volume,
    tonnes,
    powderFactor: g.volume > 0 ? totalCharge / g.volume : 0,
    chargePerTonne: tonnes > 0 ? totalCharge / tonnes : 0,
    drilledPerTonne: tonnes > 0 ? drilledMeters / tonnes : 0,
    maxChargePerDelay: Math.max(0, ...perDelay.values()),
    ...(g.advance !== undefined ? { advance: g.advance } : {}),
  };
  const pf = m.powderFactor.unit === 'kg/t' ? kpis.chargePerTonne : kpis.powderFactor;
  const powderFactorStatus =
    pf < m.powderFactor.min * 0.999 ? 'low' : pf > m.powderFactor.max * 1.001 ? 'high' : 'ok';
  return {
    method: id,
    params: p,
    holes,
    kpis,
    powderFactorStatus,
    ...(g.rules ? { rules: g.rules } : {}),
    faceWarnings: g.faceWarnings ?? [],
    warnings,
    views: g.views,
    context: g.context,
    envelope: boxOf([...g.envelopePoints, ...holes.flatMap((h) => [h.collar])]),
    ...(g.face ? { face: g.face } : {}),
    ...(g.ring ? { ring: g.ring } : {}),
  };
}

/** Área de un contorno (para indicadores de la interfaz). */
export function outlineArea(points: readonly UV[]): number {
  return Math.abs(signedArea(points));
}
