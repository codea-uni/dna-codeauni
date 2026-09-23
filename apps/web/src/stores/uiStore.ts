import { create } from 'zustand';

/** Estado de UI. Nunca contiene el diseño (ver CLAUDE.md: React no renderiza el diseño). */
interface UiState {
  fps: number;
  workerStatus: string;
  setFps: (fps: number) => void;
  setWorkerStatus: (status: string) => void;
}

export const useUiStore = create<UiState>()((set) => ({
  fps: 0,
  workerStatus: 'iniciando…',
  setFps: (fps) => {
    set({ fps });
  },
  setWorkerStatus: (workerStatus) => {
    set({ workerStatus });
  },
}));
