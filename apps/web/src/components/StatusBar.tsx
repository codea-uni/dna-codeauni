import { useEffect } from 'react';
import { useProject, useSelectionIds } from '../hooks/useDocument';
import { session } from '../session';
import { useUiStore } from '../stores/uiStore';
import { toolHint } from './Toolbar';
import { topographyElevation } from '../topography/session';
import { useLocale, useT } from '../i18n';
import { formatInputNumber } from '../i18n/numbers';
import { useUnits } from '../hooks/useUnits';
import { tabAvailable, useWorkflow } from '../hooks/useWorkflow';
import { VibrationLawChip } from './VibrationLawChip';

export function StatusBar() {
  const tr = useT();
  const project = useProject();
  const selected = useSelectionIds();
  const pointer = useUiStore((s) => s.pointer);
  const hover = useUiStore((s) => s.hover);
  const frameStats = useUiStore((s) => s.frameStats);
  const tool = useUiStore((s) => s.tool);
  const viewMode = useUiStore((s) => s.viewMode);
  const message = useUiStore((s) => s.message);
  const busy = useUiStore((s) => s.busy);
  const workflow = useWorkflow();
  const { len } = useUnits();
  const locale = useLocale((s) => s.locale);
  // Coordenadas en la unidad del proyecto, con la coma del idioma y sin miles (se leen dígito a dígito).
  const coord = (m: number) => formatInputNumber(len.show(m), 2, locale);
  const holeCount = project.blasts.reduce((n, b) => n + b.holes.length, 0);
  const hoverLabel = hover ? session.document.findHole(hover)?.hole.label : undefined;
  // O(log n) con el índice del worker: se puede consultar en cada movimiento del cursor.
  const groundZ =
    pointer && project.topography.length > 0
      ? topographyElevation(pointer.x, pointer.y, project.blasts[0]?.bench.topographyId)
      : null;

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(
      () => {
        useUiStore.setState({ message: null });
      },
      message.kind === 'error' ? 8000 : 4000,
    );
    return () => {
      clearTimeout(t);
    };
  }, [message]);

  return (
    <footer className="statusbar">
      <span className="mono">
        {pointer ? `E ${coord(pointer.x)}  N ${coord(pointer.y)}  ${len.unit}` : 'E —  N —'}
      </span>
      {project.topography.length > 0 && (
        <span className="mono" title={tr('topo.cursorZ')}>
          {groundZ !== null ? `Z ${coord(groundZ)} ${len.unit}` : 'Z —'}
        </span>
      )}
      <span>{tr('status.holes', { n: holeCount })}</span>
      <span className="status-selected">{tr('status.selected', { n: selected.size })}</span>
      {hoverLabel !== undefined && <span>{tr('status.hole', { label: hoverLabel })}</span>}
      {tabAvailable('charged', workflow) && <VibrationLawChip />}
      {/* Región viva: los mensajes y el trabajo en curso se anuncian al lector de pantalla. */}
      <span className="grow muted" role="status" aria-live="polite">
        {busy ??
          (message ? (
            <span className={message.kind}>{message.text}</span>
          ) : viewMode === '3d' ? (
            tr('status.view3d')
          ) : (
            toolHint(tool)
          ))}
      </span>
      <span className="mono" title={tr('status.frameTitle')}>
        {frameStats
          ? `${frameStats.fps.toFixed(0)} fps · ${frameStats.cpuMs.toFixed(1)} ms CPU`
          : '— fps'}
      </span>
    </footer>
  );
}
