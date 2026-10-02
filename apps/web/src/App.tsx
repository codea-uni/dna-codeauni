import { useEffect, type CSSProperties } from 'react';
import { tabAvailable, useWorkflow } from './hooks/useWorkflow';
import {
  startAnalysisRunner,
  startEnergyRunner,
  startFragmentationRunner,
  startVibrationRunner,
  startMuckpileRunner,
} from './analysis/runner';
import { StatusBar } from './components/StatusBar';
import { DemoOverlay } from './demo/DemoOverlay';
import { stopDemo } from './demo/playback';
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
import { LEFT_TABS } from './panels/registry';
import { Viewport } from './viewport/Viewport';
import { WorkspaceWindows } from './components/WorkspaceWindows';

/**
 * Editor. `restoreLocalDraft`: al abrir, recupera el último autoguardado del navegador (modo
 * local). En modo servidor el proyecto llega de la mina y no se reemplaza con un borrador.
 */
export function App({ restoreLocalDraft = true }: { restoreLocalDraft?: boolean }) {
  useShortcuts();
  const tab = useUiStore((s) => s.leftTab);
  const demoOn = useUiStore((s) => s.demoStep !== null);
  const trailerOn = useUiStore((s) => s.demoStep !== null && s.demoTour === 'trailer');
  const workflow = useWorkflow();
  // Si la pestaña actual queda sin datos (proyecto nuevo, se borró la malla), vuelve a Diseño.
  const current = LEFT_TABS.find((x) => x.id === tab);
  const currentAvailable = demoOn || tabAvailable(current?.requires ?? null, workflow);
  const setTab = useUiStore((s) => s.setLeftTab);
  const rightCollapsed = useUiStore((s) => s.rightCollapsed);
  const rightWidth = useUiStore((s) => s.rightWidth);
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
    const stops = [
      startEnergyRunner(),
      startFragmentationRunner(),
      startVibrationRunner(),
      startMuckpileRunner(),
    ];
    return () => {
      stopDemo();
      stopAnalysis();
      stopAutosave();
      stopTopography();
      for (const stop of stops) stop();
    };
  }, [restoreLocalDraft]);
  return (
    <div
      className={`app${trailerOn ? ' trailer-on' : ''}`}
      style={
        {
          '--right-sidebar-width': rightCollapsed ? '42px' : `${rightWidth}px`,
        } as CSSProperties
      }
    >
      <Toolbar />
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
      <WorkspaceWindows />
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
