import { create } from 'zustand';
import {
  DEFAULT_ADVANCE_EFFICIENCY,
  DEFAULT_UG_TIMING,
  type EnergyMetric,
  type KuzRamVariant,
} from '@cronos/core';

/**
 * Pestaña «Análisis» de la herramienta subterránea (preferencias de la sesión, no del proyecto):
 * halos de energía en el plano del frente o del abanico, secuencia (acoplamiento y corte por
 * onda), cubicación y fragmentación. La eficiencia de avance y la sobreexcavación también las usa
 * el panel Resultados para cubicar los taladros subterráneos.
 */
export interface UgAnalysisState {
  /** La pestaña Análisis está abierta (las de diseño usan `useUndergroundStore.tab`). */
  open: boolean;
  /** Plano evaluado: el frente o el anillo `ringIndex` de los abanicos. */
  target: 'face' | 'ring';
  /** Diseño analizado: marca `ug-*` del frente, los abanicos o una plantilla (null = el primero). */
  designTag: string | null;
  ringIndex: number;
  /** Profundidad del plano del frente como fracción del largo perforado (0 = bocas, 1 = fondos). */
  depthFraction: number;
  metric: EnergyMetric;
  /** Dibujar los halos también en la vista 3D. */
  show3d: boolean;
  /** Distancia de corte por onda en seco [m]. */
  shockDistance: number;
  /** Punto de control para la ventana de llegada (null = solo los 8 ms). */
  receiverId: string | null;
  advanceEfficiency: number;
  overbreak: number;
  variant: KuzRamVariant;
  calibration: number;
  /** Bloque in situ [m] para xmax de Swebrec; 0 = sin dato (xmax = S). */
  inSituBlock: number;
  set: (patch: Partial<Omit<UgAnalysisState, 'set'>>) => void;
}

export const useUgAnalysisStore = create<UgAnalysisState>((set) => ({
  open: false,
  target: 'face',
  designTag: null,
  ringIndex: 0,
  depthFraction: 0.5,
  metric: 'nearFieldPpv',
  show3d: false,
  shockDistance: DEFAULT_UG_TIMING.shockDistance,
  receiverId: null,
  advanceEfficiency: DEFAULT_ADVANCE_EFFICIENCY,
  overbreak: 0,
  variant: 'cunningham2005',
  calibration: 1,
  inSituBlock: 0,
  set: (patch) => {
    set(patch);
  },
}));
