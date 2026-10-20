import { create } from 'zustand';
import { DEFAULT_FACE, DEFAULT_RING, type FaceForm, type RingForm } from './model';
import type { Placement } from './send';

/** Ubicación sobre una labor: cuál, a qué progresiva y en qué sentido avanza. */
export interface WorkingLocation {
  /** Labor elegida (ver `workingTargets`). */
  targetId: string;
  /** Progresiva desde el inicio del eje [m]. */
  station: number;
  /** El frente avanza hacia el inicio del eje. */
  reverse: boolean;
}

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
  /** Labor donde se trabaja (frente y abanicos por separado); null = coordenadas a mano. */
  locations: Record<UndergroundTab, WorkingLocation | null>;
  setLocation: (tab: UndergroundTab, location: WorkingLocation | null) => void;
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
  locations: { face: null, ring: null },
  setLocation: (tab, location) => {
    set((s) => ({ locations: { ...s.locations, [tab]: location } }));
  },
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
