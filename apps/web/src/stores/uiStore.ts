import {
  DEFAULT_HOLE_TEMPLATE,
  type ScenarioKpis,
  type BoundaryId,
  type HoleId,
  type HoleTemplate,
  type SurfaceConnectorId,
  type Vec2,
} from '@cronos/core';
import {
  DEFAULT_DECORATIONS,
  type DecorationSettings,
  type FrameStats,
  type SnapSettings,
  type ToolName,
  type ViewMode,
} from '@cronos/engine';
import { create } from 'zustand';
import type { CsvPreview } from '../dialogs/CsvImportDialog';
import type { DxfPreview } from '../dialogs/DxfImportDialog';
import type { TopoImportRequest } from '../dialogs/TopographyImportDialog';

/**
 * Estado de UI. Nunca contiene el diseño (ver CLAUDE.md: React no renderiza el diseño).
 * Los cambios de herramienta, snapping y plantilla se reenvían al engine desde el Viewport.
 */
/** Panel abierto en una ventana flotante (posición y tamaño en px de la pantalla). */
export interface FloatingPanel {
  /** Módulo (p. ej. «lib.explosives»). */
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

const FLOATING_KEY = 'cronos.floating.v2';
const LAYOUT_KEY = 'cronos.editor-layout.v2';

interface EditorLayout {
  rightCollapsed: boolean;
  rightWidth: number;
}

const DEFAULT_LAYOUT: EditorLayout = {
  rightCollapsed: false,
  rightWidth: 290,
};

function loadLayout(): EditorLayout {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (!raw) return DEFAULT_LAYOUT;
    const value = JSON.parse(raw) as Partial<EditorLayout>;
    return {
      rightCollapsed: value.rightCollapsed === true,
      rightWidth:
        typeof value.rightWidth === 'number'
          ? Math.max(240, Math.min(520, value.rightWidth))
          : DEFAULT_LAYOUT.rightWidth,
    };
  } catch {
    return DEFAULT_LAYOUT;
  }
}

function saveLayout(layout: EditorLayout): EditorLayout {
  try {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
  } catch {
    // El diseño del editor sigue siendo utilizable si el navegador no permite persistencia.
  }
  return layout;
}

/** Ventanas recordadas entre sesiones (preferencia local; si el almacenamiento falla, ninguna). */
function loadFloating(): FloatingPanel[] {
  try {
    const raw = localStorage.getItem(FLOATING_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as FloatingPanel[]) : [];
  } catch {
    return [];
  }
}

function saveFloating(list: FloatingPanel[]): FloatingPanel[] {
  try {
    localStorage.setItem(FLOATING_KEY, JSON.stringify(list));
  } catch {
    // ponytail: sin almacenamiento las ventanas no se recuerdan, nada más.
  }
  return list;
}

interface UiState {
  ribbonTab: 'home' | 'view' | 'tools' | 'charge' | 'timing' | 'analysis' | 'library';
  setRibbonTab: (tab: UiState['ribbonTab']) => void;
  rightCollapsed: boolean;
  rightWidth: number;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setSidebarWidth: (width: number) => void;
  tool: ToolName;
  snap: SnapSettings;
  holeTemplate: HoleTemplate;
  /** Conector de la herramienta Amarre. */
  tieConnectorId: SurfaceConnectorId | undefined;
  leftTab:
    | 'design'
    | 'charge'
    | 'timing'
    | 'energy'
    | 'fragmentation'
    | 'vibration'
    | 'muckpile'
    | 'scenarios'
    | 'library';
  /** Perímetro activo (resaltado; destino por defecto al generar mallas). */
  activeBoundaryId: BoundaryId | null;
  /** Vista previa del CSV a importar (abre el diálogo). */
  csvPreview: CsvPreview | null;
  shortcutsOpen: boolean;
  settingsOpen: boolean;
  /** Comparación de escenarios mostrada en la pestaña Escenarios (también la usa la demo). */
  scenarioKpis: ScenarioKpis[] | null;
  setScenarioKpis: (kpis: ScenarioKpis[] | null) => void;
  /** Paso actual del modo demostración (null = apagado). */
  demoStep: number | null;
  demoTour: 'tour' | 'trailer';
  demoPaused: boolean;
  demoReady: boolean;
  setDemo: (patch: {
    demoStep?: number | null;
    demoPaused?: boolean;
    demoReady?: boolean;
    demoTour?: 'tour' | 'trailer';
  }) => void;
  versionsOpen: boolean;
  setVersionsOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  viewMode: ViewMode;
  /** Pestaña del panel derecho. */
  rightTab: 'selection' | 'view' | 'results';
  setRightTab: (tab: UiState['rightTab']) => void;
  decorations: DecorationSettings;
  setDecorations: (patch: Partial<DecorationSettings>) => void;
  setViewMode: (mode: ViewMode) => void;
  /** Exageración del radio de los taladros en 3D. */
  radiusScale: number;
  setRadiusScale: (scale: number) => void;
  dxfPreview: DxfPreview | null;
  setDxfPreview: (preview: DxfPreview | null) => void;
  /** Asistente de importación de topografía abierto con estos archivos. */
  topoImport: TopoImportRequest | null;
  setTopoImport: (request: TopoImportRequest | null) => void;
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
  /** Módulos abiertos como ventanas flotantes; el último está encima. */
  floating: FloatingPanel[];
  floatPanel: (id: FloatingPanel['id'], width?: number) => void;
  dockPanel: (id: FloatingPanel['id']) => void;
  updateFloating: (id: FloatingPanel['id'], patch: Partial<Omit<FloatingPanel, 'id'>>) => void;
  raiseFloating: (id: FloatingPanel['id']) => void;
}

export const useUiStore = create<UiState>()((set) => ({
  ribbonTab: 'home',
  setRibbonTab: (ribbonTab) => {
    set({ ribbonTab });
  },
  ...loadLayout(),
  setSidebarCollapsed: (rightCollapsed) => {
    set((s) => saveLayout({ rightCollapsed, rightWidth: s.rightWidth }));
  },
  setSidebarWidth: (width) => {
    set((s) =>
      saveLayout({
        rightCollapsed: s.rightCollapsed,
        rightWidth: Math.max(240, Math.min(520, width)),
      }),
    );
  },
  tool: 'select',
  snap: {
    grid: false,
    gridSize: 1,
    holes: true,
    pattern: true,
    topography: true,
    tolerancePx: 10,
  },
  holeTemplate: DEFAULT_HOLE_TEMPLATE,
  tieConnectorId: undefined,
  leftTab: 'design',
  floating: loadFloating(),
  floatPanel: (id, width = 720) => {
    set((s) => {
      if (s.floating.some((f) => f.id === id)) return {};
      const n = s.floating.length;
      const workspace = id.startsWith('workspace.');
      const ribbonBottom =
        document.querySelector('.toolbar')?.getBoundingClientRect().bottom ?? 150;
      const y = workspace
        ? Math.min(ribbonBottom + 12 + n * 16, Math.max(0, window.innerHeight - 220))
        : 70 + n * 28;
      const w = Math.min(width, window.innerWidth - 40);
      const h = Math.min(Math.round(window.innerHeight * 0.72), window.innerHeight - y - 40);
      const availableWidth = workspace
        ? (document.querySelector('.viewport-host')?.getBoundingClientRect().width ??
          window.innerWidth)
        : window.innerWidth;
      const x = Math.max(20, Math.round((availableWidth - w) / 2) + n * 28);
      return { floating: saveFloating([...s.floating, { id, x, y, w, h }]) };
    });
  },
  dockPanel: (id) => {
    set((s) => ({ floating: saveFloating(s.floating.filter((f) => f.id !== id)) }));
  },
  updateFloating: (id, patch) => {
    set((s) => ({
      floating: saveFloating(s.floating.map((f) => (f.id === id ? { ...f, ...patch } : f))),
    }));
  },
  raiseFloating: (id) => {
    set((s) => {
      const f = s.floating.find((x) => x.id === id);
      if (!f || s.floating.at(-1)?.id === id) return {};
      return { floating: saveFloating([...s.floating.filter((x) => x.id !== id), f]) };
    });
  },
  activeBoundaryId: null,
  csvPreview: null,
  shortcutsOpen: false,
  settingsOpen: false,
  scenarioKpis: null,
  setScenarioKpis: (scenarioKpis) => {
    set({ scenarioKpis });
  },
  demoStep: null,
  demoTour: 'tour',
  demoPaused: false,
  demoReady: false,
  setDemo: (patch) => {
    set(patch);
  },
  versionsOpen: false,
  setVersionsOpen: (versionsOpen) => {
    set({ versionsOpen });
  },
  setSettingsOpen: (settingsOpen) => {
    set({ settingsOpen });
  },
  viewMode: 'plan',
  rightTab: 'view',
  setRightTab: (rightTab) => {
    set({ rightTab });
  },
  decorations: DEFAULT_DECORATIONS,
  setDecorations: (patch) => {
    set((s) => ({ decorations: { ...s.decorations, ...patch } }));
  },
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
  topoImport: null,
  setTopoImport: (topoImport) => {
    set({ topoImport });
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
    useUiStore.getState().floatPanel(`workspace.${leftTab}`, 640);
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
