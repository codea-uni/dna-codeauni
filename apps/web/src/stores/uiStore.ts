import { DEFAULT_HOLE_TEMPLATE, type HoleId, type HoleTemplate, type Vec2 } from '@blastlab/core';
import type { FrameStats, SnapSettings, ToolName } from '@blastlab/engine';
import { create } from 'zustand';

/**
 * Estado de UI. Nunca contiene el diseño (ver CLAUDE.md: React no renderiza el diseño).
 * Los cambios de herramienta, snapping y plantilla se reenvían al engine desde el Viewport.
 */
interface UiState {
  tool: ToolName;
  snap: SnapSettings;
  holeTemplate: HoleTemplate;
  frameStats: FrameStats | null;
  pointer: Vec2 | null;
  hover: HoleId | null;
  message: { text: string; kind: 'info' | 'error' } | null;
  busy: string | null;
  setTool: (tool: ToolName) => void;
  setSnap: (snap: Partial<SnapSettings>) => void;
  setHoleTemplate: (template: Partial<HoleTemplate>) => void;
  setFrameStats: (stats: FrameStats) => void;
  setPointer: (pointer: Vec2 | null) => void;
  setHover: (hover: HoleId | null) => void;
  notify: (text: string, kind?: 'info' | 'error') => void;
  setBusy: (busy: string | null) => void;
}

export const useUiStore = create<UiState>()((set) => ({
  tool: 'select',
  snap: { grid: false, gridSize: 1, holes: true, pattern: true, tolerancePx: 10 },
  holeTemplate: DEFAULT_HOLE_TEMPLATE,
  frameStats: null,
  pointer: null,
  hover: null,
  message: null,
  busy: null,
  setTool: (tool) => {
    set({ tool });
  },
  setSnap: (snap) => {
    set((s) => ({ snap: { ...s.snap, ...snap } }));
  },
  setHoleTemplate: (template) => {
    set((s) => ({ holeTemplate: { ...s.holeTemplate, ...template } }));
  },
  setFrameStats: (frameStats) => {
    set({ frameStats });
  },
  setPointer: (pointer) => {
    set({ pointer });
  },
  setHover: (hover) => {
    set({ hover });
  },
  notify: (text, kind = 'info') => {
    set({ message: { text, kind } });
  },
  setBusy: (busy) => {
    set({ busy });
  },
}));
