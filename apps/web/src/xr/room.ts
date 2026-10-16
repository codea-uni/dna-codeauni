import {
  ROOM_POSE_HZ,
  roomServerMessageSchema,
  type RoomClientMessage,
  type RoomPeer,
  type RoomPose,
  type RoomRole,
  type RoomState,
} from '@cronos/api';
import type { HoleId } from '@cronos/core';
import type { Engine, XrAvatar } from '@cronos/engine';
import { muckpileEnd, sequenceTimes } from '../analysis/visualize';
import { API_BASE, serverMode } from '../server/api';
import { useProjectSession } from '../server/projectSession';
import { useAnalysisStore } from '../stores/analysisStore';
import { useUiStore } from '../stores/uiStore';
import { applyXrLayers, useXrRoom, xrLayers } from './xrState';
import { createLiveDesign, useLiveFeed } from './liveDesign';

/** Desvío tolerado entre la secuencia del presentador y la propia [s] (supuesto, QUESTIONS §2). */
const SYNC_DRIFT = 0.1;
/** El presentador reenvía su estado cada tanto aunque no cambie (quien se desincronizó vuelve). */
const STATE_EVERY_MS = 1000;
const RETRY_MS = 2000;
/** Sin poses durante este tiempo, la persona se oculta (salió a la planta o cerró la vista 3D). */
const STALE_MS = 2000;

const store = () => useAnalysisStore.getState();

function roomUrl(projectId: string): string {
  const url = new URL(
    `${API_BASE || '/api'}/rooms/${encodeURIComponent(projectId)}/ws`,
    location.href,
  );
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.href;
}

/** Pedir o soltar el rol de presentador en la sala abierta (botón del menú del visor). */
let presentInActiveRoom: ((on: boolean) => void) | null = null;
export function setPresenting(on: boolean): void {
  presentInActiveRoom?.(on);
}

/** La animación que sigue al presentador ya incluye el vuelo de la pila. */
let playingWithPile = false;

/** La secuencia propia sigue la del presentador (se corrige solo si se aleja más de SYNC_DRIFT). */
export function followSequence(engine: Engine, seq: RoomState['sequence']): void {
  const s = store();
  const a = s.analysis;
  if (!a) return;
  if (seq.t === null) {
    if (s.sequenceTime !== null) {
      engine.stopSequence();
      s.set({ sequencePlaying: false, sequenceTime: null });
    }
    return;
  }
  const drift = s.sequenceTime === null ? Infinity : Math.abs(s.sequenceTime - seq.t);
  const withPile = !!s.muckpile && xrLayers().pile;
  if (seq.playing) {
    // Si la pila llegó con la animación ya en marcha, se retoma desde el mismo tiempo con ella.
    if (s.sequencePlaying && drift <= SYNC_DRIFT && withPile === playingWithPile) return;
    const end = s.muckpile && withPile ? muckpileEnd(s.muckpile, null) : a.timing.lastTime + 0.3;
    playingWithPile = withPile;
    engine.playSequence(sequenceTimes(a), seq.speed, seq.t, end);
    s.set({ sequencePlaying: true, sequenceSpeed: seq.speed });
  } else if (s.sequencePlaying || drift > SYNC_DRIFT) {
    engine.seekSequence(sequenceTimes(a), seq.t);
    s.set({ sequencePlaying: false });
  }
}

/**
 * Entra a la sala del proyecto abierto (D-19), desde la web o desde el visor: manda la propia pose
 * a ROOM_POSE_HZ (la cabeza en el visor, la cámara en la vista 3D) y dibuja a los demás como
 * avatares, a su escala: gigantes sobre la maqueta o chicos dentro de ella. Quien presenta comparte la secuencia, las capas y el taladro; los demás
 * lo siguen. Devuelve la función para salir.
 */
export function joinRoom(engine: Engine, projectId: string): () => void {
  let ws: WebSocket | null = null;
  let closed = false;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let presenterId: string | null = null;
  let you: string | null = null;
  const role = (): RoomRole =>
    presenterId !== null && presenterId === you ? 'presenter' : 'viewer';
  let hole: HoleId | null = null;
  let webWasPlaying = false;
  /** Presentador por el que la web ya pasó a 3D. */
  let webIn3dFor: string | null = null;
  let lastSent = '';
  let lastLayers = '';
  let lastHole: string | null = null;
  const peers = new Map<string, RoomPeer & { pose?: RoomPose; seen?: number }>();

  const send = (m: RoomClientMessage) => {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
  };
  const publishStatus = () => {
    useXrRoom.setState({
      role: role(),
      presenter: presenterId ? (peers.get(presenterId)?.name ?? null) : null,
      peers: peers.size,
    });
  };
  const drawAvatars = () => {
    const list: XrAvatar[] = [];
    const now = performance.now();
    for (const p of peers.values())
      if (p.pose && now - (p.seen ?? 0) < STALE_MS)
        list.push({
          id: p.id,
          name: p.name,
          color: p.color,
          head: { p: vec(p.pose.head.p), q: p.pose.head.q },
          hands: p.pose.hands.map((h) => ({ p: vec(h.p), q: h.q })),
          scale: p.pose.scale,
        });
    engine.setAvatars(list);
  };
  const applyState = (state: RoomState) => {
    if (role() !== 'viewer') return;
    // Desde la web se sigue la secuencia de quien presenta en el visor (se puede apagar con
    // «Seguir»): al empezar una animación la web pasa sola a 3D para verla. De las capas solo se
    // toma la pila: sin ella la web corría el tiempo (el panel avanzaba) pero no se veía el vuelo
    // de los bloques que sí se ve en el visor. Se calcula apenas el visor la tiene prendida, para
    // que esté lista al disparar.
    if (!engine.xrMode) {
      if (!useLiveFeed.getState().follow) return;
      // El estado solo lo manda quien presenta DENTRO del visor: apenas entra, la web pasa a 3D
      // (una vez por presentador; si después la persona vuelve a planta, se respeta).
      if (webIn3dFor !== presenterId) {
        webIn3dFor = presenterId;
        if (useUiStore.getState().viewMode !== '3d') useUiStore.getState().setViewMode('3d');
      }
      const starts = state.sequence.playing && !webWasPlaying;
      webWasPlaying = state.sequence.playing;
      if (state.layers.pile && (starts || !store().muckpile))
        applyXrLayers({ ...xrLayers(), pile: true });
      if (starts && useUiStore.getState().viewMode !== '3d')
        useUiStore.getState().setViewMode('3d');
      followSequence(engine, state.sequence);
      return;
    }
    // Capas y taladro solo cuando el presentador los cambia: entre medio, cada uno mira lo suyo.
    const layers = JSON.stringify(state.layers);
    if (layers !== lastLayers) {
      lastLayers = layers;
      applyXrLayers(state.layers);
    }
    if (state.hole !== lastHole) {
      lastHole = state.hole;
      engine.setXrHole(state.hole as HoleId | null);
    }
    followSequence(engine, state.sequence);
  };

  const live = createLiveDesign(engine, send);
  const nameOf = (id: string) => peers.get(id)?.name ?? '—';

  const connect = () => {
    const socket = new WebSocket(roomUrl(projectId));
    ws = socket;
    socket.onmessage = (e: MessageEvent<string>) => {
      let raw: unknown;
      try {
        raw = JSON.parse(e.data);
      } catch {
        return;
      }
      const parsed = roomServerMessageSchema.safeParse(raw);
      if (!parsed.success) return;
      const m = parsed.data;
      live.onMessage(m, nameOf);
      switch (m.type) {
        case 'welcome':
          peers.clear();
          for (const p of m.peers) peers.set(p.id, p);
          you = m.you;
          presenterId = m.presenter;
          if (m.state) applyState(m.state);
          // Reconectado dentro del visor sin presentador: vuelve a presentar (si no, la web dejaba
          // de ver la secuencia).
          if (engine.xrMode && m.presenter === null) send({ type: 'claim' });
          break;
        case 'join':
          peers.set(m.peer.id, m.peer);
          break;
        case 'leave':
          peers.delete(m.id);
          drawAvatars();
          break;
        case 'presenter':
          presenterId = m.id;
          // Nuevo presentador (o el mismo que volvió a entrar): la próxima animación se sigue.
          webWasPlaying = false;
          if (m.id === null) webIn3dFor = null;
          lastSent = '';
          shareState(true);
          break;
        case 'pose': {
          const p = peers.get(m.id);
          if (p) {
            p.pose = m.pose;
            p.seen = performance.now();
          }
          drawAvatars();
          break;
        }
        case 'state':
          applyState(m.state);
          break;
      }
      publishStatus();
    };
    socket.onclose = () => {
      if (closed) return;
      retry = setTimeout(connect, RETRY_MS);
    };
  };

  const current = (): RoomState => {
    const s = store();
    return {
      sequence: { playing: s.sequencePlaying, t: s.sequenceTime, speed: s.sequenceSpeed },
      layers: xrLayers(),
      hole,
    };
  };
  const shareState = (force: boolean) => {
    if (role() !== 'presenter' || !engine.xrMode) return;
    const state = current();
    // El tiempo avanza solo: cambia la clave solo lo que el presentador decide.
    const key = JSON.stringify({ ...state, sequence: { ...state.sequence, t: null } });
    if (!force && key === lastSent) return;
    lastSent = key;
    send({ type: 'state', state });
  };

  const poseTimer = setInterval(() => {
    const pose = engine.getViewerPose();
    if (pose)
      send({
        type: 'pose',
        pose: {
          head: { p: arr(pose.head.p), q: [...pose.head.q] },
          hands: pose.hands.map((h) => ({ p: arr(h.p), q: [...h.q] })),
          scale: pose.scale,
        },
      });
  }, 1000 / ROOM_POSE_HZ);
  const stateTimer = setInterval(() => {
    shareState(true);
    drawAvatars();
  }, STATE_EVERY_MS);
  const offs = [
    useAnalysisStore.subscribe(() => {
      shareState(false);
    }),
    engine.on('xrSelectHole', (id) => {
      hole = id;
      shareState(false);
    }),
    // Al salir del visor se deja de presentar; la sala sigue (desde la web se ve a los demás).
    engine.on('xrSession', (mode) => {
      if (!mode && role() === 'presenter') send({ type: 'release' });
      // Quien entra al visor presenta (si nadie lo hace): la web ve su secuencia en vivo.
      if (mode && presenterId === null) send({ type: 'claim' });
      drawAvatars();
    }),
  ];

  presentInActiveRoom = (on) => {
    send({ type: on ? 'claim' : 'release' });
  };
  connect();
  publishStatus();
  return () => {
    closed = true;
    presentInActiveRoom = null;
    clearTimeout(retry);
    clearInterval(poseTimer);
    clearInterval(stateTimer);
    for (const off of offs) off();
    live.dispose();
    ws?.close();
    engine.setAvatars([]);
    useXrRoom.setState({ role: null, presenter: null, peers: 0 });
  };
}

const vec = ([x, y, z]: readonly [number, number, number]) => ({ x, y, z });
const arr = (v: { x: number; y: number; z: number }): [number, number, number] => [v.x, v.y, v.z];

/**
 * Mantiene la sala del proyecto del servidor que esté abierto (D-19): se entra al abrirlo y se sale
 * al cerrarlo o cambiar de proyecto, haya o no sesión XR.
 */
export function bindRoom(engine: Engine): () => void {
  let projectId: string | null = null;
  let leave: (() => void) | null = null;
  const sync = () => {
    const next = serverMode ? (useProjectSession.getState().current?.projectId ?? null) : null;
    if (next === projectId) return;
    leave?.();
    leave = null;
    projectId = next;
    if (next) leave = joinRoom(engine, next);
  };
  sync();
  const off = useProjectSession.subscribe(sync);
  return () => {
    off();
    leave?.();
  };
}
