import { Activity, Flame, Layers, LayoutGrid, Library, Shapes, Timer } from 'lucide-react';
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
import { PatternPanel } from './panels/PatternPanel';
import { PropertiesPanel } from './panels/PropertiesPanel';
import { ResultsPanel } from './panels/ResultsPanel';
import { TimingPanel } from './panels/TimingPanel';
import { ViewPanel } from './panels/ViewPanel';
import { CsvImportDialog } from './dialogs/CsvImportDialog';
import { ShortcutsDialog } from './dialogs/ShortcutsDialog';
import { FragmentationPanel } from './panels/FragmentationPanel';
import { VibrationPanel } from './panels/VibrationPanel';
import { getCompute } from './session';
import { useUiStore } from './stores/uiStore';
import { Viewport } from './viewport/Viewport';

const TABS = [
  { id: 'design', label: 'Diseño', icon: LayoutGrid },
  { id: 'charge', label: 'Carguío', icon: Layers },
  { id: 'timing', label: 'Tiempos', icon: Timer },
  { id: 'energy', label: 'Energía', icon: Flame },
  { id: 'fragmentation', label: 'Fragm.', icon: Shapes, title: 'Fragmentación' },
  { id: 'vibration', label: 'Vibración', icon: Activity },
  { id: 'library', label: 'Librería', icon: Library, title: 'Librería de productos' },
] as const;

export function App() {
  useShortcuts();
  const tab = useUiStore((s) => s.leftTab);
  const setTab = useUiStore((s) => s.setLeftTab);
  const csvPreview = useUiStore((s) => s.csvPreview);
  const setCsvPreview = useUiStore((s) => s.setCsvPreview);
  const shortcutsOpen = useUiStore((s) => s.shortcutsOpen);
  const setShortcutsOpen = useUiStore((s) => s.setShortcutsOpen);
  useEffect(() => {
    // Precalienta el worker (carga de módulos) para que la primera operación real no pague el arranque.
    void getCompute().api.ping('warmup');
    const stopAnalysis = startAnalysisRunner();
    const stops = [startEnergyRunner(), startFragmentationRunner(), startVibrationRunner()];
    return () => {
      stopAnalysis();
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
                title={'title' in t ? t.title : t.label}
                onClick={() => {
                  setTab(t.id);
                }}
              >
                <t.icon size={16} strokeWidth={1.8} aria-hidden />
                <span>{t.label}</span>
              </button>
            ))}
          </nav>
          {tab === 'design' && (
            <>
              <BlastPanel />
              <PatternPanel />
            </>
          )}
          {tab === 'charge' && <ChargePanel />}
          {tab === 'timing' && <TimingPanel />}
          {tab === 'energy' && <EnergyPanel />}
          {tab === 'fragmentation' && <FragmentationPanel />}
          {tab === 'vibration' && <VibrationPanel />}
          {tab === 'library' && <LibraryPanel />}
        </ErrorBoundary>
      </aside>
      <main className="viewport-host">
        <Viewport />
      </main>
      <aside className="sidebar right">
        <ErrorBoundary>
          <PropertiesPanel />
          <ViewPanel />
          <ResultsPanel />
        </ErrorBoundary>
      </aside>
      <StatusBar />
      {shortcutsOpen && (
        <ShortcutsDialog
          onClose={() => {
            setShortcutsOpen(false);
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
