import type { BlastAnalysis } from '@blastlab/core';
import type { EngineLayer } from '@blastlab/engine';
import { create } from 'zustand';

export type ColorBy = 'none' | 'time' | 'kg' | 'powderFactor';
export type LabelBy = 'label' | 'time' | 'kg';

interface AnalysisState {
  analysis: BlastAnalysis | null;
  /** Versión del documento a la que corresponde `analysis`. */
  version: number;
  computing: boolean;
  coincidenceWindowMs: number;
  /** 0 = automático. */
  isochroneIntervalMs: number;
  colorBy: ColorBy;
  labelBy: LabelBy;
  layers: Record<EngineLayer, boolean>;
  sequenceTime: number | null;
  sequencePlaying: boolean;
  /** Segundos de secuencia por segundo real. */
  sequenceSpeed: number;
  set: (patch: Partial<Omit<AnalysisState, 'set' | 'setLayer'>>) => void;
  setLayer: (layer: EngineLayer, visible: boolean) => void;
}

export const useAnalysisStore = create<AnalysisState>()((set) => ({
  analysis: null,
  version: -1,
  computing: false,
  coincidenceWindowMs: 8,
  isochroneIntervalMs: 0,
  colorBy: 'none',
  labelBy: 'label',
  layers: { labels: true, traces: true, connections: true, isochrones: false },
  sequenceTime: null,
  sequencePlaying: false,
  sequenceSpeed: 0.1,
  set: (patch) => {
    set(patch);
  },
  setLayer: (layer, visible) => {
    set((s) => ({ layers: { ...s.layers, [layer]: visible } }));
  },
}));
