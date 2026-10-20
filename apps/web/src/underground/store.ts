import { create } from 'zustand';
import { DEFAULT_FACE, DEFAULT_RING, type FaceForm, type RingForm } from './model';
import type { Placement } from './send';

/** Estado de la herramienta subterránea (preferencias de la sesión; no es parte del proyecto). */
interface UndergroundState {
  tab: 'face' | 'ring';
  face: FaceForm;
  ring: RingForm;
  /** null hasta que se abre la herramienta: entonces toma el origen por defecto del proyecto. */
  placement: Placement | null;
  setTab: (tab: 'face' | 'ring') => void;
  patchFace: (patch: Partial<FaceForm>) => void;
  patchRing: (patch: Partial<RingForm>) => void;
  setPlacement: (placement: Placement) => void;
}

export const useUndergroundStore = create<UndergroundState>((set) => ({
  tab: 'face',
  face: DEFAULT_FACE,
  ring: DEFAULT_RING,
  placement: null,
  setTab: (tab) => {
    set({ tab });
  },
  patchFace: (patch) => {
    set((s) => ({ face: { ...s.face, ...patch } }));
  },
  patchRing: (patch) => {
    set((s) => ({ ring: { ...s.ring, ...patch } }));
  },
  setPlacement: (placement) => {
    set({ placement });
  },
}));
