import {
  Activity,
  Flame,
  Layers,
  LayoutGrid,
  Library,
  Shapes,
  Timer,
  GitCompare,
} from 'lucide-react';
import { useEffect } from 'react';
import {
  startAnalysisRunner,
  startEnergyRunner,
  startFragmentationRunner,
  startVibrationRunner,
} from './analysis/runner';
import { ErrorBoundary } from './components/ErrorBoundary';
import { StatusBar } from './components/StatusBar';
import { Toolbar } from './components/Toolbar';
import { useShortcuts } from './hooks/useShortcuts';
import { BlastPanel } from './panels/BlastPanel';
import { ChargePanel } from './panels/ChargePanel';
import { EnergyPanel } from './panels/EnergyPanel';
import { LibraryPanel } from './panels/LibraryPanel';
import { GroupsPanel } from './panels/GroupsPanel';
import { PatternPanel } from './panels/PatternPanel';
import { RightSidebar } from './panels/RightSidebar';
import { TimingPanel } from './panels/TimingPanel';
import { CsvImportDialog } from './dialogs/CsvImportDialog';
import { DxfImportDialog } from './dialogs/DxfImportDialog';
import { ProjectSettingsDialog } from './dialogs/ProjectSettingsDialog';
import { ShortcutsDialog } from './dialogs/ShortcutsDialog';
import { VersionsDialog } from './dialogs/VersionsDialog';
import { startAutosave } from './persistence/autosave';
import { restoreLatestAutosave } from './actions';
import { FragmentationPanel } from './panels/FragmentationPanel';
import { VibrationPanel } from './panels/VibrationPanel';
import { ScenariosPanel } from './panels/ScenariosPanel';
import { getCompute } from './session';
import { useUiStore } from './stores/uiStore';
import { useT, type MessageKey } from './i18n';
import { Viewport } from './viewport/Viewport';

const TABS = [
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
] as const satisfies readonly {
  id: string;
  label: MessageKey;
  icon: unknown;
  title?: MessageKey;
}[];

export function App() {
  useShortcuts();
  const tr = useT();
  const tab = useUiStore((s) => s.leftTab);
  const setTab = useUiStore((s) => s.setLeftTab);
  const csvPreview = useUiStore((s) => s.csvPreview);
  const setCsvPreview = useUiStore((s) => s.setCsvPreview);
  const shortcutsOpen = useUiStore((s) => s.shortcutsOpen);
  const settingsOpen = useUiStore((s) => s.settingsOpen);
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen);
  const versionsOpen = useUiStore((s) => s.versionsOpen);
  const setVersionsOpen = useUiStore((s) => s.setVersionsOpen);
  const dxfPreview = useUiStore((s) => s.dxfPreview);
  const setDxfPreview = useUiStore((s) => s.setDxfPreview);
  const setShortcutsOpen = useUiStore((s) => s.setShortcutsOpen);
  useEffect(() => {
    // Precalienta el worker (carga de módulos) para que la primera operación real no pague el arranque.
    void getCompute().api.ping('warmup');
    const stopAnalysis = startAnalysisRunner();
    const stopAutosave = startAutosave();
    void restoreLatestAutosave();
    const stops = [startEnergyRunner(), startFragmentationRunner(), startVibrationRunner()];
    return () => {
      stopAnalysis();
      stopAutosave();
      for (const stop of stops) stop();
    };
  }, []);
  return (
    <div className="app">
      <Toolbar />
      <aside className="sidebar left">
        <ErrorBoundary>
          <nav className="tabs" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                className={tab === t.id ? 'active' : ''}
                title={tr('title' in t ? t.title : t.label)}
                onClick={() => {
                  setTab(t.id);
                }}
              >
                <t.icon size={16} strokeWidth={1.8} aria-hidden />
                <span>{tr(t.label)}</span>
              </button>
            ))}
          </nav>
          {tab === 'design' && (
            <>
              <BlastPanel />
              <PatternPanel />
              <GroupsPanel />
            </>
          )}
          {tab === 'charge' && <ChargePanel />}
          {tab === 'timing' && <TimingPanel />}
          {tab === 'energy' && <EnergyPanel />}
          {tab === 'fragmentation' && <FragmentationPanel />}
          {tab === 'vibration' && <VibrationPanel />}
          {tab === 'scenarios' && <ScenariosPanel />}
          {tab === 'library' && <LibraryPanel />}
        </ErrorBoundary>
      </aside>
      <main className="viewport-host">
        <Viewport />
      </main>
      <RightSidebar />
      <StatusBar />
      {shortcutsOpen && (
        <ShortcutsDialog
          onClose={() => {
            setShortcutsOpen(false);
          }}
        />
      )}
      {settingsOpen && (
        <ProjectSettingsDialog
          onClose={() => {
            setSettingsOpen(false);
          }}
        />
      )}
      {versionsOpen && (
        <VersionsDialog
          onClose={() => {
            setVersionsOpen(false);
          }}
        />
      )}
      {dxfPreview && (
        <DxfImportDialog
          preview={dxfPreview}
          onClose={() => {
            setDxfPreview(null);
          }}
        />
      )}
      {csvPreview && (
        <CsvImportDialog
          preview={csvPreview}
          onClose={() => {
            setCsvPreview(null);
          }}
        />
      )}
    </div>
  );
}
