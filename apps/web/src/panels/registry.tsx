import {
  Activity,
  ChartColumn,
  Flame,
  GitCompare,
  Layers,
  LayoutGrid,
  Library,
  MousePointerClick,
  Shapes,
  SlidersHorizontal,
  Timer,
} from 'lucide-react';
import type { MessageKey } from '../i18n';
import type { TabRequirement } from '../hooks/useWorkflow';
import { FirstSteps } from './FirstSteps';
import { BlastPanel } from './BlastPanel';
import { ChargePanel } from './ChargePanel';
import { EnergyPanel } from './EnergyPanel';
import { FragmentationPanel } from './FragmentationPanel';
import { GroupsPanel } from './GroupsPanel';
import { LibraryPanel } from './LibraryPanel';
import { MapPanel } from './MapPanel';
import { PatternPanel } from './PatternPanel';
import { PropertiesPanel } from './PropertiesPanel';
import { ResultsPanel } from './ResultsPanel';
import { ScenariosPanel } from './ScenariosPanel';
import { TimingPanel } from './TimingPanel';
import { TopographyPanel } from './TopographyPanel';
import { VibrationPanel } from './VibrationPanel';
import { ViewPanel } from './ViewPanel';

interface TabDef {
  id: string;
  label: MessageKey;
  icon: typeof Layers;
  title?: MessageKey;
  /** Dato previo que necesita (observación 2 del ingeniero); sin él la pestaña se deshabilita. */
  requires?: TabRequirement;
  /** Grupo visual: flujo de diseño, análisis (Fase 2) o catálogo. */
  group?: 'flow' | 'analysis' | 'catalog';
}

/** Pestañas del panel izquierdo (flujo de diseño). */
export const LEFT_TABS = [
  { id: 'design', label: 'app.tab.design', icon: LayoutGrid, group: 'flow', requires: null },
  { id: 'charge', label: 'app.tab.charge', icon: Layers, group: 'flow', requires: 'holes' },
  { id: 'timing', label: 'app.tab.timing', icon: Timer, group: 'flow', requires: 'holes' },
  { id: 'energy', label: 'app.tab.energy', icon: Flame, group: 'analysis', requires: 'charged' },
  {
    id: 'fragmentation',
    label: 'app.tab.fragmentation',
    icon: Shapes,
    title: 'app.tab.fragmentation.title',
    group: 'analysis',
    requires: 'charged',
  },
  {
    id: 'vibration',
    label: 'app.tab.vibration',
    icon: Activity,
    group: 'analysis',
    requires: 'charged',
  },
  {
    id: 'scenarios',
    label: 'app.tab.scenarios',
    icon: GitCompare,
    title: 'app.tab.scenarios.title',
    group: 'analysis',
    requires: 'holes',
  },
  {
    id: 'library',
    label: 'app.tab.library',
    icon: Library,
    title: 'app.tab.library.title',
    group: 'catalog',
    requires: null,
  },
] as const satisfies readonly TabDef[];

/** Pestañas del panel derecho: la selección, la vista y los resultados. */
export const RIGHT_TABS = [
  {
    id: 'selection',
    label: 'sidebar.selection',
    icon: MousePointerClick,
    title: 'sidebar.selectionTitle',
  },
  { id: 'view', label: 'sidebar.view', icon: SlidersHorizontal, title: 'sidebar.viewTitle' },
  { id: 'results', label: 'sidebar.results', icon: ChartColumn, title: 'sidebar.resultsTitle' },
] as const satisfies readonly TabDef[];

export type PanelId = (typeof LEFT_TABS)[number]['id'] | (typeof RIGHT_TABS)[number]['id'];

/** Contenido de un panel: el mismo en la barra lateral y en una ventana flotante. */
export function PanelContent({ id }: { id: PanelId }) {
  switch (id) {
    case 'design':
      return (
        <>
          <FirstSteps />
          <BlastPanel />
          <TopographyPanel />
          <PatternPanel />
          <GroupsPanel />
        </>
      );
    case 'charge':
      return <ChargePanel />;
    case 'timing':
      return <TimingPanel />;
    case 'energy':
      return <EnergyPanel />;
    case 'fragmentation':
      return <FragmentationPanel />;
    case 'vibration':
      return <VibrationPanel />;
    case 'scenarios':
      return <ScenariosPanel />;
    case 'library':
      return <LibraryPanel />;
    case 'selection':
      return <PropertiesPanel />;
    case 'view':
      return (
        <>
          <ViewPanel />
          <MapPanel />
        </>
      );
    case 'results':
      return <ResultsPanel />;
  }
}
