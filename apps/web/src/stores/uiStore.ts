import {
  DEFAULT_HOLE_TEMPLATE,
  type BoundaryId,
  type HoleId,
  type HoleTemplate,
  type SurfaceConnectorId,
  type Vec2,
} from '@blastlab/core';
import type { FrameStats, SnapSettings, ToolName, ViewMode } from '@blastlab/engine';
import { create } from 'zustand';
import type { CsvPreview } from '../dialogs/CsvImportDialog';
import type { DxfPreview } from '../dialogs/DxfImportDialog';

/**
 * Estado de UI. Nunca contiene el diseño (ver CLAUDE.md: React no renderiza el diseño).
 * Los cambios de herramienta, snapping y plantilla se reenvían al engine desde el Viewport.
 */
interface UiState {
  tool: ToolName;
  snap: SnapSettings;
  holeTemplate: HoleTemplate;
  /** Conector de la herramienta Amarre. */
  tieConnectorId: SurfaceConnectorId | undefined;
  leftTab: 'design' | 'charge' | 'timing' | 'energy' | 'fragmentation' | 'vibration' | 'library';
  /** Perímetro activo (resaltado; destino por defecto al generar mallas). */
  activeBoundaryId: BoundaryId | null;
  /** Vista previa del CSV a importar (abre el diálogo). */
  csvPreview: CsvPreview | null;
  shortcutsOpen: boolean;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  /** Exageración del radio de los taladros en 3D. */
  radiusScale: number;
  setRadiusScale: (scale: number) => void;
  dxfPreview: DxfPreview | null;
  setDxfPreview: (preview: DxfPreview | null) => void;
  setShortcutsOpen: (open: boolean) => void;
  setCsvPreview: (preview: CsvPreview | null) => void;
  setActiveBoundary: (id: BoundaryId | null) => void;
  frameStats: FrameStats | null;
  pointer: Vec2 | null;
  hover: HoleId | null;
  message: { text: string; kind: 'info' | 'error' } | null;
  busy: string | null;
  setTool: (tool: ToolName) => void;
  setSnap: (snap: Partial<SnapSettings>) => void;
  setHoleTemplate: (template: Partial<HoleTemplate>) => void;
  setTieConnector: (id: SurfaceConnectorId | undefined) => void;
  setLeftTab: (tab: UiState['leftTab']) => void;
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
  tieConnectorId: undefined,
  leftTab: 'design',
  activeBoundaryId: null,
  csvPreview: null,
  shortcutsOpen: false,
  viewMode: 'plan',
  setViewMode: (viewMode) => {
    set({ viewMode });
  },
  radiusScale: 2,
  setRadiusScale: (radiusScale) => {
    set({ radiusScale });
  },
  dxfPreview: null,
  setDxfPreview: (dxfPreview) => {
    set({ dxfPreview });
  },
  setShortcutsOpen: (shortcutsOpen) => {
    set({ shortcutsOpen });
  },
  setCsvPreview: (csvPreview) => {
    set({ csvPreview });
  },
  setActiveBoundary: (activeBoundaryId) => {
    set({ activeBoundaryId });
  },
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
  setTieConnector: (tieConnectorId) => {
    set({ tieConnectorId });
  },
  setLeftTab: (leftTab) => {
    set({ leftTab });
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
