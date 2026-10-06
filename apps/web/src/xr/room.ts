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
import { API_BASE } from '../server/api';
import { useAnalysisStore } from '../stores/analysisStore';
import { applyXrLayers, useXrRoom, xrLayers } from './xrState';

/** Desvío tolerado entre la secuencia del presentador y la propia [s] (supuesto, QUESTIONS §2). */
const SYNC_DRIFT = 0.1;
/** El presentador reenvía su estado cada tanto aunque no cambie (quien se desincronizó vuelve). */
const STATE_EVERY_MS = 1000;
const RETRY_MS = 2000;

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
  if (seq.playing) {
    if (s.sequencePlaying && drift <= SYNC_DRIFT) return;
    const end =
      s.muckpile && xrLayers().pile ? muckpileEnd(s.muckpile, null) : a.timing.lastTime + 0.3;
    engine.playSequence(sequenceTimes(a), seq.speed, seq.t, end);
    s.set({ sequencePlaying: true, sequenceSpeed: seq.speed });
  } else if (s.sequencePlaying || drift > SYNC_DRIFT) {
    engine.seekSequence(sequenceTimes(a), seq.t);
    s.set({ sequencePlaying: false });
  }
}

/**
 * Entra a la sala del proyecto abierto mientras dura la sesión XR (D-19): manda la propia pose a
 * ROOM_POSE_HZ y dibuja a los demás como avatares (a su escala: gigantes sobre la maqueta o
 * chicos dentro de ella). Quien presenta comparte la secuencia, las capas y el taladro; los demás
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
  let lastSent = '';
  let lastLayers = '';
  let lastHole: string | null = null;
  const peers = new Map<string, RoomPeer & { pose?: RoomPose }>();

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
    for (const p of peers.values())
      if (p.pose)
        list.push({
          id: p.id,
          name: p.name,
          color: p.color,
          head: { p: vec(p.pose.head.p), q: p.pose.head.q },
          hands: p.pose.hands.map((h) => ({ p: vec(h.p), q: h.q })),
          scale: p.pose.scale,
        });
    engine.setXrAvatars(list);
  };
  const applyState = (state: RoomState) => {
    if (role() !== 'viewer') return;
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
      switch (m.type) {
        case 'welcome':
          peers.clear();
          for (const p of m.peers) peers.set(p.id, p);
          you = m.you;
          presenterId = m.presenter;
          if (m.state) applyState(m.state);
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
          lastSent = '';
          shareState(true);
          break;
        case 'pose': {
          const p = peers.get(m.id);
          if (p) p.pose = m.pose;
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
    if (role() !== 'presenter') return;
    const state = current();
    // El tiempo avanza solo: cambia la clave solo lo que el presentador decide.
    const key = JSON.stringify({ ...state, sequence: { ...state.sequence, t: null } });
    if (!force && key === lastSent) return;
    lastSent = key;
    send({ type: 'state', state });
  };

  const poseTimer = setInterval(() => {
    const pose = engine.getXrPose();
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
  }, STATE_EVERY_MS);
  const offs = [
    useAnalysisStore.subscribe(() => {
      shareState(false);
    }),
    engine.on('xrSelectHole', (id) => {
      hole = id;
      shareState(false);
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
    ws?.close();
    engine.setXrAvatars([]);
    useXrRoom.setState({ role: null, presenter: null, peers: 0 });
  };
}

const vec = ([x, y, z]: readonly [number, number, number]) => ({ x, y, z });
const arr = (v: { x: number; y: number; z: number }): [number, number, number] => [v.x, v.y, v.z];
