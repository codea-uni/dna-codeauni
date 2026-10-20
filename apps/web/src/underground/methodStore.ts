import type { MethodParams, MiningMethodId } from '@cronos/core';
import { create } from 'zustand';
import type { Placement } from './send';

/**
 * Estado de la pestaña «Método de minado» (preferencias de la sesión, no son parte del proyecto):
 * plantilla elegida, cambios del usuario a sus parámetros, explosivo y ubicación de cada una. Cada
 * plantilla guarda lo suyo: se diseña cada labor (tajeo, chimenea, frente) por separado.
 */
interface MethodState {
  /** La pestaña de métodos está a la vista (las otras dos usan `useUndergroundStore.tab`). */
  active: boolean;
  /** Plantilla abierta; null = catálogo de tarjetas. */
  methodId: MiningMethodId | null;
  patches: Partial<Record<MiningMethodId, Partial<MethodParams>>>;
  explosives: Partial<Record<MiningMethodId, string>>;
  placements: Partial<Record<MiningMethodId, Placement>>;
  setActive: (active: boolean) => void;
  choose: (id: MiningMethodId | null) => void;
  patch: (id: MiningMethodId, patch: Partial<MethodParams>) => void;
  reset: (id: MiningMethodId) => void;
  setExplosive: (id: MiningMethodId, explosiveId: string) => void;
  setPlacement: (id: MiningMethodId, placement: Placement) => void;
}

export const useMethodStore = create<MethodState>((set) => ({
  active: true,
  methodId: null,
  patches: {},
  explosives: {},
  placements: {},
  setActive: (active) => {
    set({ active });
  },
  choose: (methodId) => {
    set({ methodId, active: true });
  },
  patch: (id, patch) => {
    set((s) => ({ patches: { ...s.patches, [id]: { ...s.patches[id], ...patch } } }));
  },
  reset: (id) => {
    set((s) => ({
      patches: Object.fromEntries(Object.entries(s.patches).filter(([k]) => k !== id)),
      explosives: Object.fromEntries(Object.entries(s.explosives).filter(([k]) => k !== id)),
    }));
  },
  setExplosive: (id, explosiveId) => {
    set((s) => ({ explosives: { ...s.explosives, [id]: explosiveId } }));
  },
  setPlacement: (id, placement) => {
    set((s) => ({ placements: { ...s.placements, [id]: placement } }));
  },
}));
