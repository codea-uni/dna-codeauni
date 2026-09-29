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
import type { FloatingPanel } from '../stores/uiStore';
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
import { VibrationPanel } from './VibrationPanel';
import { ViewPanel } from './ViewPanel';

export type PanelId = FloatingPanel['id'];

interface TabDef {
  id: PanelId;
  label: MessageKey;
  icon: typeof Layers;
  title?: MessageKey;
}

/** Pestañas del panel izquierdo (flujo de diseño). */
export const LEFT_TABS = [
  { id: 'design', label: 'app.tab.design', icon: LayoutGrid },
  { id: 'charge', label: 'app.tab.charge', icon: Layers },
  { id: 'timing', label: 'app.tab.timing', icon: Timer },
  { id: 'energy', label: 'app.tab.energy', icon: Flame },
  {
    id: 'fragmentation',
    label: 'app.tab.fragmentation',
    icon: Shapes,
    title: 'app.tab.fragmentation.title',
  },
  { id: 'vibration', label: 'app.tab.vibration', icon: Activity },
  {
    id: 'scenarios',
    label: 'app.tab.scenarios',
    icon: GitCompare,
    title: 'app.tab.scenarios.title',
  },
  { id: 'library', label: 'app.tab.library', icon: Library, title: 'app.tab.library.title' },
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

export const PANEL_TABS: readonly TabDef[] = [...LEFT_TABS, ...RIGHT_TABS];

/** Contenido de un panel: el mismo en la barra lateral y en una ventana flotante. */
export function PanelContent({ id }: { id: PanelId }) {
  switch (id) {
    case 'design':
      return (
        <>
          <BlastPanel />
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
