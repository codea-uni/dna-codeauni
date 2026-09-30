import { Fragment, useEffect } from 'react';
import { tabAvailable, useWorkflow } from './hooks/useWorkflow';
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
import { TopographyImportDialog } from './dialogs/TopographyImportDialog';
import { ProjectSettingsDialog } from './dialogs/ProjectSettingsDialog';
import { ShortcutsDialog } from './dialogs/ShortcutsDialog';
import { VersionsDialog } from './dialogs/VersionsDialog';
import { startAutosave } from './persistence/autosave';
import { startTopographySync } from './topography/session';
import { openTopography, requireCrs, restoreLatestAutosave } from './actions';
import { getCompute } from './session';
import { useUiStore } from './stores/uiStore';
import { useT } from './i18n';
import { LEFT_TABS, PanelContent } from './panels/registry';
import { Viewport } from './viewport/Viewport';

/**
 * Editor. `restoreLocalDraft`: al abrir, recupera el último autoguardado del navegador (modo
 * local). En modo servidor el proyecto llega de la mina y no se reemplaza con un borrador.
 */
export function App({ restoreLocalDraft = true }: { restoreLocalDraft?: boolean }) {
  useShortcuts();
  const tr = useT();
  const tab = useUiStore((s) => s.leftTab);
  const demoOn = useUiStore((s) => s.demoStep !== null);
  const workflow = useWorkflow();
  // Si la pestaña actual queda sin datos (proyecto nuevo, se borró la malla), vuelve a Diseño.
  const current = LEFT_TABS.find((x) => x.id === tab);
  const currentAvailable = demoOn || tabAvailable(current?.requires ?? null, workflow);
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
  const topoImport = useUiStore((s) => s.topoImport);
  const setTopoImport = useUiStore((s) => s.setTopoImport);
  const setShortcutsOpen = useUiStore((s) => s.setShortcutsOpen);
  useEffect(() => {
    if (!currentAvailable) setTab('design');
  }, [currentAvailable, setTab]);
  useEffect(() => {
    // Precalienta el worker (carga de módulos) para que la primera operación real no pague el arranque.
    void getCompute().api.ping('warmup');
    const stopAnalysis = startAnalysisRunner();
    const stopAutosave = startAutosave();
    const stopTopography = startTopographySync();
    if (restoreLocalDraft) void restoreLatestAutosave();
    const stops = [startEnergyRunner(), startFragmentationRunner(), startVibrationRunner()];
    return () => {
      stopAnalysis();
      stopAutosave();
      stopTopography();
      for (const stop of stops) stop();
    };
  }, [restoreLocalDraft]);
  return (
    <div className="app">
      <Toolbar />
      <aside className="sidebar left">
        <ErrorBoundary>
          <nav className="tabs" role="tablist">
            {LEFT_TABS.map((t, i) => {
              const available = demoOn || tabAvailable(t.requires, workflow);
              const label = tr('title' in t ? t.title : t.label);
              return (
                <Fragment key={t.id}>
                  {i > 0 && LEFT_TABS[i - 1]?.group !== t.group && (
                    <span className="tabs-sep" aria-hidden />
                  )}
                  <button
                    role="tab"
                    aria-selected={tab === t.id}
                    aria-disabled={!available}
                    disabled={!available}
                    className={`${tab === t.id ? 'active' : ''}${t.group === 'analysis' ? ' analysis' : ''}`}
                    title={
                      available
                        ? label
                        : `${label} · ${tr(t.requires === 'charged' ? 'tabs.needCharge' : 'tabs.needHoles')}`
                    }
                    onClick={() => {
                      setTab(t.id);
                    }}
                  >
                    <t.icon size={16} strokeWidth={1.8} aria-hidden />
                    <span>{tr(t.label)}</span>
                  </button>
                </Fragment>
              );
            })}
          </nav>
          <PanelContent id={tab} />
        </ErrorBoundary>
      </aside>
      <main
        className="viewport-host"
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('Files')) e.preventDefault();
        }}
        onDrop={(e) => {
          // Archivos de topografía soltados sobre el visor abren el asistente.
          const files = [...e.dataTransfer.files];
          if (files.length === 0) return;
          e.preventDefault();
          if (requireCrs()) void openTopography(files);
        }}
      >
        <Viewport />
      </main>
      <RightSidebar />
      <StatusBar />
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
      {topoImport && (
        <TopographyImportDialog
          request={topoImport}
          onClose={() => {
            setTopoImport(null);
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
