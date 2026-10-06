import { Engine } from '@cronos/engine';
import { useEffect, useRef } from 'react';
import { bindVisualization } from '../analysis/visualize';
import { t, useLocale } from '../i18n';
import { session, setEngine } from '../session';
import { applyTopographyToEngine } from '../topography/session';
import { useUiStore } from '../stores/uiStore';
import { Legend3D } from './Legend3D';
import { bindXr } from '../xr/bindXr';

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
    applyTopographyToEngine();

    const ui = useUiStore.getState();
    engine.setTool(ui.tool);
    engine.setSnapSettings(ui.snap);
    engine.setHoleTemplate(ui.holeTemplate);
    engine.setTieConnector(ui.tieConnectorId);
    engine.setDecorations(ui.decorations);
    engine.set3DOptions({ radiusScale: ui.radiusScale });
    engine.setViewMode(ui.viewMode);
    // `t` lee el idioma al llamarse; volver a pasarlo al cambiar refresca los textos fijos del mapa.
    const applyText = () => {
      engine.setText((key, vars) => t(`engine.${key}`, vars));
    };
    applyText();
    const unsubscribeLocale = useLocale.subscribe(applyText);
    const unbindVisualization = bindVisualization(engine);
    const unbindXr = bindXr(engine);

    const unsubscribeUi = useUiStore.subscribe((state, prev) => {
      if (state.tool !== prev.tool) engine.setTool(state.tool);
      if (state.snap !== prev.snap) engine.setSnapSettings(state.snap);
      if (state.holeTemplate !== prev.holeTemplate) engine.setHoleTemplate(state.holeTemplate);
      if (state.tieConnectorId !== prev.tieConnectorId)
        engine.setTieConnector(state.tieConnectorId);
      if (state.activeBoundaryId !== prev.activeBoundaryId)
        engine.setActiveBoundary(state.activeBoundaryId);
      if (state.viewMode !== prev.viewMode) engine.setViewMode(state.viewMode);
      if (state.decorations !== prev.decorations) engine.setDecorations(state.decorations);
      if (state.radiusScale !== prev.radiusScale)
        engine.set3DOptions({ radiusScale: state.radiusScale });
    });
    const offs = [
      engine.on('frameStats', (stats) => {
        useUiStore.getState().setFrameStats(stats);
      }),
      engine.on('pointer', (p) => {
        useUiStore.getState().setPointer(p);
      }),
      engine.on('activeBoundary', (id) => {
        if (useUiStore.getState().activeBoundaryId !== id)
          useUiStore.getState().setActiveBoundary(id);
      }),
      engine.on('viewMode', (mode) => {
        if (useUiStore.getState().viewMode !== mode) useUiStore.getState().setViewMode(mode);
      }),
      engine.on('hover', (id) => {
        useUiStore.getState().setHover(id);
      }),
    ];

    return () => {
      unsubscribeUi();
      unsubscribeLocale();
      unbindVisualization();
      unbindXr();
      for (const off of offs) off();
      setEngine(null);
      engine.dispose();
    };
  }, []);

  return (
    <>
      <canvas ref={canvasRef} className="viewport" />
      <Legend3D />
    </>
  );
}
