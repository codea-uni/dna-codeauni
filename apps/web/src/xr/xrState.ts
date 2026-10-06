import type { RoomRole, RoomState } from '@cronos/api';
import { create } from 'zustand';
import { requestMuckpile } from '../analysis/muckpileActions';
import { useAnalysisStore } from '../stores/analysisStore';

/** Capas que se prenden y apagan desde el visor (y que el presentador comparte). */
export type XrLayers = RoomState['layers'];

const store = () => useAnalysisStore.getState();

export function xrLayers(): XrLayers {
  const s = store();
  return {
    energy: s.energyEnabled && s.layers.energy,
    vibration: s.vibEnabled && s.layers.vibration,
    labels: s.layers.labels,
    pile: s.layers.muckpile || s.layers.muckpileBlocks,
  };
}

/** Aplica las capas con las mismas acciones de los paneles (los cálculos se piden si faltan). */
export function applyXrLayers(next: XrLayers): void {
  const s = store();
  const cur = xrLayers();
  if (next.energy !== cur.energy) {
    if (next.energy && !s.energyEnabled) s.set({ energyEnabled: true });
    s.setLayer('energy', next.energy);
  }
  if (next.vibration !== cur.vibration) {
    if (next.vibration && !s.vibEnabled) s.set({ vibEnabled: true });
    s.setLayer('vibration', next.vibration);
  }
  if (next.labels !== cur.labels) s.setLayer('labels', next.labels);
  if (next.pile !== cur.pile) {
    s.setLayer('muckpile', next.pile);
    s.setLayer('muckpileBlocks', next.pile);
  }
  // También si la capa ya estaba prendida: quien se une puede no haber calculado la pila.
  if (next.pile && !s.muckpile && !s.muckpileComputing) requestMuckpile();
}

/** Sala multiusuario del visor (D-19): rol propio, nombre del presentador y conectados. */
export const useXrRoom = create<{
  role: RoomRole | null;
  presenter: string | null;
  peers: number;
}>(() => ({ role: null, presenter: null, peers: 0 }));
