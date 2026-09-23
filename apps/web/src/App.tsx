import { useEffect } from 'react';
import { startAnalysisRunner, startEnergyRunner } from './analysis/runner';
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
import { getCompute } from './session';
import { useUiStore } from './stores/uiStore';
import { Viewport } from './viewport/Viewport';

const TABS = [
  { id: 'design', label: 'Diseño' },
  { id: 'charge', label: 'Carguío' },
  { id: 'timing', label: 'Tiempos' },
  { id: 'energy', label: 'Energía' },
  { id: 'library', label: 'Productos' },
] as const;

export function App() {
  useShortcuts();
  const tab = useUiStore((s) => s.leftTab);
  const setTab = useUiStore((s) => s.setLeftTab);
  const csvPreview = useUiStore((s) => s.csvPreview);
  const setCsvPreview = useUiStore((s) => s.setCsvPreview);
  useEffect(() => {
    // Precalienta el worker (carga de módulos) para que la primera operación real no pague el arranque.
    void getCompute().api.ping('warmup');
    const stopAnalysis = startAnalysisRunner();
    const stopEnergy = startEnergyRunner();
    return () => {
      stopAnalysis();
      stopEnergy();
    };
  }, []);
  return (
    <div className="app">
      <Toolbar />
      <aside className="sidebar left">
        <nav className="tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              className={tab === t.id ? 'active' : ''}
              onClick={() => {
                setTab(t.id);
              }}
            >
              {t.label}
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
        {tab === 'library' && <LibraryPanel />}
      </aside>
      <main className="viewport-host">
        <Viewport />
      </main>
      <aside className="sidebar right">
        <PropertiesPanel />
        <ViewPanel />
        <ResultsPanel />
      </aside>
      <StatusBar />
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
