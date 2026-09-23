import { Engine } from '@blastlab/engine';
import { useEffect, useRef } from 'react';
import { session, setEngine } from '../session';
import { useUiStore } from '../stores/uiStore';

/**
 * Monta el canvas y crea el Engine una sola vez. React no vuelve a tocar el render:
 * solo reenvía comandos (herramienta, snapping, plantilla) y recibe eventos (fps, cursor).
 */
export function Viewport() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = new Engine(canvas, { document: session.document, selection: session.selection });
    setEngine(engine);

    const ui = useUiStore.getState();
    engine.setTool(ui.tool);
    engine.setSnapSettings(ui.snap);
    engine.setHoleTemplate(ui.holeTemplate);

    const unsubscribeUi = useUiStore.subscribe((state, prev) => {
      if (state.tool !== prev.tool) engine.setTool(state.tool);
      if (state.snap !== prev.snap) engine.setSnapSettings(state.snap);
      if (state.holeTemplate !== prev.holeTemplate) engine.setHoleTemplate(state.holeTemplate);
    });
    const offs = [
      engine.on('frameStats', (stats) => {
        useUiStore.getState().setFrameStats(stats);
      }),
      engine.on('pointer', (p) => {
        useUiStore.getState().setPointer(p);
      }),
      engine.on('hover', (id) => {
        useUiStore.getState().setHover(id);
      }),
    ];

    return () => {
      unsubscribeUi();
      for (const off of offs) off();
      setEngine(null);
      engine.dispose();
    };
  }, []);

  return <canvas ref={canvasRef} className="viewport" />;
}
