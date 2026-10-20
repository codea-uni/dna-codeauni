import { create } from 'zustand';
import { DEFAULT_FACE, DEFAULT_RING, type FaceForm, type RingForm } from './model';
import type { Placement } from './send';

/** Estado de la herramienta subterránea (preferencias de la sesión; no es parte del proyecto). */
interface UndergroundState {
  tab: UndergroundTab;
  face: FaceForm;
  ring: RingForm;
  /**
   * Ubicación de cada diseño (frente y abanicos por separado, para que no se encimen); null hasta
   * que se abre la herramienta o lo usa el asistente: entonces toma los orígenes por defecto.
   */
  placements: Record<UndergroundTab, Placement> | null;
  setTab: (tab: UndergroundTab) => void;
  patchFace: (patch: Partial<FaceForm>) => void;
  patchRing: (patch: Partial<RingForm>) => void;
  setPlacements: (placements: Record<UndergroundTab, Placement>) => void;
  setPlacement: (tab: UndergroundTab, placement: Placement) => void;
}

export type UndergroundTab = 'face' | 'ring';

export const useUndergroundStore = create<UndergroundState>((set) => ({
  tab: 'face',
  face: DEFAULT_FACE,
  ring: DEFAULT_RING,
  placements: null,
  setTab: (tab) => {
    set({ tab });
  },
  patchFace: (patch) => {
    set((s) => ({ face: { ...s.face, ...patch } }));
  },
  patchRing: (patch) => {
    set((s) => ({ ring: { ...s.ring, ...patch } }));
  },
  setPlacements: (placements) => {
    set({ placements });
  },
  setPlacement: (tab, placement) => {
    set((s) => (s.placements ? { placements: { ...s.placements, [tab]: placement } } : {}));
  },
}));
