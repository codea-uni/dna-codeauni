import { lazy, Suspense, useEffect, type ComponentType } from 'react';
import { BookOpen, Layers, LayoutGrid, Mountain, Shapes } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { tabAvailable, useWorkflow, type TabRequirement } from '../hooks/useWorkflow';
import { useT, type MessageKey } from '../i18n';
import { LEFT_TABS, PanelContent } from '../panels/registry';
import { BlastPanel } from '../panels/BlastPanel';
import { TopographyPanel } from '../panels/TopographyPanel';
import { PatternPanel } from '../panels/PatternPanel';
import { GroupsPanel } from '../panels/GroupsPanel';
import { FirstSteps } from '../panels/FirstSteps';
import { useUiStore } from '../stores/uiStore';
import { ErrorBoundary } from './ErrorBoundary';
import { FloatingWindow } from './Floatable';

const DocumentationPanel = lazy(() => import('../documentation/DocumentationPanel'));

type Section = 'home' | 'tools' | 'charge' | 'timing' | 'analysis' | 'library' | 'reference';
interface WorkspacePanel {
  id: string;
  section: Section;
  label: MessageKey;
  icon: LucideIcon;
  requires: TabRequirement;
  Content: ComponentType;
}

/** Every former left panel remains accessible from the ribbon, without reserving canvas space. */
export const WORKSPACE_PANELS: WorkspacePanel[] = [
  {
    id: 'documentation',
    section: 'reference',
    label: 'toolbar.documentation',
    icon: BookOpen,
    requires: null,
    Content: DocumentationPanel,
  },
  {
    id: 'blast',
    section: 'tools',
    label: 'blast.title',
    icon: Layers,
    requires: null,
    Content: BlastPanel,
  },
  {
    id: 'topography',
    section: 'tools',
    label: 'topo.section',
    icon: Mountain,
    requires: null,
    Content: TopographyPanel,
  },
  {
    id: 'pattern',
    section: 'tools',
    label: 'pattern.generate',
    icon: LayoutGrid,
    requires: null,
    Content: PatternPanel,
  },
  {
    id: 'groups',
    section: 'tools',
    label: 'groups.title',
    icon: Shapes,
    requires: 'holes',
    Content: GroupsPanel,
  },
  ...LEFT_TABS.map((tab): WorkspacePanel => ({
    id: tab.id,
    section:
      tab.id === 'design'
        ? 'home'
        : tab.id === 'charge' || tab.id === 'timing' || tab.id === 'library'
          ? tab.id
          : 'analysis',
    label: tab.id === 'design' ? 'steps.title' : 'title' in tab ? tab.title : tab.label,
    icon: tab.icon,
    requires: tab.requires,
    Content: tab.id === 'design' ? FirstSteps : () => <PanelContent id={tab.id} />,
  })),
];

export function openWorkspacePanel(id: string) {
  const ui = useUiStore.getState();
  const windowId = `workspace.${id}`;
  if (ui.floating.some((win) => win.id === windowId)) ui.raiseFloating(windowId);
  else
    ui.floatPanel(
      windowId,
      id === 'documentation' ? 1100 : id === 'library' || id === 'scenarios' ? 900 : 640,
    );
}

export function WorkspaceWindows() {
  const t = useT();
  const floating = useUiStore((s) => s.floating);
  const demoOn = useUiStore((s) => s.demoStep !== null && s.demoTour !== 'trailer');
  const tab = useUiStore((s) => s.leftTab);
  const workflow = useWorkflow();
  useEffect(() => {
    if (!demoOn) return;
    const ui = useUiStore.getState();
    for (const win of ui.floating) {
      if (win.id.startsWith('workspace.') && win.id !== `workspace.${tab}`) ui.dockPanel(win.id);
    }
    openWorkspacePanel(tab);
  }, [demoOn, tab]);
  return floating.map((win) => {
    const panel = WORKSPACE_PANELS.find((item) => win.id === `workspace.${item.id}`);
    if (!panel) return null;
    const Content = panel.Content;
    return (
      <FloatingWindow
        key={win.id}
        win={win}
        className={`workspace-window${panel.id === 'documentation' ? ' documentation-window' : ''}`}
        title={t(panel.label)}
        closeLabel={t('workspace.closeWindow')}
      >
        <ErrorBoundary>
          {demoOn || tabAvailable(panel.requires, workflow) ? (
            <Suspense
              fallback={
                <p className="hint" role="status">
                  {t('workspace.loading')}
                </p>
              }
            >
              <Content />
            </Suspense>
          ) : (
            <p className="hint">
              {t(panel.requires === 'charged' ? 'tabs.needCharge' : 'tabs.needHoles')}
            </p>
          )}
        </ErrorBoundary>
      </FloatingWindow>
    );
  });
}
