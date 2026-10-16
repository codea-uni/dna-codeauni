import type { HoleId } from '@cronos/core';
import type { Engine, XrLine, XrView } from '@cronos/engine';
import { muckpileEnd, sequenceTimes } from '../analysis/visualize';
import { playDemoSequence } from '../demo/runtime';
import { formatNumber, t, useLocale } from '../i18n';
import { session } from '../session';
import { useAnalysisStore } from '../stores/analysisStore';
import { holeCardRows } from './holeCard';
import { HoleProximity } from './holeProximity';
import { HOLE_DETAIL_CARD, showHoleDetail } from '../ai/holeDetail';
import { energyLegend, vibrationLegend } from './mapLegend';
import { setPresenting } from './room';
import { bindXrLiveVoice } from './liveVoice';
import { cardXrLines, chooseCardOption, closeCard, useCardStore } from '../ai/cards';
import { applyXrLayers, useXrRoom, xrLayers } from './xrState';

/** Segundos reales que dura en el visor la secuencia con el vuelo del material. */
const XR_SEQUENCE_SECONDS = 12;
/** El HUD de la secuencia queda este tiempo al terminar [ms]. */
const HUD_HOLD_MS = 3000;
/**
 * Tono en el visor: una conversación hablada con quien presenta o con su cliente. Las
 * recomendaciones salen de la revisión y los resultados de la app (`get_analysis`), nunca de
 * reglas inventadas (CLAUDE.md, reglas de dominio).
 */
const VR_STYLE = `VR mode: the user is inside a VR headset (Meta Quest) with controllers or hands, no keyboard, often presenting to a client. You are their Jarvis-like copilot: you drive the view and can take them anywhere. Keep replies under 35 words and answer straight away: never restate or quote what the user said. Show while you talk: para mostrar el detalle de un taladro usa hole_detail; para llevar al usuario junto a él usa vr_view go_to target hole (también abre su ficha); to show the firing, vibration, energy, displacement or muckpile call show_results (the firing plays with the muckpile flight; at full scale it moves them to an isometric view 60 m from the blast edge: do not move them farther or call go_to after it). To take them somewhere use vr_view go_to: "llévame al terreno / a la voladura" = target blast; "llévame a la comunidad" = target point with its name (stands at the community looking at the blast); "¿dónde está la comunidad? / muéstrame la comunidad / vista con la comunidad" = vr_view focus_point (blast and community together from above; do not add higher after it); "llévame al taladro 12" = target hole; "ponme detrás de la voladura" = behind; "vista desde la cara libre" = free_face; "en la cresta" = crest; "centra la voladura" (at full scale) = blast; "ponme dentro de la malla" = center; "por encima de la voladura / encima del plano / desde arriba / vista de pájaro" = above (floating over the pattern; distance_m = height); "vista general" = overview (far, with the community); "más arriba / más alto" = vr_view higher, "más abajo / bájame" = lower, "déjame a N m del terreno / ponme a N m de altura" = vr_view height with distance_m N, "vista en planta / vista de planta / desde arriba" = vr_view go_to above (set_camera does not work in VR), "acércame / aléjame" = zoom_in / zoom_out (10 m steps at full scale; "aléjame 50 metros" = distance_m 50). "Quiero ver el amarre / solo los taladros / solo la vibración" = spotlight with that layer; "muéstrame el precorte / el buffer / los taladros con ANFO / los que no tienen detonador / los taladros 10 a 20" = spotlight holes {group | explosive | no_detonator | labels} (only those holes stay, with their numbers). The spotlight stays until the user is done: then ask "¿Hacemos algo más en esta vista o volvemos a la vista general?" and call spotlight restore for the general view; if they are far, also go_to above first so it fits in view. Use vr_view state when you need to know where they are or what they are looking at. Other views: table = model on their real table, model = isolated model, place = put it on the table, zoom_in / zoom_out = small steps. After a design change, play the sequence if they want to see it. After answering, when it fits, offer one concrete next step drawn from the results (predict_results), e.g. "¿Quieres que suba el retardo de fondo para evitar los tiros cortados?". Never invent mining rules or values.`;

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
 * de los paneles: ningún cálculo nuevo. No hay comandos directos: el diseño se edita solo por voz,
 * con el asistente (`voice.ts`).
 */
export function bindXr(engine: Engine): () => void {
  let view: XrView = 'table';
  let scale = 1;
  let tab: Tab = 'view';
  /** La secuencia espera al análisis o a la pila antes de arrancar. */
  let preparing = false;
  /** Etiquetas y pila de la web al entrar: el visor empieza sin ellas y se devuelven al salir. */
  let webLayers: { labels: boolean; muckpile: boolean; muckpileBlocks: boolean } | null = null;
  let selected: HoleId | null = null;
  let ended = false;
  let playback: AbortController | null = null;
  /** Leyenda reducida a su encabezado (botón del panel). */
  let legendCollapsed = false;
  let lastMenu = '';
  let lastInfo = '';
  let lastLegend = '';
  let lastHint = '';
  let lastHud = '';
  /** El HUD queda unos segundos al terminar la secuencia [ms de performance.now]. */
  let hudUntil = 0;

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
        { id: 'view:table', icon: '▦', label: t('xr.menu.table'), active: view === 'table' },
        { id: 'view:walk', icon: '▲', label: t('xr.menu.walk'), active: view === 'walk' },
        { id: 'view:model', icon: '◆', label: t('xr.menu.model'), active: view === 'model' },
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
      // Mientras se calcula una capa prendida, su nombre lo dice (si no, parece que no anda).
      const label = (key: 'energy' | 'vibration' | 'pile', busy: boolean) =>
        busy ? t('xr.menu.computing', { name: t(`xr.menu.${key}`) }) : t(`xr.menu.${key}`);
      lines.push(
        [
          { id: 'energy', label: label('energy', l.energy && s.energyComputing), toggle: l.energy },
          {
            id: 'vibration',
            label: label('vibration', l.vibration && s.vibComputing),
            toggle: l.vibration,
          },
        ],
        [
          { id: 'labels', label: t('xr.menu.labels'), toggle: l.labels },
          {
            id: 'pile',
            label: label('pile', l.pile && (s.muckpileComputing || !s.muckpile)),
            toggle: l.pile,
          },
        ],
      );
    } else {
      lines.push([
        preparing && !s.sequencePlaying
          ? { id: 'play', icon: '…', label: t('xr.menu.preparing'), active: true }
          : {
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
      ...(voice.available
        ? [
            {
              id: 'voice',
              label: t(voice.listening ? 'xr.voice.send' : 'xr.menu.talk'),
              active: voice.listening,
            },
          ]
        : []),
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

  /** Contexto del visor para el asistente (en inglés, como las respuestas de las herramientas). */
  const voiceContext = (): string => {
    const hole = selected ? session.document.findHole(selected)?.hole : undefined;
    const scene = {
      table: 'tabletop model',
      walk: 'inside the blast at full scale',
      model: 'isolated model',
    }[view];
    return `VR headset, ${scene}; ${hole ? `pointed hole "${hole.label}"` : 'no hole pointed'}`;
  };
  const voice = bindXrLiveVoice(
    engine,
    VR_STYLE,
    voiceContext,
    () => {
      refresh();
    },
    () => {
      refresh();
    },
  );

  /** Escala de colores y datos de los mapas prendidos y ya calculados (a la derecha de la vista). */
  const legendRows = (): XrLine[] => {
    const s = store();
    const l = xrLayers();
    const parts = [
      l.energy && s.energy ? energyLegend(s.energy, session.document.project) : [],
      l.vibration && s.vibration ? vibrationLegend(s.vibration) : [],
    ].filter((p) => p.length > 0);
    if (parts.length === 0) return [];
    const header: XrLine = [
      { label: t('xr.legend.title'), heading: true, weight: 2 },
      { id: 'legend:toggle', label: t(legendCollapsed ? 'xr.legend.show' : 'xr.legend.hide') },
    ];
    if (legendCollapsed) return [header];
    return [header, ...parts.flatMap((p, i) => (i > 0 ? [{ label: '' }, ...p] : p))];
  };

  /** Ayuda bajo el control derecho: qué hace cada botón (según el escenario y la voz). */
  const hintRows = (): XrLine[] => [
    ...(voice.available ? [{ label: t('xr.hint.live'), body: true, key: 'A' }] : []),
    { label: t('xr.hint.pick'), body: true, key: t('xr.hint.trigger') },
    ...(view === 'walk'
      ? [{ label: t('xr.hint.walkStick'), body: true, key: t('xr.hint.stick') }]
      : []),
    {
      label: t(view === 'walk' ? 'xr.hint.moveWalk' : 'xr.hint.move'),
      body: true,
      key: t('xr.hint.grip'),
    },
    { label: t('xr.hint.exit'), body: true, key: 'B/Y' },
    { label: t('xr.hint.hands'), body: true },
  ];

  /** Tiempos de disparo ordenados (para contar los taladros ya disparados sin recorrerlos todos). */
  let firedCache: { analysis: unknown; times: number[] } | null = null;
  const firedBy = (time: number): { n: number; total: number } => {
    const a = store().analysis;
    if (!a) return { n: 0, total: 0 };
    if (firedCache?.analysis !== a)
      firedCache = {
        analysis: a,
        times: Array.from(a.timing.fireTime)
          .filter((x) => Number.isFinite(x))
          .sort((x, y) => x - y),
      };
    const times = firedCache.times;
    let lo = 0;
    let hi = times.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((times[mid] ?? Infinity) <= time) lo = mid + 1;
      else hi = mid;
    }
    return { n: lo, total: times.length };
  };

  /**
   * Avance de la secuencia arriba de la vista mientras se reproduce (o en pausa), y unos segundos
   * después de terminar: tiempo desde el primer disparo, taladros disparados y barra de avance.
   */
  const hudRows = (): XrLine[] => {
    const s = store();
    const span = sequenceSpan();
    if (s.sequenceTime === null || !s.analysis || !span) return [];
    const done = ended && !s.sequencePlaying;
    if (done && performance.now() > hudUntil) return [];
    const time = s.sequenceTime;
    const ms = Math.round((time - s.analysis.timing.firstTime) * 100) * 10;
    const { n, total } = firedBy(time);
    return [
      [
        { label: t(done ? 'xr.hud.done' : 'xr.hud.title'), heading: true, weight: 2 },
        { label: t('xr.hud.time', { ms: formatNumber(Math.max(0, ms)) }) },
      ],
      { label: t('xr.hud.holes', { n: formatNumber(n), total: formatNumber(total) }), body: true },
      {
        label: '',
        slider:
          Math.round(
            Math.min(1, Math.max(0, (time - span.from) / Math.max(1e-6, span.end - span.from))) *
              100,
          ) / 100,
      },
    ];
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
    const legend = legendRows();
    const legendKey = JSON.stringify(legend);
    if (legendKey !== lastLegend) {
      lastLegend = legendKey;
      engine.setXrLegend(legend);
    }
    const hint = hintRows();
    const hintKey = JSON.stringify(hint);
    if (hintKey !== lastHint) {
      lastHint = hintKey;
      engine.setXrHint(hint);
    }
    const hud = hudRows();
    const hudKey = JSON.stringify(hud);
    if (hudKey !== lastHud) {
      lastHud = hudKey;
      engine.setXrHud(hud);
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
      preparing = true;
      refresh();
      playDemoSequence(playback.signal, XR_SEQUENCE_SECONDS, xrLayers().pile)
        .catch(() => {
          // cancelada o sin análisis: el menú vuelve a «Reproducir»
        })
        .finally(() => {
          preparing = false;
          refresh();
        });
    }
  };

  const syncCards = () => {
    engine.setXrCards(
      useCardStore.getState().cards.map((c) => ({ id: c.id, rows: cardXrLines(c) })),
    );
  };
  syncCards();

  const proximity = new HoleProximity();
  let automaticId: string | null = null;
  let detailVersion = -1;
  let detailAnalysis = store().analysis;
  let detailLocale = useLocale.getState().locale;
  // La cabeza ya viene en coordenadas del proyecto; no se modifica XrSession.
  const proximityTimer = setInterval(() => {
    const state = engine.xrMode ? engine.xrState() : null;
    const card = useCardStore.getState().cards.find((c) => c.id === HOLE_DETAIL_CARD);
    const explicit = card?.hole?.source === 'explicit' ? card.hole.id : null;
    const holes = session.document.project.blasts[0]?.holes ?? [];
    const nearby = proximity.update(
      holes,
      state?.view === 'walk' && Math.abs(state.scale - 1) < 0.01 ? state.head : null,
      performance.now(),
      explicit,
    );
    const locale = useLocale.getState().locale;
    const changed =
      detailVersion !== session.document.version ||
      detailAnalysis !== store().analysis ||
      detailLocale !== locale;
    if (explicit) {
      automaticId = null;
      if (changed) {
        detailVersion = session.document.version;
        detailAnalysis = store().analysis;
        detailLocale = locale;
        const hole = holes.find((h) => h.id === explicit);
        if (hole) showHoleDetail(hole);
        else closeCard(HOLE_DETAIL_CARD);
      }
      return;
    }
    if (!nearby) {
      automaticId = null;
      if (card?.hole?.source === 'proximity') closeCard(HOLE_DETAIL_CARD);
      return;
    }
    if (nearby.id !== automaticId || changed) {
      automaticId = nearby.id;
      detailVersion = session.document.version;
      detailAnalysis = store().analysis;
      detailLocale = locale;
      showHoleDetail(nearby, 'proximity');
    }
  }, 250);

  const act = ({ id, value }: { id: string; value?: number }) => {
    if (voice.action(id)) return;
    if (id.startsWith('card:choice:')) {
      // card:choice:<idTarjeta>:<idOpción> (los ids no llevan «:»).
      const [cardId = '', choiceId = ''] = id.slice('card:choice:'.length).split(':');
      chooseCardOption(cardId, choiceId);
      return;
    }
    if (id.startsWith('card:close:')) {
      closeCard(id.slice('card:close:'.length));
      return;
    }
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
      case 'voice':
        voice.toggle();
        break;
      case 'legend:toggle':
        legendCollapsed = !legendCollapsed;
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
      lastLegend = '';
      lastHint = '';
      lastHud = '';
      selected = null;
      const s = store();
      if (mode) {
        // El visor empieza sin pila (se prende desde Capas).
        const { labels, muckpile, muckpileBlocks } = s.layers;
        webLayers = { labels, muckpile, muckpileBlocks };
        // Con la numeración a la vista: en el visor se habla de los taladros por su número.
        applyXrLayers({ ...xrLayers(), labels: true, pile: false });
        refresh();
      } else {
        playback?.abort();
        if (webLayers)
          for (const [k, v] of Object.entries(webLayers))
            s.setLayer(k as keyof typeof webLayers, v);
        webLayers = null;
      }
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
    // Tarjetas de reporte del asistente: las mismas de la web, dibujadas para el visor.
    useCardStore.subscribe((s, prev) => {
      if (s.cards !== prev.cards) {
        const previous = prev.cards.find((c) => c.id === HOLE_DETAIL_CARD);
        if (previous?.hole && !s.cards.some((c) => c.id === HOLE_DETAIL_CARD))
          proximity.dismiss(previous.hole.id);
        syncCards();
      }
    }),
    engine.on('sequenceEnded', () => {
      ended = true;
      hudUntil = performance.now() + HUD_HOLD_MS;
      setTimeout(refresh, HUD_HOLD_MS + 50);
      refresh();
    }),
    // Una secuencia nueva (también la que lanza el asistente) vuelve a mostrar el HUD.
    useAnalysisStore.subscribe((s, prev) => {
      if (s.sequencePlaying && !prev.sequencePlaying) ended = false;
    }),
    useAnalysisStore.subscribe(refresh),
    useLocale.subscribe(refresh),
    useXrRoom.subscribe(refresh),
  ];
  return () => {
    clearInterval(proximityTimer);
    const card = useCardStore.getState().cards.find((c) => c.id === HOLE_DETAIL_CARD);
    if (card?.hole?.source === 'proximity') closeCard(HOLE_DETAIL_CARD);
    voice.dispose();
    playback?.abort();
    for (const off of offs) off();
  };
}
