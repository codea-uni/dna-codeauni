import type { HoleId } from '@cronos/core';
import type { Engine, XrLine, XrView } from '@cronos/engine';
import { muckpileEnd, sequenceTimes } from '../analysis/visualize';
import { playDemoSequence } from '../demo/runtime';
import { formatNumber, t, useLocale } from '../i18n';
import { session } from '../session';
import { useAnalysisStore } from '../stores/analysisStore';
import { holeCardRows } from './holeCard';
import { setPresenting } from './room';
import { applyXrLayers, useXrRoom, xrLayers } from './xrState';

/** Segundos reales que dura en el visor la secuencia con el vuelo del material. */
const XR_SEQUENCE_SECONDS = 12;
/** Rango del slider de escala de la maqueta (1:N, logarítmico). */
const SCALE_MIN = 100;
const SCALE_MAX = 20_000;

type Tab = 'view' | 'layers' | 'sequence';

/** Posición 0–1 del slider para la escala 1:N, y su inversa. */
export const scaleToSlider = (n: number): number =>
  Math.min(1, Math.max(0, Math.log(n / SCALE_MIN) / Math.log(SCALE_MAX / SCALE_MIN)));
export const sliderToScale = (v: number): number => SCALE_MIN * (SCALE_MAX / SCALE_MIN) ** v;

const store = () => useAnalysisStore.getState();

/**
 * Menú y ficha del taladro dentro del visor (D-19). El engine dibuja los paneles y avisa qué botón
 * o taladro se apuntó; aquí se arman los textos (`t()`) y se usan las mismas acciones y resultados
 * de los paneles: ningún cálculo nuevo. La sesión es de solo lectura (no hay comandos).
 */
export function bindXr(engine: Engine): () => void {
  let view: XrView = 'table';
  let scale = 1;
  let tab: Tab = 'view';
  let selected: HoleId | null = null;
  let ended = false;
  let playback: AbortController | null = null;
  let lastMenu = '';
  let lastInfo = '';

  /** Intervalo de la secuencia en el visor [s], como `playDemoSequence`. */
  const sequenceSpan = (): { from: number; end: number } | null => {
    const { analysis, muckpile } = store();
    if (!analysis) return null;
    const pile = xrLayers().pile && muckpile;
    return {
      from: analysis.timing.firstTime - 0.05,
      end: pile ? muckpileEnd(muckpile, null) : analysis.timing.lastTime + 0.3,
    };
  };

  /**
   * Menú por pestañas (vista, capas, secuencia) con un pie fijo (sala y salir). Aparece al mirar la
   * mano izquierda; la escala y la línea de tiempo se arrastran con el gatillo.
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
    lines.push(
      (['view', 'layers', 'sequence'] as const).map((k) => ({
        id: `tab:${k}`,
        label: t(`xr.tab.${k}`),
        tab: true,
        active: tab === k,
      })),
    );
    if (tab === 'view') {
      // Escenarios: maqueta sobre la mesa real, dentro de la voladura o maqueta aislada.
      lines.push([
        { id: 'view:table', icon: '🪑', label: t('xr.menu.table'), active: view === 'table' },
        { id: 'view:walk', icon: '⛰️', label: t('xr.menu.walk'), active: view === 'walk' },
        { id: 'view:model', icon: '🧊', label: t('xr.menu.model'), active: view === 'model' },
      ]);
      if (view !== 'walk') {
        const n = 1 / scale;
        lines.push({
          id: 'scale',
          label: t('xr.menu.scale', { n: formatNumber(Math.round(n)) }),
          slider: scaleToSlider(n),
        });
        if (view === 'table') lines.push({ id: 'place', label: t('xr.menu.place') });
      }
    } else if (tab === 'layers') {
      lines.push(
        [
          { id: 'energy', label: t('xr.menu.energy'), toggle: l.energy },
          { id: 'vibration', label: t('xr.menu.vibration'), toggle: l.vibration },
        ],
        [
          { id: 'labels', label: t('xr.menu.labels'), toggle: l.labels },
          { id: 'pile', label: t('xr.menu.pile'), toggle: l.pile },
        ],
      );
    } else {
      lines.push([
        {
          id: 'play',
          icon: s.sequencePlaying ? '⏸' : '▶',
          label: t(s.sequencePlaying ? 'xr.menu.pause' : 'xr.menu.play'),
          active: s.sequencePlaying,
        },
        { id: 'reset', icon: '⟲', label: t('xr.menu.reset') },
      ]);
      const span = sequenceSpan();
      if (span && s.analysis) {
        const time = s.sequenceTime ?? span.from;
        // Redondeado a 10 ms: el menú se redibuja solo cuando cambia lo que se ve.
        const ms = Math.round((time - s.analysis.timing.firstTime) * 100) * 10;
        lines.push({
          id: 'time',
          label: t('xr.menu.time', { ms: formatNumber(Math.max(0, ms)) }),
          slider:
            Math.round(((time - span.from) / Math.max(1e-6, span.end - span.from)) * 100) / 100,
        });
      }
    }
    lines.push([
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
    ]);
    return lines;
  };

  const infoRows = (): XrLine[] => {
    const hole = selected ? session.document.findHole(selected)?.hole : undefined;
    return hole ? holeCardRows(hole, session.document.project, store().analysis) : [];
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

  const act = ({ id, value }: { id: string; value?: number }) => {
    const s = store();
    switch (id) {
      case 'tab:view':
      case 'tab:layers':
      case 'tab:sequence':
        tab = id.slice(4) as Tab;
        break;
      case 'scale':
        if (value !== undefined) engine.zoomXr(1 / sliderToScale(value) / scale);
        break;
      case 'time': {
        const span = sequenceSpan();
        if (value === undefined || !span || !s.analysis) break;
        ended = false;
        engine.seekSequence(sequenceTimes(s.analysis), span.from + value * (span.end - span.from));
        s.set({ sequencePlaying: false });
        break;
      }
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
