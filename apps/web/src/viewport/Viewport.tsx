import { Engine } from '@cronos/engine';
import { useEffect, useRef } from 'react';
import { bindVisualization } from '../analysis/visualize';
import { formatNumber, t, useLocale } from '../i18n';
import { polygonSignedArea } from '@cronos/core';
import { session, setEngine } from '../session';
import { applyTopographyToEngine } from '../topography/session';
import { syncTunnels } from '../underground/send';
import { useUiStore } from '../stores/uiStore';
import { AgentCards } from '../ai/AgentCards';
import { BuildChip, bindBuild } from './BuildChip';
import { Legend3D } from './Legend3D';
import { PickCard } from './PickCard';
import { QuickBar } from './QuickBar';
import { ViewGizmo } from './ViewGizmo';
import { bindXr } from '../xr/bindXr';
import { XrFab } from '../xr/XrButtons';
import { LiveFeedView } from '../xr/LiveFeedView';
import { bindRoom } from '../xr/room';

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
    syncTunnels(true);

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
    const unbindRoom = bindRoom(engine);
    const unbindBuild = bindBuild(engine);

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
      // Perímetro cerrado: se avisa con su área y se vuelve a Seleccionar (la herramienta no queda
      // activa esperando otro perímetro).
      engine.on('boundaryCreated', (id) => {
        const b = session.document.project.blasts
          .flatMap((x) => x.boundaries)
          .find((x) => x.id === id);
        const ui = useUiStore.getState();
        if (b)
          ui.notify(
            t('design.boundaryCreated', {
              name: b.name,
              area: formatNumber(Math.abs(polygonSignedArea(b.polygon)), 0),
            }),
          );
        ui.setTool('select');
      }),
      engine.on('viewMode', (mode) => {
        if (useUiStore.getState().viewMode !== mode) useUiStore.getState().setViewMode(mode);
      }),
      engine.on('hover', (id) => {
        useUiStore.getState().setHover(id);
      }),
      // Clic en 3D: la ficha muestra lo elegido (los taladros van además a la selección).
      engine.on('picked3d', (picked) => {
        useUiStore.getState().setPicked3d(picked);
      }),
    ];

    return () => {
      unsubscribeUi();
      unsubscribeLocale();
      unbindVisualization();
      unbindXr();
      unbindRoom();
      unbindBuild();
      for (const off of offs) off();
      setEngine(null);
      engine.dispose();
    };
  }, []);

  return (
    <>
      <canvas ref={canvasRef} className="viewport" />
      <QuickBar />
      <ViewGizmo />
      <PickCard />
      <Legend3D />
      <BuildChip />
      <AgentCards />
      <LiveFeedView />
      <XrFab />
    </>
  );
}
