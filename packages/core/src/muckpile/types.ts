import type { ScalarGrid } from '../energy/contours';
import type { Meters, Seconds } from '../model/types';

/** Superficie consultable en planta (la topografía con `SurfaceIndex`, o una grilla). */
export interface ElevationSource {
  elevationAt(x: number, y: number): number | null;
}

/**
 * Bloques de la pila en arreglos planos (índice k = bloque). Posiciones en coordenadas de
 * proyecto [m] (float64: UTM); el engine resta el origen antes de enviarlas a la GPU.
 */
export interface MuckpileBlocks {
  count: number;
  /** Centro in situ [x, y, z, …]. */
  origin: Float64Array;
  /** Punto de impacto de la trayectoria balística [x, y, z, …]. */
  impact: Float64Array;
  /** Posición final en la pila [x, y, z, …]. */
  destination: Float64Array;
  /** Velocidad inicial [vx, vy, vz, …] [m/s]. */
  velocity: Float32Array;
  /** Tiempo de salida (disparo de su taladro) [s]; NaN si el taladro no tiene tiempo. */
  launchTime: Float64Array;
  /** Tiempo de impacto [s] (= salida si el bloque no vuela). */
  impactTime: Float64Array;
  /** Índice del taladro en `blast.holes` (Voronoi en planta a la cota del bloque). */
  hole: Int32Array;
  /** Volumen in situ [m³]. */
  volume: Float32Array;
  /** Alto del bloque in situ [m] (el lado en planta es `blockSize`). */
  height: Float32Array;
  /**
   * Pendiente del terreno sobre el bloque superior de cada columna [dz/dx, dz/dy, …] (0 en los
   * demás y sin topografía): in situ, su cara de arriba sigue el relieve del levantamiento.
   */
  topSlope: Float32Array;
  /** Tamaño de fragmento representativo [m] (Kuz-Ram del taladro, FC-44); NaN sin datos. */
  fragmentSize: Float32Array;
  /** Índice del dominio en `blast.domains` (−1 = sin dominio). */
  domain: Int16Array;
}

/** Grillas de la pila (misma retícula): cotas [m] y atributos por celda. */
export interface MuckpileGrids {
  /** Terreno fijo: piso dentro de la voladura y terreno pre-voladura fuera. */
  base: ScalarGrid;
  /** Superficie antes de la voladura (techo in situ dentro del perímetro). */
  before: ScalarGrid;
  /** Superficie de la pila después de la voladura. */
  after: ScalarGrid;
  /** Desplazamiento horizontal medio de los bloques de cada columna [m] (NaN sin material). */
  displacement: Float32Array;
  /** Tamaño de fragmento medio de la columna [m] (NaN sin datos). */
  fragmentSize: Float32Array;
  /** Dominio dominante de la columna (−1 = sin dominio o sin material). */
  domain: Int16Array;
  /** Fracción del volumen de la columna que es del dominio dominante (1 = sin mezcla). */
  domainPurity: Float32Array;
}

/** Indicadores de la pila (`muckpile/README.md` §Salidas). */
export interface MuckpileStats {
  /** Volumen in situ [m³] y volumen de la pila [m³]. */
  inSituVolume: number;
  pileVolume: number;
  /** pileVolume / (inSituVolume·esponjamiento) − 1 (control de conservación). */
  volumeError: number;
  /** Parte del volumen in situ bajo el talud, delante de la cresta [m³] (A7b, FC-46). */
  wedgeVolume: number;
  /** Mayor exceso de desnivel sobre el de reposo entre celdas vecinas con material [m] (≈ 0). */
  maxReposeExcess: number;
  /** Desplazamiento horizontal de los bloques: máximo y medio ponderado por volumen [m]. */
  maxDisplacement: Meters;
  meanDisplacement: Meters;
  /** Throw: distancia máxima del pie de la pila (≥ 0,1 m de espesor) a la cara libre [m]. */
  throw: Meters;
  /** Drop: bajada de la superficie dentro del perímetro [m], máxima y media. */
  maxDrop: Meters;
  meanDrop: Meters;
  /** Esponjamiento lateral: cuánto se abre la pila fuera del perímetro, de costado [m]. */
  lateralSpread: Meters;
  /** Cota máxima de la pila [m] y su altura sobre el piso [m]. */
  maxElevation: Meters;
  maxHeight: Meters;
  /** Dirección media de salida en planta (unitaria). */
  direction: { x: number; y: number };
  blocks: number;
  /** Bloques que no vuelan: taladro sin tiempo, sin carga o sin superficie libre. */
  staticBlocks: number;
  /** Primer y último tiempo de salida [s] y último impacto [s]. */
  firstLaunch: Seconds;
  lastLaunch: Seconds;
  lastImpact: Seconds;
}

export type MuckpileWarning =
  | { id: 'muckpile.noFootprint' }
  | { id: 'muckpile.unblastedBoundaries'; params: { n: number } }
  | { id: 'muckpile.noChargedHoles' }
  | { id: 'muckpile.staticBlocks'; params: { blocks: number; holes: number } }
  | { id: 'muckpile.powerLawR0' }
  | { id: 'muckpile.faceVelocityFlyrock' }
  | { id: 'muckpile.clipped'; params: { blocks: number } }
  | { id: 'muckpile.gridLimit'; params: { cell: number } };

/** Vector medio de desplazamiento por taladro (centroide de sus bloques in situ → en la pila). */
export interface MuckpileVectors {
  count: number;
  /** Índice del taladro en `blast.holes`. */
  hole: Int32Array;
  /** Centroides ponderados por volumen [x, y, z, …]. */
  from: Float64Array;
  to: Float64Array;
  /** Desplazamiento horizontal medio de los bloques del taladro [m]. */
  magnitude: Float32Array;
}

export interface MuckpileResult {
  blocks: MuckpileBlocks;
  vectors: MuckpileVectors;
  grids: MuckpileGrids;
  stats: MuckpileStats;
  /** Volumen por clase de tamaño de fragmento (fracción del volumen con tamaño, ascendente). */
  sizeClasses: { upper: Meters; fraction: number }[];
  warnings: MuckpileWarning[];
  /** Duración del cálculo [ms]. */
  elapsedMs: number;
}
