import { diameterToDisplay, lengthToDisplay, type HoleId } from '@cronos/core';
import type { Engine, XrLine, XrRow, XrView } from '@cronos/engine';
import { playDemoSequence } from '../demo/runtime';
import { formatNumber, t, useLocale } from '../i18n';
import { session } from '../session';
import { useAnalysisStore } from '../stores/analysisStore';
import { setPresenting } from './room';
import { applyXrLayers, useXrRoom, xrLayers } from './xrState';

/** Segundos reales que dura en el visor la secuencia con el vuelo del material. */
const XR_SEQUENCE_SECONDS = 12;
const ZOOM_STEP = 1.5;

const store = () => useAnalysisStore.getState();

/**
 * Menú y ficha del taladro dentro del visor (D-19). El engine dibuja los paneles y avisa qué botón
 * o taladro se apuntó; aquí se arman los textos (`t()`) y se usan las mismas acciones y resultados
 * de los paneles: ningún cálculo nuevo. La sesión es de solo lectura (no hay comandos).
 */
export function bindXr(engine: Engine): () => void {
  let view: XrView = 'table';
  let scale = 1;
  let selected: HoleId | null = null;
  let ended = false;
  let playback: AbortController | null = null;
  let lastMenu = '';
  let lastInfo = '';

  /**
   * Menú compacto: botones agrupados por fila (escenario, maqueta, capas, secuencia, sala). Aparece
   * al mirar la mano izquierda.
   */
  const menuRows = (): XrLine[] => {
    const s = store();
    const l = xrLayers();
    const room = useXrRoom.getState();
    const lines: XrLine[] = [];
    if (room.role === 'presenter')
      lines.push({ label: t('xr.room.presenting', { n: room.peers }) });
    else if (room.role === 'viewer' && room.presenter)
      lines.push({ label: t('xr.room.following', { name: room.presenter }) });
    // Escenarios: maqueta sobre la mesa real, dentro de la voladura o maqueta aislada.
    lines.push([
      { id: 'view:table', label: t('xr.menu.table'), active: view === 'table' },
      { id: 'view:walk', label: t('xr.menu.walk'), active: view === 'walk' },
      { id: 'view:model', label: t('xr.menu.model'), active: view === 'model' },
    ]);
    if (view !== 'walk')
      lines.push([
        { id: 'zoomOut', label: t('xr.menu.zoomOut') },
        { label: t('xr.menu.scale', { n: formatNumber(Math.round(1 / scale)) }) },
        { id: 'zoomIn', label: t('xr.menu.zoomIn') },
        ...(view === 'table' ? [{ id: 'place', label: t('xr.menu.place') }] : []),
      ]);
    lines.push(
      [
        { id: 'energy', label: t('xr.menu.energy'), active: l.energy },
        { id: 'vibration', label: t('xr.menu.vibration'), active: l.vibration },
      ],
      [
        { id: 'labels', label: t('xr.menu.labels'), active: l.labels },
        { id: 'pile', label: t('xr.menu.pile'), active: l.pile },
      ],
      [
        {
          id: 'play',
          label: t(s.sequencePlaying ? 'xr.menu.pause' : 'xr.menu.play'),
          active: s.sequencePlaying,
        },
        { id: 'reset', label: t('xr.menu.reset') },
      ],
      [
        ...(room.role
          ? [
              {
                id: 'present',
                label: t(room.role === 'presenter' ? 'xr.menu.stopPresenting' : 'xr.menu.present'),
                active: room.role === 'presenter',
              },
            ]
          : []),
        { id: 'exit', label: t('xr.menu.exit') },
      ],
    );
    return lines;
  };

  const infoRows = (): XrRow[] => {
    const hole = selected ? session.document.findHole(selected)?.hole : undefined;
    if (!hole) return [];
    const units = session.document.project.displayUnits;
    const rows: XrRow[] = [{ label: t('xr.info.title', { label: hole.label }) }];
    const a = store().analysis;
    const i = a ? a.charge.holeIds.indexOf(hole.id) : -1;
    const kg = a?.charge.perHole[i];
    const fire = a?.timing.fireTime[i];
    if (kg !== undefined) rows.push({ label: t('xr.info.charge', { kg: formatNumber(kg, 1) }) });
    // Tiempo relativo al primer taladro, como las etiquetas de tiempo (H-502).
    if (a && fire !== undefined && Number.isFinite(fire))
      rows.push({
        label: t('xr.info.delay', { ms: formatNumber((fire - a.timing.firstTime) * 1000) }),
      });
    rows.push(
      {
        label: t('xr.info.length', {
          value: formatNumber(lengthToDisplay(hole.length, units.length), 1),
          unit: units.length,
        }),
      },
      {
        label: t('xr.info.diameter', {
          value: formatNumber(diameterToDisplay(hole.diameter, units.diameter)),
          unit: units.diameter,
        }),
      },
    );
    return rows;
  };

  /** Redibuja los paneles solo si cambió su texto (el store cambia en cada cuadro de la secuencia). */
  const refresh = () => {
    if (!engine.xrMode) return;
    const menu = menuRows();
    const menuKey = JSON.stringify(menu);
    if (menuKey !== lastMenu) {
      lastMenu = menuKey;
      engine.setXrMenu(menu);
    }
    const info = infoRows();
    const infoKey = JSON.stringify(info);
    if (infoKey !== lastInfo) {
      lastInfo = infoKey;
      engine.setXrInfo(info);
    }
  };

  const play = () => {
    const s = store();
    if (s.sequencePlaying) {
      engine.pauseSequence();
      s.set({ sequencePlaying: false });
    } else if (s.sequenceTime !== null && !ended) {
      engine.resumeSequence();
      s.set({ sequencePlaying: true });
    } else {
      ended = false;
      playback?.abort();
      playback = new AbortController();
      playDemoSequence(playback.signal, XR_SEQUENCE_SECONDS, xrLayers().pile).catch(() => {
        // cancelada o sin análisis: el menú vuelve a «Reproducir»
      });
    }
  };

  const act = (id: string) => {
    const s = store();
    switch (id) {
      case 'energy':
      case 'vibration':
      case 'labels':
      case 'pile': {
        const l = xrLayers();
        applyXrLayers({ ...l, [id]: !l[id] });
        break;
      }
      case 'play':
        play();
        break;
      case 'reset':
        playback?.abort();
        ended = false;
        engine.stopSequence();
        s.set({ sequencePlaying: false, sequenceTime: null });
        break;
      case 'view:table':
      case 'view:walk':
      case 'view:model':
        engine.setXrView(id.slice(5) as XrView);
        break;
      case 'place':
        engine.placeXrOnTable();
        break;
      case 'present':
        setPresenting(useXrRoom.getState().role !== 'presenter');
        break;
      case 'zoomIn':
        engine.zoomXr(ZOOM_STEP);
        break;
      case 'zoomOut':
        engine.zoomXr(1 / ZOOM_STEP);
        break;
      case 'exit':
        engine.exitXr();
        break;
    }
    refresh();
  };

  const offs = [
    engine.on('xrSession', (mode) => {
      lastMenu = '';
      lastInfo = '';
      selected = null;
      if (mode) refresh();
      else playback?.abort();
    }),
    engine.on('xrView', (v) => {
      view = v.view;
      scale = v.scale;
      refresh();
    }),
    engine.on('xrSelectHole', (id) => {
      selected = id;
      refresh();
    }),
    engine.on('xrAction', act),
    engine.on('sequenceEnded', () => {
      ended = true;
    }),
    useAnalysisStore.subscribe(refresh),
    useLocale.subscribe(refresh),
    useXrRoom.subscribe(refresh),
  ];
  return () => {
    playback?.abort();
    for (const off of offs) off();
  };
}
