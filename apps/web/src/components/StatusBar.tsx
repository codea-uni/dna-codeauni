import { useEffect } from 'react';
import { useProject, useSelectionIds } from '../hooks/useDocument';
import { session } from '../session';
import { useUiStore } from '../stores/uiStore';
import { toolHint } from './Toolbar';

export function StatusBar() {
  const project = useProject();
  const selected = useSelectionIds();
  const pointer = useUiStore((s) => s.pointer);
  const hover = useUiStore((s) => s.hover);
  const frameStats = useUiStore((s) => s.frameStats);
  const tool = useUiStore((s) => s.tool);
  const viewMode = useUiStore((s) => s.viewMode);
  const message = useUiStore((s) => s.message);
  const busy = useUiStore((s) => s.busy);
  const holeCount = project.blasts.reduce((n, b) => n + b.holes.length, 0);
  const hoverLabel = hover ? session.document.findHole(hover)?.hole.label : undefined;

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
        {pointer ? `E ${pointer.x.toFixed(2)}  N ${pointer.y.toFixed(2)}` : 'E —  N —'}
      </span>
      <span>{holeCount} taladros</span>
      <span>{selected.size} seleccionados</span>
      {hoverLabel !== undefined && <span>Taladro {hoverLabel}</span>}
      <span className="grow muted">
        {busy ??
          (message ? (
            <span className={message.kind}>{message.text}</span>
          ) : viewMode === '3d' ? (
            'Vista 3D: arrastre orbita · Shift o botón derecho desplaza · rueda acerca · 3 vuelve a planta'
          ) : (
            toolHint(tool)
          ))}
      </span>
      <span className="mono" title="Medido durante la última interacción (el render es a demanda)">
        {frameStats
          ? `${frameStats.fps.toFixed(0)} fps · ${frameStats.cpuMs.toFixed(1)} ms CPU`
          : '— fps'}
      </span>
    </footer>
  );
}
