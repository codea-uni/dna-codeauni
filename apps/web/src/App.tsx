import { useEffect } from 'react';
import {
  startAnalysisRunner,
  startEnergyRunner,
  startFragmentationRunner,
  startVibrationRunner,
} from './analysis/runner';
import { ErrorBoundary } from './components/ErrorBoundary';
import { StatusBar } from './components/StatusBar';
import { DemoOverlay } from './demo/DemoOverlay';
import { Toolbar } from './components/Toolbar';
import { useShortcuts } from './hooks/useShortcuts';
import { RightSidebar } from './panels/RightSidebar';
import { CsvImportDialog } from './dialogs/CsvImportDialog';
import { DxfImportDialog } from './dialogs/DxfImportDialog';
import { ProjectSettingsDialog } from './dialogs/ProjectSettingsDialog';
import { ShortcutsDialog } from './dialogs/ShortcutsDialog';
import { VersionsDialog } from './dialogs/VersionsDialog';
import { startAutosave } from './persistence/autosave';
import { restoreLatestAutosave } from './actions';
import { getCompute } from './session';
import { useUiStore } from './stores/uiStore';
import { useT } from './i18n';
import { FloatingWindows, PopOutButton, SidebarBody } from './components/FloatingWindows';
import { LEFT_TABS } from './panels/registry';
import { Viewport } from './viewport/Viewport';

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
            {LEFT_TABS.map((t) => (
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
            <PopOutButton id={tab} />
          </nav>
          <SidebarBody id={tab} />
        </ErrorBoundary>
      </aside>
      <main className="viewport-host">
        <Viewport />
      </main>
      <RightSidebar />
      <StatusBar />
      <FloatingWindows />
      <DemoOverlay />
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
